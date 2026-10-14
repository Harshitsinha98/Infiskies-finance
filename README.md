# Infiskies Finance

Internal project finance and operations portal for owner, co-admins, and employees.

## Stack
- React + Vite + TypeScript
- Supabase Auth (Google OAuth), Postgres, Row Level Security, and Storage
- Vercel deployment from GitHub

## Owner bootstrap
Initial owner email: `sinhaharshit67@gmail.com`.

Do not hard-code owner privileges in the browser. Bootstrap the owner using the documented one-time SQL/admin process once Supabase Auth has a matching user. The UI must deny access until a member record exists and is active.

## Core modules
- Role-based member management and invitations
- Projects and project-specific employee share agreements
- Revenue, project expenses, and business miscellaneous expenses
- Employee payout ledger
- Task assignment and status tracking
- Audit logs and dashboard analytics

## Share rules
Shares are configured separately for each employee and project, as either a percentage of that project's configured share base or a fixed amount. Expenses are recorded separately and do not automatically reduce employee shares. Paid payouts are separate from agreed amounts.

## Environment
Create a local `.env` file from `.env.example`. Never commit real keys. Browser code may only use Supabase project URL and publishable/anon key with RLS enabled. Never expose a service-role key.

## Deployment
Expected Vite settings: `npm run build`, output directory `dist`. Connect this repository to the designated Vercel account and configure environment variables there.