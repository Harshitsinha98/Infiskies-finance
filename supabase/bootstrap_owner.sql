-- Run this only in the Supabase SQL Editor, after the owner has successfully signed
-- in at least once with Google using sinhaharshit67@gmail.com.
-- This uses the SQL Editor's privileged database session; never run via the browser client.
do $$
declare
  owner_user auth.users%rowtype;
begin
  select * into owner_user
  from auth.users
  where lower(email) = 'sinhaharshit67@gmail.com'
  limit 1;

  if owner_user.id is null then
    raise exception 'Owner user not found. First sign in through Supabase Google Auth with sinhaharshit67@gmail.com, then rerun this script.';
  end if;

  insert into public.infiskies_profiles (
    id, email, full_name, avatar_url, role, status, permissions
  )
  values (
    owner_user.id,
    lower(owner_user.email),
    coalesce(owner_user.raw_user_meta_data ->> 'full_name',
             owner_user.raw_user_meta_data ->> 'name',
             'Harshit Sinha'),
    owner_user.raw_user_meta_data ->> 'avatar_url',
    'owner',
    'active',
    '{}'::jsonb
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.infiskies_profiles.full_name, ''), excluded.full_name),
      avatar_url = coalesce(public.infiskies_profiles.avatar_url, excluded.avatar_url),
      role = 'owner',
      status = 'active',
      updated_at = now();
end $$;
