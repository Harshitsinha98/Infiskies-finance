# Supabase and Google OAuth Setup

Supabase project URL: `https://nrunqihyyijjyihqqlfw.supabase.co`

## 1. Database setup
The current BreakIQ Supabase project already has all three Infiskies migrations applied. For a fresh project, run each of these in order in SQL Editor:
- `supabase/migrations/20261014000100_initial_schema.sql`
- `supabase/migrations/20261014000200_settings_and_invitation_acceptance.sql`
- `supabase/migrations/20261014000300_audit_trail.sql`

Every finance table/type/function uses the `infiskies_*` prefix so it can coexist with BreakIQ's existing `profiles`, `projects` and operations tables. Never run an older unprefixed finance schema in the shared project.

Use a dedicated project and review the migration before applying. It creates the initial tables, role types, helper functions, indexes and RLS policies.

## 2. Enable Google provider
1. In Supabase Dashboard, open Authentication → Sign In / Providers → Google and enable it.
2. In Google Cloud Console, create or select a project, configure the Google Auth consent screen and create an OAuth Client ID for a Web application.
3. In the Google OAuth client, set the Authorized redirect URI to the exact callback shown by Supabase. It should look like:
   `https://zdvmlgioavvpraqzfeam.supabase.co/auth/v1/callback`
4. Copy the Google Client ID and Client Secret into the Supabase Google provider settings and save.

## 3. Configure Supabase URL configuration
In Authentication → URL Configuration:
- Set Site URL to the actual deployed Infiskies Finance URL once Vercel has created it.
- Add the exact deployed URL to Redirect URLs.
- Add `http://localhost:5173/**` for local development.
- If using Vercel preview URLs, add a narrowly scoped Vercel preview pattern that matches the real project/account naming. Prefer exact production URLs for production.

## 4. Bootstrap the owner account
1. Open the app and sign in with Google using `sinhaharshit67@gmail.com`.
2. The first sign-in may show the access-denied screen until the profile exists.
3. In Supabase SQL Editor, run `supabase/bootstrap_owner.sql` from this repo.
4. Sign out and sign in again. The matching user should now be an active owner profile.

The bootstrap script uses a privileged SQL Editor session; never expose database credentials or a service-role key in frontend code.

## 5. Member invitations
The Team page writes an invitation record but does not send an email. Manually share the deployed app URL. When a user signs in with Google using the exact invited email, the database trigger creates their active Infiskies profile from the unexpired invitation. If they have already signed in before you create the invitation, ask them to sign out and sign in again after the invitation is saved.

## 6. Publishable key
The Supabase publishable key is intended for browser applications. It is not a database authorization boundary; all exposed tables must keep RLS enabled and their policies tested. Never use a service-role/secret key in a `VITE_*` variable.

## Current implementation status
The repository contains the initial responsive login/dashboard foundation and initial SQL schema. Finance records, full invitations/member-management workflows, live chart queries, uploads, payout lifecycle and task CRUD still need implementation and security testing. Dashboard figures are sample data until those modules are wired to Supabase.
