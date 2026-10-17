import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}
async function checkoutSignature(orderId: string, paymentId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(orderId + "|" + paymentId)));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: "Server auth is not configured." }, 500);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in to the client portal first." }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "Your session is invalid or expired." }, 401);
  const { data: client, error: clientError } = await admin.from("infiskies_clients")
    .select("id,user_id,full_name,email,status").eq("user_id", authData.user.id).maybeSingle();
  if (clientError || !client || client.status !== "active") return respond({ error: "An active client portal account is required." }, 403);

  const { data: vaultCredentials, error: vaultError } = await admin.rpc("infiskies_get_razorpay_secrets");
  const razorpayKeyId = String(vaultCredentials?.key_id || Deno.env.get("RAZORPAY_KEY_ID") || "");
  const razorpayKeySecret = String(vaultCredentials?.key_secret || Deno.env.get("RAZORPAY_KEY_SECRET") || "");
  if (vaultError) return respond({ error: "Unable to load Razorpay credentials from secure server storage." }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return respond({ error: "Request body must be valid JSON." }, 400); }
  if (body.action !== "create_order" && body.action !== "verify_payment") return respond({ error: "Unsupported payment action." }, 400);
  if (!razorpayKeyId || !razorpayKeySecret) return respond({ error: "Razorpay is not configured yet. The owner must add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Supabase Edge Function secrets." }, 503);

  const milestoneId = String(body.milestone_id || "");
  if (!milestoneId) return respond({ error: "Milestone ID is required." }, 400);
  const { data: milestone, error: milestoneError } = await admin.from("infiskies_proposal_milestones")
    .select("id,proposal_id,title,amount,status,razorpay_order_id,razorpay_payment_id")
    .eq("id", milestoneId).maybeSingle();
  if (milestoneError || !milestone) return respond({ error: "Milestone not found." }, 404);
  const { data: proposal, error: proposalError } = await admin.from("infiskies_proposals")
    .select("id,client_id,status,title").eq("id", milestone.proposal_id).maybeSingle();
  if (proposalError || !proposal || proposal.client_id !== client.id) return respond({ error: "This milestone does not belong to your client account." }, 403);
  if (proposal.status !== "accepted") return respond({ error: "Accept the proposal before making a milestone payment." }, 409);
  if (milestone.status === "paid") return respond({ success: true, already_paid: true, payment_id: milestone.razorpay_payment_id, message: "This milestone is already paid." });
  if (milestone.status !== "unpaid" || Number(milestone.amount) <= 0) return respond({ error: "This milestone is not payable." }, 409);

  const basicAuth = "Basic " + btoa(razorpayKeyId + ":" + razorpayKeySecret);
  if (body.action === "create_order") {
    let orderId = milestone.razorpay_order_id as string | null;
    if (!orderId) {
      const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST", headers: { "Authorization": basicAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(Number(milestone.amount) * 100), currency: "INR",
          receipt: "infiskies-" + milestone.id.replaceAll("-", "").slice(0, 24),
          notes: { proposal_id: proposal.id, milestone_id: milestone.id, client_id: client.id },
        }),
      });
      const orderData = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok || !orderData.id) return respond({ error: "Razorpay could not create the order. Check the API key mode and configuration." }, 502);
      orderId = String(orderData.id);
      const { error: saveOrderError } = await admin.from("infiskies_proposal_milestones")
        .update({ razorpay_order_id: orderId }).eq("id", milestone.id).eq("status", "unpaid");
      if (saveOrderError) return respond({ error: "Razorpay order was created but could not be saved. Contact the workspace owner before retrying." }, 500);
    }
    return respond({
      success: true, key_id: razorpayKeyId, order_id: orderId, amount: Math.round(Number(milestone.amount) * 100),
      currency: "INR", milestone_id: milestone.id, milestone_title: milestone.title,
      client_name: client.full_name, client_email: client.email,
    });
  }

  const orderId = String(body.order_id || "");
  const paymentId = String(body.payment_id || "");
  const signature = String(body.signature || "");
  if (!orderId || !paymentId || !signature) return respond({ error: "Razorpay order, payment and signature are required." }, 400);
  if (milestone.razorpay_order_id !== orderId) return respond({ error: "This Razorpay order does not match the milestone." }, 409);
  const expected = await checkoutSignature(orderId, paymentId, razorpayKeySecret);
  if (!safeEqual(expected, signature.toLowerCase())) return respond({ error: "Payment signature verification failed. The milestone has not been marked paid." }, 400);
  if (milestone.status === "paid" && milestone.razorpay_payment_id === paymentId) return respond({ success: true, already_paid: true, payment_id: paymentId });
  const { data: updated, error: updateError } = await admin.from("infiskies_proposal_milestones")
    .update({ status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("id", milestone.id).eq("status", "unpaid").eq("razorpay_order_id", orderId)
    .select("id,status,paid_at").maybeSingle();
  if (updateError) return respond({ error: "Payment was verified, but the milestone status could not be updated. Contact the workspace owner." }, 500);
  if (!updated) return respond({ error: "The milestone changed while this payment was being verified. Refresh the portal to confirm its status." }, 409);
  return respond({ success: true, milestone_id: updated.id, status: updated.status, paid_at: updated.paid_at, payment_id: paymentId });
});
