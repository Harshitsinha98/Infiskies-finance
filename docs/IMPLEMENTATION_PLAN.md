# Infiskies Finance Implementation Plan

## Roles
- Owner: complete business access and can invite/manage members and appoint co-admins.
- Co-admin: explicit permission-scoped access; cannot grant the owner role or change owner privileges.
- Employee: own profile, assigned tasks, own share agreements and payout summaries only.

## Supabase schema
- profiles: auth user ID, normalized email, role, active/suspended state and permission flags.
- invitations: normalized invited email, intended role, permissions, expiry and acceptance status.
- projects: client, status, contract value, share base and dates.
- project_members: individual per-project share agreement; percentage or fixed value and agreement version.
- revenue_entries: project income and received/pending state.
- expenses: project and business expenses, category, receipt and payment state.
- payouts: agreed amount, approval/payment status and immutable share-calculation snapshot.
- tasks: project, assignee, assigner, priority, status, deadline and progress.
- audit_logs: sensitive change history.

## Financial rules
Percentage share = project share base × employee percentage / 100. Fixed shares are employee-specific fixed amounts. Expenses remain separate and do not automatically reduce shares. Track agreed, approved, paid and outstanding separately. Warn on over-allocation; preserve historical agreements in payout snapshots.

## Security requirements
- Supabase Auth Google OAuth only; no Firebase dependency.
- Block access unless the Google-authenticated user has an active profile matching the normalized auth email.
- Use a trusted owner bootstrap after the matching Supabase Auth user exists; never grant owner role based solely on browser-submitted email.
- Invitations, role changes and permission changes must occur through trusted server/admin paths.
- Enable RLS on every exposed table and default deny.
- Employees can see only assigned tasks and their own share/payout data; co-admin data access depends on explicit permissions.
- Never expose a service-role key to the browser or commit real credentials.

## Phases
1. Responsive React/Vite/TypeScript foundation.
2. Supabase project, Google OAuth, owner bootstrap, RLS and access tests.
3. Invitations, member roles and co-admin permissions.
4. Projects, team assignments and shares.
5. Revenue, expenses, payouts and reports.
6. Task assignment and employee workspace.
7. Dashboards, charts, exports and audit logs.
8. Test/build, security review and Vercel production connection.

Owner bootstrap email: `sinhaharshit67@gmail.com`.

## Environment
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY (or the project's public publishable key)
Only public client keys go into Vite builds. Service-role secrets stay server-side.
