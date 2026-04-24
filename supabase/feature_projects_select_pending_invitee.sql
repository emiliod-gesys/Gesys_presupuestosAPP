-- Permite que quien tiene una invitación pendiente lea el proyecto (nombre, etc.)
-- para listados y notificaciones. Sin esto, el embed project:projects() en invitaciones devuelve null.

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_is_project_member(projects.id)
    or exists (
      select 1 from public.project_invitations pi
      where pi.project_id = projects.id
        and pi.invitee_id = auth.uid()
        and pi.status = 'pending'
    )
  );
