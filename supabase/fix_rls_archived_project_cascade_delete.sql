-- Parche: permitir DELETE FROM projects cuando el proyecto está archivado.
-- Las políticas hijas exigían project_editable_by_id (false si archived) y
-- bloqueaban el borrado en cascada.

drop policy if exists "transactions_delete" on public.transactions;
create policy "transactions_delete" on public.transactions
  for delete to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

drop policy if exists "transaction_comments_delete" on public.transaction_comments;
create policy "transaction_comments_delete" on public.transaction_comments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.transactions t2
      inner join public.project_members pm
        on pm.project_id = t2.project_id and pm.user_id = auth.uid() and pm.role = 'admin'
      where t2.id = transaction_comments.transaction_id
    )
  );

drop policy if exists "budget_categories_delete" on public.budget_categories;
create policy "budget_categories_delete" on public.budget_categories
  for delete to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

drop policy if exists "budget_alerts_delete" on public.budget_alerts;
create policy "budget_alerts_delete" on public.budget_alerts
  for delete to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

drop policy if exists "project_members_delete" on public.project_members;
create policy "project_members_delete" on public.project_members
  for delete to authenticated
  using (public.current_user_is_project_admin(project_members.project_id));
