# Infiskies Finance Implementation Plan

## Product roles
- `owner`: complete business access, creates co-admins and employees.
- `co_admin`: permission-scoped access. Cannot create owner or grant owner role.
- `employee`: own profile, assigned tasks, explicitly granted project access, own share and payout summaries only.

## Supabase schema (planned)
- `profiles`: keyed to `auth.users.id`; email, full name, role, active/suspended state, creator and timestamps.
- `invitations`: normalized invited email, intended role, permission JSON, expiry, status and creator.
- `projects`: client, description, status, contract value, configured share base, dates, creator.
- `project_members`: project-to-user membership, share type (`percentage` or `fixed`), share value, agreement version and active status.
- `revenue_entries`: project, invoice/reference, amount, received/pending status and dates.
- `expenses`: nullable project for business-wide expenses, scope, category, amount, incurred date, paid-by member, receipt path, status and creator.
- `payouts`: project, member, share agreement snapshot, amount, status (`pending`, `approved`, `paid`, `void`), approval and payment metadata.
- `tasks`: optional project, title/description, assignee, assigner, priority, status, due date, progress and timestamps.
- `audit_logs`: actor, action, entity type/id, minimal JSON change summary and timestamp.

## Share calculation
- Percentage: configured project `share_base_amount * share_value / 100`.
- Fixed: agreed `share_value` in INR.
- Expenses remain separate; never automatically subtract expenses from shares.
- Display agreed amount, paid amount, and outstanding amount separately.
- Store an immutable share-agreement snapshot on payout/settlement records so later edits do not rewrite history.
- Warn if combined allocations exceed project share base; admin must explicitly confirm any override.

## Security requirements
- Use Supabase Auth Google OAuth only; no Firebase dependencies.
- Disable open public sign-up where supported by project configuration; allow only pre-authorized emails.
- On OAuth callback, verify an active `profiles` row exists for `auth.uid()` and normalized email matches the authorized invitation/profile. Otherwise sign out and show an access-denied message.
- Invitations must be created only by an authorized owner/co-admin with `members.manage`; role changes must happen through trusted database functions or Edge Functions, not client-side role assignment.
- Enable RLS on every public table. Default deny. Use `auth.uid()` and permission helper functions to enforce access at database level.
- Employees can read/update only permitted own profile fields; employees can read their assigned tasks and own share/payout records, not other employees' financial data.
- Co-admin access is checked against explicit permission flags; no implied full access.
- Prevent owners being demoted by co-admins and prevent clients from granting themselves roles.
- Audit sensitive actions. Keep service-role keys server-side only.

## Delivery phases
1. Design foundation, routes, responsive shell and design system.
2. Supabase project configuration, Google OAuth callback, profile bootstrap and RLS.
3. Member invitations and role/permission management.
4. Projects, project memberships and share agreements.
5. Revenue, expenses, miscellaneous costs and payout ledger.
6. Tasks and employee workspace.
7. Analytics, charts, exports and audit history.
8. Permission/security tests, build validation and Vercel deployment.

## Owner bootstrap
Owner email: `sinhaharshit67@gmail.com`. First create/sign in the owner in Supabase Auth, then promote the matching auth user through a one-time trusted admin SQL/migration or server-side procedure. Do not grant owner merely because a client sends this email from the browser.

## Required environment variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or the Supabase publishable key appropriate to the project)

Only public client keys belong in Vercel's client-side build. Service-role keys must never use a `VITE_` prefix or ship to browsers.