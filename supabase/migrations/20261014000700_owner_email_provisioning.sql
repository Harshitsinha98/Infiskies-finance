-- Automatically provision the specifically authorized Infiskies owner account.
-- The account only becomes owner after authenticating via Supabase Auth/Google.
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
  if new.email is null then return new; end if;

  display_name := coalesce(new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));

  if lower(new.email) = 'infiskies@gmail.com' then
    insert into public.infiskies_profiles
      (id, email, full_name, avatar_url, role, status, permissions)
    values
      (new.id, lower(new.email), display_name, new.raw_user_meta_data ->> 'avatar_url',
       'owner', 'active', '{}'::jsonb)
    on conflict (id) do update
      set email = excluded.email, full_name = excluded.full_name,
          avatar_url = excluded.avatar_url, role = 'owner', status = 'active',
          permissions = '{}'::jsonb, updated_at = now();
    return new;
  end if;

  if exists(select 1 from public.infiskies_profiles p where p.id = new.id) then
    return new;
  end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = lower(new.email) and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc limit 1 for update;

  if invite_row.id is null then return new; end if;

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, created_by)
  values
    (new.id, lower(new.email), display_name, new.raw_user_meta_data ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions, invite_row.invited_by)
  on conflict (id) do nothing;

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = new.id, updated_at = now()
  where id = invite_row.id;
  return new;
end;
$$;

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

  select u.raw_user_meta_data into current_user_meta
  from auth.users u where u.id = current_user_id;
  display_name := coalesce(current_user_meta ->> 'full_name',
    current_user_meta ->> 'name', split_part(current_email, '@', 1));

  if current_email = 'infiskies@gmail.com' then
    insert into public.infiskies_profiles
      (id, email, full_name, avatar_url, role, status, permissions)
    values
      (current_user_id, current_email, display_name, current_user_meta ->> 'avatar_url',
       'owner', 'active', '{}'::jsonb)
    on conflict (id) do update
      set email = excluded.email, full_name = excluded.full_name,
          avatar_url = excluded.avatar_url, role = 'owner', status = 'active',
          permissions = '{}'::jsonb, updated_at = now();
    return true;
  end if;

  if exists (select 1 from public.infiskies_profiles p
    where p.id = current_user_id and p.status = 'active' and p.email = current_email) then
    return true;
  end if;

  select * into invite_row
  from public.infiskies_invitations i
  where lower(i.email) = current_email and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc limit 1 for update;
  if invite_row.id is null then return false; end if;

  insert into public.infiskies_profiles
    (id, email, full_name, avatar_url, role, status, permissions, created_by)
  values
    (current_user_id, current_email, display_name, current_user_meta ->> 'avatar_url',
     invite_row.role, 'active', invite_row.permissions, invite_row.invited_by)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.infiskies_profiles.full_name, ''), excluded.full_name),
        avatar_url = coalesce(public.infiskies_profiles.avatar_url, excluded.avatar_url),
        role = case when public.infiskies_profiles.role = 'owner' then 'owner' else excluded.role end,
        status = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.status else 'active' end,
        permissions = case when public.infiskies_profiles.role = 'owner' then public.infiskies_profiles.permissions else excluded.permissions end,
        updated_at = now();

  update public.infiskies_invitations
  set status = 'accepted', accepted_by = current_user_id, updated_at = now()
  where id = invite_row.id;
  return true;
end;
$$;

revoke all on function public.infiskies_accept_my_invitation() from public;
grant execute on function public.infiskies_accept_my_invitation() to authenticated;
