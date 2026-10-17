-- Client Portal users also need to appear as audit-log actors.
-- Both employee and client accounts are auth.users records; profiles are only internal team members.
alter table public.infiskies_audit_logs
  drop constraint if exists infiskies_audit_logs_actor_id_fkey;

alter table public.infiskies_audit_logs
  add constraint infiskies_audit_logs_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

create or replace function public.infiskies_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  row_data jsonb;
  target_id text;
  detail_data jsonb;
  action_name text;
  actor_uuid uuid;
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

  actor_uuid := (select auth.uid());
  insert into public.infiskies_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (actor_uuid, action_name, replace(tg_table_name, 'infiskies_', ''), target_id, detail_data);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;
