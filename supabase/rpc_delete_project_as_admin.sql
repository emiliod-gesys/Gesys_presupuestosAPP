-- Borrado de proyecto vía RPC: evita que el CASCADE falle por tablas con RLS
-- sin política DELETE (p. ej. notifications, project_invitations) o por orden
-- de borrado frente a project_members.
--
-- Ejecutar en Supabase → SQL Editor (rol con permisos para crear funciones).

create or replace function public.delete_project_as_admin(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  ) then
    raise exception 'Solo administradores pueden eliminar el proyecto';
  end if;

  delete from public.projects
  where id = p_project_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

-- Propietario típico en Supabase: bypass RLS en el DELETE en cascada
alter function public.delete_project_as_admin(uuid) owner to postgres;

revoke all on function public.delete_project_as_admin(uuid) from public;
grant execute on function public.delete_project_as_admin(uuid) to authenticated;
