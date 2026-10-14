/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Banknote, BriefcaseBusiness, CircleDollarSign, Clock3, RefreshCw, Wallet } from "lucide-react";
type Row = Record<string, any>;
type Props = { projects: Row[]; shares: Row[]; payouts: Row[]; tasks: Row[]; search: string; onRefresh: () => void; onNavigate: (view: string) => void };
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n||0));
const label = (v?:string|null) => String(v||"—").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const dateLabel = (v?:string|null) => v ? new Date(v).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "—";
function Stat({title,value,caption,icon,color}:{title:string;value:string;caption:string;icon:ReactNode;color:string}) {
 return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className={"stat-icon "+color}>{icon}</div></div><strong>{value}</strong><div className="stat-bottom"><span className="stat-neutral">{caption}</span></div></div>;
}
function Empty({title,detail,onClick,action}:{title:string;detail:string;onClick?:()=>void;action?:string}) {
 return <div className="empty-state"><div className="empty-state-icon"><BriefcaseBusiness size={22}/></div><h3>{title}</h3><p>{detail}</p>{onClick&&<button className="button button-secondary" onClick={onClick}>{action||"View details"} <ArrowRight size={15}/></button>}</div>;
}
export default function EmployeeDashboard({projects,shares,payouts,tasks,search,onRefresh,onNavigate}:Props) {
 const query=search.trim().toLowerCase();
 const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects]);
 const amountForShare=(s:Row)=>{const p=projectById.get(s.project_id);return s.share_type==="percentage"?Number(p?.share_base_amount||0)*Number(s.share_value||0)/100:Number(s.share_value||0);};
 const activeShares=shares.filter(s=>s.status==="active");
 const myShareValue=activeShares.reduce((sum,s)=>sum+amountForShare(s),0);
 const paid=payouts.filter(p=>p.status==="paid");
 const awaiting=payouts.filter(p=>p.status==="pending"||p.status==="approved");
 const paidTotal=paid.reduce((sum,p)=>sum+Number(p.amount||0),0);
 const awaitingTotal=awaiting.reduce((sum,p)=>sum+Number(p.amount||0),0);
 const openTasks=tasks.filter(t=>t.status!=="done"&&t.status!=="blocked");
 const linkedProjectIds=new Set<string>([
   ...activeShares.map(s=>String(s.project_id)),
   ...tasks.filter(t=>t.project_id).map(t=>String(t.project_id))
 ]);
 const myProjects=projects.filter(p=>linkedProjectIds.has(String(p.id))&&(!query||[p.name,p.client_name,p.description,p.status].some(v=>String(v||"").toLowerCase().includes(query))));
 const shownShares=activeShares.filter(s=>!query||[projectById.get(s.project_id)?.name,projectById.get(s.project_id)?.client_name,s.share_type].some(v=>String(v||"").toLowerCase().includes(query)));
 const shownPayouts=payouts.filter(p=>!query||[p.status,p.notes,projectById.get(p.project_id)?.name].some(v=>String(v||"").toLowerCase().includes(query))).slice(0,5);
 const shownTasks=openTasks.filter(t=>!query||[t.title,t.description,projectById.get(t.project_id)?.name,t.status].some(v=>String(v||"").toLowerCase().includes(query))).slice(0,5);
 return <div className="data-view employee-home">
  <div className="employee-dashboard-toolbar"><div><span className="eyebrow muted">MY WORKSPACE</span><p>Your own projects, share agreements, payouts and assigned tasks.</p></div><button className="button button-secondary" onClick={onRefresh}><RefreshCw size={15}/> Refresh my data</button></div>
  <div className="stat-grid">
   <Stat title="My projects" value={String(myProjects.length)} caption="Projects linked to my shares or tasks" color="lilac" icon={<BriefcaseBusiness size={18}/>} />
   <Stat title="My active share value" value={money(myShareValue)} caption={activeShares.length+" active agreement(s)"} color="mint" icon={<CircleDollarSign size={18}/>} />
   <Stat title="Payout awaiting me" value={money(awaitingTotal)} caption={awaiting.length+" pending / approved payout(s)"} color="peach" icon={<Clock3 size={18}/>} />
   <Stat title="Paid to me" value={money(paidTotal)} caption={paid.length+" completed payout(s)"} color="blue" icon={<Banknote size={18}/>} />
  </div>
  <div className="overview-grid">
   <section className="panel"><div className="panel-heading"><div><h3>My projects</h3><p>Projects linked to your shares or assigned tasks</p></div><button className="text-button" onClick={()=>onNavigate("Team shares")}>My shares <ArrowRight size={15}/></button></div>
    {myProjects.length===0?<Empty title="No projects assigned yet" detail="Projects appear when an active share agreement or task links you to them." onClick={()=>onNavigate("Tasks")} action="View my tasks"/>:<div className="record-list">{myProjects.slice(0,6).map(p=>{const ps=activeShares.filter(s=>s.project_id===p.id);const val=ps.reduce((sum,s)=>sum+amountForShare(s),0);const count=tasks.filter(t=>t.project_id===p.id).length;return <div className="record-row" key={p.id}><div className="record-monogram">{String(p.name||"P").slice(0,2).toUpperCase()}</div><div className="record-main"><b>{p.name}</b><small>{p.client_name||"Client not specified"} · {label(p.status)}{count?" · "+count+" task(s)":""}</small></div><div className="record-right"><b>{money(val)}</b><span className="status-pill status-active">{ps.length?"My share":"Assigned"}</span></div></div>})}</div>}
   </section>
   <section className="panel"><div className="panel-heading"><div><h3>My payout summary</h3><p>Only your payout records</p></div><Wallet size={18}/></div><div className="snapshot-list"><div><span>Active share value</span><b>{money(myShareValue)}</b></div><div><span>Awaiting payment</span><b>{money(awaitingTotal)}</b></div><div><span>Already paid</span><b className="money-positive">{money(paidTotal)}</b></div><div><span>Open tasks</span><b>{openTasks.length}</b></div><div className="snapshot-total"><span>All payout records</span><b>{payouts.length}</b></div></div><p className="small-note">Share value is the current agreement amount; it is not the same as money already paid.</p></section>
  </div>
  <div className="overview-grid">
   <section className="panel"><div className="panel-heading"><div><h3>My share agreements</h3><p>Current active agreements for your account</p></div><button className="text-button" onClick={()=>onNavigate("Team shares")}>All agreements <ArrowRight size={15}/></button></div>
    {shownShares.length===0?<Empty title="No active share agreements" detail="Active shares assigned to your account appear here." onClick={()=>onNavigate("Team shares")} action="Open team shares"/>:<div className="compact-table">{shownShares.slice(0,5).map(s=><div className="compact-row" key={s.id}><div><b>{projectById.get(s.project_id)?.name||"Project"}</b><small>{s.share_type==="percentage"?Number(s.share_value)+"% of share base":"Fixed agreement"} · {label(s.status)}</small></div><div className="record-right"><b>{money(amountForShare(s))}</b><small>{s.share_type==="percentage"?money(Number(projectById.get(s.project_id)?.share_base_amount||0))+" share base":"Fixed INR"}</small></div></div>)}</div>}
   </section>
   <section className="panel"><div className="panel-heading"><div><h3>My recent payouts</h3><p>Pending, approved and completed payments</p></div><button className="text-button" onClick={()=>onNavigate("Payouts")}>All payouts <ArrowRight size={15}/></button></div>
    {shownPayouts.length===0?<Empty title="No payout records yet" detail="Payouts recorded for your account appear here." onClick={()=>onNavigate("Payouts")} action="Open payouts"/>:<div className="compact-table">{shownPayouts.map(p=><div className="compact-row" key={p.id}><div><b>{projectById.get(p.project_id)?.name||"Project payout"}</b><small>{dateLabel(p.created_at)} · {label(p.status)}</small></div><div className="record-right"><b>{money(Number(p.amount||0))}</b><span className={"status-pill status-"+p.status}>{label(p.status)}</span></div></div>)}</div>}
   </section>
  </div>
  <section className="panel"><div className="panel-heading"><div><h3>My tasks</h3><p>Tasks assigned to you or assigned by you</p></div><button className="text-button" onClick={()=>onNavigate("Tasks")}>Open tasks <ArrowRight size={15}/></button></div>
   {shownTasks.length===0?<Empty title="No open tasks" detail="There are currently no incomplete tasks visible to your account." onClick={()=>onNavigate("Tasks")} action="View task board"/>:<div className="compact-table">{shownTasks.map(t=><div className="compact-row" key={t.id}><div><b>{t.title}</b><small>{projectById.get(t.project_id)?.name||"No linked project"} · Due {dateLabel(t.due_at)}</small></div><div className="record-right"><span className={"status-pill status-"+t.status}>{label(t.status)}</span><small>{Number(t.progress_percent||0)}% complete</small></div></div>)}</div>}
  </section>
  <p className="finance-method-note">Your view is restricted to your own shares, payouts, assigned tasks and linked projects. Company-wide income/expenses and other employees’ payout data are not displayed.</p>
 </div>;
}
