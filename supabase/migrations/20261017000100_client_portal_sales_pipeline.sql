-- Infiskies client portal, lead pipeline, proposal milestones and client-visible project timeline.
-- All objects are namespaced to Infiskies; BreakIQ tables are untouched.
alter table public.infiskies_profiles
  add column if not exists department text not null default '',
  add column if not exists designation text not null default '';

create table if not exists public.infiskies_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  company_name text not null default '',
  phone text not null default '',
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid not null references public.infiskies_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infiskies_clients_email_lowercase check (email = lower(email))
);

create table if not exists public.infiskies_sales_leads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact_name text not null,
  company_name text not null default '',
  email text not null default '',
  phone text not null default '',
  service_interest text not null default '',
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  status text not null default 'new' check (status in ('new','contacted','qualified','proposal_sent','won','lost')),
  notes text not null default '',
  next_follow_up date,
  client_id uuid references public.infiskies_clients(id) on delete set null,
  created_by uuid not null references public.infiskies_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.infiskies_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.infiskies_clients(id) on delete restrict,
  project_id uuid references public.infiskies_projects(id) on delete set null,
  lead_id uuid references public.infiskies_sales_leads(id) on delete set null,
  title text not null,
  scope text not null default '',
  terms text not null default '',
  total_amount numeric(14,2) not null check (total_amount > 0),
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','cancelled')),
  created_by uuid not null references public.infiskies_profiles(id),
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.infiskies_proposal_milestones (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.infiskies_proposals(id) on delete cascade,
  title text not null,
  description text not null default '',
  percentage numeric(6,3) not null check (percentage > 0 and percentage <= 100),
  amount numeric(14,2) not null check (amount > 0),
  position integer not null default 1,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(proposal_id, position)
);

-- A project belongs to one client account only; this is the isolation boundary for client data.
create table if not exists public.infiskies_client_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.infiskies_clients(id) on delete cascade,
  project_id uuid not null unique references public.infiskies_projects(id) on delete cascade,
  proposal_id uuid unique references public.infiskies_proposals(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.infiskies_project_timeline (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.infiskies_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date,
  status text not null default 'upcoming' check (status in ('upcoming','in_progress','completed','blocked')),
  position integer not null default 1,
  visible_to_client boolean not null default true,
  completed_at timestamptz,
  created_by uuid not null references public.infiskies_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists infiskies_leads_owner_idx on public.infiskies_sales_leads(created_by, status, created_at desc);
create index if not exists infiskies_proposals_client_status_idx on public.infiskies_proposals(client_id, status, created_at desc);
create index if not exists infiskies_milestones_proposal_idx on public.infiskies_proposal_milestones(proposal_id, position);
create index if not exists infiskies_timeline_project_idx on public.infiskies_project_timeline(project_id, position, due_date);

alter table public.infiskies_clients enable row level security;
alter table public.infiskies_sales_leads enable row level security;
alter table public.infiskies_proposals enable row level security;
alter table public.infiskies_proposal_milestones enable row level security;
alter table public.infiskies_client_projects enable row level security;
alter table public.infiskies_project_timeline enable row level security;

drop policy if exists infiskies_clients_select on public.infiskies_clients;
create policy infiskies_clients_select on public.infiskies_clients
for select to authenticated
using (
  (user_id = (select auth.uid()) and status = 'active')
  or public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('members.manage')
);

drop policy if exists infiskies_clients_update on public.infiskies_clients;
create policy infiskies_clients_update on public.infiskies_clients
for update to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('members.manage'))
with check (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('members.manage'));

drop policy if exists infiskies_leads_select on public.infiskies_sales_leads;
create policy infiskies_leads_select on public.infiskies_sales_leads
for select to authenticated
using (
  created_by = (select auth.uid())
  or public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('sales.manage')
);

drop policy if exists infiskies_leads_insert on public.infiskies_sales_leads;
create policy infiskies_leads_insert on public.infiskies_sales_leads
for insert to authenticated
with check (public.infiskies_is_active_member() and created_by = (select auth.uid()));

drop policy if exists infiskies_leads_update on public.infiskies_sales_leads;
create policy infiskies_leads_update on public.infiskies_sales_leads
for update to authenticated
using (
  created_by = (select auth.uid())
  or public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('sales.manage')
)
with check (
  created_by = (select auth.uid())
  or public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('sales.manage')
);

drop policy if exists infiskies_leads_delete on public.infiskies_sales_leads;
create policy infiskies_leads_delete on public.infiskies_sales_leads
for delete to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('sales.manage'));

