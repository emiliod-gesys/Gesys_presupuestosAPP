-- Compromisos de presupuesto por proyecto/categoria.
-- Ejecutar en Supabase SQL Editor (bases ya existentes).

create table if not exists public.project_reservations (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  category_id uuid references public.budget_categories(id) not null,
  title text not null,
  details text,
  reserved_amount numeric(15,2) not null,
  created_by uuid references public.profiles(id) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.transactions
  add column if not exists reservation_id uuid references public.project_reservations(id) on delete set null;

create index if not exists idx_project_reservations_project on public.project_reservations(project_id);
create index if not exists idx_transactions_reservation on public.transactions(reservation_id);

alter table public.project_reservations enable row level security;

drop policy if exists "project_reservations_select" on public.project_reservations;
create policy "project_reservations_select" on public.project_reservations
  for select to authenticated
  using (
    exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_reservations.project_id
        and pm.user_id = auth.uid()
    )
  );

drop policy if exists "project_reservations_insert" on public.project_reservations;
create policy "project_reservations_insert" on public.project_reservations
  for insert to authenticated
  with check (
    public.project_editable_by_id(project_reservations.project_id)
    and auth.uid() = created_by
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_reservations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

drop policy if exists "project_reservations_update" on public.project_reservations;
create policy "project_reservations_update" on public.project_reservations
  for update to authenticated
  using (
    public.project_editable_by_id(project_reservations.project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_reservations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

drop policy if exists "project_reservations_delete" on public.project_reservations;
create policy "project_reservations_delete" on public.project_reservations
  for delete to authenticated
  using (
    public.project_editable_by_id(project_reservations.project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_reservations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );
