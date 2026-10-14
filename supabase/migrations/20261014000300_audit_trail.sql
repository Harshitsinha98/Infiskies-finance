create or replace function public.infiskies_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  target_id text;
  detail_data jsonb;
  action_name text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
    action_name := 'deleted';
  else
    row_data := to_jsonb(new);
    action_name := lower(tg_op);
  end if;

  target_id := coalesce(row_data ->> 'id', row_data ->> 'project_id', row_data ->> 'employee_id', row_data ->> 'email');
  detail_data := jsonb_strip_nulls(jsonb_build_object(
    'name', row_data ->> 'name',
    'full_name', row_data ->> 'full_name',
    'title', row_data ->> 'title',
    'category', row_data ->> 'category',
    'amount', row_data ->> 'amount',
    'status', row_data ->> 'status',
    'role', row_data ->> 'role',
    'email', row_data ->> 'email',
    'project_id', row_data ->> 'project_id'
  ));

  insert into public.infiskies_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    action_name,
    replace(tg_table_name, 'infiskies_', ''),
    target_id,
    detail_data
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'infiskies_profiles',
    'infiskies_invitations',
    'infiskies_projects',
    'infiskies_project_members',
    'infiskies_revenue_entries',
    'infiskies_expenses',
    'infiskies_payouts',
    'infiskies_tasks'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_audit', table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.infiskies_write_audit_log()',
      table_name || '_audit',
      table_name
    );
  end loop;
end $$;
