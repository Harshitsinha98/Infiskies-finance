/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight, BriefcaseBusiness, ChartNoAxesCombined,
  CircleDollarSign, RefreshCw, TrendingUp, Wallet, HandCoins
} from "lucide-react";

type Row = Record<string, any>;
type Props = {
  projects: Row[];
  expenses: Row[];
  shares: Row[];
  income: Row[];
  payouts: Row[];
  search: string;
  onRefresh: () => void;
  onNavigate: (view: string) => void;
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(Number(value || 0));
const titleCase = (value?: string | null) => String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function StatCard({ label, value, caption, icon, color }: {
  label: string; value: string; caption: string; icon: ReactNode; color: string;
}) {
  return <div className="stat-card">
    <div className="stat-top"><span>{label}</span><div className={"stat-icon " + color}>{icon}</div></div>
    <strong>{value}</strong>
    <div className="stat-bottom"><span className="stat-neutral">{caption}</span></div>
  </div>;
}

function EmptyProjects({ onNavigate }: { onNavigate: (view: string) => void }) {
  return <div className="empty-state">
    <div className="empty-state-icon"><BriefcaseBusiness size={23} /></div>
    <h3>No projects yet</h3>
    <p>Create a project with its contract value and employee share agreements to start seeing a financial forecast.</p>
    <button className="button button-primary" onClick={() => onNavigate("Projects")}>Manage projects <ArrowRight size={16} /></button>
  </div>;
}

export default function OwnerFinanceDashboard({
  projects, expenses, shares, income, payouts, search, onRefresh, onNavigate
}: Props) {
  const [mode, setMode] = useState<"overall" | "project-wise">("overall");
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const total = (rows: Row[], field = "amount") => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const actualExpenseRows = expenses.filter((expense) => expense.status !== "planned" && expense.status !== "void");
  const plannedExpenseRows = expenses.filter((expense) => expense.status === "planned");
  const receivedIncomeRows = income.filter((entry) => entry.status === "received");
  const paidPayoutRows = payouts.filter((payout) => payout.status === "paid");
  const netIncome = total(receivedIncomeRows);
  const netPayout = total(paidPayoutRows);
  const netExpenses = total(actualExpenseRows);
  const netProfit = netIncome - netPayout - netExpenses;

  const shareCommitment = (share: Row) => {
    const project = projectById.get(share.project_id);
    return share.share_type === "percentage"
      ? Number(project?.share_base_amount || 0) * Number(share.share_value || 0) / 100
      : Number(share.share_value || 0);
  };
  const activeForecastShares = shares.filter((share) =>
    share.status === "active" && projectById.get(share.project_id)?.status !== "archived");
  const projectedIncome = total(projects.filter((project) => project.status !== "archived"), "contract_value");
  const projectedPayouts = activeForecastShares.reduce((sum, share) => sum + shareCommitment(share), 0);
  const pendingPayouts = activeForecastShares.reduce((sum, share) => {
    const paidAgainstAgreement = total(paidPayoutRows.filter((payout) => payout.project_member_id === share.id));
    return sum + Math.max(0, shareCommitment(share) - paidAgainstAgreement);
  }, 0);
  const projectedExpenses = total(plannedExpenseRows);
  const projectedProfit = projectedIncome - projectedPayouts - projectedExpenses;

  const query = search.trim().toLowerCase();
  const projectRows = projects
    .filter((project) => !query || [project.name, project.client_name, project.description, project.status]
      .some((value) => String(value || "").toLowerCase().includes(query)))
    .map((project) => {
      const projectShares = shares.filter((share) => share.project_id === project.id && share.status === "active");
      const expectedIncome = project.status === "archived" ? 0 : Number(project.contract_value || 0);
      const expectedPayout = project.status === "archived" ? 0 : projectShares.reduce((sum, share) => sum + shareCommitment(share), 0);
      const pendingForProject = project.status === "archived" ? 0 : projectShares.reduce((sum, share) => {
        const paidAgainstAgreement = total(paidPayoutRows.filter((payout) => payout.project_member_id === share.id));
        return sum + Math.max(0, shareCommitment(share) - paidAgainstAgreement);
      }, 0);
      const expectedExpenses = total(expenses.filter((expense) =>
        expense.project_id === project.id && expense.status === "planned"));
      const receivedForProject = total(receivedIncomeRows.filter((entry) => entry.project_id === project.id));
      const paidForProject = total(paidPayoutRows.filter((payout) => payout.project_id === project.id));
      const actualExpensesForProject = total(actualExpenseRows.filter((expense) => expense.project_id === project.id));
      return {
        id: project.id, name: project.name, client: project.client_name, status: project.status,
        projectedIncome: expectedIncome, projectedPayouts: expectedPayout, pendingPayouts: pendingForProject, projectedExpenses: expectedExpenses,
        projectedProfit: expectedIncome - expectedPayout - expectedExpenses,
        netIncome: receivedForProject, netPayout: paidForProject, netExpenses: actualExpensesForProject,
        netProfit: receivedForProject - paidForProject - actualExpensesForProject
      };
    });

  const sumRows = (field: keyof typeof projectRows[number]) => projectRows.reduce((sum, project) => sum + Number(project[field] || 0), 0);

  return <div className="owner-finance-dashboard">
    <div className="finance-dashboard-toolbar">
      <div>
        <span className="eyebrow muted">OWNER FINANCE OVERVIEW</span>
        <p>Track forecast commitments separately from money actually received, paid and spent.</p>
      </div>
      <div className="finance-toolbar-actions">
        <div className="finance-view-switch" role="tablist" aria-label="Finance dashboard view">
          <button role="tab" aria-selected={mode === "overall"} className={mode === "overall" ? "selected" : ""} onClick={() => setMode("overall")}>Overall</button>
          <button role="tab" aria-selected={mode === "project-wise"} className={mode === "project-wise" ? "selected" : ""} onClick={() => setMode("project-wise")}>Project-wise</button>
        </div>
        <button className="button button-secondary" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button>
      </div>
    </div>

    {mode === "overall" ? <>
      <section className="finance-section">
        <div className="finance-section-heading">
          <div><span className="eyebrow muted">FORECAST</span><h2>Projected finances</h2><p>Contracted project income, active employee shares and planned expenses.</p></div>
          <span className={"finance-section-total " + (projectedProfit >= 0 ? "money-positive" : "money-negative")}>{money(projectedProfit)} projected profit</span>
        </div>
        <div className="stat-grid payout-forecast-grid">
          <StatCard label="Projected income" value={money(projectedIncome)} caption={projects.filter((project) => project.status !== "archived").length + " non-archived project(s)"} color="lilac" icon={<TrendingUp size={18} />} />
          <StatCard label="Projected payouts" value={money(projectedPayouts)} caption={activeForecastShares.length + " active share agreement(s)"} color="blue" icon={<CircleDollarSign size={18} />} />
          <StatCard label="Pending payouts" value={money(pendingPayouts)} caption="Agreement value less amount already paid" color="peach" icon={<HandCoins size={18} />} />
          <StatCard label="Projected expenses" value={money(projectedExpenses)} caption={plannedExpenseRows.length + " planned expense(s)"} color="peach" icon={<Wallet size={18} />} />
          <StatCard label="Projected profit" value={money(projectedProfit)} caption="Income − shares − planned expenses" color={projectedProfit >= 0 ? "mint" : "peach"} icon={<ChartNoAxesCombined size={18} />} />
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div><span className="eyebrow muted">ACTUALS</span><h2>Net finances</h2><p>Based only on received income, paid payouts and actual expenses.</p></div>
          <span className={"finance-section-total " + (netProfit >= 0 ? "money-positive" : "money-negative")}>{money(netProfit)} net profit</span>
        </div>
        <div className="stat-grid">
          <StatCard label="Net income" value={money(netIncome)} caption={receivedIncomeRows.length + " received entry/entries"} color="mint" icon={<TrendingUp size={18} />} />
          <StatCard label="Net payout" value={money(netPayout)} caption={paidPayoutRows.length + " paid payout(s)"} color="blue" icon={<HandCoins size={18} />} />
          <StatCard label="Net expenses" value={money(netExpenses)} caption={actualExpenseRows.length + " actual expense(s)"} color="peach" icon={<Wallet size={18} />} />
          <StatCard label="Net profit" value={money(netProfit)} caption="Received income − paid payouts − actual expenses" color={netProfit >= 0 ? "mint" : "peach"} icon={<ChartNoAxesCombined size={18} />} />
        </div>
      </section>

      <div className="overview-grid">
        <section className="panel"><div className="panel-heading"><div><h3>Project forecast</h3><p>Contract value and current share commitments</p></div><button className="text-button" onClick={() => setMode("project-wise")}>Project-wise view <ArrowRight size={15} /></button></div>
          {projects.filter((project) => project.status !== "archived").length === 0 ? <EmptyProjects onNavigate={onNavigate} /> : <div className="record-list">{projects.filter((project) => project.status !== "archived").slice(0, 5).map((project) => <div className="record-row" key={project.id}><div className="record-monogram">{String(project.name || "P").slice(0, 2).toUpperCase()}</div><div className="record-main"><b>{project.name}</b><small>{project.client_name || "No client specified"}</small></div><div className="record-right"><b>{money(Number(project.contract_value || 0))}</b><span className="status-pill status-planned">Projected income</span></div></div>)}</div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><h3>Expense split</h3><p>Planned budgets versus actual costs</p></div><button className="icon-button" title="Refresh records" onClick={onRefresh}><RefreshCw size={16} /></button></div>
          <div className="snapshot-list"><div><span>Planned expenses</span><b>{money(projectedExpenses)}</b></div><div><span>Actual expenses</span><b>{money(netExpenses)}</b></div><div><span>Paid employee payouts</span><b>{money(netPayout)}</b></div><div><span>Income received</span><b className="money-positive">{money(netIncome)}</b></div><div className="snapshot-total"><span>Net profit to date</span><b>{money(netProfit)}</b></div></div>
          <p className="small-note">Overall includes both project costs and company-wide overhead. Project-wise totals include only costs linked to each project.</p>
        </section>
      </div>
      <p className="finance-method-note">Projected income uses the contract value of non-archived projects; projected payouts use active employee share agreements; projected expenses are expenses marked <b>Planned</b>. Net income uses received entries, net payouts are marked <b>Paid</b>, and net expenses exclude Planned and Void entries. This is an operational estimate, not a statutory accounting report.</p>
    </> : <section className="panel full-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">PROJECT-WISE BREAKDOWN</span><h3>Finance by project</h3><p>{projectRows.length} project(s) shown. Company-wide overhead appears only in Overall because it isn't assigned to a specific project.</p></div><button className="button button-secondary" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button></div>
      {projectRows.length === 0 ? <EmptyProjects onNavigate={onNavigate} /> : <div className="table-wrap finance-projection-table"><table><thead><tr><th>Project</th><th>Projected income</th><th>Projected payouts</th><th>Pending payouts</th><th>Projected expenses</th><th>Projected profit</th><th>Net income</th><th>Net payout</th><th>Net expenses</th><th>Net profit</th></tr></thead><tbody>{projectRows.map((project) => <tr key={project.id}><td><b>{project.name}</b><small className="cell-sub">{project.client || "No client specified"} · {titleCase(project.status)}</small></td><td>{money(project.projectedIncome)}</td><td>{money(project.projectedPayouts)}</td><td><b className={project.pendingPayouts > 0 ? "money-negative" : "money-positive"}>{money(project.pendingPayouts)}</b></td><td>{money(project.projectedExpenses)}</td><td><b className={project.projectedProfit >= 0 ? "money-positive" : "money-negative"}>{money(project.projectedProfit)}</b></td><td>{money(project.netIncome)}</td><td>{money(project.netPayout)}</td><td>{money(project.netExpenses)}</td><td><b className={project.netProfit >= 0 ? "money-positive" : "money-negative"}>{money(project.netProfit)}</b></td></tr>)}</tbody><tfoot><tr><th>Total for shown projects</th><th>{money(sumRows("projectedIncome"))}</th><th>{money(sumRows("projectedPayouts"))}</th><th>{money(sumRows("pendingPayouts"))}</th><th>{money(sumRows("projectedExpenses"))}</th><th>{money(sumRows("projectedProfit"))}</th><th>{money(sumRows("netIncome"))}</th><th>{money(sumRows("netPayout"))}</th><th>{money(sumRows("netExpenses"))}</th><th>{money(sumRows("netProfit"))}</th></tr></tfoot></table></div>}
      <div className="projectwise-footnote"><b>Calculations:</b> Projected income = contract value (archived excluded); projected payouts = active employee shares; projected expenses = Planned project costs; net income = received entries; net payout = payouts marked Paid; net expenses = actual project costs. Business-wide costs are included in Overall only.</div>
    </section>}
  </div>;
}
