# Infiskies Finance

Internal project-finance and work-management portal for the owner, co-admins, and employees.

## Stack
- React + Vite + TypeScript
- Supabase Auth (Google OAuth), Postgres, Row Level Security, and Storage
- Vercel deployment linked to GitHub

## Owner bootstrap
Initial owner email: `sinhaharshit67@gmail.com`.

This app reuses the existing BreakIQ Supabase project to avoid creating another free-tier project. Its finance tables, custom types, and helper functions are prefixed with `infiskies_`; BreakIQ's existing tables are left untouched.

Do not hard-code owner privileges in the browser. Bootstrap the owner through a trusted Supabase SQL/admin operation only after the same email has successfully signed in and the matching `auth.users` row exists. The frontend denies access until an active `infiskies_profiles` row exists.

## Share rules
Employee shares are individually configured per project, either percentage of that project's configured share base or a fixed amount. Expenses remain separate from shares. The app should show agreed share, amount paid, and amount outstanding separately.

## Environment
Copy `.env.example` to `.env.local` and fill the Supabase project URL and publishable/anon key. Never commit real keys. Never expose a service-role key in frontend code.

## Deployment
Vite build command: `npm run build`; output directory: `dist`. Connect this GitHub repository to the intended Vercel account and configure its environment variables.
