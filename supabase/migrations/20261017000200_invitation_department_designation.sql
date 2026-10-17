alter table public.infiskies_invitations
  add column if not exists department text not null default '',
  add column if not exists designation text not null default '';

create or replace function public.infiskies_accept_my_invitation()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invite_row public.infiskies_invitations%rowtype;
  display_name text;
  current_user_meta jsonb;
begin
  if current_user_id is null or current_email = '' then return false; end if;

  if exists (select 1 from public.infiskies_profiles p
             where p.id = current_user_id and p.status = 'active' and p.email = current_email) then
    return true;
  end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = current_email and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc limit 1 for update;

  if invite_row.id is null then return false; end if;

  select u.raw_user_meta_data into current_user_meta from auth.users u where u.id = current_user_id;
  display_name := coalesce(current_user_meta ->> 'full_name', current_user_meta ->> 'name', split_part(current_email, '@', 1));

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, department, designation, created_by)
  values
    (current_user_id, current_email, display_name, current_user_meta ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions, invite_row.department, invite_row.designation, invite_row.invited_by)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        role = case when public.infiskies_profiles.role = 'owner' then 'owner' else excluded.role end,
        status = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.status else 'active' end,
        permissions = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.permissions else excluded.permissions end,
        department = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.department else excluded.department end,
        designation = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.designation else excluded.designation end,
        updated_at = now();

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = current_user_id, updated_at = now()
  where id = invite_row.id;
  return true;
end;
$$;
revoke all on function public.infiskies_accept_my_invitation() from public;
grant execute on function public.infiskies_accept_my_invitation() to authenticated;
