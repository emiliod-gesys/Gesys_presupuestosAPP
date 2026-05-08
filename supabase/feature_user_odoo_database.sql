-- Nombre de la base de datos Odoo (requerido por JSON-RPC salvo subdominio *.odoo.com).
alter table public.user_odoo_settings
  add column if not exists odoo_database text;
