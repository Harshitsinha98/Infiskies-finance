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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: "Server auth is not configured." }, 500);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in with an authorized workspace account first." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return respond({ error: "Your session is invalid or expired." }, 401);

  const { data: actor, error: actorError } = await admin
    .from("infiskies_profiles")
    .select("id,email,role,status,permissions")
    .eq("id", user.id)
    .maybeSingle();

  if (actorError) return respond({ error: "Could not verify workspace permissions." }, 500);
  const userEmail = String(user.email || "").toLowerCase();
  if (!actor || actor.status !== "active" || String(actor.email || "").toLowerCase() !== userEmail) {
    return respond({ error: "This account does not have active Infiskies access." }, 403);
  }

  const permissions = (actor.permissions || {}) as Record<string, unknown>;
  const canManageMembers =
    actor.role === "owner" ||
    (actor.role === "co_admin" && permissions["members.manage"] === true);
  if (!canManageMembers) return respond({ error: "Only authorized workspace admins can create employee accounts." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }
  if (body.action !== "create_employee") return respond({ error: "Unsupported action." }, 400);

  const fullName = String(body.full_name || "").trim().slice(0, 120);
  const username = String(body.username || "").trim().toLowerCase().replace(/^@/, "");
  const password = String(body.password || "");
  if (!fullName) return respond({ error: "Employee name is required." }, 400);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return respond({ error: "Username must be 3–30 characters: lowercase letters, numbers, dots, underscores or hyphens." }, 400);
  }
  if (["admin", "administrator", "owner", "root", "support", "infiskies"].includes(username)) {
    return respond({ error: "This username is reserved. Choose another username." }, 400);
  }
  if (password.length < 10 || password.length > 128) {
    return respond({ error: "Password must be between 10 and 128 characters." }, 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("infiskies_profiles")
    .select("id")
    .eq("login_username", username)
    .maybeSingle();
  if (existingError) return respond({ error: "Could not check username availability." }, 500);
  if (existing) return respond({ error: "That username is already in use." }, 409);

  // A non-deliverable login alias gives Supabase Auth a unique email identity.
  // No email is sent; staff use the username in the Infiskies login screen.
  const authEmail = username + "@members.infiskies.finance";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, login_username: username, auth_method: "username_password" },
  });
  if (createError || !created.user) {
    const message = String(createError?.message || "Could not create the employee login.");
    return respond({ error: /already|registered|duplicate/i.test(message) ? "That username is already in use." : message }, 400);
  }

  const { error: profileError } = await admin.from("infiskies_profiles").insert({
    id: created.user.id,
    email: authEmail,
    login_username: username,
    full_name: fullName,
    role: "employee",
    status: "active",
    permissions: {},
    created_by: actor.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return respond({ error: "The login was created, but the workspace profile could not be saved. Please try again." }, 500);
  }

  return respond({ success: true, id: created.user.id, username, full_name: fullName });
});
