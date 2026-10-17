/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { CalendarDays, Check, CheckCircle2, Clock3, FileText, LockKeyhole, LogOut, RefreshCw, Wallet, X, AlertCircle, BriefcaseBusiness } from "lucide-react";

type Row = Record<string, any>;
type Client = { id: string; user_id: string; full_name: string; email: string; company_name: string; status: string };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => { open: () => void };
  }
}
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value + (String(value).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const labelize = (value?: string) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

async function ensureRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return true;
  const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function ClientPortal({ client, onSignOut }: { client: Client; onSignOut: () => void }) {
  const db = supabase as any;
  const [proposals, setProposals] = useState<Row[]>([]);
  const [milestones, setMilestones] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [timeline, setTimeline] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true); setError("");
    const proposalResult = await db.from("infiskies_proposals").select("*").eq("client_id", client.id).neq("status", "draft").neq("status", "cancelled").order("created_at", { ascending: false });
    const proposalRows = proposalResult.data || [];
    setProposals(proposalRows);
    if (proposalResult.error) setError(proposalResult.error.message);
    const [linkResult] = await Promise.all([
      db.from("infiskies_client_projects").select("id,client_id,project_id,proposal_id").eq("client_id", client.id),
    ]);
    const projectLinks = linkResult.data || [];
    if (linkResult.error && !proposalResult.error) setError(linkResult.error.message);
    const proposalIds = proposalRows.map((proposal: Row) => proposal.id);
    const projectIds = projectLinks.map((link: Row) => link.project_id);
    const [milestoneResult, projectResult, timelineResult] = await Promise.all([
      proposalIds.length ? db.from("infiskies_proposal_milestones").select("*").in("proposal_id", proposalIds).order("position", { ascending: true }) : Promise.resolve({ data: [], error: null }),
      projectIds.length ? db.from("infiskies_projects").select("id,name,client_name,description,status,contract_value,start_date,due_date").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
      projectIds.length ? db.from("infiskies_project_timeline").select("*").in("project_id", projectIds).eq("visible_to_client", true).order("position", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    ]);
    setMilestones(milestoneResult.data || []);
    setProjects(projectResult.data || []);
    setTimeline(timelineResult.data || []);
    const otherError = [milestoneResult.error, projectResult.error, timelineResult.error].find(Boolean);
    if (otherError && !proposalResult.error && !linkResult.error) setError(otherError.message);
    setLoading(false);
  }, [db, client.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const milestonesByProposal = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    milestones.forEach((milestone) => grouped.set(milestone.proposal_id, [...(grouped.get(milestone.proposal_id) || []), milestone]));
    return grouped;
  }, [milestones]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const timelineByProject = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    timeline.forEach((step) => grouped.set(step.project_id, [...(grouped.get(step.project_id) || []), step]));
    return grouped;
  }, [timeline]);

  const respondToProposal = async (proposal: Row, decision: "accepted" | "rejected") => {
    const message = decision === "accepted"
      ? "Accept this proposal and agree to its scope, estimate and payment milestones?"
      : "Reject this proposal? The owner will see your decision.";
    if (!window.confirm(message)) return;
    setBusyId(proposal.id); setError(""); setNotice("");
    const { error: responseError } = await db.rpc("infiskies_client_respond_to_proposal", { proposal_uuid: proposal.id, decision });
    if (responseError) setError(responseError.message);
    else {
      setNotice(decision === "accepted" ? "Proposal accepted. Your project workspace and timeline are now available here." : "Proposal rejected. The owner has been notified in the workspace status.");
      await refresh();
    }
    setBusyId("");
  };

  const payMilestone = async (milestone: Row) => {
    setBusyId(milestone.id); setError(""); setNotice("");
    try {
      const { data: order, error: orderError } = await db.functions.invoke("infiskies-razorpay-payments", { body: { action: "create_order", milestone_id: milestone.id } });
      if (orderError) throw orderError;
      if (order?.error) throw new Error(order.error);
      if (order?.already_paid) { setNotice("This milestone is already marked paid."); await refresh(); return; }
      const loaded = await ensureRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error("Razorpay Checkout could not load. Check your connection and try again.");
      const checkout = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Infiskies",
        description: order.milestone_title || milestone.title,
        image: window.location.origin + "/favicon.ico",
        prefill: { name: client.full_name, email: client.email },
        notes: { milestone_id: milestone.id },
        theme: { color: "#6855e8" },
        modal: { ondismiss: () => setBusyId("") },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const { data: verification, error: verifyError } = await db.functions.invoke("infiskies-razorpay-payments", {
            body: {
              action: "verify_payment", milestone_id: milestone.id,
              order_id: response.razorpay_order_id, payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          });
          if (verifyError) setError(verifyError.message);
          else if (verification?.error) setError(verification.error);
          else { setNotice("Payment verified successfully. This milestone is marked paid."); await refresh(); }
          setBusyId("");
        },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Razorpay checkout.");
      setBusyId("");
    }
  };

  return <main className="client-portal-shell">
    <header className="client-portal-topbar"><div className="client-portal-brand"><div className="client-portal-mark"><BriefcaseBusiness size={19} /></div><div><strong>Client Portal</strong><small>PROJECTS · PROPOSALS · PAYMENTS</small></div></div><div className="client-portal-user"><span>{client.full_name}</span><button className="icon-button" onClick={() => void refresh()} title="Refresh portal"><RefreshCw size={16} /></button><button className="button button-secondary" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div></header>
    <div className="client-portal-content"><div className="client-portal-welcome"><div><span className="eyebrow muted">WELCOME TO YOUR PROJECT SPACE</span><h1>Client Portal</h1><p>Review your proposals, accept an estimate, track your project and pay milestones securely.</p></div><div className="client-company-chip"><LockKeyhole size={15} /><span>Private to {client.company_name || client.full_name}</span></div></div>
      {notice && <div className="success-banner"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
      {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
      {loading && <div className="inline-loading"><span /> Loading your private project records…</div>}
      <section className="client-portal-stat-grid"><div className="client-portal-stat"><span>Proposals</span><b>{proposals.length}</b><small>Sent and accepted estimates</small></div><div className="client-portal-stat"><span>Projects</span><b>{projects.length}</b><small>Projects linked to your account</small></div><div className="client-portal-stat"><span>Pending milestone payments</span><b>{money(milestones.filter((m) => m.status === "unpaid" && proposals.some((p) => p.id === m.proposal_id && p.status === "accepted")).reduce((sum, m) => sum + Number(m.amount || 0), 0))}</b><small>Payable according to accepted proposals</small></div></section>

      <section className="client-portal-section"><div className="client-portal-section-head"><div><h2><FileText size={18} /> Proposals & estimates</h2><p>Scope, amount and payment schedule are shown before you accept.</p></div></div>
        {proposals.length === 0 ? <div className="client-portal-empty"><FileText size={24} /><h3>No proposals available</h3><p>When Infiskies sends you a proposal, it will appear here.</p></div> : <div className="client-proposal-list">{proposals.map((proposal) => {
          const proposalMilestones = milestonesByProposal.get(proposal.id) || [];
          const project = proposal.project_id ? projectById.get(proposal.project_id) : null;
          return <article className="client-proposal-card" key={proposal.id}><div className="client-proposal-head"><div><span className={"status-pill status-" + proposal.status}>{labelize(proposal.status)}</span><h3>{proposal.title}</h3><p>{dateLabel(proposal.created_at)} · {project?.name || "Project will be created when accepted"}</p></div><div className="client-proposal-price"><small>Estimate total</small><strong>{money(proposal.total_amount)}</strong></div></div>
            <div className="client-proposal-text"><h4>Scope of work</h4><p>{proposal.scope || "Scope details will be agreed with the owner."}</p>{proposal.terms && <><h4>Terms & assumptions</h4><p>{proposal.terms}</p></>}</div>
            <div className="client-milestone-list"><h4><Wallet size={16} /> Payment milestones</h4>{proposalMilestones.map((milestone) => <div className="client-milestone-row" key={milestone.id}><div className="client-milestone-icon">{milestone.status === "paid" ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</div><div className="client-milestone-info"><b>{milestone.title}</b><small>{milestone.description || "Project milestone"}{milestone.due_date ? " · Due " + dateLabel(milestone.due_date) : ""}</small></div><span className="client-milestone-percent">{Number(milestone.percentage)}%</span><strong>{money(milestone.amount)}</strong>{milestone.status === "paid" ? <span className="status-pill status-active">Paid</span> : proposal.status === "accepted" && milestone.status === "unpaid" ? <button className="button button-small button-primary" disabled={busyId === milestone.id} onClick={() => void payMilestone(milestone)}>{busyId === milestone.id ? "Opening…" : "Pay now"}</button> : <span className="status-pill status-pending">{labelize(milestone.status)}</span>}</div>)}</div>
            {proposal.status === "sent" && <div className="client-proposal-actions"><p>Accepting confirms the scope, estimate and milestone allocation.</p><div><button className="button button-secondary" disabled={busyId === proposal.id} onClick={() => void respondToProposal(proposal, "rejected")}><X size={15} /> Reject</button><button className="button button-primary" disabled={busyId === proposal.id} onClick={() => void respondToProposal(proposal, "accepted")}><Check size={15} /> Accept proposal</button></div></div>}
          </article>;
        })}</div>}
      </section>

      <section className="client-portal-section"><div className="client-portal-section-head"><div><h2><BriefcaseBusiness size={18} /> My projects</h2><p>Only projects explicitly assigned to this client account are displayed.</p></div></div>
        {projects.length === 0 ? <div className="client-portal-empty"><BriefcaseBusiness size={24} /><h3>No project linked yet</h3><p>Once you accept a proposal or the owner links a project to your account, project details will appear here.</p></div> : <div className="client-project-grid">{projects.map((project) => {
          const steps = timelineByProject.get(project.id) || [];
          return <article className="client-project-card" key={project.id}><div className="client-project-card-head"><div className="client-project-icon"><BriefcaseBusiness size={18} /></div><span className={"status-pill status-" + project.status}>{labelize(project.status)}</span></div><h3>{project.name}</h3><p>{project.description || "Project details provided by Infiskies."}</p><div className="client-project-facts"><div><small>Start date</small><b>{dateLabel(project.start_date)}</b></div><div><small>Target handover</small><b>{dateLabel(project.due_date)}</b></div><div><small>Contract value</small><b>{money(project.contract_value)}</b></div></div><div className="client-timeline"><h4><CalendarDays size={16} /> Project timeline</h4>{steps.length === 0 ? <p className="client-timeline-empty">The project timeline will appear when the owner adds milestones.</p> : <ol>{steps.map((step) => <li key={step.id} className={"client-timeline-step step-" + step.status}><div className="client-timeline-dot" /><div className="client-timeline-step-copy"><b>{step.title}</b><p>{step.description || "Project phase"}</p><small>{dateLabel(step.due_date)} · {labelize(step.status)}</small></div></li>)}</ol>}</div></article>;
        })}</div>}
      </section>
      <footer className="client-portal-footer"><span>Client Portal · Infiskies</span><span><LockKeyhole size={12} /> Your portal only shows your assigned project records.</span></footer>
    </div>
  </main>;
}
