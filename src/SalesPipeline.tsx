/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  AlertCircle, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, CheckCircle2,
  ClipboardList, Copy, FileText, Plus, RefreshCw, Send, Trash2, Users, X
} from "lucide-react";

type Role = "owner" | "co_admin" | "employee";
type Row = Record<string, any>;
type Tab = "leads" | "proposals" | "clients" | "timeline";
type MilestoneDraft = { title: string; percentage: string; description: string; due_date: string };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value + (String(value).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const labelize = (value?: string) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const defaultMilestones = (): MilestoneDraft[] => [
  { title: "Project advance", percentage: "50", description: "Advance payment to begin work", due_date: "" },
  { title: "Mid-project progress", percentage: "25", description: "Payment at agreed project progress", due_date: "" },
  { title: "Final handover", percentage: "25", description: "Remaining amount at handover", due_date: "" },
];

export default function SalesPipeline({ session, role, projects, onRefresh }: {
  session: Session; role: Role; projects: Row[]; onRefresh: () => void | Promise<void>;
}) {
  const db = supabase as any;
  const isOwner = role === "owner";
  const [tab, setTab] = useState<Tab>("leads");
  const [leads, setLeads] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [milestones, setMilestones] = useState<Row[]>([]);
  const [clientProjects, setClientProjects] = useState<Row[]>([]);
  const [timeline, setTimeline] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leadDraft, setLeadDraft] = useState({ title: "", contact_name: "", company_name: "", email: "", phone: "", service_interest: "", estimated_value: "0", next_follow_up: "", notes: "" });
  const [clientDraft, setClientDraft] = useState({ full_name: "", email: "", company_name: "", phone: "", password: "" });
  const [proposalDraft, setProposalDraft] = useState({ client_id: "", project_id: "", lead_id: "", title: "", scope: "", terms: "", total_amount: "" });
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraft[]>(defaultMilestones());
  const [linkDraft, setLinkDraft] = useState({ client_id: "", project_id: "" });
  const [timelineDraft, setTimelineDraft] = useState({ project_id: "", title: "", description: "", due_date: "", status: "upcoming", visible_to_client: true });

  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    setError("");
    const leadResult = await db.from("infiskies_sales_leads").select("*").order("created_at", { ascending: false });
    setLeads(leadResult.data || []);
    if (leadResult.error) setError(leadResult.error.message);
    if (isOwner) {
      const [clientResult, proposalResult, linkResult, timelineResult] = await Promise.all([
        db.from("infiskies_clients").select("*").order("created_at", { ascending: false }),
        db.from("infiskies_proposals").select("*").order("created_at", { ascending: false }),
        db.from("infiskies_client_projects").select("*").order("created_at", { ascending: false }),
        db.from("infiskies_project_timeline").select("*").order("position", { ascending: true }),
      ]);
      setClients(clientResult.data || []);
      setProposals(proposalResult.data || []);
      setClientProjects(linkResult.data || []);
      setTimeline(timelineResult.data || []);
      const proposalIds = (proposalResult.data || []).map((proposal: Row) => proposal.id);
      if (proposalIds.length) {
        const milestoneResult = await db.from("infiskies_proposal_milestones").select("*").in("proposal_id", proposalIds).order("position", { ascending: true });
        setMilestones(milestoneResult.data || []);
        if (milestoneResult.error) setError(milestoneResult.error.message);
      } else setMilestones([]);
      const adminError = [clientResult.error, proposalResult.error, linkResult.error, timelineResult.error].find(Boolean);
      if (adminError && !leadResult.error) setError(adminError.message);
    } else {
      setClients([]); setProposals([]); setMilestones([]); setClientProjects([]); setTimeline([]);
    }
    setLoading(false);
  }, [db, isOwner]);

  useEffect(() => { void refresh(); }, [refresh]);

  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const milestoneByProposal = useMemo(() => {
    const map = new Map<string, Row[]>();
    milestones.forEach((item) => map.set(item.proposal_id, [...(map.get(item.proposal_id) || []), item]));
    return map;
  }, [milestones]);
  const linkedProjectIds = new Set(clientProjects.map((link) => link.project_id));
  const setErrorMessage = (message: string) => { setError(message); setNotice(""); };
  const setSuccessMessage = (message: string) => { setNotice(message); setError(""); };

  const saveLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") || "").trim(), contact_name: String(form.get("contact_name") || "").trim(),
      company_name: String(form.get("company_name") || "").trim(), email: String(form.get("email") || "").trim().toLowerCase(),
      phone: String(form.get("phone") || "").trim(), service_interest: String(form.get("service_interest") || "").trim(),
      estimated_value: Number(form.get("estimated_value") || 0), next_follow_up: String(form.get("next_follow_up") || "") || null,
      notes: String(form.get("notes") || "").trim(), created_by: session.user.id,
    };
    try {
      const result = await db.from("infiskies_sales_leads").insert(payload);
      if (result.error) throw result.error;
      setLeadDraft({ title: "", contact_name: "", company_name: "", email: "", phone: "", service_interest: "", estimated_value: "0", next_follow_up: "", notes: "" });
      setSuccessMessage("Sales lead saved. It is visible to workspace owners.");
      await refresh(); await onRefresh();
    } catch (err) { setErrorMessage(err instanceof Error ? err.message : "Could not save the lead."); }
    finally { setSaving(false); }
  };

  const updateLead = async (lead: Row, changes: Row) => {
    setSaving(true); setError(""); setNotice("");
    const { error: updateError } = await db.from("infiskies_sales_leads").update(changes).eq("id", lead.id);
    if (updateError) setErrorMessage(updateError.message);
    else { setSuccessMessage("Lead updated."); await refresh(); }
    setSaving(false);
  };

  const deleteLead = async (lead: Row) => {
    if (!isOwner || !window.confirm("Delete sales lead “" + lead.title + "”?")) return;
    setSaving(true);
    const { error: deleteError } = await db.from("infiskies_sales_leads").delete().eq("id", lead.id);
    if (deleteError) setErrorMessage(deleteError.message);
    else { setSuccessMessage("Lead deleted."); await refresh(); }
    setSaving(false);
  };

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const { data, error: invokeError } = await db.functions.invoke("infiskies-manage-member", {
        body: { action: "create_client", ...clientDraft, full_name: clientDraft.full_name.trim(), email: clientDraft.email.trim().toLowerCase() },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setClientDraft({ full_name: "", email: "", company_name: "", phone: "", password: "" });
      setSuccessMessage("Client Portal account created for " + (data?.client?.email || "the client") + ". Share the initial password securely; it is not displayed again.");
      await refresh();
    } catch (err) { setErrorMessage(err instanceof Error ? err.message : "Could not create the client portal account."); }
    finally { setSaving(false); }
  };

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const title = proposalDraft.title.trim();
      const amount = Number(proposalDraft.total_amount);
      const selectedMilestones = milestoneDrafts.filter((item) => item.title.trim());
      const pctTotal = selectedMilestones.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
      if (!proposalDraft.client_id) throw new Error("Choose a client account for this proposal.");
      if (!title) throw new Error("Proposal title is required.");
      if (!(amount > 0)) throw new Error("Estimate amount must be greater than zero.");
      if (!selectedMilestones.length || Math.abs(pctTotal - 100) > 0.01) throw new Error("Milestone percentages must total exactly 100%. Adjust or add milestones.");
      if (selectedMilestones.some((item) => !(Number(item.percentage) > 0) || Number(item.percentage) > 100)) throw new Error("Each milestone must have a percentage between 0 and 100.");
      const proposalResult = await db.from("infiskies_proposals").insert({
        client_id: proposalDraft.client_id, project_id: proposalDraft.project_id || null,
        lead_id: proposalDraft.lead_id || null, title, scope: proposalDraft.scope.trim(),
        terms: proposalDraft.terms.trim(), total_amount: amount, status: "draft", created_by: session.user.id,
      }).select("*").single();
      if (proposalResult.error || !proposalResult.data) throw proposalResult.error || new Error("Could not create the proposal.");
      let assigned = 0;
      const milestoneRows = selectedMilestones.map((item, index) => {
        const milestoneAmount = index === selectedMilestones.length - 1
          ? Math.round((amount - assigned) * 100) / 100
          : Math.round(amount * Number(item.percentage) / 100 * 100) / 100;
        if (index < selectedMilestones.length - 1) assigned += milestoneAmount;
        return {
          proposal_id: proposalResult.data.id, title: item.title.trim(),
          description: item.description.trim(), percentage: Number(item.percentage), amount: milestoneAmount,
          position: index + 1, due_date: item.due_date || null,
        };
      });
      const milestoneResult = await db.from("infiskies_proposal_milestones").insert(milestoneRows);
      if (milestoneResult.error) throw milestoneResult.error;
      const { error: sendError } = await db.from("infiskies_proposals").update({ status: "sent" }).eq("id", proposalResult.data.id);
      if (sendError) throw sendError;
      if (proposalDraft.lead_id) await db.from("infiskies_sales_leads").update({ status: "proposal_sent", client_id: proposalDraft.client_id }).eq("id", proposalDraft.lead_id);
      setProposalDraft({ client_id: "", project_id: "", lead_id: "", title: "", scope: "", terms: "", total_amount: "" });
      setMilestoneDrafts(defaultMilestones());
      setSuccessMessage("Proposal sent to the selected Client Portal. The client will see the estimate and milestone schedule on their next login.");
      await refresh();
    } catch (err) { setErrorMessage(err instanceof Error ? err.message : "Could not create the proposal."); }
    finally { setSaving(false); }
  };

  const createProjectLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    if (!linkDraft.client_id || !linkDraft.project_id) { setErrorMessage("Choose both a client and a project."); setSaving(false); return; }
    const { error: linkError } = await db.from("infiskies_client_projects").insert({ client_id: linkDraft.client_id, project_id: linkDraft.project_id });
    if (linkError) setErrorMessage(linkError.message);
    else { setSuccessMessage("Project linked. Only this client account can see its client-visible timeline and project portal details."); setLinkDraft({ client_id: "", project_id: "" }); await refresh(); }
    setSaving(false);
  };

  const createTimelineStep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const payload = { ...timelineDraft, due_date: timelineDraft.due_date || null, position: timeline.filter((step) => step.project_id === timelineDraft.project_id).length + 1, created_by: session.user.id };
    const { error: createError } = await db.from("infiskies_project_timeline").insert(payload);
    if (createError) setErrorMessage(createError.message);
    else { setSuccessMessage("Project timeline milestone added."); setTimelineDraft({ project_id: "", title: "", description: "", due_date: "", status: "upcoming", visible_to_client: true }); await refresh(); }
    setSaving(false);
  };

  const updateTimelineStep = async (step: Row, changes: Row) => {
    setSaving(true); setError(""); setNotice("");
    const payload = { ...changes, completed_at: changes.status === "completed" ? new Date().toISOString() : changes.status ? null : step.completed_at };
    const { error: updateError } = await db.from("infiskies_project_timeline").update(payload).eq("id", step.id);
    if (updateError) setErrorMessage(updateError.message); else { setSuccessMessage("Timeline updated."); await refresh(); }
    setSaving(false);
  };
  const deleteTimelineStep = async (step: Row) => {
    if (!window.confirm("Delete timeline step “" + step.title + "”?")) return;
    setSaving(true);
    const { error: deleteError } = await db.from("infiskies_project_timeline").delete().eq("id", step.id);
    if (deleteError) setErrorMessage(deleteError.message); else { setSuccessMessage("Timeline step deleted."); await refresh(); }
    setSaving(false);
  };

  const goToClientPortal = async (email: string) => {
    await navigator.clipboard.writeText(window.location.origin);
    setSuccessMessage("Client Portal URL copied for " + email + ". Share the client’s email and initial password separately.");
  };

  return <div className="pipeline-page">
    <div className="pipeline-tabs" role="tablist" aria-label="Sales pipeline sections">
      <button className={tab === "leads" ? "active" : ""} onClick={() => setTab("leads")}><Users size={16} /> Sales leads</button>
      {isOwner && <button className={tab === "proposals" ? "active" : ""} onClick={() => setTab("proposals")}><FileText size={16} /> Proposal & estimate</button>}
      {isOwner && <button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}><Users size={16} /> Client accounts</button>}
      {isOwner && <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}><CalendarDays size={16} /> Project timeline</button>}
      <button className="pipeline-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>
    {notice && <div className="success-banner"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
    {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
    {loading && <div className="inline-loading"><span /> Loading sales and client records…</div>}

    {tab === "leads" && <div className="pipeline-grid">
      <section className="panel pipeline-form-panel"><div className="panel-heading"><div><h3><Plus size={17} /> Add a sales lead</h3><p>Capture a lead so owners can review and convert it to a proposal.</p></div></div>
        <form className="record-form" onSubmit={(event) => void saveLead(event)}>
          <div className="form-grid"><label>Lead / opportunity name<input name="title" value={leadDraft.title} onChange={(e) => setLeadDraft({ ...leadDraft, title: e.target.value })} required placeholder="Website redesign" /></label><label>Contact person<input name="contact_name" value={leadDraft.contact_name} onChange={(e) => setLeadDraft({ ...leadDraft, contact_name: e.target.value })} required placeholder="Contact name" /></label><label>Company / client<input name="company_name" value={leadDraft.company_name} onChange={(e) => setLeadDraft({ ...leadDraft, company_name: e.target.value })} placeholder="Company name" /></label><label>Service required<input name="service_interest" value={leadDraft.service_interest} onChange={(e) => setLeadDraft({ ...leadDraft, service_interest: e.target.value })} placeholder="Website, app, marketing…" /></label><label>Client email<input type="email" name="email" value={leadDraft.email} onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })} placeholder="client@company.com" /></label><label>Phone<input name="phone" value={leadDraft.phone} onChange={(e) => setLeadDraft({ ...leadDraft, phone: e.target.value })} placeholder="Contact number" /></label><label>Estimated value (₹)<input name="estimated_value" type="number" min="0" step="0.01" value={leadDraft.estimated_value} onChange={(e) => setLeadDraft({ ...leadDraft, estimated_value: e.target.value })} /></label><label>Next follow-up<input type="date" name="next_follow_up" value={leadDraft.next_follow_up} onChange={(e) => setLeadDraft({ ...leadDraft, next_follow_up: e.target.value })} /></label></div>
          <label>Notes / requirement<textarea name="notes" rows={3} value={leadDraft.notes} onChange={(e) => setLeadDraft({ ...leadDraft, notes: e.target.value })} placeholder="Customer needs, call outcome, next steps…" /></label>
          <button type="submit" className="button button-primary" disabled={saving}><Plus size={16} /> {saving ? "Saving…" : "Save lead"}</button>
        </form>
      </section>
      <section className="panel pipeline-records-panel"><div className="panel-heading"><div><h3>Sales lead register</h3><p>{leads.length} lead(s) visible to your account. Owners can review all employee leads.</p></div></div>
        {leads.length === 0 ? <div className="empty-state"><div className="empty-state-icon"><ClipboardList size={22} /></div><h3>No sales leads yet</h3><p>Start by adding a lead from the form.</p></div> : <div className="pipeline-record-list">{leads.map((lead) => <article className="pipeline-record-card" key={lead.id}>
          <div className="pipeline-record-head"><div><h4>{lead.title}</h4><p>{lead.contact_name}{lead.company_name ? " · " + lead.company_name : ""}</p></div><b className="inline-total">{money(lead.estimated_value)}</b></div>
          <div className="pipeline-meta"><span>{lead.service_interest || "Service not specified"}</span><span>{lead.email || lead.phone || "No contact details"}</span><span>Follow-up: {dateLabel(lead.next_follow_up)}</span></div>
          <div className="pipeline-inline-edit"><label>Status<select disabled={saving} value={lead.status} onChange={(e) => void updateLead(lead, { status: e.target.value })}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="proposal_sent">Proposal sent</option><option value="won">Won</option><option value="lost">Lost</option></select></label><label>Follow-up<input type="date" defaultValue={lead.next_follow_up || ""} onBlur={(e) => { if (e.target.value !== (lead.next_follow_up || "")) void updateLead(lead, { next_follow_up: e.target.value || null }); }} /></label><label className="pipeline-notes-field">Notes<input defaultValue={lead.notes || ""} onBlur={(e) => { if (e.target.value !== (lead.notes || "")) void updateLead(lead, { notes: e.target.value }); }} placeholder="Add call notes…" /></label></div>
          {isOwner && <div className="pipeline-card-actions"><span className="pipeline-owner-note">Added {dateLabel(lead.created_at)}</span><button className="button button-small button-secondary" disabled={saving} onClick={() => { setProposalDraft((old) => ({ ...old, lead_id: lead.id, title: lead.title, scope: lead.notes || lead.service_interest, total_amount: String(lead.estimated_value || "") })); setTab("proposals"); }}>Create proposal <ArrowUpRight size={14} /></button><button className="icon-button danger-icon" title="Delete lead" disabled={saving} onClick={() => void deleteLead(lead)}><Trash2 size={15} /></button></div>}
        </article>)}</div>}
      </section>
    </div>}

    {tab === "clients" && isOwner && <div className="pipeline-grid">
      <section className="panel pipeline-form-panel"><div className="panel-heading"><div><h3><Users size={17} /> Create client portal access</h3><p>Set the email and temporary password the client will use to sign in.</p></div></div>
        <form className="record-form" onSubmit={(e) => void createClient(e)}><label>Client full name<input value={clientDraft.full_name} onChange={(e) => setClientDraft({ ...clientDraft, full_name: e.target.value })} required /></label><label>Client email<input type="email" value={clientDraft.email} onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })} required /></label><label>Company name<input value={clientDraft.company_name} onChange={(e) => setClientDraft({ ...clientDraft, company_name: e.target.value })} /></label><label>Phone<input value={clientDraft.phone} onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })} /></label><label>Initial password<input type="password" autoComplete="new-password" minLength={10} value={clientDraft.password} onChange={(e) => setClientDraft({ ...clientDraft, password: e.target.value })} required /><small className="field-hint">Use at least 10 characters. Share this password privately; it will not be stored in the client listing.</small></label><button className="button button-primary" type="submit" disabled={saving}><Plus size={16} /> Create client access</button></form>
      </section>
      <section className="panel pipeline-records-panel"><div className="panel-heading"><div><h3>Client Portal accounts</h3><p>{clients.length} client account(s). Clients can only see projects explicitly linked to them.</p></div></div>
        {clients.length === 0 ? <div className="empty-state"><div className="empty-state-icon"><Users size={22} /></div><h3>No clients yet</h3><p>Create a client account to enable proposal acceptance and milestone payments.</p></div> : <div className="table-wrap"><table><thead><tr><th>Client</th><th>Company</th><th>Access</th><th>Portal</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><b>{client.full_name}</b><small className="cell-sub">{client.email}</small></td><td>{client.company_name || "—"}</td><td><span className={"status-pill status-" + client.status}>{labelize(client.status)}</span></td><td><button className="icon-button" title="Copy Client Portal URL" onClick={() => void goToClientPortal(client.email)}><Copy size={15} /></button></td></tr>)}</tbody></table></div>}
      </section>
    </div>}

    {tab === "proposals" && isOwner && <div className="pipeline-grid">
      <section className="panel pipeline-form-panel"><div className="panel-heading"><div><h3><FileText size={17} /> Proposal with estimate</h3><p>Customize scope, contract price and any number of milestone payments.</p></div></div>
        {clients.length === 0 ? <div className="inline-empty-hint">Create a client account first in the Client accounts tab.</div> : <form className="record-form" onSubmit={(e) => void createProposal(e)}>
          <div className="form-grid"><label>Client<select value={proposalDraft.client_id} onChange={(e) => setProposalDraft({ ...proposalDraft, client_id: e.target.value })} required><option value="">Select client</option>{clients.filter((client) => client.status === "active").map((client) => <option key={client.id} value={client.id}>{client.full_name} · {client.email}</option>)}</select></label><label>Related sales lead<select value={proposalDraft.lead_id} onChange={(e) => setProposalDraft({ ...proposalDraft, lead_id: e.target.value })}><option value="">None</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.title} · {lead.contact_name}</option>)}</select></label><label>Existing project (optional)<select value={proposalDraft.project_id} onChange={(e) => setProposalDraft({ ...proposalDraft, project_id: e.target.value })}><option value="">Create project when accepted</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Proposal title<input value={proposalDraft.title} onChange={(e) => setProposalDraft({ ...proposalDraft, title: e.target.value })} required placeholder="Website development proposal" /></label><label>Estimate amount (₹)<input type="number" min="0.01" step="0.01" value={proposalDraft.total_amount} onChange={(e) => setProposalDraft({ ...proposalDraft, total_amount: e.target.value })} required /></label></div>
          <label>Scope of work<textarea rows={4} value={proposalDraft.scope} onChange={(e) => setProposalDraft({ ...proposalDraft, scope: e.target.value })} required placeholder="Deliverables, design, development, integrations…" /></label><label>Terms & assumptions<textarea rows={3} value={proposalDraft.terms} onChange={(e) => setProposalDraft({ ...proposalDraft, terms: e.target.value })} placeholder="Revisions, exclusions, validity and payment terms…" /></label>
          <div className="milestone-editor-head"><div><h4>Payment milestones</h4><p>Percentages must total 100%. Client can pay each milestone in the Client Portal.</p></div><button type="button" className="button button-small button-secondary" onClick={() => setMilestoneDrafts((old) => [...old, { title: "", percentage: "", description: "", due_date: "" }])}><Plus size={14} /> Add milestone</button></div>
          <div className="milestone-editor-list">{milestoneDrafts.map((milestone, index) => <div className="milestone-editor-row" key={index}><div className="milestone-row-number">{index + 1}</div><div className="form-grid milestone-row-fields"><label>Milestone title<input value={milestone.title} onChange={(e) => setMilestoneDrafts((old) => old.map((row, i) => i === index ? { ...row, title: e.target.value } : row))} required /></label><label>Percentage (%)<input type="number" min="0.01" max="100" step="0.001" value={milestone.percentage} onChange={(e) => setMilestoneDrafts((old) => old.map((row, i) => i === index ? { ...row, percentage: e.target.value } : row))} required /></label><label>Due date<input type="date" value={milestone.due_date} onChange={(e) => setMilestoneDrafts((old) => old.map((row, i) => i === index ? { ...row, due_date: e.target.value } : row))} /></label><label>Description<input value={milestone.description} onChange={(e) => setMilestoneDrafts((old) => old.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} placeholder="What is this payment for?" /></label></div>{milestoneDrafts.length > 1 && <button type="button" className="icon-button danger-icon" title="Remove milestone" onClick={() => setMilestoneDrafts((old) => old.filter((_, i) => i !== index))}><X size={15} /></button>}</div>)}</div>
          <div className="milestone-total-row"><span>Milestone allocation</span><b>{milestoneDrafts.reduce((sum, item) => sum + Number(item.percentage || 0), 0).toFixed(2)}%</b><span>Estimated total</span><b>{money(Number(proposalDraft.total_amount || 0))}</b></div>
          <button className="button button-primary" type="submit" disabled={saving || !clients.length}><Send size={15} /> {saving ? "Preparing proposal…" : "Create and send proposal"}</button>
        </form>}
      </section>
      <section className="panel pipeline-records-panel"><div className="panel-heading"><div><h3>Sent proposals</h3><p>{proposals.length} proposal(s), including drafts awaiting completion.</p></div></div>
        {proposals.length === 0 ? <div className="empty-state"><div className="empty-state-icon"><FileText size={22} /></div><h3>No proposals yet</h3><p>Create an estimate and send it to a client; they can accept it from Client Portal.</p></div> : <div className="pipeline-record-list">{proposals.map((proposal) => <article className="pipeline-record-card" key={proposal.id}><div className="pipeline-record-head"><div><h4>{proposal.title}</h4><p>{clientById.get(proposal.client_id)?.full_name || "Client"} · {projectById.get(proposal.project_id)?.name || "Project created on acceptance"}</p></div><b className="inline-total">{money(proposal.total_amount)}</b></div><div className="pipeline-meta"><span className={"status-pill status-" + proposal.status}>{labelize(proposal.status)}</span><span>{(milestoneByProposal.get(proposal.id) || []).length} payment milestones</span><span>{dateLabel(proposal.created_at)}</span></div><div className="proposal-mini-milestones">{(milestoneByProposal.get(proposal.id) || []).map((milestone) => <span key={milestone.id}>{milestone.title}: {Number(milestone.percentage)}% ({money(milestone.amount)})</span>)}</div>{proposal.status === "draft" && <button className="button button-small button-secondary" disabled={saving} onClick={() => void (async () => { const { error: sendError } = await db.from("infiskies_proposals").update({ status: "sent" }).eq("id", proposal.id); if (sendError) setErrorMessage(sendError.message); else { setSuccessMessage("Proposal sent to the client."); await refresh(); } })()}><Send size={14} /> Send proposal</button>}</article>)}</div>}
      </section>
    </div>}

    {tab === "timeline" && isOwner && <div className="pipeline-grid">
      <div className="pipeline-column">
        <section className="panel pipeline-form-panel"><div className="panel-heading"><div><h3><BriefcaseBusiness size={17} /> Link client to a project</h3><p>Use this for projects that already exist. Each project can be linked to one client portal account.</p></div></div>
          <form className="record-form" onSubmit={(e) => void createProjectLink(e)}><label>Client<select value={linkDraft.client_id} onChange={(e) => setLinkDraft({ ...linkDraft, client_id: e.target.value })} required><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.full_name} · {client.email}</option>)}</select></label><label>Project<select value={linkDraft.project_id} onChange={(e) => setLinkDraft({ ...linkDraft, project_id: e.target.value })} required><option value="">Select project</option>{projects.filter((project) => !linkedProjectIds.has(project.id) || clientProjects.some((link) => link.project_id === project.id && link.client_id === linkDraft.client_id)).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="submit" className="button button-primary" disabled={saving}><Check size={16} /> Link project</button></form>
        </section>
        <section className="panel pipeline-form-panel"><div className="panel-heading"><div><h3><CalendarDays size={17} /> Add timeline step</h3><p>Only the linked client can see steps marked visible to client.</p></div></div>
          <form className="record-form" onSubmit={(e) => void createTimelineStep(e)}><label>Project<select value={timelineDraft.project_id} onChange={(e) => setTimelineDraft({ ...timelineDraft, project_id: e.target.value })} required><option value="">Select a linked project</option>{projects.filter((project) => linkedProjectIds.has(project.id)).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Milestone / phase<input value={timelineDraft.title} onChange={(e) => setTimelineDraft({ ...timelineDraft, title: e.target.value })} required placeholder="UI design approval" /></label><label>Description<textarea rows={3} value={timelineDraft.description} onChange={(e) => setTimelineDraft({ ...timelineDraft, description: e.target.value })} placeholder="Phase details and deliverables" /></label><div className="form-grid"><label>Due date<input type="date" value={timelineDraft.due_date} onChange={(e) => setTimelineDraft({ ...timelineDraft, due_date: e.target.value })} /></label><label>Status<select value={timelineDraft.status} onChange={(e) => setTimelineDraft({ ...timelineDraft, status: e.target.value })}><option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option></select></label></div><label className="inline-checkbox"><input type="checkbox" checked={timelineDraft.visible_to_client} onChange={(e) => setTimelineDraft({ ...timelineDraft, visible_to_client: e.target.checked })} /> Visible in Client Portal</label><button type="submit" className="button button-primary" disabled={saving || !projects.some((project) => linkedProjectIds.has(project.id))}><Plus size={16} /> Add timeline step</button></form>
        </section>
      </div>
      <section className="panel pipeline-records-panel"><div className="panel-heading"><div><h3>Project timeline management</h3><p>{timeline.length} timeline step(s). Project details are filtered by each client's link.</p></div></div>
        {timeline.length === 0 ? <div className="empty-state"><div className="empty-state-icon"><CalendarDays size={22} /></div><h3>No timeline steps</h3><p>Link a client to a project and add project phases.</p></div> : <div className="pipeline-record-list">{timeline.map((step) => <article className="pipeline-record-card" key={step.id}><div className="pipeline-record-head"><div><h4>{step.title}</h4><p>{projectById.get(step.project_id)?.name || "Project"}</p></div><span className={"status-pill status-" + step.status}>{labelize(step.status)}</span></div><p className="timeline-description">{step.description || "No description"}</p><div className="pipeline-inline-edit"><label>Status<select value={step.status} disabled={saving} onChange={(e) => void updateTimelineStep(step, { status: e.target.value })}><option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option></select></label><label>Due date<input type="date" defaultValue={step.due_date || ""} onBlur={(e) => { if ((e.target.value || null) !== (step.due_date || null)) void updateTimelineStep(step, { due_date: e.target.value || null }); }} /></label><label className="inline-checkbox"><input type="checkbox" checked={Boolean(step.visible_to_client)} onChange={(e) => void updateTimelineStep(step, { visible_to_client: e.target.checked })} /> Client visible</label><button className="icon-button danger-icon" title="Delete timeline step" onClick={() => void deleteTimelineStep(step)}><Trash2 size={15} /></button></div></article>)}</div>}
      </section>
    </div>}
  </div>;
}
