-- Login usernames are public identifiers; credentials remain only in Supabase Auth.
alter table public.infiskies_profiles
  add column if not exists login_username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'infiskies_profiles_login_username_format'
      and conrelid = 'public.infiskies_profiles'::regclass
  ) then
    alter table public.infiskies_profiles
      add constraint infiskies_profiles_login_username_format
      check (login_username is null or login_username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
  end if;
end $$;

create unique index if not exists infiskies_profiles_login_username_unique
  on public.infiskies_profiles (login_username)
  where login_username is not null;
