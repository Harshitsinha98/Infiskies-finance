-- Automatically reconcile verified Razorpay milestone payments into Infiskies Income.
alter table public.infiskies_revenue_entries
  add column if not exists payment_provider text,
  add column if not exists payment_id text,
  add column if not exists proposal_id uuid references public.infiskies_proposals(id) on delete set null,
  add column if not exists milestone_id uuid references public.infiskies_proposal_milestones(id) on delete set null;

create unique index if not exists infiskies_income_payment_unique
  on public.infiskies_revenue_entries(payment_provider, payment_id)
  where payment_provider is not null and payment_id is not null;

create index if not exists infiskies_income_proposal_idx
  on public.infiskies_revenue_entries(proposal_id, milestone_id);

-- Project oversight fields used for delivery health, accountability and progress.
alter table public.infiskies_projects
  add column if not exists priority text not null default 'medium',
  add column if not exists manager_id uuid references public.infiskies_profiles(id) on delete set null,
  add column if not exists progress_percent integer not null default 0,
  add column if not exists health_status text not null default 'on_track',
  add column if not exists risk_notes text not null default '',
  add column if not exists latest_update text not null default '',
  add column if not exists next_update_at date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='infiskies_project_priority_check' and conrelid='public.infiskies_projects'::regclass) then
    alter table public.infiskies_projects add constraint infiskies_project_priority_check check (priority in ('low','medium','high','critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname='infiskies_project_progress_check' and conrelid='public.infiskies_projects'::regclass) then
    alter table public.infiskies_projects add constraint infiskies_project_progress_check check (progress_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='infiskies_project_health_check' and conrelid='public.infiskies_projects'::regclass) then
    alter table public.infiskies_projects add constraint infiskies_project_health_check check (health_status in ('on_track','at_risk','blocked'));
  end if;
end $$;

create table if not exists public.infiskies_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.infiskies_projects(id) on delete cascade,
  author_id uuid not null references public.infiskies_profiles(id),
  headline text not null,
  body text not null default '',
  progress_percent integer check (progress_percent between 0 and 100),
  health_status text not null default 'on_track' check (health_status in ('on_track','at_risk','blocked')),
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists infiskies_project_updates_project_idx on public.infiskies_project_updates(project_id, created_at desc);
alter table public.infiskies_project_updates enable row level security;

drop policy if exists infiskies_project_updates_select on public.infiskies_project_updates;
create policy infiskies_project_updates_select on public.infiskies_project_updates
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or exists (
    select 1 from public.infiskies_project_members pm
    where pm.project_id = infiskies_project_updates.project_id
      and pm.employee_id = (select auth.uid()) and pm.status = 'active'
  )
  or (
    visible_to_client = true
    and exists (
      select 1 from public.infiskies_client_projects cp
      join public.infiskies_clients c on c.id = cp.client_id
      where cp.project_id = infiskies_project_updates.project_id
        and c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
);

drop policy if exists infiskies_project_updates_insert on public.infiskies_project_updates;
create policy infiskies_project_updates_insert on public.infiskies_project_updates
for insert to authenticated
with check (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.infiskies_project_members pm
      where pm.project_id = infiskies_project_updates.project_id
        and pm.employee_id = (select auth.uid()) and pm.status = 'active'
    )
  )
);

drop policy if exists infiskies_project_updates_delete on public.infiskies_project_updates;
create policy infiskies_project_updates_delete on public.infiskies_project_updates
for delete to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'));

-- This function must be called only after the Edge Function verifies Razorpay's HMAC signature.
-- It atomically marks a milestone paid and inserts the matching Income record, with retry safety.
create or replace function public.infiskies_record_proposal_payment(
  p_milestone_id uuid,
  p_order_id text,
  p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_milestone public.infiskies_proposal_milestones%rowtype;
  v_proposal public.infiskies_proposals%rowtype;
  v_existing public.infiskies_revenue_entries%rowtype;
  v_income_id uuid;
  v_paid_at timestamptz := now();
begin
  if coalesce(p_order_id,'') = '' or coalesce(p_payment_id,'') = '' then
    raise exception 'Payment ID and order ID are required.';
  end if;

  select * into v_milestone
  from public.infiskies_proposal_milestones
  where id = p_milestone_id
  for update;
  if not found then raise exception 'Payment milestone not found.'; end if;
  if v_milestone.razorpay_order_id is distinct from p_order_id then
    raise exception 'Razorpay order does not match this milestone.';
  end if;

  select * into v_proposal
  from public.infiskies_proposals
  where id = v_milestone.proposal_id;
  if not found or v_proposal.status <> 'accepted' or v_proposal.project_id is null then
    raise exception 'Accepted proposal and linked project are required before recording income.';
  end if;

  select * into v_existing
  from public.infiskies_revenue_entries
  where payment_provider = 'razorpay' and payment_id = p_payment_id
  limit 1;

  if found then
    if v_existing.milestone_id is distinct from v_milestone.id then
      raise exception 'This payment ID is already recorded against another milestone.';
    end if;
    if v_milestone.status <> 'paid' or v_milestone.razorpay_payment_id is distinct from p_payment_id then
      update public.infiskies_proposal_milestones
      set status='paid', razorpay_payment_id=p_payment_id, paid_at=coalesce(paid_at,v_paid_at)
      where id=v_milestone.id;
    end if;
    return jsonb_build_object('success', true, 'already_recorded', true, 'income_id', v_existing.id);
  end if;

  if v_milestone.status = 'paid' and v_milestone.razorpay_payment_id is distinct from p_payment_id then
    raise exception 'This milestone is already reconciled to a different payment.';
  end if;
  if v_milestone.status not in ('unpaid','paid') then
    raise exception 'This milestone is not payable.';
  end if;

  update public.infiskies_proposal_milestones
  set status='paid', razorpay_payment_id=p_payment_id, paid_at=coalesce(paid_at,v_paid_at)
  where id=v_milestone.id;

  insert into public.infiskies_revenue_entries(
    project_id, description, reference, amount, status, invoice_date, received_at, created_by,
    payment_provider, payment_id, proposal_id, milestone_id
  ) values (
    v_proposal.project_id,
    'Proposal payment: ' || v_proposal.title || ' — ' || v_milestone.title,
    'Razorpay ' || p_payment_id,
    v_milestone.amount,
    'received',
    current_date,
    v_paid_at,
    v_proposal.created_by,
    'razorpay',
    p_payment_id,
    v_proposal.id,
    v_milestone.id
  )
  on conflict (payment_provider,payment_id) where payment_provider is not null and payment_id is not null
  do nothing
  returning id into v_income_id;

  if v_income_id is null then
    select id into v_income_id from public.infiskies_revenue_entries
    where payment_provider='razorpay' and payment_id=p_payment_id;
  end if;

  return jsonb_build_object('success', true, 'already_recorded', false, 'income_id', v_income_id);
end;
$function$;

revoke all on function public.infiskies_record_proposal_payment(uuid,text,text) from public;
revoke all on function public.infiskies_record_proposal_payment(uuid,text,text) from anon;
revoke all on function public.infiskies_record_proposal_payment(uuid,text,text) from authenticated;
grant execute on function public.infiskies_record_proposal_payment(uuid,text,text) to service_role;
