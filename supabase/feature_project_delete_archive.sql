-- ============================================================
-- 1) Borrado de proyecto: categorías hijas referencian parent_id
--    sin ON DELETE CASCADE → falla el DELETE del proyecto.
-- ============================================================

alter table public.budget_categories
  drop constraint if exists budget_categories_parent_id_fkey;

alter table public.budget_categories
  add constraint budget_categories_parent_id_fkey
  foreign key (parent_id) references public.budget_categories(id)
  on delete cascade;

-- ============================================================
-- 2) Proyecto archivado: solo reactivar (→ active) sin tocar otros campos
-- ============================================================

create or replace function public.enforce_archived_project_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'archived' then
    if new.status = 'archived' then
      if to_jsonb(new) is distinct from to_jsonb(old) then
        raise exception 'Proyecto archivado: no se puede modificar. Reactiva el proyecto (estado Activo) para editarlo.';
      end if;
    elsif new.status = 'active' then
      if to_jsonb(new) - 'status' - 'updated_at'
         is distinct from to_jsonb(old) - 'status' - 'updated_at' then
        raise exception 'Proyecto archivado: solo puedes volver a Activo sin cambiar nombre, fechas ni otros datos.';
      end if;
    else
      raise exception 'Proyecto archivado: solo se permite reactivar (estado Activo).';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_enforce_archived on public.projects;
create trigger trg_projects_enforce_archived
  before update on public.projects
  for each row
  execute procedure public.enforce_archived_project_rules();

-- ============================================================
-- 3) No editar datos del proyecto si está archivado
-- ============================================================

create or replace function public.project_editable_by_id(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.status is distinct from 'archived' from public.projects p where p.id = p_project_id),
    false
  );
$$;

revoke all on function public.project_editable_by_id(uuid) from public;
grant execute on function public.project_editable_by_id(uuid) to authenticated;

-- ----- transactions -----
drop policy if exists "transactions_insert" on public.transactions;
create policy "transactions_insert" on public.transactions
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and public.project_editable_by_id(transactions.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

drop policy if exists "transactions_update" on public.transactions;
create policy "transactions_update" on public.transactions
  for update to authenticated
  using (
    public.project_editable_by_id(transactions.project_id)
    and (
      auth.uid() = created_by
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = transactions.project_id
          and pm.user_id = auth.uid()
          and pm.role = 'admin'
      )
    )
  );

drop policy if exists "transactions_delete" on public.transactions;
create policy "transactions_delete" on public.transactions
  for delete to authenticated
  using (
    public.project_editable_by_id(transactions.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ----- transaction_comments -----
drop policy if exists "transaction_comments_insert" on public.transaction_comments;
create policy "transaction_comments_insert" on public.transaction_comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.transactions t
      inner join public.project_members pm
        on pm.project_id = t.project_id and pm.user_id = auth.uid() and pm.role in ('admin', 'worker')
      where t.id = transaction_comments.transaction_id
    )
    and exists (
      select 1 from public.transactions t2
      where t2.id = transaction_comments.transaction_id
        and public.project_editable_by_id(t2.project_id)
    )
  );

drop policy if exists "transaction_comments_delete" on public.transaction_comments;
create policy "transaction_comments_delete" on public.transaction_comments
  for delete to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_comments.transaction_id
        and public.project_editable_by_id(t.project_id)
    )
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.transactions t2
        inner join public.project_members pm
          on pm.project_id = t2.project_id and pm.user_id = auth.uid() and pm.role = 'admin'
        where t2.id = transaction_comments.transaction_id
      )
    )
  );

-- ----- budget_categories -----
drop policy if exists "budget_categories_insert" on public.budget_categories;
create policy "budget_categories_insert" on public.budget_categories
  for insert to authenticated
  with check (
    public.project_editable_by_id(budget_categories.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

drop policy if exists "budget_categories_update" on public.budget_categories;
create policy "budget_categories_update" on public.budget_categories
  for update to authenticated
  using (
    public.project_editable_by_id(budget_categories.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

drop policy if exists "budget_categories_delete" on public.budget_categories;
create policy "budget_categories_delete" on public.budget_categories
  for delete to authenticated
  using (
    public.project_editable_by_id(budget_categories.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ----- budget_alerts (reemplazar FOR ALL) -----
drop policy if exists "budget_alerts_all" on public.budget_alerts;

create policy "budget_alerts_select" on public.budget_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "budget_alerts_insert" on public.budget_alerts
  for insert to authenticated
  with check (
    public.project_editable_by_id(budget_alerts.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "budget_alerts_update" on public.budget_alerts
  for update to authenticated
  using (
    public.project_editable_by_id(budget_alerts.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "budget_alerts_delete" on public.budget_alerts
  for delete to authenticated
  using (
    public.project_editable_by_id(budget_alerts.project_id)
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ----- project_members -----
drop policy if exists "project_members_insert" on public.project_members;
create policy "project_members_insert" on public.project_members
  for insert to authenticated
  with check (
    public.project_editable_by_id(project_members.project_id)
    and (
      public.current_user_is_project_admin(project_members.project_id)
      or public.project_has_no_members(project_members.project_id)
    )
  );

drop policy if exists "project_members_update" on public.project_members;
create policy "project_members_update" on public.project_members
  for update to authenticated
  using (
    public.project_editable_by_id(project_members.project_id)
    and public.current_user_is_project_admin(project_members.project_id)
  );

drop policy if exists "project_members_delete" on public.project_members;
create policy "project_members_delete" on public.project_members
  for delete to authenticated
  using (
    public.project_editable_by_id(project_members.project_id)
    and public.current_user_is_project_admin(project_members.project_id)
  );

-- ----- project_invitations -----
drop policy if exists "project_invitations_insert" on public.project_invitations;
create policy "project_invitations_insert" on public.project_invitations
  for insert to authenticated
  with check (
    public.project_editable_by_id(project_invitations.project_id)
    and auth.uid() = inviter_id
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = project_invitations.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ----- project_logs -----
drop policy if exists "project_logs_insert" on public.project_logs;
create policy "project_logs_insert" on public.project_logs
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.project_editable_by_id(project_logs.project_id)
  );
