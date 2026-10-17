-- Infiskies Finance hardening: authorization boundaries and payment reconciliation integrity.
-- Apply after 20261017000600_project_update_employee_rls.sql.
-- This migration does not touch non-Infiskies objects.

-- Remove email-driven automatic owner promotion. Owner access must be provisioned using
-- the trusted SQL bootstrap after confirming the intended, verified Auth account.
create or replace function public.infiskies_sync_auth_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  invite_row public.infiskies_invitations%rowtype;
  display_name text;
begin
  if new.email is null then return new; end if;
  if exists (select 1 from public.infiskies_profiles p where p.id = new.id) then
    return new;
  end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.expires_at > now()
    and i.role <> 'owner'
  order by i.created_at desc limit 1 for update;

  if invite_row.id is null then return new; end if;
  display_name := coalesce(new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, created_by)
  values
    (new.id, lower(new.email), display_name, new.raw_user_meta_data ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions, invite_row.invited_by)
  on conflict (id) do nothing;

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = new.id, updated_at = now()
  where id = invite_row.id and status = 'pending';
  return new;
end;
$function$;

create or replace function public.infiskies_accept_my_invitation()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invite_row public.infiskies_invitations%rowtype;
  display_name text;
  current_user_meta jsonb;
begin
  if current_user_id is null or current_email = '' then return false; end if;
  if exists (
    select 1 from public.infiskies_profiles p
    where p.id = current_user_id and p.status = 'active' and p.email = current_email
  ) then return true; end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = current_email
    and i.status = 'pending'
    and i.expires_at > now()
    and i.role <> 'owner'
  order by i.created_at desc limit 1 for update;
  if invite_row.id is null then return false; end if;

  select u.raw_user_meta_data into current_user_meta
  from auth.users u where u.id = current_user_id;
  display_name := coalesce(current_user_meta ->> 'full_name',
    current_user_meta ->> 'name', split_part(current_email, '@', 1));

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, department, designation, created_by)
  values
    (current_user_id, current_email, display_name, current_user_meta ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions,
     coalesce(invite_row.department, ''), coalesce(invite_row.designation, ''), invite_row.invited_by)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.infiskies_profiles.full_name, ''), excluded.full_name),
        avatar_url = coalesce(public.infiskies_profiles.avatar_url, excluded.avatar_url),
        role = case when public.infiskies_profiles.role = 'owner' then 'owner' else excluded.role end,
        status = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.status else 'active' end,
        permissions = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.permissions else excluded.permissions end,
        department = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.department else excluded.department end,
        designation = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.designation else excluded.designation end,
        updated_at = now();

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = current_user_id, updated_at = now()
  where id = invite_row.id and status = 'pending';
  return true;
end;
$function$;

revoke all on function public.infiskies_accept_my_invitation() from public;
grant execute on function public.infiskies_accept_my_invitation() to authenticated;

-- An employee may update their assigned task's progress/status, but may not change
-- assignment identities. Admins with task-management permissions retain full editing.
drop policy if exists tasks_update on public.infiskies_tasks;
create policy tasks_update on public.infiskies_tasks
for update to authenticated
using (
  assigned_to = (select auth.uid())
  or public.infiskies_has_permission('tasks.manage')
  or public.infiskies_has_permission('tasks.assign')
)
with check (
  (
    public.infiskies_has_permission('tasks.manage')
    or public.infiskies_has_permission('tasks.assign')
  )
  or (
    assigned_to = (select auth.uid())
    and assigned_by = (select auth.uid())
  )
);

-- Internal employee project updates must be authored by the current employee and cannot
-- be made client-visible by setting a flag in the browser payload.
drop policy if exists infiskies_project_updates_insert on public.infiskies_project_updates;
create policy infiskies_project_updates_insert on public.infiskies_project_updates
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    public.infiskies_current_role() = 'owner'
    or public.infiskies_has_permission('projects.manage')
    or (
      visible_to_client = false
      and (
        exists (
          select 1 from public.infiskies_project_members pm
          where pm.project_id = infiskies_project_updates.project_id
            and pm.employee_id = (select auth.uid()) and pm.status = 'active'
        )
        or exists (
          select 1 from public.infiskies_tasks t
          where t.project_id = infiskies_project_updates.project_id
            and t.assigned_to = (select auth.uid())
        )
      )
    )
  )
);

-- Lock state changes and reconcile captured payments exactly once against the matching context.
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
  if coalesce(p_order_id, '') = '' or coalesce(p_payment_id, '') = '' then
    raise exception 'Payment ID and order ID are required.';
  end if;

  select * into v_milestone from public.infiskies_proposal_milestones
  where id = p_milestone_id for update;
  if not found then raise exception 'Payment milestone not found.'; end if;
  if v_milestone.razorpay_order_id is distinct from p_order_id then
    raise exception 'Razorpay order does not match this milestone.';
  end if;

  select * into v_proposal from public.infiskies_proposals
  where id = v_milestone.proposal_id for update;
  if not found or v_proposal.status <> 'accepted' or v_proposal.project_id is null then
    raise exception 'Accepted proposal and linked project are required before recording income.';
  end if;

  if v_milestone.status = 'paid'
     and v_milestone.razorpay_payment_id is distinct from p_payment_id then
    raise exception 'This milestone is already reconciled to a different payment.';
  end if;
  if v_milestone.status not in ('unpaid', 'paid') then
    raise exception 'This milestone is not payable.';
  end if;

  select * into v_existing from public.infiskies_revenue_entries
  where payment_provider = 'razorpay' and payment_id = p_payment_id limit 1;

  if found then
    if v_existing.milestone_id is distinct from v_milestone.id
       or v_existing.proposal_id is distinct from v_proposal.id
       or v_existing.project_id is distinct from v_proposal.project_id
       or v_existing.amount is distinct from v_milestone.amount then
      raise exception 'This payment ID is already recorded against a different payment context.';
    end if;

    update public.infiskies_proposal_milestones
    set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = coalesce(paid_at, v_paid_at)
    where id = v_milestone.id;
    return jsonb_build_object('success', true, 'already_recorded', true, 'income_id', v_existing.id);
  end if;

  update public.infiskies_proposal_milestones
  set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = coalesce(paid_at, v_paid_at)
  where id = v_milestone.id;

  insert into public.infiskies_revenue_entries (
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
  on conflict (payment_provider, payment_id)
    where payment_provider is not null and payment_id is not null
  do nothing
  returning id into v_income_id;

  if v_income_id is null then
    select id into v_income_id from public.infiskies_revenue_entries
    where payment_provider = 'razorpay' and payment_id = p_payment_id;
    if not found then raise exception 'Income reconciliation conflict. No income record was returned.'; end if;
  end if;
  return jsonb_build_object('success', true, 'already_recorded', false, 'income_id', v_income_id);
end;
$function$;

revoke all on function public.infiskies_record_proposal_payment(uuid, text, text) from public;
revoke all on function public.infiskies_record_proposal_payment(uuid, text, text) from anon;
revoke all on function public.infiskies_record_proposal_payment(uuid, text, text) from authenticated;
grant execute on function public.infiskies_record_proposal_payment(uuid, text, text) to service_role;

create index if not exists infiskies_tasks_project_assignee_idx
  on public.infiskies_tasks(project_id, assigned_to, status);
create index if not exists infiskies_project_members_project_status_idx
  on public.infiskies_project_members(project_id, status, employee_id);
create index if not exists infiskies_project_updates_created_at_idx
  on public.infiskies_project_updates(project_id, created_at desc);
