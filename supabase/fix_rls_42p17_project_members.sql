-- ============================================================
-- Parche para bases YA creadas: error PostgREST 42P17 / 500 en
-- GET /rest/v1/projects?... (recursión RLS en project_members)
-- Ejecutar una vez en Supabase → SQL Editor
-- ============================================================

create or replace function public.current_user_is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_project_admin(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.role = 'admin'
  );
$$;

create or replace function public.project_has_no_members(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
  );
$$;

revoke all on function public.current_user_is_project_member(uuid) from public;
grant execute on function public.current_user_is_project_member(uuid) to authenticated;

revoke all on function public.current_user_is_project_admin(uuid) from public;
grant execute on function public.current_user_is_project_admin(uuid) to authenticated;

revoke all on function public.project_has_no_members(uuid) from public;
grant execute on function public.project_has_no_members(uuid) to authenticated;

drop policy if exists "project_members_select" on public.project_members;
drop policy if exists "project_members_insert" on public.project_members;
drop policy if exists "project_members_update" on public.project_members;
drop policy if exists "project_members_delete" on public.project_members;

create policy "project_members_select" on public.project_members
  for select to authenticated
  using (public.current_user_is_project_member(project_id));

create policy "project_members_insert" on public.project_members
  for insert to authenticated
  with check (
    public.current_user_is_project_admin(project_id)
    or public.project_has_no_members(project_id)
  );

create policy "project_members_update" on public.project_members
  for update to authenticated
  using (public.current_user_is_project_admin(project_id));

create policy "project_members_delete" on public.project_members
  for delete to authenticated
  using (public.current_user_is_project_admin(project_id));

drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_update" on public.projects;

create policy "projects_select" on public.projects
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_is_project_member(projects.id)
  );

create policy "projects_update" on public.projects
  for update to authenticated
  using (public.current_user_is_project_admin(projects.id));