drop policy if exists infiskies_proposals_select on public.infiskies_proposals;
create policy infiskies_proposals_select on public.infiskies_proposals
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or public.infiskies_has_permission('sales.manage')
  or (
    status <> 'draft'
    and exists (
      select 1 from public.infiskies_clients c
      where c.id = infiskies_proposals.client_id
        and c.user_id = (select auth.uid())
        and c.status = 'active'
    )
  )
);

drop policy if exists infiskies_proposals_insert on public.infiskies_proposals;
create policy infiskies_proposals_insert on public.infiskies_proposals
for insert to authenticated
with check (
  (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('sales.manage'))
  and created_by = (select auth.uid())
);

drop policy if exists infiskies_proposals_update on public.infiskies_proposals;
create policy infiskies_proposals_update on public.infiskies_proposals
for update to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('sales.manage'))
with check (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('sales.manage'));

drop policy if exists infiskies_proposals_delete on public.infiskies_proposals;
create policy infiskies_proposals_delete on public.infiskies_proposals
for delete to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'));

drop policy if exists infiskies_milestones_select on public.infiskies_proposal_milestones;
create policy infiskies_milestones_select on public.infiskies_proposal_milestones
for select to authenticated
using (
  exists (
    select 1 from public.infiskies_proposals p
    where p.id = proposal_id
      and (
        public.infiskies_current_role() = 'owner'
        or public.infiskies_has_permission('projects.manage')
        or public.infiskies_has_permission('sales.manage')
        or (
          p.status <> 'draft'
          and exists(select 1 from public.infiskies_clients c where c.id = p.client_id and c.user_id = (select auth.uid()) and c.status = 'active')
        )
      )
  )
);

drop policy if exists infiskies_milestones_manage on public.infiskies_proposal_milestones;
create policy infiskies_milestones_manage on public.infiskies_proposal_milestones
for all to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or public.infiskies_has_permission('sales.manage')
)
with check (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or public.infiskies_has_permission('sales.manage')
);

drop policy if exists infiskies_client_projects_select on public.infiskies_client_projects;
create policy infiskies_client_projects_select on public.infiskies_client_projects
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or exists (
    select 1 from public.infiskies_clients c
    where c.id = client_id and c.user_id = (select auth.uid()) and c.status = 'active'
  )
);

drop policy if exists infiskies_client_projects_manage on public.infiskies_client_projects;
create policy infiskies_client_projects_manage on public.infiskies_client_projects
for all to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'))
with check (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'));

drop policy if exists infiskies_timeline_select on public.infiskies_project_timeline;
create policy infiskies_timeline_select on public.infiskies_project_timeline
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or (
    visible_to_client = true
    and exists (
      select 1 from public.infiskies_client_projects cp
      join public.infiskies_clients c on c.id = cp.client_id
      where cp.project_id = infiskies_project_timeline.project_id
        and c.user_id = (select auth.uid())
        and c.status = 'active'
    )
  )
);

