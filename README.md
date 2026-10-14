# Infiskies Finance

Private project-finance and work-management workspace for the owner, co-admins and employees.

## Stack
- React + Vite + TypeScript
- Supabase Auth (Google OAuth), PostgreSQL, Row Level Security and SQL audit triggers
- Vercel deployment from GitHub

## Functional modules
- Overview totals calculated from accessible database records (no seeded/demo financial records).
- Projects: create, edit, delete, values, client details, status and schedule.
- Expenses: project/business scopes, category, amount, date and reimbursement status.
- Income: pending/received/void records per project.
- Team shares: percentage-of-share-base or fixed agreements per project/member.
- Payouts: create pending payouts from share agreements, approve and mark paid.
- Tasks: create/update, assign, set priority, status, progress and due dates.
- Team & invitations: active/suspended profile access, scoped co-admin permissions, invitation/revocation and invitee profile activation after matching Google sign-in.
- Reports: export actual accessible rows as CSV.
- Settings and audit activity log.
- Owner dashboard: Overall and Project-wise tabs with projected income, share payouts, planned expenses, projected profit, and the four actual net metrics. Planned expenses are explicitly separated from actual expenses.

## Shared Supabase project
The application reuses the existing BreakIQ Supabase project to avoid creating another free-tier project. Every Infiskies Finance table, custom type and helper function uses the `infiskies_` prefix. Existing BreakIQ tables are not modified by the Infiskies migrations.

Project URL: `https://nrunqihyyijjyihqqlfw.supabase.co`

## Database setup
Apply migration files in chronological order to a fresh project:
1. `supabase/migrations/20261014000100_initial_schema.sql`
2. `supabase/migrations/20261014000200_settings_and_invitation_acceptance.sql`
3. `supabase/migrations/20261014000300_audit_trail.sql`
4. `supabase/migrations/20261014000400_invitation_acceptance_rpc.sql`
5. `supabase/migrations/20261014000500_planned_expenses.sql`

These migrations have been applied to the current shared BreakIQ project. Do not run an older unprefixed finance schema in the shared project.

## Owner
Initial owner email: `sinhaharshit67@gmail.com`. The matching user must first sign in with Google; owner provisioning is performed using trusted SQL/admin access, not from browser code.

## Security notes
- The frontend uses only the project's publishable/anon key.
- Never put the service-role/secret key in a Vite environment variable or commit it.
- All data tables use Postgres RLS.
- Invitees must sign in with Google using the exact invited email; a database trigger activates only a matching unexpired pending invitation.
- Invitations are stored in Supabase but the app does not send invitation emails automatically; share the app URL with the invited person.
- The owner cannot be changed or suspended through the Team page.

## Development
Copy `.env.example` to `.env.local` if you want to override the built-in public Supabase URL and publishable key. Then run:
```sh
npm install
npm run dev
npm run build
``

Vite build output is `dist`. Connect this repository to the intended Vercel account and configure the production URL in Supabase Auth URL Configuration.
