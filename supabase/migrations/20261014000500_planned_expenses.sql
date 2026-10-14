-- Allow forecast expense entries without counting them as actual spending.
-- Scoped only to Infiskies Finance's namespaced table.
alter table public.infiskies_expenses
  drop constraint if exists infiskies_expenses_status_check;

alter table public.infiskies_expenses
  add constraint infiskies_expenses_status_check
  check (status in ('planned','recorded','reimbursable','reimbursed','void'));
