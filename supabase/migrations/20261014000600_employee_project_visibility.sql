-- Fix employee project visibility. The old policy accidentally compared each
-- related row's project_id to its own id, hiding projects with active employee shares.
drop policy if exists "projects_select" on public.infiskies_projects;

create policy "projects_select" on public.infiskies_projects
for select to authenticated
using (
  public.infiskies_current_role() = 'owner'
  or public.infiskies_has_permission('projects.manage')
  or exists (
    select 1
    from public.infiskies_project_members pm
    where pm.project_id = public.infiskies_projects.id
      and pm.employee_id = (select auth.uid())
      and pm.status = 'active'
  )
  or exists (
    select 1
    from public.infiskies_tasks t
    where t.project_id = public.infiskies_projects.id
      and t.assigned_to = (select auth.uid())
  )
);
