-- Invitado acepta invitación pero no aparece en el dashboard: el INSERT en
-- project_members lo bloqueaba RLS (solo admin o proyecto sin miembros).
--
-- Ejecutar en Supabase → SQL Editor.

drop policy if exists "project_members_insert" on public.project_members;
create policy "project_members_insert" on public.project_members
  for insert to authenticated
  with check (
    (
      auth.uid() = project_members.user_id
      and exists (
        select 1 from public.project_invitations pi
        where pi.project_id = project_members.project_id
          and pi.invitee_id = auth.uid()
          and pi.status = 'pending'
      )
    )
    or (
      public.project_editable_by_id(project_members.project_id)
      and (
        public.current_user_is_project_admin(project_members.project_id)
        or public.project_has_no_members(project_members.project_id)
      )
    )
  );

drop policy if exists "project_members_delete" on public.project_members;
create policy "project_members_delete" on public.project_members
  for delete to authenticated
  using (
    public.current_user_is_project_admin(project_members.project_id)
    or (
      auth.uid() = project_members.user_id
      and exists (
        select 1 from public.project_invitations pi
        where pi.project_id = project_members.project_id
          and pi.invitee_id = auth.uid()
          and pi.status = 'pending'
      )
    )
  );

drop policy if exists "project_logs_insert" on public.project_logs;
create policy "project_logs_insert" on public.project_logs
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      public.project_editable_by_id(project_logs.project_id)
      or exists (
        select 1 from public.project_invitations pi
        where pi.project_id = project_logs.project_id
          and pi.invitee_id = auth.uid()
          and pi.status = 'pending'
      )
    )
  );
