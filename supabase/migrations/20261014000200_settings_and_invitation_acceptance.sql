-- Functional Infiskies settings and trusted invite acceptance.
-- All objects are namespaced and do not modify BreakIQ tables.
create table if not exists public.infiskies_app_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.infiskies_app_settings enable row level security;
drop policy if exists "app_settings_select_owner" on public.infiskies_app_settings;
create policy "app_settings_select_owner" on public.infiskies_app_settings
for select to authenticated using (public.infiskies_current_role() = 'owner');
drop policy if exists "app_settings_insert_owner" on public.infiskies_app_settings;
create policy "app_settings_insert_owner" on public.infiskies_app_settings
for insert to authenticated with check (public.infiskies_current_role() = 'owner' and updated_by = (select auth.uid()));
drop policy if exists "app_settings_update_owner" on public.infiskies_app_settings;
create policy "app_settings_update_owner" on public.infiskies_app_settings
for update to authenticated using (public.infiskies_current_role() = 'owner')
with check (public.infiskies_current_role() = 'owner' and updated_by = (select auth.uid()));

create or replace function public.infiskies_sync_auth_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite_row public.infiskies_invitations%rowtype;
  display_name text;
begin
  if new.email is null then
    return new;
  end if;

  if exists(select 1 from public.infiskies_profiles p where p.id = new.id) then
    return new;
  end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
  for update;

  if invite_row.id is null then
    return new;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, created_by)
  values
    (new.id, lower(new.email), display_name,
     new.raw_user_meta_data ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions, invite_row.invited_by)
  on conflict (id) do nothing;

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = new.id, updated_at = now()
  where id = invite_row.id;

  return new;
end;
$$;

drop trigger if exists infiskies_auth_invitation_created on auth.users;
create trigger infiskies_auth_invitation_created
after insert or update of email on auth.users
for each row execute function public.infiskies_sync_auth_invitation();
