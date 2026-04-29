-- Familias de proyectos: agrupa proyectos hermanos para comparación.
-- Ejecutar en Supabase SQL Editor (proyectos ya existentes).

create table if not exists public.project_families (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null
);

alter table public.projects
  add column if not exists family_id uuid references public.project_families(id) on delete set null;

create index if not exists idx_projects_family_id on public.projects(family_id);

alter table public.project_families enable row level security;

drop policy if exists "project_families_select" on public.project_families;
create policy "project_families_select" on public.project_families
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.projects p
      inner join public.project_members pm on pm.project_id = p.id and pm.user_id = auth.uid()
      where p.family_id = project_families.id
    )
  );

drop policy if exists "project_families_insert" on public.project_families;
create policy "project_families_insert" on public.project_families
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "project_families_update" on public.project_families;
create policy "project_families_update" on public.project_families
  for update to authenticated
  using (created_by = auth.uid());

drop policy if exists "project_families_delete" on public.project_families;
create policy "project_families_delete" on public.project_families
  for delete to authenticated
  using (created_by = auth.uid());
