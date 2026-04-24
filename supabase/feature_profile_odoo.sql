-- Credenciales Odoo por usuario (RLS: solo el propietario).
-- Ejecutar en Supabase SQL Editor si ya tienes el esquema base desplegado.

create table if not exists public.user_odoo_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  odoo_url text,
  odoo_login text,
  odoo_password text,
  updated_at timestamptz not null default now()
);

alter table public.user_odoo_settings enable row level security;

drop policy if exists "user_odoo_settings_select_own" on public.user_odoo_settings;
create policy "user_odoo_settings_select_own" on public.user_odoo_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_odoo_settings_insert_own" on public.user_odoo_settings;
create policy "user_odoo_settings_insert_own" on public.user_odoo_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_odoo_settings_update_own" on public.user_odoo_settings;
create policy "user_odoo_settings_update_own" on public.user_odoo_settings
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "user_odoo_settings_delete_own" on public.user_odoo_settings;
create policy "user_odoo_settings_delete_own" on public.user_odoo_settings
  for delete to authenticated using (auth.uid() = user_id);
