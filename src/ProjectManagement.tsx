/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { AlertCircle, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDot, Clock3, Flag, Plus, RefreshCw, Save, ShieldAlert, TrendingUp } from "lucide-react";

type Row = Record<string, any>;
type Role = "owner" | "co_admin" | "employee";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value + (String(value).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const labelize = (value?: string) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);

export default function ProjectManagement({ session, role, projects, tasks, profiles, canManage, onRefresh }: {
  session: Session; role: Role; projects: Row[]; tasks: Row[]; profiles: Row[]; canManage: boolean; onRefresh: () => void | Promise<void>;
}) {
  const db = supabase as any;
  const [selectedId, setSelectedId] = useState("");
  const [updates, setUpdates] = useState<Row[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectDraft, setProjectDraft] = useState({ status: "planning", priority: "medium", manager_id: "", progress_percent: "0", health_status: "on_track", due_date: "", next_update_at: "", latest_update: "", risk_notes: "" });
  const [updateDraft, setUpdateDraft] = useState({ headline: "", body: "", visible_to_client: false });
  const visibleProjects = useMemo(() => [...projects].sort((a,b) => {
    const statusRank = (p: Row) => p.status === "active" ? 0 : p.status === "planning" ? 1 : p.status === "on_hold" ? 2 : p.status === "completed" ? 3 : 4;
    return statusRank(a) - statusRank(b) || String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"));
  }), [projects]);
  const selectedProject = visibleProjects.find((project) => project.id === selectedId) || visibleProjects[0] || null;
  const activeProjects = projects.filter((project) => ["active", "planning"].includes(project.status));
  const atRiskProjects = projects.filter((project) => project.health_status === "at_risk" || project.health_status === "blocked" || project.status === "on_hold");
  const overdueProjects = projects.filter((project) => project.due_date && project.due_date < today() && !["completed", "archived"].includes(project.status));
  const avgProgress = projects.length ? Math.round(projects.reduce((sum, p) => sum + Number(p.progress_percent || 0), 0) / projects.length) : 0;
  const projectTasks = selectedProject ? tasks.filter((task) => task.project_id === selectedProject.id) : [];
  const projectUpdates = selectedProject ? updates.filter((item) => item.project_id === selectedProject.id) : [];
  const profileName = (id?: string) => profiles.find((p) => p.id === id)?.full_name || profiles.find((p) => p.id === id)?.login_username || "Team member";
  const isOverdue = (project: Row) => Boolean(project.due_date && project.due_date < today() && !["completed", "archived"].includes(project.status));

  const refreshUpdates = useCallback(async () => {
    if (!db || projects.length === 0) { setUpdates([]); return; }
    setLoadingUpdates(true);
    const ids = projects.map((project) => project.id);
    const { data, error: queryError } = await db.from("infiskies_project_updates").select("*").in("project_id", ids).order("created_at", { ascending: false }).limit(250);
    setUpdates(data || []);
    if (queryError) setError(queryError.message);
    setLoadingUpdates(false);
  }, [db, projects]);

  useEffect(() => { void refreshUpdates(); }, [refreshUpdates]);
  useEffect(() => {
    if (selectedProject) {
      setSelectedId(selectedProject.id);
      setProjectDraft({
        status: selectedProject.status || "planning",
        priority: selectedProject.priority || "medium",
        manager_id: selectedProject.manager_id || "",
        progress_percent: String(selectedProject.progress_percent ?? 0),
        health_status: selectedProject.health_status || "on_track",
        due_date: selectedProject.due_date || "",
        next_update_at: selectedProject.next_update_at || "",
        latest_update: selectedProject.latest_update || "",
        risk_notes: selectedProject.risk_notes || "",
      });
      setUpdateDraft({ headline: "", body: "", visible_to_client: false });
    }
  }, [selectedProject?.id, selectedProject?.updated_at, selectedProject?.progress_percent, selectedProject?.health_status]);

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject || !canManage) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = {
        status: projectDraft.status,
        priority: projectDraft.priority,
        manager_id: projectDraft.manager_id || null,
        progress_percent: Math.max(0, Math.min(100, Number(projectDraft.progress_percent || 0))),
        health_status: projectDraft.health_status,
        due_date: projectDraft.due_date || null,
        next_update_at: projectDraft.next_update_at || null,
        latest_update: projectDraft.latest_update.trim(),
        risk_notes: projectDraft.risk_notes.trim(),
      };
      const { error: updateError } = await db.from("infiskies_projects").update(payload).eq("id", selectedProject.id);
      if (updateError) throw updateError;
      if (updateDraft.headline.trim() || updateDraft.body.trim()) {
        const { error: logError } = await db.from("infiskies_project_updates").insert({
          project_id: selectedProject.id, author_id: session.user.id,
          headline: updateDraft.headline.trim() || "Project status update",
          body: updateDraft.body.trim(), progress_percent: payload.progress_percent,
          health_status: payload.health_status, visible_to_client: updateDraft.visible_to_client,
        });
        if (logError) throw new Error("Project fields saved, but the update log could not be created: " + logError.message);
      }
      setNotice("Project health, progress and delivery details saved.");
      setUpdateDraft({ headline: "", body: "", visible_to_client: false });
      await onRefresh(); await refreshUpdates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the project.");
    } finally { setSaving(false); }
  };

  const submitTeamUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    if (!updateDraft.headline.trim() && !updateDraft.body.trim()) { setError("Add a headline or an update note first."); return; }
    setSaving(true); setError(""); setNotice("");
    const { error: insertError } = await db.from("infiskies_project_updates").insert({
      project_id: selectedProject.id, author_id: session.user.id,
      headline: updateDraft.headline.trim() || "Team work update",
      body: updateDraft.body.trim(), progress_percent: Number(selectedProject.progress_percent || 0),
      health_status: selectedProject.health_status || "on_track", visible_to_client: false,
    });
    if (insertError) setError(insertError.message);
    else {
      setNotice("Progress update sent to the owner for review.");
      setUpdateDraft({ headline: "", body: "", visible_to_client: false });
      await refreshUpdates();
    }
    setSaving(false);
  };

  return <div className="project-management-page">
    <div className="project-management-heading"><div><span className="eyebrow muted">DELIVERY CONTROL CENTER</span><h2>Project management</h2><p>Manage delivery health, ownership, deadlines, risk and stakeholder updates from one place.</p></div><button className="button button-secondary" onClick={() => { void onRefresh(); void refreshUpdates(); }} disabled={saving}><RefreshCw size={15} /> Refresh</button></div>
    {notice && <div className="success-banner"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><span>×</span></button></div>}
    {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><span>×</span></button></div>}
    <div className="project-kpi-grid">
      <div className="project-kpi"><span>Active / planning</span><strong>{activeProjects.length}</strong><small>Projects in delivery</small></div>
      <div className="project-kpi risk"><span>At risk / blocked</span><strong>{atRiskProjects.length}</strong><small>Need owner attention</small></div>
      <div className="project-kpi overdue"><span>Past due date</span><strong>{overdueProjects.length}</strong><small>Exclude completed projects</small></div>
      <div className="project-kpi"><span>Average progress</span><strong>{avgProgress}%</strong><small>Across {projects.length} project(s)</small></div>
    </div>
    {projects.length === 0 ? <div className="panel project-empty"><BriefcaseBusinessFallback /><h3>No projects yet</h3><p>Create a project first. Delivery health and progress controls will appear here.</p></div> : <div className="project-management-layout">
      <section className="panel project-picker-panel"><div className="panel-heading"><div><h3>Project portfolio</h3><p>Select a project to inspect its delivery status.</p></div><span className="status-pill status-active">{projects.length} projects</span></div>
        <div className="project-picker-list">{visibleProjects.map((project) => {
          const projectTaskRows = tasks.filter((task) => task.project_id === project.id);
          const done = projectTaskRows.filter((task) => task.status === "done").length;
          const overdue = projectTaskRows.filter((task) => task.status !== "done" && task.due_at && new Date(task.due_at).getTime() < Date.now()).length;
          return <button type="button" key={project.id} className={"project-picker-card" + (selectedProject?.id === project.id ? " selected" : "")} onClick={() => setSelectedId(project.id)}>
            <div className="project-picker-top"><b>{project.name}</b><span className={"project-health-pill health-" + (project.health_status || "on_track")}>{labelize(project.health_status || "on_track")}</span></div>
            <small>{project.client_name || "Client not set"} · {labelize(project.status)}</small>
            <div className="project-picker-progress"><span style={{ width: Math.max(0,Math.min(100,Number(project.progress_percent||0))) + "%" }} /></div>
            <div className="project-picker-footer"><span>{Number(project.progress_percent || 0)}% complete</span><span>{done}/{projectTaskRows.length} tasks</span></div>
            <div className="project-picker-meta"><span className={isOverdue(project) ? "text-danger" : ""}><CalendarClock size={12} /> {dateLabel(project.due_date)}</span><span>{overdue > 0 ? overdue + " overdue task(s)" : (project.priority || "medium") + " priority"}</span></div>
          </button>;
        })}</div>
      </section>
      {selectedProject && <div className="project-management-detail-column">
        <section className="panel project-detail-panel"><div className="project-detail-top"><div><span className="eyebrow muted">PROJECT OVERVIEW</span><h3>{selectedProject.name}</h3><p>{selectedProject.client_name || "Client not set"} · Contract {money(Number(selectedProject.contract_value || 0))}</p></div><span className={"project-health-pill health-" + (selectedProject.health_status || "on_track")}>{labelize(selectedProject.health_status || "on_track")}</span></div>
          <div className="project-delivery-stats"><div><span>Tasks complete</span><b>{projectTasks.filter((t) => t.status === "done").length} / {projectTasks.length}</b></div><div><span>Open tasks</span><b>{projectTasks.filter((t) => t.status !== "done").length}</b></div><div><span>Overdue tasks</span><b className={projectTasks.some((t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < Date.now()) ? "text-danger" : ""}>{projectTasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < Date.now()).length}</b></div><div><span>Handover target</span><b>{dateLabel(selectedProject.due_date)}</b></div></div>
          {canManage ? <form className="project-management-form" onSubmit={(e) => void saveProject(e)}>
            <div className="form-grid"><label>Status<select value={projectDraft.status} onChange={(e) => setProjectDraft({ ...projectDraft, status: e.target.value })}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label><label>Priority<select value={projectDraft.priority} onChange={(e) => setProjectDraft({ ...projectDraft, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Project manager<select value={projectDraft.manager_id} onChange={(e) => setProjectDraft({ ...projectDraft, manager_id: e.target.value })}><option value="">Not assigned</option>{profiles.filter((p) => p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.full_name || p.login_username || p.email}</option>)}</select></label><label>Overall progress (%)<input type="number" min="0" max="100" value={projectDraft.progress_percent} onChange={(e) => setProjectDraft({ ...projectDraft, progress_percent: e.target.value })} required /></label><label>Delivery health<select value={projectDraft.health_status} onChange={(e) => setProjectDraft({ ...projectDraft, health_status: e.target.value })}><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="blocked">Blocked</option></select></label><label>Due date<input type="date" value={projectDraft.due_date} onChange={(e) => setProjectDraft({ ...projectDraft, due_date: e.target.value })} /></label><label>Next client update<input type="date" value={projectDraft.next_update_at} onChange={(e) => setProjectDraft({ ...projectDraft, next_update_at: e.target.value })} /></label></div>
            <label>Latest summary / status note<textarea rows={3} value={projectDraft.latest_update} onChange={(e) => setProjectDraft({ ...projectDraft, latest_update: e.target.value })} placeholder="What moved forward? What is the next step?" /></label>
            <label>Risks, blockers and dependencies<textarea rows={3} value={projectDraft.risk_notes} onChange={(e) => setProjectDraft({ ...projectDraft, risk_notes: e.target.value })} placeholder="Risk, owner, mitigation, dependency or blocker…" /></label>
            <div className="project-update-log-form"><h4><TrendingUp size={15} /> Publish a project update</h4><div className="form-grid"><label>Update headline<input value={updateDraft.headline} onChange={(e) => setUpdateDraft({ ...updateDraft, headline: e.target.value })} placeholder="Sprint 2 completed" /></label><label className="inline-checkbox"><input type="checkbox" checked={updateDraft.visible_to_client} onChange={(e) => setUpdateDraft({ ...updateDraft, visible_to_client: e.target.checked })} /> Show this update to linked client</label></div><label>Update details<textarea rows={3} value={updateDraft.body} onChange={(e) => setUpdateDraft({ ...updateDraft, body: e.target.value })} placeholder="Completed work, current plan, decisions required and next actions." /></label></div>
            <button type="submit" className="button button-primary" disabled={saving}><Save size={15} /> {saving ? "Saving…" : "Save project & log update"}</button>
          </form> : <form className="project-management-form" onSubmit={(e) => void submitTeamUpdate(e)}><div className="project-readonly-grid"><div><span>Priority</span><b>{labelize(selectedProject.priority || "medium")}</b></div><div><span>Manager</span><b>{profileName(selectedProject.manager_id)}</b></div><div><span>Delivery health</span><b>{labelize(selectedProject.health_status || "on_track")}</b></div><div><span>Next client update</span><b>{dateLabel(selectedProject.next_update_at)}</b></div></div><div className="project-risk-summary"><b><ShieldAlert size={14} /> Current risks / blockers</b><p>{selectedProject.risk_notes || "No risks or blockers logged."}</p></div><label>Update headline<input value={updateDraft.headline} onChange={(e) => setUpdateDraft({ ...updateDraft, headline: e.target.value })} placeholder="What changed?" /></label><label>Work update for owner<textarea rows={4} value={updateDraft.body} onChange={(e) => setUpdateDraft({ ...updateDraft, body: e.target.value })} placeholder="Completed work, blockers, help needed and next actions." /></label><button type="submit" className="button button-primary" disabled={saving}><Plus size={15} /> Send update to owner</button></form>}
        </section>
        <section className="panel project-update-history"><div className="panel-heading"><div><h3>Project activity & updates</h3><p>{projectUpdates.length} status/update record(s), newest first.</p></div><button className="button button-secondary" onClick={() => void refreshUpdates()} disabled={loadingUpdates}><RefreshCw size={14} /> Refresh</button></div>
          {projectUpdates.length === 0 ? <div className="project-no-updates"><Clock3 size={20} /><p>No project updates have been logged yet.</p></div> : <div className="project-update-list">{projectUpdates.map((item) => <article className="project-update-item" key={item.id}><div className="project-update-marker"><CircleDot size={15} /></div><div className="project-update-copy"><div className="project-update-heading"><b>{item.headline}</b><small>{dateLabel(item.created_at)}</small></div><p>{item.body || "No additional details."}</p><div className="project-update-tags"><span>{profileName(item.author_id)}</span>{item.progress_percent != null && <span>{Number(item.progress_percent)}% progress</span>}<span>{labelize(item.health_status || "on_track")}</span><span>{item.visible_to_client ? "Client visible" : "Internal"}</span></div></div></article>)}</div>}
        </section>
        <section className="panel project-task-snapshot"><div className="panel-heading"><div><h3>Task delivery snapshot</h3><p>Task execution indicators for this project.</p></div></div>
          {projectTasks.length === 0 ? <p className="project-task-empty">No tasks assigned to this project yet.</p> : <div className="project-task-list">{projectTasks.slice(0,8).map((task) => <div className="project-task-row" key={task.id}><div className="project-task-main"><b>{task.title}</b><small>{profileName(task.assigned_to)} · Due {dateLabel(task.due_at)}</small></div><span className={"status-pill status-" + task.status}>{labelize(task.status)}</span><div className="project-task-mini-progress"><span style={{width: Math.max(0,Math.min(100,Number(task.progress_percent||0)))+"%"}} /></div></div>)}</div>}
        </section>
      </div>}
    </div>}
    {role === "owner" && <p className="project-management-footer"><Flag size={13} /> Owner controls cover project health and client-visible updates. Keep risk notes current and agree date changes with the client.</p>}
  </div>;
}

function BriefcaseBusinessFallback() {
  return <div className="project-empty-icon"><Flag size={20} /></div>;
}
