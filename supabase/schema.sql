-- ============================================================
-- GESYS PRESUPUESTOS - Schema completo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Habilitar extensiones
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table profiles enable row level security;

create policy "Profiles son visibles por todos los usuarios autenticados"
  on profiles for select to authenticated using (true);

create policy "Usuarios pueden actualizar su propio perfil"
  on profiles for update to authenticated using (auth.uid() = id);

-- Trigger para crear perfil al registrarse
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- COMPANIONS (Compañeros)
-- ============================================================
create table if not exists companions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  companion_id uuid references profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamptz default now() not null,
  unique(user_id, companion_id)
);

alter table companions enable row level security;

create policy "Usuarios ven sus propias relaciones de compañeros"
  on companions for select to authenticated
  using (auth.uid() = user_id or auth.uid() = companion_id);

create policy "Usuarios pueden enviar solicitudes de compañero"
  on companions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Usuarios pueden actualizar solicitudes que les llegan"
  on companions for update to authenticated
  using (auth.uid() = companion_id or auth.uid() = user_id);

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  location text,
  client text,
  start_date date,
  end_date date,
  status text check (status in ('active', 'completed', 'archived')) default 'active',
  is_template boolean default false,
  template_id uuid references projects(id),
  created_by uuid references profiles(id) not null,
  total_budget numeric(15,2) default 0,
  currency text default 'GTQ',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table projects enable row level security;

create policy "Usuarios ven proyectos donde son miembros"
  on projects for select to authenticated
  using (
    created_by = auth.uid() or
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
      and project_members.user_id = auth.uid()
    )
  );

create policy "Usuarios autenticados pueden crear proyectos"
  on projects for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Admins pueden actualizar el proyecto"
  on projects for update to authenticated
  using (
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
      and project_members.user_id = auth.uid()
      and project_members.role = 'admin'
    )
  );

-- ============================================================
-- PROJECT MEMBERS
-- ============================================================
create table if not exists project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text check (role in ('admin', 'worker', 'observer')) not null,
  invited_by uuid references profiles(id),
  joined_at timestamptz default now() not null,
  unique(project_id, user_id)
);

alter table project_members enable row level security;

create policy "Miembros pueden ver otros miembros del proyecto"
  on project_members for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Admins pueden gestionar miembros"
  on project_members for insert to authenticated
  with check (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    ) or
    -- El creador inicial se agrega a sí mismo
    not exists (select 1 from project_members pm where pm.project_id = project_members.project_id)
  );

create policy "Admins pueden actualizar roles"
  on project_members for update to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

create policy "Admins pueden eliminar miembros"
  on project_members for delete to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

-- ============================================================
-- PROJECT INVITATIONS
-- ============================================================
create table if not exists project_invitations (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  inviter_id uuid references profiles(id) not null,
  invitee_id uuid references profiles(id) not null,
  role text check (role in ('admin', 'worker', 'observer')) not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamptz default now() not null,
  unique(project_id, invitee_id)
);

alter table project_invitations enable row level security;

create policy "Usuarios ven invitaciones que les conciernen"
  on project_invitations for select to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid());

create policy "Admins pueden crear invitaciones"
  on project_invitations for insert to authenticated
  with check (
    auth.uid() = inviter_id and
    exists (
      select 1 from project_members pm
      where pm.project_id = project_invitations.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

create policy "Invitados pueden responder sus invitaciones"
  on project_invitations for update to authenticated
  using (invitee_id = auth.uid());

-- ============================================================
-- BUDGET CATEGORIES (Renglones)
-- ============================================================
create table if not exists budget_categories (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  budget_amount numeric(15,2) default 0,
  parent_id uuid references budget_categories(id),
  order_index integer default 0,
  created_at timestamptz default now() not null
);

alter table budget_categories enable row level security;

create policy "Miembros ven categorías de sus proyectos"
  on budget_categories for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Admins y workers pueden crear categorías"
  on budget_categories for insert to authenticated
  with check (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('admin', 'worker')
    )
  );

create policy "Admins pueden actualizar categorías"
  on budget_categories for update to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

create policy "Admins pueden eliminar categorías"
  on budget_categories for delete to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

-- ============================================================
-- BUDGET ALERTS
-- ============================================================
create table if not exists budget_alerts (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references budget_categories(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  threshold_percentage numeric(5,2) not null,
  is_active boolean default true,
  created_by uuid references profiles(id) not null,
  created_at timestamptz default now() not null
);

alter table budget_alerts enable row level security;

create policy "Miembros ven alertas de sus proyectos"
  on budget_alerts for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_alerts.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Admins gestionan alertas"
  on budget_alerts for all to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_alerts.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

-- ============================================================
-- TRANSACTION TYPES
-- ============================================================
create table if not exists transaction_types (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text check (type in ('income', 'expense')) not null,
  description text
);

alter table transaction_types enable row level security;
create policy "Todos los usuarios autenticados ven tipos de transacción"
  on transaction_types for select to authenticated using (true);

insert into transaction_types (name, type, description) values
  ('Factura de Venta', 'income', 'Factura emitida por venta de bienes o servicios'),
  ('Pago de Venta', 'income', 'Pago recibido por venta'),
  ('Anticipo de Cliente', 'income', 'Anticipo recibido de cliente'),
  ('Factura de Compra', 'expense', 'Factura recibida por compra de bienes o servicios'),
  ('Pago de Compra', 'expense', 'Pago realizado por compra'),
  ('Planilla', 'expense', 'Pago de planilla de trabajadores'),
  ('Viáticos', 'expense', 'Gastos de viáticos y alimentación'),
  ('Liquidación', 'expense', 'Liquidación de gastos'),
  ('Otro Ingreso', 'income', 'Otro tipo de ingreso'),
  ('Otro Gasto', 'expense', 'Otro tipo de gasto')
on conflict do nothing;

-- ============================================================
-- TRANSACTIONS
-- ============================================================
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  category_id uuid references budget_categories(id),
  transaction_type_id uuid references transaction_types(id) not null,
  description text not null,
  amount numeric(15,2) not null,
  date date not null,
  reference_number text,
  notes text,
  created_by uuid references profiles(id) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table transactions enable row level security;

create policy "Miembros ven transacciones de sus proyectos"
  on transactions for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Admins y workers pueden crear transacciones"
  on transactions for insert to authenticated
  with check (
    auth.uid() = created_by and
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('admin', 'worker')
    )
  );

create policy "Admins y el creador pueden actualizar transacciones"
  on transactions for update to authenticated
  using (
    auth.uid() = created_by or
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

create policy "Admins pueden eliminar transacciones"
  on transactions for delete to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
    )
  );

