# Post-audit hardening notes

This document records high-impact issues identified during the repository review.

## Changes in the hardening migration

- Removes hard-coded email-based automatic owner promotion. Owner access must be provisioned through the privileged bootstrap process for the intended verified Auth account.
- Prevents employees from using task-update policy to change trusted task assignment identities.
- Limits employee project updates to self-authored internal notes; client-visible updates require owner or an appropriately authorized project manager.
- Makes payment reconciliation more defensive and idempotent: row locks, one payment ID per matching proposal/project/milestone/amount, no overwriting a different payment on an already-paid milestone, and an explicit error if a conflict has no matching income row.
- Adds indexes for frequent project/member/task read paths.

## Required manual verification

This change is not a substitute for staging and production testing. Apply migrations to a staging Supabase database first. Confirm the intended owner email using the actual Supabase Auth account and run `supabase/bootstrap_owner.sql` only through the Supabase SQL Editor, after verifying the target account.

Then test: Google and username/password sign-in, revoked/expired invitations, suspended members, co-admin permission scopes, task reassignment attempts by employees, private/client-visible project updates, and Razorpay success/uncaptured/failure/duplicate/mismatched/replayed payment paths. Verify there is exactly one `received` income row per captured Razorpay payment. Run `npm run build` and `npm run lint`.
