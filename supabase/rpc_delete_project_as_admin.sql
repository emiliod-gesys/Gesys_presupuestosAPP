-- Borrado de proyecto vía RPC (respaldo si no usas SUPABASE_SERVICE_ROLE_KEY en la API).
-- Recomendado en producción: variable SUPABASE_SERVICE_ROLE_KEY en Vercel; la ruta DELETE
-- /api/projects/[id] borra con cliente service_role tras comprobar admin (sin depender de RLS).
--
-- Si al borrar aparece "Proyecto no encontrado", el DELETE dentro de esta función sigue
-- sujeto a RLS: la función debe ser propiedad de un rol que omita RLS (p. ej. postgres) o
-- comenta la línea ALTER OWNER si falla y usa solo la service role en la app.
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