-- ============================================================
-- PROJECT LOGS (inmutable - sin delete ni update)
-- ============================================================
create table if not exists project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  action text not null,
  details jsonb,
  created_at timestamptz default now() not null
);

alter table project_logs enable row level security;

create policy "Miembros ven logs de sus proyectos"
  on project_logs for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_logs.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Sistema puede insertar logs"
  on project_logs for insert to authenticated
  with check (auth.uid() = user_id);

-- Sin UPDATE ni DELETE para garantizar inmutabilidad

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  data jsonb,
  created_at timestamptz default now() not null
);

alter table notifications enable row level security;

create policy "Usuarios ven sus propias notificaciones"
  on notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "Sistema puede crear notificaciones"
  on notifications for insert to authenticated
  with check (true);

create policy "Usuarios pueden marcar sus notificaciones como leídas"
  on notifications for update to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- FUNCIÓN: registrar log automático en transacciones
-- ============================================================
create or replace function log_transaction_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into project_logs (project_id, user_id, action, details)
    values (new.project_id, new.created_by, 'transaction_created', jsonb_build_object(
      'transaction_id', new.id,
      'description', new.description,
      'amount', new.amount,
      'date', new.date
    ));
  elsif TG_OP = 'UPDATE' then
    insert into project_logs (project_id, user_id, action, details)
    values (new.project_id, auth.uid(), 'transaction_updated', jsonb_build_object(
      'transaction_id', new.id,
      'description', new.description,
      'amount', new.amount
    ));
  elsif TG_OP = 'DELETE' then
    insert into project_logs (project_id, user_id, action, details)
    values (old.project_id, auth.uid(), 'transaction_deleted', jsonb_build_object(
      'transaction_id', old.id,
      'description', old.description,
      'amount', old.amount
    ));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_transaction_change on transactions;
create trigger on_transaction_change
  after insert or update or delete on transactions
  for each row execute procedure log_transaction_change();

-- ============================================================
-- FUNCIÓN: verificar alertas de presupuesto
-- ============================================================
create or replace function check_budget_alerts()
returns trigger language plpgsql security definer as $$
declare
  v_category budget_categories%rowtype;
  v_alert budget_alerts%rowtype;
  v_spent numeric;
  v_pct numeric;
  v_member project_members%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select * into v_category from budget_categories where id = new.category_id;
  if not found or v_category.budget_amount = 0 then
    return new;
  end if;

  select coalesce(sum(
    case when tt.type = 'expense' then t.amount else -t.amount end
  ), 0)
  into v_spent
  from transactions t
  join transaction_types tt on t.transaction_type_id = tt.id
  where t.category_id = new.category_id;

  v_pct := (v_spent / v_category.budget_amount) * 100;

  for v_alert in
    select * from budget_alerts
    where category_id = new.category_id
    and is_active = true
    and threshold_percentage <= v_pct
  loop
    for v_member in
      select * from project_members where project_id = new.project_id
    loop
      insert into notifications (user_id, project_id, type, title, message, data)
      values (
        v_member.user_id,
        new.project_id,
        'budget_alert',
        'Alerta de presupuesto',
        'El renglón "' || v_category.name || '" ha alcanzado el ' || round(v_pct, 1) || '% del presupuesto asignado.',
        jsonb_build_object(
          'category_id', new.category_id,
          'category_name', v_category.name,
          'threshold', v_alert.threshold_percentage,
          'current_pct', round(v_pct, 1)
        )
      )
      on conflict do nothing;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_transaction_inserted on transactions;
create trigger on_transaction_inserted
  after insert on transactions
  for each row execute procedure check_budget_alerts();

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_project_members_user on project_members(user_id);
create index if not exists idx_project_members_project on project_members(project_id);
create index if not exists idx_transactions_project on transactions(project_id);
create index if not exists idx_transactions_category on transactions(category_id);
create index if not exists idx_notifications_user on notifications(user_id, is_read);
create index if not exists idx_project_logs_project on project_logs(project_id);
create index if not exists idx_companions_user on companions(user_id);
create index if not exists idx_companions_companion on companions(companion_id);
