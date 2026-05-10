-- Vinculación SAT Guatemala (portal / futura sincronización FEL).
-- Ejecutar en Supabase SQL Editor si ya tienes el esquema base.

create table if not exists public.user_sat_gt_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nit text,
  portal_login text,
  portal_password text,
  updated_at timestamptz not null default now()
);

alter table public.user_sat_gt_settings enable row level security;

drop policy if exists "user_sat_gt_settings_select_own" on public.user_sat_gt_settings;
create policy "user_sat_gt_settings_select_own" on public.user_sat_gt_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_sat_gt_settings_insert_own" on public.user_sat_gt_settings;
create policy "user_sat_gt_settings_insert_own" on public.user_sat_gt_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_sat_gt_settings_update_own" on public.user_sat_gt_settings;
create policy "user_sat_gt_settings_update_own" on public.user_sat_gt_settings
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "user_sat_gt_settings_delete_own" on public.user_sat_gt_settings;
create policy "user_sat_gt_settings_delete_own" on public.user_sat_gt_settings
  for delete to authenticated using (auth.uid() = user_id);
