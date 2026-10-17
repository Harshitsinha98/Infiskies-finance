-- Let assigned employees post internal updates and read activity for their own project work.
drop policy if exists infiskies_project_updates_select on public.infiskies_project_updates;
create policy infiskies_project_updates_select on public.infiskies_project_updates
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or exists (
    select 1 from public.infiskies_project_members pm
    where pm.project_id = infiskies_project_updates.project_id
      and pm.employee_id = (select auth.uid()) and pm.status = 'active'
  )
  or exists (
    select 1 from public.infiskies_tasks t
    where t.project_id = infiskies_project_updates.project_id and t.assigned_to = (select auth.uid())
  )
  or (
    visible_to_client = true
    and exists (
      select 1 from public.infiskies_client_projects cp
      join public.infiskies_clients c on c.id = cp.client_id
      where cp.project_id = infiskies_project_updates.project_id
        and c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
);
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
          where t.project_id = infiskies_project_updates.project_id and t.assigned_to = (select auth.uid())
        )
      )
    )
  )
);
