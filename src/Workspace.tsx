/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, ArrowRight, Banknote, Bell, BriefcaseBusiness, CalendarDays, Check, CheckCircle2,
  AlertCircle, ChevronDown, CircleDollarSign, Command, Download, ExternalLink, HandCoins,
  LayoutDashboard, ListTodo, LockKeyhole, LogOut, Menu, Plus, Search, Settings, ShieldCheck,
  TrendingUp, Users, Wallet, X, Pencil, Trash2, RefreshCw, ReceiptText, UserPlus, Copy
} from "lucide-react";
import { supabase } from "./lib/supabase";
import OwnerFinanceDashboard from "./OwnerFinanceDashboard";

type Role = "owner" | "co_admin" | "employee";
type Row = Record<string, any>;
type Kind = "project" | "expense" | "income" | "share" | "task" | "invite" | "payout" | "permissions" | "help" | null;
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const dateInput = (value?: string | null) => value ? String(value).slice(0, 10) : "";
const titleCase = (value?: string | null) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
const shortId = (id?: string | null) => id ? id.slice(0, 8).toUpperCase() : "—";

function EmptyState({ title, detail, onAdd, action = "Add first record" }: { title: string; detail: string; onAdd?: () => void; action?: string }) {
  return <div className="empty-state"><div className="empty-state-icon"><ReceiptText size={23} /></div><h3>{title}</h3><p>{detail}</p>{onAdd && <button className="button button-primary" onClick={onAdd}><Plus size={16} /> {action}</button>}</div>;
}
function StatCard({ label, value, caption, icon, color }: { label: string; value: string; caption: string; icon: ReactNode; color: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={"stat-icon " + color}>{icon}</div></div><strong>{value}</strong><div className="stat-bottom"><span className="stat-neutral">{caption}</span></div></div>;
}
function ModalShell({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onClick={close} role="presentation"><section className={"modal-card" + (wide ? " modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}><header className="modal-head"><div><span className="eyebrow muted">INFISKIES FINANCE</span><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></header>{children}</section></div>;
}
export default function Workspace({ session, role, onSignOut }: { session: Session; role: Role; onSignOut: () => void }) {
  const db = supabase as any;
  const [view, setView] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Kind>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [projects, setProjects] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [shares, setShares] = useState<Row[]>([]);
  const [income, setIncome] = useState<Row[]>([]);
  const [payouts, setPayouts] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [invitations, setInvitations] = useState<Row[]>([]);
  const [activity, setActivity] = useState<Row[]>([]);
  const [workspaceName, setWorkspaceName] = useState("Infiskies Studio");
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({
    "members.manage": false, "projects.manage": false, "finance.view": true, "finance.manage": false,
    "payouts.manage": false, "tasks.view_all": false, "tasks.assign": false, "tasks.manage": false, "audit.view": false
  });

  const refreshData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    const results = await Promise.all([
      db.from("infiskies_projects").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_expenses").select("*").order("expense_date", { ascending: false }),
      db.from("infiskies_project_members").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_revenue_entries").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_payouts").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_tasks").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_profiles").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_invitations").select("*").order("created_at", { ascending: false }),
      db.from("infiskies_audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("infiskies_app_settings").select("*").eq("id", "workspace").maybeSingle()
    ]);
    const [pr, ex, sh, inc, pay, ta, prof, inv, act, settings] = results;
    const errors = results.filter((r) => r.error).map((r) => r.error.message);
    setProjects(pr.data || []);
    setExpenses(ex.data || []);
    setShares(sh.data || []);
    setIncome(inc.data || []);
    setPayouts(pay.data || []);
    setTasks(ta.data || []);
    setProfiles(prof.data || []);
    setInvitations(inv.data || []);
    setActivity(act.data || []);
    if (settings.data?.settings?.name) setWorkspaceName(settings.data.settings.name);
    setError(errors.length ? "Some data could not be loaded: " + Array.from(new Set(errors)).join(" · ") : "");
    setLoading(false);
  }, [db]);
  useEffect(() => { void refreshData(); }, [refreshData]);

  const isOwner = role === "owner";
  const visibleItems = role === "employee"
    ? [{ label: "Overview", icon: LayoutDashboard, section: "Workspace" }, { label: "Tasks", icon: ListTodo, section: "Workspace" }, { label: "Team shares", icon: CircleDollarSign, section: "Finance" }, { label: "Payouts", icon: Banknote, section: "Finance" }]
    : [
      { label: "Overview", icon: LayoutDashboard, section: "Workspace" }, { label: "Projects", icon: BriefcaseBusiness, section: "Workspace" },
      { label: "Tasks", icon: ListTodo, section: "Workspace" }, { label: "Expenses", icon: Wallet, section: "Finance" },
      { label: "Income", icon: TrendingUp, section: "Finance" }, { label: "Team shares", icon: CircleDollarSign, section: "Finance" },
      { label: "Payouts", icon: Banknote, section: "Finance" }, { label: "Reports", icon: Activity, section: "Finance" }
    ];
  const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Team member";
  const firstName = userName.split(" ")[0];
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const total = (rows: Row[], field = "amount") => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const totalProjectValue = total(projects, "contract_value");
  const actualExpenseRows = expenses.filter((e) => e.status !== "void" && e.status !== "planned");
  const plannedExpenseRows = expenses.filter((e) => e.status === "planned");
  const totalExpenses = total(actualExpenseRows, "amount");
  const totalIncome = total(income.filter((r) => r.status === "received"), "amount");
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "blocked").length;
  const paidPayouts = total(payouts.filter((p) => p.status === "paid"));
  const totalCommittedShares = shares.filter((s) => s.status === "active").reduce((sum, s) => {
    const p = projectById.get(s.project_id);
    return sum + (s.share_type === "percentage" ? Number(p?.share_base_amount || 0) * Number(s.share_value || 0) / 100 : Number(s.share_value || 0));
  }, 0);
  const query = search.trim().toLowerCase();
  const contains = (row: Row, fields: string[]) => !query || fields.some((field) => String(row[field] || "").toLowerCase().includes(query));
  const projectName = (id?: string | null) => id ? projectById.get(id)?.name || shortId(id) : "Business-wide";
  const memberName = (id?: string | null) => id ? profileById.get(id)?.full_name || profileById.get(id)?.email || shortId(id) : "Unassigned";
  const calcShare = (share: Row) => {
    const project = projectById.get(share.project_id);
    return share.share_type === "percentage" ? Number(project?.share_base_amount || 0) * Number(share.share_value || 0) / 100 : Number(share.share_value || 0);
  };
  const visibleProjects = projects.filter((p) => contains(p, ["name", "client_name", "description", "status"]));
  const visibleExpenses = expenses.filter((e) => contains(e, ["category", "description", "status", "scope"]) || projectName(e.project_id).toLowerCase().includes(query));
  const visibleIncome = income.filter((r) => contains(r, ["description", "reference", "status"]) || projectName(r.project_id).toLowerCase().includes(query));
  const visibleShares = shares.filter((s) => contains(s, ["share_type", "status"]) || memberName(s.employee_id).toLowerCase().includes(query) || projectName(s.project_id).toLowerCase().includes(query));
  const visibleTasks = tasks.filter((t) => contains(t, ["title", "description", "status", "priority"]) || memberName(t.assigned_to).toLowerCase().includes(query) || projectName(t.project_id).toLowerCase().includes(query));
  const visiblePayouts = payouts.filter((p) => contains(p, ["status", "notes", "payment_reference"]) || memberName(p.employee_id).toLowerCase().includes(query) || projectName(p.project_id).toLowerCase().includes(query));
  const visibleProfiles = profiles.filter((p) => contains(p, ["email", "full_name", "role", "status"]));
  const closeModal = () => { setModal(null); setEditing(null); };
  const openModal = (kind: Kind, row: Row | null = null) => { setError(""); setEditing(row); setModal(kind); };

  const saveRecord = async (table: string, payload: Row) => {
    const response = editing?.id && modal !== "invite"
      ? await db.from(table).update(payload).eq("id", editing.id)
      : await db.from(table).insert(payload);
    if (response.error) throw response.error;
    setNotice(editing?.id && modal !== "invite" ? "Changes saved." : "Record added.");
    closeModal();
    await refreshData();
  };

  const submitModal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const val = (key: string) => String(form.get(key) || "").trim();
    const num = (key: string) => Number(form.get(key) || 0);
    const nullable = (key: string) => val(key) || null;
    setSaving(true); setError(""); setNotice("");
    try {
      if (modal === "project") {
        await saveRecord("infiskies_projects", {
          name: val("name"), client_name: val("client_name"), description: val("description"), status: val("status"),
          contract_value: num("contract_value"), share_base_amount: num("share_base_amount"),
          start_date: nullable("start_date"), due_date: nullable("due_date"), created_by: session.user.id
        });
      } else if (modal === "expense") {
        const scope = val("scope");
        const projectId = scope === "project" ? nullable("project_id") : null;
        if (scope === "project" && !projectId) throw new Error("Select a project for a project expense.");
        await saveRecord("infiskies_expenses", {
          scope, project_id: projectId, category: val("category"), description: val("description"),
          amount: num("amount"), expense_date: val("expense_date") || new Date().toISOString().slice(0, 10),
          status: val("status"), paid_by: nullable("paid_by"), created_by: session.user.id
        });
      } else if (modal === "income") {
        const status = val("status");
        await saveRecord("infiskies_revenue_entries", {
          project_id: val("project_id"), description: val("description"), reference: nullable("reference"),
          amount: num("amount"), status, invoice_date: nullable("invoice_date"),
          received_at: status === "received" ? (editing?.received_at || new Date().toISOString()) : null,
          created_by: session.user.id
        });
      } else if (modal === "share") {
        const payload = { project_id: val("project_id"), employee_id: val("employee_id"), share_type: val("share_type"), share_value: num("share_value"), status: val("status"), created_by: session.user.id };
        if (payload.share_type === "percentage" && payload.share_value > 100) throw new Error("Percentage share cannot exceed 100%.");
        await saveRecord("infiskies_project_members", payload);
      } else if (modal === "task") {
        const status = val("status");
        await saveRecord("infiskies_tasks", {
          title: val("title"), description: val("description"), project_id: nullable("project_id"),
          assigned_to: val("assigned_to"), assigned_by: editing?.assigned_by || session.user.id, status, priority: val("priority"),
          progress_percent: num("progress_percent"), due_at: val("due_at") ? new Date(val("due_at")).toISOString() : null,
          completed_at: status === "done" ? (editing?.completed_at || new Date().toISOString()) : null
        });
      } else if (modal === "invite") {
        const email = val("email").toLowerCase();
        const inviteRole = val("role");
        if (!email.includes("@")) throw new Error("Enter a valid email address.");
        if (email === String(session.user.email || "").toLowerCase()) throw new Error("You are already the workspace owner.");
        const response = await db.from("infiskies_invitations").insert({
          email, role: inviteRole, permissions: inviteRole === "co_admin" ? permissionDraft : {}, invited_by: session.user.id
        });
        if (response.error) throw response.error;
        setNotice("Invitation saved. Send the app URL to " + email + "; after signing in with that Google email, their account will be activated.");
        closeModal(); await refreshData();
      } else if (modal === "permissions" && editing) {
        await saveRecord("infiskies_profiles", { permissions: { ...permissionDraft } });
      } else if (modal === "payout" && editing) {
        const share = editing;
        const project = projectById.get(share.project_id);
        const amount = num("amount");
        if (!project) throw new Error("Project not found for this agreement.");
        if (amount <= 0) throw new Error("Payout amount must be greater than zero.");
        const response = await db.from("infiskies_payouts").insert({
          project_id: share.project_id, project_member_id: share.id, employee_id: share.employee_id, amount,
          share_type_snapshot: share.share_type, share_value_snapshot: share.share_value,
          share_base_snapshot: Number(project.share_base_amount || 0), agreement_version_snapshot: Number(share.agreement_version || 1),
          status: "pending", notes: val("notes"), created_by: session.user.id
        });
        if (response.error) throw response.error;
        setNotice("Payout recorded as pending approval."); closeModal(); await refreshData();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this record."); }
    finally { setSaving(false); }
  };

  const removeRecord = async (table: string, row: Row, label: string) => {
    if (!window.confirm("Delete " + label + "? This cannot be undone.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const { error: deleteError } = await db.from(table).delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      setNotice(label + " deleted."); await refreshData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete this record."); }
    finally { setSaving(false); }
  };
  const updateTask = async (task: Row, changes: Row) => {
    setSaving(true); setError(""); setNotice("");
    const status = changes.status || task.status;
    const payload = { ...changes, completed_at: status === "done" ? (task.completed_at || new Date().toISOString()) : status ? null : task.completed_at };
    const { error: updateError } = await db.from("infiskies_tasks").update(payload).eq("id", task.id);
    if (updateError) setError(updateError.message);
    else { setNotice("Task updated."); await refreshData(); }
    setSaving(false);
  };
  const updateProfile = async (profile: Row, changes: Row) => {
    if (profile.role === "owner") return;
    setSaving(true); setError(""); setNotice("");
    const { error: updateError } = await db.from("infiskies_profiles").update(changes).eq("id", profile.id);
    if (updateError) setError(updateError.message);
    else { setNotice("Team member updated."); await refreshData(); }
    setSaving(false);
  };
  const updatePayout = async (payout: Row, status: string) => {
    setSaving(true); setError(""); setNotice("");
    const payload: Row = { status };
    if (status === "approved") { payload.approved_by = session.user.id; payload.approved_at = new Date().toISOString(); }
    if (status === "paid") { payload.paid_by = session.user.id; payload.paid_at = new Date().toISOString(); }
    const { error: updateError } = await db.from("infiskies_payouts").update(payload).eq("id", payout.id);
    if (updateError) setError(updateError.message);
    else { setNotice("Payout marked " + status + "."); await refreshData(); }
    setSaving(false);
  };
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const { error: settingsError } = await db.from("infiskies_app_settings").upsert({ id: "workspace", settings: { name: workspaceName.trim() || "Infiskies Studio" }, updated_by: session.user.id }, { onConflict: "id" });
    if (settingsError) setError(settingsError.message);
    else { setNotice("Workspace settings saved."); await refreshData(); }
    setSaving(false);
  };
  const exportCsv = (name: string, rows: Row[], columns: { key: string; label: string }[]) => {
    const esc = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const csv = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
    setNotice("CSV export prepared.");
  };

  const openCreate = (kind: Kind) => openModal(kind, null);
  const projectOptions = projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
  const employeeOptions = profiles.filter((p) => p.status === "active" && p.role !== "owner").map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email} · {p.email}</option>);
  const pageActions = () => {
    if (view === "Projects" && role !== "employee") return <button className="button button-primary" onClick={() => openCreate("project")}><Plus size={16} /> New project</button>;
    if (view === "Expenses" && role !== "employee") return <button className="button button-primary" onClick={() => openCreate("expense")}><Plus size={16} /> Add expense</button>;
    if (view === "Income" && role !== "employee") return <button className="button button-primary" onClick={() => openCreate("income")}><Plus size={16} /> Add income</button>;
    if (view === "Team shares" && role !== "employee") return <button className="button button-primary" onClick={() => openCreate("share")}><Plus size={16} /> Add share agreement</button>;
    if (view === "Tasks" && role !== "employee") return <button className="button button-primary" onClick={() => openCreate("task")}><Plus size={16} /> New task</button>;
    if (view === "Team" && isOwner) return <button className="button button-primary" onClick={() => { setPermissionDraft({ "members.manage": false, "projects.manage": false, "finance.view": true, "finance.manage": false, "payouts.manage": false, "tasks.view_all": false, "tasks.assign": false, "tasks.manage": false, "audit.view": false }); openCreate("invite"); }}><UserPlus size={16} /> Invite member</button>;
    if (view === "Reports") return <button className="button button-primary" onClick={() => exportCsv("infiskies-projects.csv", projects, [{ key: "name", label: "Project" }, { key: "client_name", label: "Client" }, { key: "status", label: "Status" }, { key: "contract_value", label: "Contract value" }, { key: "share_base_amount", label: "Share base" }, { key: "due_date", label: "Due date" }])}><Download size={16} /> Export projects</button>;
    return <button className="button button-secondary" onClick={() => void refreshData()} disabled={loading}><RefreshCw size={15} /> Refresh data</button>;
  };

  return <div className="app-shell">
    <aside className={"sidebar" + (menuOpen ? " sidebar-open" : "")}>
      <div className="brand"><div className="brand-mark"><span /><span /><span /><span /></div><div><strong>infiskies</strong><small>FINANCE</small></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">IF</div><div><b>{workspaceName}</b><small>Finance workspace</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">MENU</div>
      {["Workspace", "Finance"].map((section) => <div key={section}><div className="nav-section-label">{section}</div>{visibleItems.filter((i) => i.section === section).map((item) => <button key={item.label} className={"nav-item" + (view === item.label ? " active" : "")} onClick={() => { setView(item.label); setSearch(""); setMenuOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.label === "Tasks" && tasks.filter((t) => t.status !== "done").length > 0 && <span className="nav-count">{tasks.filter((t) => t.status !== "done").length}</span>}</button>)}</div>)}
      {role !== "employee" && <><div className="nav-section-label">Manage</div><button className={"nav-item" + (view === "Team" ? " active" : "")} onClick={() => setView("Team")}><Users size={18} /><span>Team members</span></button>{isOwner && <button className={"nav-item" + (view === "Settings" ? " active" : "")} onClick={() => setView("Settings")}><Settings size={18} /><span>Settings & access</span></button>}<button className={"nav-item" + (view === "Activity" ? " active" : "")} onClick={() => setView("Activity")}><Activity size={18} /><span>Activity log</span></button></>}
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Command size={16} /></div><b>Need a hand?</b><p>Learn the everyday actions in this workspace.</p><button onClick={() => openModal("help")}>Open quick guide <ArrowRight size={14} /></button></div><div className="profile-row"><div className="profile-avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="profile-meta"><b>{userName}</b><small>{role.replace("_", " ")}</small></div><button className="icon-button compact" onClick={onSignOut} title="Sign out"><LogOut size={16} /></button></div></div>
    </aside>
    {menuOpen && <button aria-label="Close menu" className="mobile-scrim" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><div className="breadcrumb">Workspace <span>/</span> <b>{view}</b></div><div className="topbar-actions"><label className="search-box"><Search size={16} /><input placeholder="Search current view..." aria-label="Search current view" value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-button" title="Activity log" onClick={() => setView("Activity")}><Bell size={18} /></button><div className="topbar-avatar">{userName.slice(0, 1).toUpperCase()}</div></div></header>
      <div className="page-content"><div className="welcome-row"><div><div className="date-line"><CalendarDays size={14} /> INFISKIES FINANCE WORKSPACE</div><h1>{view === "Overview" ? "Welcome, " + firstName : view}</h1><p>{({ Overview: "Current totals based on the records your account can access.", Projects: "Create projects and maintain contract values and timelines.", Tasks: "Assign work and update task progress.", Expenses: "Track actual business and project expenses.", Income: "Track invoices, expected income and receipts.", "Team shares": "Manage project-specific share agreements.", Payouts: "Approve and track employee payouts.", Reports: "Export current database records as CSV.", Team: "Manage member access and invitations.", Settings: "Manage workspace name and security information.", Activity: "Review recorded workspace changes." } as Record<string, string>)[view] || "Your workspace, all in one place."}</p></div><div className="welcome-actions">{pageActions()}</div></div>
        {notice && <div className="success-banner"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
        {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
        {loading && <div className="inline-loading"><span /> Loading latest records from Supabase…</div>}

        {view === "Overview" && isOwner && <OwnerFinanceDashboard projects={projects} expenses={expenses} shares={shares} income={income} payouts={payouts} search={query} onRefresh={() => void refreshData()} onNavigate={(next) => setView(next)} />}
        {view === "Overview" && !isOwner && <div className="data-view"><div className="stat-grid">
          <StatCard label="Project value" value={money(totalProjectValue)} caption={projects.length + " saved project(s)"} color="lilac" icon={<BriefcaseBusiness size={18} />} />
          <StatCard label="Income received" value={money(totalIncome)} caption={income.filter((r) => r.status === "received").length + " receipt(s)"} color="mint" icon={<TrendingUp size={18} />} />
          <StatCard label="Expenses recorded" value={money(totalExpenses)} caption={actualExpenseRows.length + " actual record(s)"} color="peach" icon={<Wallet size={18} />} />
          <StatCard label="Open tasks" value={String(openTasks)} caption={tasks.length + " saved task(s)"} color="blue" icon={<ListTodo size={18} />} />
        </div><div className="overview-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Projects</h3><p>Latest records from the database</p></div><button className="text-button" onClick={() => setView("Projects")}>View projects <ArrowRight size={15} /></button></div>
            {projects.length === 0 ? <EmptyState title="No projects yet" detail="Create your first project; the totals will then update from real data." onAdd={role !== "employee" ? () => openCreate("project") : undefined} /> : <div className="record-list">{projects.slice(0, 5).map((p) => <div className="record-row" key={p.id}><div className="record-monogram">{String(p.name || "P").slice(0, 2).toUpperCase()}</div><div className="record-main"><b>{p.name}</b><small>{p.client_name || "No client specified"}</small></div><div className="record-right"><b>{money(Number(p.contract_value || 0))}</b><span className={"status-pill status-" + p.status}>{titleCase(p.status)}</span></div></div>)}</div>}
          </section>
          <section className="panel"><div className="panel-heading"><div><h3>Financial snapshot</h3><p>Calculated from actual entries</p></div><button className="icon-button" title="Refresh records" onClick={() => void refreshData()}><RefreshCw size={16} /></button></div>
            <div className="snapshot-list"><div><span>Project value</span><b>{money(totalProjectValue)}</b></div><div><span>Income received</span><b className="money-positive">{money(totalIncome)}</b></div><div><span>Expenses recorded</span><b>{money(totalExpenses)}</b></div><div><span>Committed shares</span><b>{money(totalCommittedShares)}</b></div><div className="snapshot-total"><span>Income less expenses</span><b>{money(totalIncome - totalExpenses)}</b></div></div><p className="small-note">Simple cash summary only; not a profit, tax or accounting statement.</p>
          </section></div><div className="overview-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Tasks needing attention</h3><p>Incomplete tasks in your accessible workspace</p></div><button className="text-button" onClick={() => setView("Tasks")}>All tasks <ArrowRight size={15} /></button></div>
            {tasks.filter((t) => t.status !== "done").length === 0 ? <EmptyState title="No open tasks" detail="Tasks assigned to your account will appear here." onAdd={role !== "employee" ? () => openCreate("task") : undefined} /> : <div className="compact-table">{tasks.filter((t) => t.status !== "done").slice(0, 5).map((t) => <div className="compact-row" key={t.id}><div><b>{t.title}</b><small>{projectName(t.project_id)} · {memberName(t.assigned_to)}</small></div><span className={"status-pill status-" + t.status}>{titleCase(t.status)}</span></div>)}</div>}
          </section>
          <section className="panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Changes recorded by audit triggers</p></div><button className="text-button" onClick={() => setView("Activity")}>View log <ArrowRight size={15} /></button></div>
            {activity.length === 0 ? <EmptyState title="No activity recorded yet" detail="Create or update a record to start the audit trail." /> : <div className="compact-table">{activity.slice(0, 5).map((a) => <div className="activity-row" key={a.id}><div className="activity-dot"><Activity size={14} /></div><div><b>{titleCase(a.action)} {titleCase(a.entity_type)}</b><small>{Object.values(a.details || {}).filter(Boolean).join(" · ") || shortId(a.entity_id)} · {dateLabel(a.created_at)}</small></div></div>)}</div>}
          </section></div></div>}

        {view === "Projects" && <section className="panel full-panel"><div className="panel-heading"><div><h3>All projects</h3><p>{visibleProjects.length} matching record(s)</p></div><button className="button button-secondary" onClick={() => void refreshData()}><RefreshCw size={15} /> Refresh</button></div>
          {visibleProjects.length === 0 ? <EmptyState title={query ? "No matching projects" : "No projects yet"} detail={query ? "Try another search term." : "Add a real project with contract value, share base and schedule."} onAdd={role !== "employee" ? () => openCreate("project") : undefined} /> : <div className="table-wrap"><table><thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Contract value</th><th>Share base</th><th>Due date</th><th>Actions</th></tr></thead><tbody>{visibleProjects.map((p) => <tr key={p.id}><td><b>{p.name}</b><small className="cell-sub">{p.description || shortId(p.id)}</small></td><td>{p.client_name || "—"}</td><td><span className={"status-pill status-" + p.status}>{titleCase(p.status)}</span></td><td>{money(Number(p.contract_value || 0))}</td><td>{money(Number(p.share_base_amount || 0))}</td><td>{dateLabel(p.due_date)}</td><td><div className="row-actions">{role !== "employee" && <><button className="icon-button" title="Edit project" onClick={() => openModal("project", p)}><Pencil size={15} /></button><button className="icon-button danger-icon" title="Delete project" onClick={() => void removeRecord("infiskies_projects", p, p.name)}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </section>}

        {view === "Expenses" && <section className="panel full-panel"><div className="panel-heading"><div><h3>Expense register</h3><p>{visibleExpenses.length} matching row(s); Planned entries are forecast-only, not actual spending.</p></div><b className="inline-total">{money(totalExpenses)}</b></div>
          {visibleExpenses.length === 0 ? <EmptyState title={query ? "No matching expenses" : "No expenses recorded"} detail="Only saved Supabase entries appear here." onAdd={role !== "employee" ? () => openCreate("expense") : undefined} /> : <div className="table-wrap"><table><thead><tr><th>Expense</th><th>Project / scope</th><th>Date</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{visibleExpenses.map((e) => <tr key={e.id}><td><b>{e.category}</b><small className="cell-sub">{e.description || "No description"}</small></td><td>{e.scope === "business" ? "Business-wide" : projectName(e.project_id)}</td><td>{dateLabel(e.expense_date)}</td><td><span className={"status-pill status-" + e.status}>{titleCase(e.status)}</span></td><td className="amount-cell">{money(Number(e.amount || 0))}</td><td><div className="row-actions">{role !== "employee" && <><button className="icon-button" title="Edit expense" onClick={() => openModal("expense", e)}><Pencil size={15} /></button><button className="icon-button danger-icon" title="Delete expense" onClick={() => void removeRecord("infiskies_expenses", e, e.category)}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </section>}

        {view === "Income" && <section className="panel full-panel"><div className="panel-heading"><div><h3>Income register</h3><p>{visibleIncome.length} matching entry/entries</p></div><b className="inline-total">{money(totalIncome)} received</b></div>
          {visibleIncome.length === 0 ? <EmptyState title="No income entries yet" detail="Record an invoice or receipt. Only received entries count as income received." onAdd={role !== "employee" ? () => openCreate("income") : undefined} /> : <div className="table-wrap"><table><thead><tr><th>Entry</th><th>Project</th><th>Invoice date</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{visibleIncome.map((r) => <tr key={r.id}><td><b>{r.description || "Income entry"}</b><small className="cell-sub">{r.reference || shortId(r.id)}</small></td><td>{projectName(r.project_id)}</td><td>{dateLabel(r.invoice_date)}</td><td><span className={"status-pill status-" + r.status}>{titleCase(r.status)}</span></td><td className="amount-cell">{money(Number(r.amount || 0))}</td><td><div className="row-actions">{role !== "employee" && <><button className="icon-button" title="Edit income" onClick={() => openModal("income", r)}><Pencil size={15} /></button><button className="icon-button danger-icon" title="Delete income" onClick={() => void removeRecord("infiskies_revenue_entries", r, r.description || "income entry")}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </section>}

        {view === "Team shares" && <div className="data-view"><section className="panel full-panel"><div className="panel-heading"><div><h3>Share agreements</h3><p>Percentage shares use the project's share base; fixed shares use the agreed INR amount.</p></div><b className="inline-total">{money(totalCommittedShares)} active</b></div>
          {visibleShares.length === 0 ? <EmptyState title="No share agreements" detail="Add a project-specific percentage or fixed agreement for a team member." onAdd={role !== "employee" ? () => openCreate("share") : undefined} /> : <div className="table-wrap"><table><thead><tr><th>Team member</th><th>Project</th><th>Agreement</th><th>Calculated amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleShares.map((s) => <tr key={s.id}><td><b>{memberName(s.employee_id)}</b><small className="cell-sub">{shortId(s.employee_id)}</small></td><td>{projectName(s.project_id)}</td><td>{s.share_type === "percentage" ? Number(s.share_value) + "% of share base" : money(Number(s.share_value)) + " fixed"}</td><td className="amount-cell">{money(calcShare(s))}</td><td><span className={"status-pill status-" + s.status}>{titleCase(s.status)}</span></td><td><div className="row-actions">{role !== "employee" && <><button className="icon-button" title="Create payout" onClick={() => openModal("payout", s)}><HandCoins size={15} /></button><button className="icon-button" title="Edit agreement" onClick={() => openModal("share", s)}><Pencil size={15} /></button><button className="icon-button danger-icon" title="Delete agreement" onClick={() => void removeRecord("infiskies_project_members", s, "share agreement")}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </section><section className="panel full-panel"><div className="panel-heading"><div><h3>Latest payouts</h3><p>Pending, approved and paid records</p></div><button className="text-button" onClick={() => setView("Payouts")}>Manage payouts <ArrowRight size={15} /></button></div>
          {payouts.length === 0 ? <EmptyState title="No payouts recorded" detail="Use the hand icon next to an agreement to create a payout." /> : <div className="compact-table">{payouts.slice(0, 5).map((p) => <div className="compact-row" key={p.id}><div><b>{memberName(p.employee_id)}</b><small>{projectName(p.project_id)} · {dateLabel(p.created_at)}</small></div><div className="record-right"><b>{money(Number(p.amount || 0))}</b><span className={"status-pill status-" + p.status}>{titleCase(p.status)}</span></div></div>)}</div>}
        </section></div>}

        {view === "Payouts" && <section className="panel full-panel"><div className="panel-heading"><div><h3>Payout register</h3><p>Approve pending amounts and mark transfers as paid.</p></div><b className="inline-total">{money(paidPayouts)} paid</b></div>
          {visiblePayouts.length === 0 ? <EmptyState title="No payouts found" detail="Payouts appear after one is created from a share agreement." onAdd={role !== "employee" && shares.length > 0 ? () => setView("Team shares") : undefined} action="Go to team shares" /> : <div className="table-wrap"><table><thead><tr><th>Member</th><th>Project</th><th>Created</th><th>Status</th><th>Amount</th><th>Reference</th><th>Next action</th></tr></thead><tbody>{visiblePayouts.map((p) => <tr key={p.id}><td><b>{memberName(p.employee_id)}</b></td><td>{projectName(p.project_id)}</td><td>{dateLabel(p.created_at)}</td><td><span className={"status-pill status-" + p.status}>{titleCase(p.status)}</span></td><td className="amount-cell">{money(Number(p.amount || 0))}</td><td>{p.payment_reference || "—"}</td><td>{role !== "employee" && <div className="row-actions">{p.status === "pending" && <button className="button button-small button-secondary" disabled={saving} onClick={() => void updatePayout(p, "approved")}>Approve</button>}{p.status === "approved" && <button className="button button-small button-primary" disabled={saving} onClick={() => void updatePayout(p, "paid")}>Mark paid</button>}</div>}</td></tr>)}</tbody></table></div>}
        </section>}

        {view === "Tasks" && <section className="panel full-panel"><div className="panel-heading"><div><h3>Task board</h3><p>{visibleTasks.length} matching task(s); changes save to Supabase.</p></div><button className="button button-secondary" onClick={() => void refreshData()}><RefreshCw size={15} /> Refresh</button></div>
          {visibleTasks.length === 0 ? <EmptyState title={query ? "No matching tasks" : "No tasks assigned"} detail="Task records will appear here once created or assigned to you." onAdd={role !== "employee" ? () => openCreate("task") : undefined} /> : <div className="table-wrap"><table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleTasks.map((t) => <tr key={t.id}><td><b>{t.title}</b><small className="cell-sub">{t.description || shortId(t.id)}</small></td><td>{projectName(t.project_id)}</td><td>{memberName(t.assigned_to)}</td><td><span className={"priority-pill priority-" + t.priority}>{titleCase(t.priority)}</span></td><td>{dateLabel(t.due_at)}</td><td><div className="task-status-editor"><select aria-label={"Status for " + t.title} value={t.status} disabled={saving} onChange={(e) => void updateTask(t, { status: e.target.value })}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option><option value="blocked">Blocked</option></select><small>{Number(t.progress_percent || 0)}% complete</small></div></td><td><div className="row-actions"><button className="icon-button" title="Edit task" onClick={() => openModal("task", t)}><Pencil size={15} /></button>{role !== "employee" && <button className="icon-button danger-icon" title="Delete task" onClick={() => void removeRecord("infiskies_tasks", t, t.title)}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
        </section>}

        {view === "Team" && <div className="data-view"><section className="panel full-panel"><div className="panel-heading"><div><h3>Team members</h3><p>Active profiles can access this private workspace.</p></div><span className="status-pill status-active">{profiles.filter((p) => p.status === "active").length} active</span></div>
          {visibleProfiles.length === 0 ? <EmptyState title="No visible profiles" detail="A member profile is created when an invited person signs in with the invited Google email." /> : <div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Access</th><th>Permissions</th><th>Joined</th></tr></thead><tbody>{visibleProfiles.map((p) => <tr key={p.id}><td><b>{p.full_name || "Team member"}</b><small className="cell-sub">{p.email}</small></td><td>{p.role === "owner" ? <span className="status-pill status-active">Owner</span> : isOwner ? <select value={p.role} disabled={saving} onChange={(e) => void updateProfile(p, { role: e.target.value })}><option value="employee">Employee</option><option value="co_admin">Co-admin</option></select> : titleCase(p.role)}</td><td>{p.role === "owner" ? "Full access" : isOwner ? <select value={p.status} disabled={saving} onChange={(e) => void updateProfile(p, { status: e.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="invited">Invited</option></select> : titleCase(p.status)}</td><td>{p.role === "co_admin" && isOwner ? <button className="button button-small button-secondary" onClick={() => { setPermissionDraft({ "members.manage": false, "projects.manage": false, "finance.view": false, "finance.manage": false, "payouts.manage": false, "tasks.view_all": false, "tasks.assign": false, "tasks.manage": false, "audit.view": false, ...(p.permissions || {}) }); openModal("permissions", p); }}>Edit permissions</button> : p.role === "owner" ? "All permissions" : "—"}</td><td>{dateLabel(p.created_at)}</td></tr>)}</tbody></table></div>}
        </section><section className="panel full-panel"><div className="panel-heading"><div><h3>Invitations</h3><p>Invitations are saved but not emailed; share the app URL manually.</p></div><span className="status-pill status-pending">{invitations.filter((i) => i.status === "pending").length} pending</span></div>
          {invitations.length === 0 ? <EmptyState title="No invitations" detail="Invite a team member by their exact Google account email." onAdd={isOwner ? () => openCreate("invite") : undefined} action="Invite member" /> : <div className="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Created</th><th>Actions</th></tr></thead><tbody>{invitations.map((inv) => <tr key={inv.id}><td><b>{inv.email}</b></td><td>{titleCase(inv.role)}</td><td><span className={"status-pill status-" + inv.status}>{titleCase(inv.status)}</span></td><td>{dateLabel(inv.expires_at)}</td><td>{dateLabel(inv.created_at)}</td><td><div className="row-actions">{inv.status === "pending" && isOwner && <><button className="icon-button" title="Copy app URL" onClick={() => { void navigator.clipboard.writeText("https://infiskies-finance.vercel.app/"); setNotice("App URL copied. Send it to " + inv.email + " and ask them to sign in with Google."); }}><Copy size={15} /></button><button className="icon-button danger-icon" title="Revoke invitation" onClick={() => void (async () => { const res = await db.from("infiskies_invitations").update({ status: "revoked" }).eq("id", inv.id); if (res.error) setError(res.error.message); else { setNotice("Invitation revoked."); await refreshData(); } })()}><X size={15} /></button></>}</div></td></tr>)}</tbody></table></div>}
        </section></div>}

        {view === "Reports" && <div className="data-view"><div className="stat-grid"><StatCard label="Project value" value={money(totalProjectValue)} caption={projects.length + " projects"} color="lilac" icon={<BriefcaseBusiness size={18} />} /><StatCard label="Income received" value={money(totalIncome)} caption={income.filter((r) => r.status === "received").length + " receipts"} color="mint" icon={<TrendingUp size={18} />} /><StatCard label="Expenses" value={money(totalExpenses)} caption={actualExpenseRows.length + " actual entries"} color="peach" icon={<Wallet size={18} />} /><StatCard label="Paid payouts" value={money(paidPayouts)} caption={payouts.filter((p) => p.status === "paid").length + " paid record(s)"} color="blue" icon={<Banknote size={18} />} /></div>
          <section className="panel full-panel"><div className="panel-heading"><div><h3>Export records</h3><p>CSV files are generated from actual rows loaded from Supabase.</p></div><Download size={18} /></div><div className="export-grid">
            <button className="export-card" onClick={() => exportCsv("infiskies-projects.csv", projects, [{ key: "name", label: "Project" }, { key: "client_name", label: "Client" }, { key: "status", label: "Status" }, { key: "contract_value", label: "Contract value" }, { key: "share_base_amount", label: "Share base" }, { key: "start_date", label: "Start date" }, { key: "due_date", label: "Due date" }])}><Download size={18} /><b>Projects report</b><small>{projects.length} row(s)</small></button>
            <button className="export-card" onClick={() => exportCsv("infiskies-expenses.csv", expenses, [{ key: "category", label: "Category" }, { key: "description", label: "Description" }, { key: "scope", label: "Scope" }, { key: "project_id", label: "Project ID" }, { key: "amount", label: "Amount" }, { key: "expense_date", label: "Date" }, { key: "status", label: "Status" }])}><Download size={18} /><b>Expenses report</b><small>{expenses.length} row(s)</small></button>
            <button className="export-card" onClick={() => exportCsv("infiskies-income.csv", income, [{ key: "description", label: "Description" }, { key: "reference", label: "Reference" }, { key: "project_id", label: "Project ID" }, { key: "amount", label: "Amount" }, { key: "status", label: "Status" }, { key: "invoice_date", label: "Invoice date" }, { key: "received_at", label: "Received at" }])}><Download size={18} /><b>Income report</b><small>{income.length} row(s)</small></button>
            <button className="export-card" onClick={() => exportCsv("infiskies-payouts.csv", payouts, [{ key: "project_id", label: "Project ID" }, { key: "employee_id", label: "Employee ID" }, { key: "amount", label: "Amount" }, { key: "status", label: "Status" }, { key: "payment_reference", label: "Payment reference" }, { key: "paid_at", label: "Paid at" }])}><Download size={18} /><b>Payout report</b><small>{payouts.length} row(s)</small></button>
            <button className="export-card" onClick={() => exportCsv("infiskies-tasks.csv", tasks, [{ key: "title", label: "Task" }, { key: "project_id", label: "Project ID" }, { key: "assigned_to", label: "Assignee ID" }, { key: "status", label: "Status" }, { key: "priority", label: "Priority" }, { key: "progress_percent", label: "Progress" }, { key: "due_at", label: "Due date" }])}><Download size={18} /><b>Tasks report</b><small>{tasks.length} row(s)</small></button>
            <button className="export-card" onClick={() => exportCsv("infiskies-shares.csv", shares.map((s) => ({ ...s, member_name: memberName(s.employee_id), project_name: projectName(s.project_id), calculated_amount: calcShare(s) })), [{ key: "member_name", label: "Member" }, { key: "project_name", label: "Project" }, { key: "share_type", label: "Share type" }, { key: "share_value", label: "Share value" }, { key: "calculated_amount", label: "Calculated amount" }, { key: "status", label: "Status" }])}><Download size={18} /><b>Shares report</b><small>{shares.length} row(s)</small></button>
          </div></section></div>}

        {view === "Settings" && <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h3>Workspace settings</h3><p>Stored in the Infiskies settings table.</p></div><Settings size={18} /></div><form className="record-form" onSubmit={(e) => void saveSettings(e)}><label>Workspace name<input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} maxLength={80} required /></label><label>Signed-in owner email<input value={session.user.email || ""} readOnly /></label><label>Authentication provider<input value={String(session.user.app_metadata?.provider || "google")} readOnly /></label><button type="submit" className="button button-primary" disabled={saving}><Check size={16} /> Save workspace settings</button></form></section><section className="panel"><div className="panel-heading"><div><h3>Security status</h3><p>Current access setup</p></div><ShieldCheck size={18} /></div><div className="security-list"><div><CheckCircle2 size={17} /><span><b>Google OAuth session</b><small>{session.user.email}</small></span></div><div><CheckCircle2 size={17} /><span><b>Active role check</b><small>Current role: {titleCase(role)}</small></span></div><div><CheckCircle2 size={17} /><span><b>Row-level security</b><small>Supabase policies restrict record access.</small></span></div><div><AlertCircle size={17} /><span><b>Invitation delivery</b><small>Stored invitations are not emailed automatically. Send the app URL manually.</small></span></div></div><a className="text-link" href="https://supabase.com/dashboard/project/nrunqihyyijjyihqqlfw/auth/url-configuration" target="_blank" rel="noreferrer">Open Supabase Auth URL configuration <ExternalLink size={14} /></a></section></div>}

        {view === "Activity" && <section className="panel full-panel"><div className="panel-heading"><div><h3>Audit activity</h3><p>Recent create, update and delete actions.</p></div><button className="button button-secondary" onClick={() => void refreshData()}><RefreshCw size={15} /> Refresh log</button></div>
          {activity.filter((a) => !query || (String(a.action) + " " + String(a.entity_type) + " " + JSON.stringify(a.details || {})).toLowerCase().includes(query)).length === 0 ? <EmptyState title="No activity yet" detail="Database triggers record changes when you create or update records." /> : <div className="activity-feed">{activity.filter((a) => !query || (String(a.action) + " " + String(a.entity_type) + " " + JSON.stringify(a.details || {})).toLowerCase().includes(query)).map((a) => <div className="activity-feed-item" key={a.id}><div className="activity-feed-icon"><Activity size={16} /></div><div className="activity-feed-copy"><b>{titleCase(a.action)} {titleCase(a.entity_type)}</b><p>{Object.entries(a.details || {}).map(([key, value]) => key.replaceAll("_", " ") + ": " + String(value)).join(" · ") || "Record " + shortId(a.entity_id)}</p><small>{a.actor_id === session.user.id ? "You" : a.actor_id ? memberName(a.actor_id) : "System"} · {new Date(a.created_at).toLocaleString("en-IN")}</small></div></div>)}</div>}
        </section>}
        <footer className="page-footer"><span>© 2026 Infiskies Finance</span><span><i className="live-dot" /> Connected to Supabase</span><span>Actual database records <LockKeyhole size={12} /></span></footer>
      </div>
    </main>

    {modal && <ModalShell title={modal === "project" ? (editing ? "Edit project" : "New project") : modal === "expense" ? (editing ? "Edit expense" : "Add expense") : modal === "income" ? (editing ? "Edit income" : "Add income") : modal === "share" ? (editing ? "Edit share agreement" : "New share agreement") : modal === "task" ? (editing ? "Edit task" : "New task") : modal === "invite" ? "Invite a team member" : modal === "payout" ? "Record payout" : modal === "permissions" ? "Edit co-admin permissions" : "Quick guide"} close={closeModal} wide={modal === "help" || modal === "invite"}>
      {modal === "help" ? <div className="help-guide"><p>This workspace reads real records from Supabase. Empty tables are normal until you add your first entries.</p><div><b>1. Create projects</b><span>Add client, contract value, share base and timeline.</span></div><div><b>2. Record income and expenses</b><span>Income received is counted separately from pending invoices; expenses remain separate from employee shares.</span></div><div><b>3. Manage team shares</b><span>Set a percentage or fixed amount per employee per project, then create payout records when needed.</span></div><div><b>4. Invite team members</b><span>Invited users must sign in with Google using the invited email. Send the app URL yourself; no invitation email is sent automatically.</span></div><div><b>5. Reports</b><span>Download CSV exports from real rows your role can access.</span></div></div> : <form className="record-form" onSubmit={(e) => void submitModal(e)}>
        {modal === "project" && <><div className="form-grid"><label>Project name<input name="name" defaultValue={editing?.name || ""} required maxLength={150} /></label><label>Client name<input name="client_name" defaultValue={editing?.client_name || ""} /></label><label>Contract value (₹)<input name="contract_value" type="number" min="0" step="0.01" defaultValue={editing?.contract_value ?? 0} required /></label><label>Share base (₹)<input name="share_base_amount" type="number" min="0" step="0.01" defaultValue={editing?.share_base_amount ?? 0} required /><small className="field-hint">Percentage shares calculate from this amount.</small></label><label>Status<select name="status" defaultValue={editing?.status || "planning"}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label><label>Start date<input name="start_date" type="date" defaultValue={dateInput(editing?.start_date)} /></label><label>Due date<input name="due_date" type="date" defaultValue={dateInput(editing?.due_date)} /></label></div><label>Description<textarea name="description" rows={3} defaultValue={editing?.description || ""} /></label></>}
        {modal === "expense" && <><div className="form-grid"><label>Scope<select name="scope" defaultValue={editing?.scope || "project"}><option value="project">Project expense</option><option value="business">Business-wide expense</option></select></label><label>Project<select name="project_id" defaultValue={editing?.project_id || ""}><option value="">Select project</option>{projectOptions}</select><small className="field-hint">Required for project expenses; ignored for business-wide.</small></label><label>Category<input name="category" defaultValue={editing?.category || ""} required placeholder="Software, travel, equipment…" /></label><label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={editing?.amount ?? ""} required /></label><label>Expense date<input name="expense_date" type="date" defaultValue={dateInput(editing?.expense_date) || new Date().toISOString().slice(0, 10)} required /></label><label>Status<select name="status" defaultValue={editing?.status || "recorded"}><option value="planned">Planned (future expense)</option><option value="recorded">Recorded</option><option value="reimbursable">Reimbursable</option><option value="reimbursed">Reimbursed</option><option value="void">Void</option></select></label></div><label>Description<input name="description" defaultValue={editing?.description || ""} /></label></>}
        {modal === "income" && <div className="form-grid"><label>Project<select name="project_id" defaultValue={editing?.project_id || ""} required><option value="">Select project</option>{projectOptions}</select></label><label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={editing?.amount ?? ""} required /></label><label>Description<input name="description" defaultValue={editing?.description || ""} required /></label><label>Invoice / reference<input name="reference" defaultValue={editing?.reference || ""} /></label><label>Invoice date<input name="invoice_date" type="date" defaultValue={dateInput(editing?.invoice_date)} /></label><label>Status<select name="status" defaultValue={editing?.status || "pending"}><option value="pending">Pending</option><option value="received">Received</option><option value="void">Void</option></select></label></div>}
        {modal === "share" && <div className="form-grid"><label>Project<select name="project_id" defaultValue={editing?.project_id || ""} required><option value="">Select project</option>{projectOptions}</select></label><label>Team member<select name="employee_id" defaultValue={editing?.employee_id || ""} required><option value="">Select active employee</option>{employeeOptions}</select></label><label>Share type<select name="share_type" defaultValue={editing?.share_type || "percentage"}><option value="percentage">Percentage of share base</option><option value="fixed">Fixed amount (INR)</option></select></label><label>Share value<input name="share_value" type="number" min="0" step="0.01" defaultValue={editing?.share_value ?? ""} required /><small className="field-hint">Percentage cannot exceed 100.</small></label><label>Status<select name="status" defaultValue={editing?.status || "active"}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label></div>}
        {modal === "task" && <div className="form-grid"><label>Task title<input name="title" defaultValue={editing?.title || ""} required /></label><label>Project<select name="project_id" defaultValue={editing?.project_id || ""}><option value="">No project</option>{projectOptions}</select></label><label>Assignee<select name="assigned_to" defaultValue={editing?.assigned_to || session.user.id} required><option value={session.user.id}>{userName} (you)</option>{profiles.filter((p) => p.id !== session.user.id && p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select></label><label>Priority<select name="priority" defaultValue={editing?.priority || "medium"}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Status<select name="status" defaultValue={editing?.status || "todo"}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option><option value="blocked">Blocked</option></select></label><label>Progress (%)<input name="progress_percent" type="number" min="0" max="100" defaultValue={editing?.progress_percent ?? 0} /></label><label>Due date/time<input name="due_at" type="datetime-local" defaultValue={editing?.due_at ? String(editing.due_at).slice(0, 16) : ""} /></label></div>}
        {modal === "permissions" && editing && <div className="permission-grid"><b>Co-admin permissions</b><p>Only checked permissions are granted to this co-admin.</p>{[["members.manage", "Manage members and invitations"], ["projects.manage", "Create and edit projects"], ["finance.view", "View finance records"], ["finance.manage", "Manage income and expenses"], ["payouts.manage", "Approve and manage payouts"], ["tasks.view_all", "View all tasks"], ["tasks.assign", "Assign tasks"], ["tasks.manage", "Manage tasks"], ["audit.view", "View audit activity"]].map(([key, label]) => <label key={key} className="permission-option"><input type="checkbox" checked={Boolean(permissionDraft[key])} onChange={(e) => setPermissionDraft((old) => ({ ...old, [key]: e.target.checked }))} /><span>{label}</span></label>)}</div>}{modal === "invite" && <><div className="invite-intro">The invitation is saved to the database. No email is sent automatically; after saving, copy the app URL and share it with the invitee.</div><div className="form-grid"><label>Google account email<input type="email" name="email" placeholder="teammate@company.com" required /></label><label>Role<select name="role" defaultValue="employee" onChange={(e) => { setPermissionDraft(e.target.value === "employee" ? {} : { ...permissionDraft, "finance.view": true }); }}><option value="employee">Employee</option><option value="co_admin">Co-admin</option></select></label></div><div className="permission-grid"><b>Co-admin permissions</b><p>Only checked permissions are saved for a co-admin.</p>{[["members.manage", "Manage members and invitations"], ["projects.manage", "Create and edit projects"], ["finance.view", "View finance records"], ["finance.manage", "Manage income and expenses"], ["payouts.manage", "Approve and manage payouts"], ["tasks.view_all", "View all tasks"], ["tasks.assign", "Assign tasks"], ["tasks.manage", "Manage tasks"], ["audit.view", "View audit activity"]].map(([key, label]) => <label key={key} className="permission-option"><input type="checkbox" checked={Boolean(permissionDraft[key])} onChange={(e) => setPermissionDraft((old) => ({ ...old, [key]: e.target.checked }))} /><span>{label}</span></label>)}</div></>}
        {modal === "payout" && editing && <><div className="payout-context"><div><span>Employee</span><b>{memberName(editing.employee_id)}</b></div><div><span>Project</span><b>{projectName(editing.project_id)}</b></div><div><span>Agreement amount</span><b>{money(calcShare(editing))}</b></div></div><label>Payout amount (₹)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={calcShare(editing)} required /></label><small className="field-hint">Creates a new pending payout with a snapshot of this share agreement.</small><label>Notes<input name="notes" placeholder="Milestone or payment notes" /></label></>}
        {error && <div className="error-notice"><AlertCircle size={15} /> {error}</div>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={closeModal}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : <><Check size={16} /> {modal === "invite" ? "Save invitation" : modal === "permissions" ? "Save permissions" : "Save record"}</>}</button></div>
      </form>}
    </ModalShell>}
  </div>;
}
