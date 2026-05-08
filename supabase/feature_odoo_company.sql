-- Empresa Odoo activa para importaciones (multiempresa).
alter table public.user_odoo_settings
  add column if not exists odoo_company_id integer;
