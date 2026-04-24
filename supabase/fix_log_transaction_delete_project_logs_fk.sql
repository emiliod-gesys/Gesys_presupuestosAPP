-- Error: insert on project_logs violates project_logs_project_id_fkey (23503)
-- al borrar un proyecto: el trigger log_transaction_change() inserta un log
-- por cada transacción borrada en cascada, pero en ciertos órdenes internos la
-- fila de `projects` ya no existe y el INSERT falla.
--
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.log_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.project_logs (project_id, user_id, action, details)
    values (new.project_id, new.created_by, 'transaction_created', jsonb_build_object(
      'transaction_id', new.id,
      'description',    new.description,
      'amount',         new.amount,
      'date',           new.date
    ));
  elsif TG_OP = 'UPDATE' then
    insert into public.project_logs (project_id, user_id, action, details)
    values (new.project_id, new.created_by, 'transaction_updated', jsonb_build_object(
      'transaction_id', new.id,
      'description',    new.description,
      'amount',         new.amount
    ));
  elsif TG_OP = 'DELETE' then
    if exists (select 1 from public.projects p where p.id = old.project_id) then
      insert into public.project_logs (project_id, user_id, action, details)
      values (old.project_id, old.created_by, 'transaction_deleted', jsonb_build_object(
        'transaction_id', old.id,
        'description',    old.description,
        'amount',         old.amount
      ));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
