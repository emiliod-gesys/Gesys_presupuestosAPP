-- Ejecutar en Supabase SQL Editor (bases ya creadas).
-- 1) Administradores pueden eliminar proyectos.
-- 2) Si un proyecto se usa como plantilla (template_id), al borrarlo no debe fallar el FK.

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete to authenticated
  using (public.current_user_is_project_admin(projects.id));

alter table public.projects drop constraint if exists projects_template_id_fkey;

alter table public.projects
  add constraint projects_template_id_fkey
  foreign key (template_id) references public.projects(id)
  on delete set null;