drop policy if exists infiskies_timeline_insert on public.infiskies_project_timeline;
create policy infiskies_timeline_insert on public.infiskies_project_timeline
for insert to authenticated
with check (
  (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'))
  and created_by = (select auth.uid())
);

drop policy if exists infiskies_timeline_update on public.infiskies_project_timeline;
create policy infiskies_timeline_update on public.infiskies_project_timeline
for update to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'))
with check (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'));

drop policy if exists infiskies_timeline_delete on public.infiskies_project_timeline;
create policy infiskies_timeline_delete on public.infiskies_project_timeline
for delete to authenticated
using (public.infiskies_current_role() = 'owner' or public.infiskies_has_permission('projects.manage'));

-- Extend project visibility without loosening the existing employee/task rules.
drop policy if exists projects_select on public.infiskies_projects;
create policy projects_select on public.infiskies_projects
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or exists(select 1 from public.infiskies_project_members pm where pm.project_id = infiskies_projects.id and pm.employee_id = (select auth.uid()) and pm.status = 'active')
  or exists(select 1 from public.infiskies_tasks t where t.project_id = infiskies_projects.id and t.assigned_to = (select auth.uid()))
  or exists(
    select 1 from public.infiskies_client_projects cp
    join public.infiskies_clients c on c.id = cp.client_id
    where cp.project_id = infiskies_projects.id
      and c.user_id = (select auth.uid())
      and c.status = 'active'
  )
);

-- Called by an authenticated client only; the client can accept or reject only their own proposal.
create or replace function public.infiskies_client_respond_to_proposal(proposal_uuid uuid, decision text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.infiskies_clients%rowtype;
  v_proposal public.infiskies_proposals%rowtype;
  v_project_id uuid;
  v_milestone_count integer;
  v_total_percentage numeric;
  v_last_milestone_id uuid;
begin
  if decision not in ('accepted','rejected') then
    raise exception 'Invalid proposal decision.';
  end if;

  select * into v_client
  from public.infiskies_clients
  where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active client account not found.'; end if;

  select * into v_proposal
  from public.infiskies_proposals
  where id = proposal_uuid and client_id = v_client.id and status = 'sent'
  for update;
  if not found then raise exception 'Proposal is not available for this client.'; end if;

  if decision = 'rejected' then
    update public.infiskies_proposals
    set status = 'rejected', rejected_at = now()
    where id = v_proposal.id;
    return v_proposal.project_id;
  end if;

  select count(*), coalesce(sum(percentage), 0)
  into v_milestone_count, v_total_percentage
  from public.infiskies_proposal_milestones
  where proposal_id = v_proposal.id and status <> 'void';
  if v_milestone_count = 0 or abs(v_total_percentage - 100) > 0.01 then
    raise exception 'Proposal milestones must add up to exactly 100%% before acceptance.';
  end if;

  v_project_id := v_proposal.project_id;
  if v_project_id is not null then
    if exists(select 1 from public.infiskies_client_projects cp where cp.project_id = v_project_id and cp.client_id <> v_client.id) then
      raise exception 'This project is already assigned to another client.';
    end if;
  else
    insert into public.infiskies_projects (
      name, client_name, description, status, contract_value, share_base_amount, created_by
    )
    values (
      v_proposal.title,
      coalesce(nullif(v_client.company_name, ''), v_client.full_name),
      v_proposal.scope,
      'planning',
      v_proposal.total_amount,
      v_proposal.total_amount,
      v_proposal.created_by
    )
    returning id into v_project_id;
  end if;

  update public.infiskies_proposal_milestones
  set amount = round(v_proposal.total_amount * percentage / 100, 2)
  where proposal_id = v_proposal.id and status <> 'void';

  select id into v_last_milestone_id
  from public.infiskies_proposal_milestones
  where proposal_id = v_proposal.id and status <> 'void'
  order by position desc, created_at desc
  limit 1;

  update public.infiskies_proposal_milestones
  set amount = v_proposal.total_amount - coalesce((
    select sum(amount) from public.infiskies_proposal_milestones
    where proposal_id = v_proposal.id and status <> 'void' and id <> v_last_milestone_id
  ), 0)
  where id = v_last_milestone_id;

  insert into public.infiskies_client_projects(client_id, project_id, proposal_id)
  values (v_client.id, v_project_id, v_proposal.id)
  on conflict (project_id) do nothing;

  if not exists(select 1 from public.infiskies_client_projects cp where cp.project_id = v_project_id and cp.client_id = v_client.id) then
    raise exception 'Could not link this project to the client account.';
  end if;

  update public.infiskies_proposals
  set status = 'accepted', accepted_at = now(), project_id = v_project_id
  where id = v_proposal.id;

  return v_project_id;
end;
$$;

revoke all on function public.infiskies_client_respond_to_proposal(uuid,text) from public;
grant execute on function public.infiskies_client_respond_to_proposal(uuid,text) to authenticated;
