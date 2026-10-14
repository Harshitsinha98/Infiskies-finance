-- Infiskies Finance schema, safely namespaced for coexistence with BreakIQ in the same Supabase project.
-- All finance tables/types/functions use the infiskies_ prefix; existing BreakIQ objects are not altered.
create extension if not exists pgcrypto;
create type public.infiskies_app_role as enum ('owner','co_admin','employee');
create type public.infiskies_member_status as enum ('active','suspended','invited');
create type public.infiskies_share_type as enum ('percentage','fixed');
create type public.infiskies_project_status as enum ('planning','active','on_hold','completed','archived');
create type public.infiskies_expense_scope as enum ('project','business');
create type public.infiskies_revenue_status as enum ('pending','received','void');
create type public.infiskies_payout_status as enum ('pending','approved','paid','void');
create type public.infiskies_task_status as enum ('todo','in_progress','in_review','done','blocked');
create type public.infiskies_task_priority as enum ('low','medium','high','urgent');

create table public.infiskies_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique check (email=lower(email)), full_name text not null default '',
 avatar_url text, role public.infiskies_app_role not null default 'employee', status public.infiskies_member_status not null default 'invited',
 permissions jsonb not null default '{}'::jsonb, created_by uuid references public.infiskies_profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.infiskies_invitations (
 id uuid primary key default gen_random_uuid(), email text not null check(email=lower(email)),
 role public.infiskies_app_role not null default 'employee' check(role <> 'owner'), permissions jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 invited_by uuid not null references public.infiskies_profiles(id), expires_at timestamptz not null default (now()+interval '14 days'),
 accepted_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index invitations_one_pending_per_email on public.infiskies_invitations(email) where status='pending';
create table public.infiskies_projects (
 id uuid primary key default gen_random_uuid(), name text not null, client_name text not null default '', description text not null default '',
 status public.infiskies_project_status not null default 'planning', contract_value numeric(14,2) not null default 0 check(contract_value>=0),
 share_base_amount numeric(14,2) not null default 0 check(share_base_amount>=0), start_date date, due_date date,
 created_by uuid not null references public.infiskies_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.infiskies_project_members (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.infiskies_projects(id) on delete cascade,
 employee_id uuid not null references public.infiskies_profiles(id), share_type public.infiskies_share_type not null, share_value numeric(14,2) not null check(share_value>=0),
 status text not null default 'active' check(status in ('active','paused','ended')), agreement_version integer not null default 1 check(agreement_version>0),
 agreed_at timestamptz not null default now(), created_by uuid not null references public.infiskies_profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,employee_id),
 constraint percentage_share_valid check(share_type <> 'percentage' or share_value<=100)
);
create table public.infiskies_revenue_entries (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.infiskies_projects(id) on delete cascade,
 description text not null default '', reference text, amount numeric(14,2) not null check(amount>0),
 status public.infiskies_revenue_status not null default 'pending', invoice_date date, received_at timestamptz,
 created_by uuid not null references public.infiskies_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.infiskies_expenses (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.infiskies_projects(id) on delete restrict,
 scope public.infiskies_expense_scope not null, category text not null, description text not null default '',
 amount numeric(14,2) not null check(amount>0), expense_date date not null default current_date,
 paid_by uuid references public.infiskies_profiles(id), receipt_path text,
 status text not null default 'recorded' check(status in ('recorded','reimbursable','reimbursed','void')),
 created_by uuid not null references public.infiskies_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint expense_scope_project_match check((scope='project' and project_id is not null) or (scope='business' and project_id is null))
);
create table public.infiskies_payouts (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.infiskies_projects(id) on delete restrict,
 project_member_id uuid not null references public.infiskies_project_members(id) on delete restrict, employee_id uuid not null references public.infiskies_profiles(id),
 amount numeric(14,2) not null check(amount>0), share_type_snapshot public.infiskies_share_type not null,
 share_value_snapshot numeric(14,2) not null check(share_value_snapshot>=0), share_base_snapshot numeric(14,2) not null check(share_base_snapshot>=0),
 agreement_version_snapshot integer not null, status public.infiskies_payout_status not null default 'pending',
 approved_by uuid references public.infiskies_profiles(id), approved_at timestamptz, paid_by uuid references public.infiskies_profiles(id), paid_at timestamptz,
 payment_reference text, notes text not null default '', created_by uuid not null references public.infiskies_profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.infiskies_tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.infiskies_projects(id) on delete set null,
 title text not null, description text not null default '', assigned_to uuid not null references public.infiskies_profiles(id),
 assigned_by uuid not null references public.infiskies_profiles(id), status public.infiskies_task_status not null default 'todo', priority public.infiskies_task_priority not null default 'medium',
 progress_percent integer not null default 0 check(progress_percent between 0 and 100), due_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.infiskies_audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.infiskies_profiles(id) on delete set null,
 action text not null, entity_type text not null, entity_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index invitations_email_status_idx on public.infiskies_invitations(email,status);
create index projects_status_idx on public.infiskies_projects(status);
create index project_members_employee_idx on public.infiskies_project_members(employee_id);
create index revenue_project_status_idx on public.infiskies_revenue_entries(project_id,status);
create index expenses_project_date_idx on public.infiskies_expenses(project_id,expense_date desc);
create index payouts_employee_status_idx on public.infiskies_payouts(employee_id,status);
create index tasks_assignee_status_idx on public.infiskies_tasks(assigned_to,status);
create index tasks_project_due_idx on public.infiskies_tasks(project_id,due_at);
create index audit_logs_entity_idx on public.infiskies_audit_logs(entity_type,entity_id,created_at desc);

create or replace function public.infiskies_current_role() returns public.infiskies_app_role
language sql stable security definer set search_path=public as $$
 select p.role from public.infiskies_profiles p where p.id=(select auth.uid()) and p.status='active' and p.email=lower(coalesce((select auth.jwt()->>'email'),''))
 limit 1
$$;
create or replace function public.infiskies_has_permission(permission_key text) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(p.role='owner' or (p.role='co_admin' and coalesce((p.permissions->>permission_key)::boolean,false)),false)
 from public.infiskies_profiles p where p.id=(select auth.uid()) and p.status='active' and p.email=lower(coalesce((select auth.jwt()->>'email'),''))
 limit 1
$$;
create or replace function public.infiskies_is_active_member() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.infiskies_profiles p where p.id=(select auth.uid()) and p.status='active' and p.email=lower(coalesce((select auth.jwt()->>'email'),'')))
$$;
create or replace function public.infiskies_can_access_project(target_project uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.infiskies_current_role() in ('owner','co_admin')
 or exists(select 1 from public.infiskies_project_members pm join public.infiskies_profiles p on p.id=pm.employee_id where pm.project_id=target_project and pm.employee_id=(select auth.uid()) and pm.status='active' and p.status='active')
$$;
create or replace function public.infiskies_touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['infiskies_profiles','infiskies_invitations','infiskies_projects','infiskies_project_members','infiskies_revenue_entries','infiskies_expenses','infiskies_payouts','infiskies_tasks'] loop execute format('create trigger %I before update on public.%I for each row execute function public.infiskies_touch_updated_at()',t||'_touch_updated_at',t); end loop; end $$;

alter table public.infiskies_profiles enable row level security;
alter table public.infiskies_invitations enable row level security;
alter table public.infiskies_projects enable row level security;
alter table public.infiskies_project_members enable row level security;
alter table public.infiskies_revenue_entries enable row level security;
alter table public.infiskies_expenses enable row level security;
alter table public.infiskies_payouts enable row level security;
alter table public.infiskies_tasks enable row level security;
alter table public.infiskies_audit_logs enable row level security;

create policy "profiles_select_authorized" on public.infiskies_profiles for select to authenticated using(id=(select auth.uid()) or public.infiskies_has_permission('members.manage'));
-- Do not grant direct profile insert/delete. Admins can modify non-owner profiles via this scoped policy.
create policy "profiles_update" on public.infiskies_profiles for update to authenticated
using(public.infiskies_has_permission('members.manage') and role <> 'owner')
with check(public.infiskies_has_permission('members.manage') and role <> 'owner');
create policy "invitations_select" on public.infiskies_invitations for select to authenticated using(public.infiskies_has_permission('members.manage'));
create policy "invitations_insert" on public.infiskies_invitations for insert to authenticated with check(public.infiskies_has_permission('members.manage') and invited_by=(select auth.uid()) and role <> 'owner');
create policy "invitations_update" on public.infiskies_invitations for update to authenticated using(public.infiskies_has_permission('members.manage')) with check(public.infiskies_has_permission('members.manage') and role <> 'owner');
create policy "invitations_delete" on public.infiskies_invitations for delete to authenticated using(public.infiskies_has_permission('members.manage'));
create policy "projects_select" on public.infiskies_projects for select to authenticated using(
 public.infiskies_current_role()='owner' or public.infiskies_has_permission('projects.manage')
 or exists(select 1 from public.infiskies_project_members pm where pm.project_id=id and pm.employee_id=(select auth.uid()) and pm.status='active')
 or exists(select 1 from public.infiskies_tasks t where t.project_id=id and t.assigned_to=(select auth.uid()))
);
create policy "projects_insert" on public.infiskies_projects for insert to authenticated with check(public.infiskies_has_permission('projects.manage') and created_by=(select auth.uid()));
create policy "projects_update" on public.infiskies_projects for update to authenticated using(public.infiskies_has_permission('projects.manage')) with check(public.infiskies_has_permission('projects.manage'));
create policy "projects_delete" on public.infiskies_projects for delete to authenticated using(public.infiskies_has_permission('projects.manage'));
create policy "project_members_select" on public.infiskies_project_members for select to authenticated using(employee_id=(select auth.uid()) or public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('finance.view'));
create policy "project_members_manage" on public.infiskies_project_members for all to authenticated using(public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('finance.manage')) with check((public.infiskies_has_permission('projects.manage') or public.infiskies_has_permission('finance.manage')) and created_by=(select auth.uid()));
create policy "revenue_select" on public.infiskies_revenue_entries for select to authenticated using(public.infiskies_has_permission('finance.view') or public.infiskies_has_permission('finance.manage'));
create policy "revenue_insert" on public.infiskies_revenue_entries for insert to authenticated with check(public.infiskies_has_permission('finance.manage') and created_by=(select auth.uid()));
create policy "revenue_update" on public.infiskies_revenue_entries for update to authenticated using(public.infiskies_has_permission('finance.manage')) with check(public.infiskies_has_permission('finance.manage'));
create policy "revenue_delete" on public.infiskies_revenue_entries for delete to authenticated using(public.infiskies_has_permission('finance.manage'));
create policy "expenses_select" on public.infiskies_expenses for select to authenticated using(public.infiskies_has_permission('finance.view') or public.infiskies_has_permission('finance.manage'));
create policy "expenses_insert" on public.infiskies_expenses for insert to authenticated with check(public.infiskies_has_permission('finance.manage') and created_by=(select auth.uid()));
create policy "expenses_update" on public.infiskies_expenses for update to authenticated using(public.infiskies_has_permission('finance.manage')) with check(public.infiskies_has_permission('finance.manage'));
create policy "expenses_delete" on public.infiskies_expenses for delete to authenticated using(public.infiskies_has_permission('finance.manage'));
create policy "payouts_select" on public.infiskies_payouts for select to authenticated using(employee_id=(select auth.uid()) or public.infiskies_has_permission('finance.view') or public.infiskies_has_permission('payouts.manage'));
create policy "payouts_insert" on public.infiskies_payouts for insert to authenticated with check((public.infiskies_has_permission('payouts.manage') or public.infiskies_has_permission('finance.manage')) and created_by=(select auth.uid()));
create policy "payouts_update" on public.infiskies_payouts for update to authenticated using(public.infiskies_has_permission('payouts.manage') or public.infiskies_has_permission('finance.manage')) with check(public.infiskies_has_permission('payouts.manage') or public.infiskies_has_permission('finance.manage'));
create policy "payouts_delete" on public.infiskies_payouts for delete to authenticated using(public.infiskies_has_permission('payouts.manage'));
create policy "tasks_select" on public.infiskies_tasks for select to authenticated using(assigned_to=(select auth.uid()) or assigned_by=(select auth.uid()) or public.infiskies_has_permission('tasks.view_all') or public.infiskies_has_permission('tasks.assign'));
create policy "tasks_insert" on public.infiskies_tasks for insert to authenticated with check((public.infiskies_has_permission('tasks.assign') or public.infiskies_has_permission('tasks.manage')) and assigned_by=(select auth.uid()));
create policy "tasks_update" on public.infiskies_tasks for update to authenticated using(assigned_to=(select auth.uid()) or public.infiskies_has_permission('tasks.manage') or public.infiskies_has_permission('tasks.assign')) with check(assigned_to=(select auth.uid()) or public.infiskies_has_permission('tasks.manage') or public.infiskies_has_permission('tasks.assign'));
create policy "tasks_delete" on public.infiskies_tasks for delete to authenticated using(public.infiskies_has_permission('tasks.manage') or public.infiskies_has_permission('tasks.assign'));
create policy "audit_logs_select" on public.infiskies_audit_logs for select to authenticated using(public.infiskies_has_permission('audit.view'));
-- Deliberately no client insert/update/delete policy on audit_logs.
-- Provision sinhaharshit67@gmail.com as owner once the matching auth.users row exists, using trusted SQL/admin access.
