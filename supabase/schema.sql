-- ============================================================
-- GESYS PRESUPUESTOS - Schema completo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- PASO 1: CREAR TODAS LAS TABLAS
-- ============================================================

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists companions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  companion_id uuid references profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamptz default now() not null,
  unique(user_id, companion_id)
);

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

create table if not exists project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text check (role in ('admin', 'worker', 'observer')) not null,
  invited_by uuid references profiles(id),
  joined_at timestamptz default now() not null,
  unique(project_id, user_id)
);

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

create table if not exists budget_alerts (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references budget_categories(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  threshold_percentage numeric(5,2) not null,
  is_active boolean default true,
  created_by uuid references profiles(id) not null,
  created_at timestamptz default now() not null
);

create table if not exists transaction_types (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text check (type in ('income', 'expense')) not null,
  description text
);

create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  category_id uuid references budget_categories(id),
  transaction_type_id uuid references transaction_types(id) not null,
  description text not null,
  amount numeric(15,2) not null,
  date date not null,
  reference_number text,
  vendor text,
  attachment_url text,
  notes text,
  created_by uuid references profiles(id) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists transaction_comments (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid references transactions(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now() not null
);

create table if not exists project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  action text not null,
  details jsonb,
  created_at timestamptz default now() not null
);

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

-- ============================================================
-- PASO 1b: Funciones RLS (evitan recursión → PostgREST 42P17 en /project_members y /projects)
-- ============================================================

create or replace function public.current_user_is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_project_admin(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.role = 'admin'
  );
$$;

create or replace function public.project_has_no_members(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
  );
$$;

revoke all on function public.current_user_is_project_member(uuid) from public;
grant execute on function public.current_user_is_project_member(uuid) to authenticated;

revoke all on function public.current_user_is_project_admin(uuid) from public;
grant execute on function public.current_user_is_project_admin(uuid) to authenticated;

revoke all on function public.project_has_no_members(uuid) from public;
grant execute on function public.project_has_no_members(uuid) to authenticated;

-- ============================================================
-- PASO 2: HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================

alter table profiles enable row level security;
alter table companions enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table project_invitations enable row level security;
alter table budget_categories enable row level security;
alter table budget_alerts enable row level security;
alter table transaction_types enable row level security;
alter table transactions enable row level security;
alter table transaction_comments enable row level security;
alter table project_logs enable row level security;
alter table notifications enable row level security;

-- ============================================================
-- PASO 3: POLÍTICAS RLS (todas las tablas ya existen)
-- ============================================================

-- PROFILES
create policy "profiles_select" on profiles
  for select to authenticated using (true);

create policy "profiles_update" on profiles
  for update to authenticated using (auth.uid() = id);

-- Permite crear la fila de perfil desde el cliente si el trigger no corrió (p. ej. usuarios antiguos).
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- COMPANIONS
create policy "companions_select" on companions
  for select to authenticated
  using (auth.uid() = user_id or auth.uid() = companion_id);

create policy "companions_insert" on companions
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "companions_update" on companions
  for update to authenticated
  using (auth.uid() = companion_id or auth.uid() = user_id);

-- PROJECTS
create policy "projects_select" on projects
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_is_project_member(projects.id)
  );

create policy "projects_insert" on projects
  for insert to authenticated
  with check (auth.uid() = created_by);

create policy "projects_update" on projects
  for update to authenticated
  using (public.current_user_is_project_admin(projects.id));

-- PROJECT MEMBERS (políticas sin auto-referencia: evitan 42P17 / infinite recursion)
create policy "project_members_select" on project_members
  for select to authenticated
  using (public.current_user_is_project_member(project_id));

create policy "project_members_insert" on project_members
  for insert to authenticated
  with check (
    public.current_user_is_project_admin(project_id)
    or public.project_has_no_members(project_id)
  );

create policy "project_members_update" on project_members
  for update to authenticated
  using (public.current_user_is_project_admin(project_id));

create policy "project_members_delete" on project_members
  for delete to authenticated
  using (public.current_user_is_project_admin(project_id));

-- PROJECT INVITATIONS
create policy "project_invitations_select" on project_invitations
  for select to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid());

create policy "project_invitations_insert" on project_invitations
  for insert to authenticated
  with check (
    auth.uid() = inviter_id and
    exists (
      select 1 from project_members pm
      where pm.project_id = project_invitations.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "project_invitations_update" on project_invitations
  for update to authenticated
  using (invitee_id = auth.uid());

-- BUDGET CATEGORIES
create policy "budget_categories_select" on budget_categories
  for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "budget_categories_insert" on budget_categories
  for insert to authenticated
  with check (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

create policy "budget_categories_update" on budget_categories
  for update to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "budget_categories_delete" on budget_categories
  for delete to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_categories.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- BUDGET ALERTS
create policy "budget_alerts_all" on budget_alerts
  for all to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = budget_alerts.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- TRANSACTION TYPES
create policy "transaction_types_select" on transaction_types
  for select to authenticated using (true);

-- TRANSACTIONS
create policy "transactions_select" on transactions
  for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "transactions_insert" on transactions
  for insert to authenticated
  with check (
    auth.uid() = created_by and
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'worker')
    )
  );

create policy "transactions_update" on transactions
  for update to authenticated
  using (
    auth.uid() = created_by or
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "transactions_delete" on transactions
  for delete to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = transactions.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- TRANSACTION COMMENTS
create policy "transaction_comments_select" on transaction_comments
  for select to authenticated
  using (
    exists (
      select 1 from transactions t
      inner join project_members pm on pm.project_id = t.project_id and pm.user_id = auth.uid()
      where t.id = transaction_comments.transaction_id
    )
  );

create policy "transaction_comments_insert" on transaction_comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from transactions t
      inner join project_members pm
        on pm.project_id = t.project_id and pm.user_id = auth.uid() and pm.role in ('admin', 'worker')
      where t.id = transaction_comments.transaction_id
    )
  );

create policy "transaction_comments_delete" on transaction_comments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from transactions t
      inner join project_members pm
        on pm.project_id = t.project_id and pm.user_id = auth.uid() and pm.role = 'admin'
      where t.id = transaction_comments.transaction_id
    )
  );

-- PROJECT LOGS (solo lectura para miembros, inserción para usuarios autenticados)
create policy "project_logs_select" on project_logs
  for select to authenticated
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = project_logs.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "project_logs_insert" on project_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Sin UPDATE ni DELETE para garantizar inmutabilidad

-- NOTIFICATIONS
create policy "notifications_select" on notifications
  for select to authenticated
  using (auth.uid() = user_id);

create policy "notifications_insert" on notifications
  for insert to authenticated
  with check (true);

create policy "notifications_update" on notifications
  for update to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- PASO 4: DATOS INICIALES
-- ============================================================

insert into transaction_types (name, type, description) values
  ('Factura de Venta',    'income',  'Factura emitida por venta de bienes o servicios'),
  ('Pago de Venta',       'income',  'Pago recibido por venta'),
  ('Anticipo de Cliente', 'income',  'Anticipo recibido de cliente'),
  ('Otro Ingreso',        'income',  'Otro tipo de ingreso'),
  ('Factura de Compra',   'expense', 'Factura recibida por compra de bienes o servicios'),
  ('Pago de Compra',      'expense', 'Pago realizado por compra'),
  ('Planilla',            'expense', 'Pago de planilla de trabajadores'),
  ('Viáticos',            'expense', 'Gastos de viáticos y alimentación'),
  ('Liquidación',         'expense', 'Liquidación de gastos'),
  ('Otro Gasto',          'expense', 'Otro tipo de gasto')
on conflict do nothing;

-- ============================================================
-- PASO 5: TRIGGER - crear perfil al registrarse
-- ============================================================

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
    email      = excluded.email,
    full_name  = coalesce(excluded.full_name, profiles.full_name),
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
-- PASO 6: TRIGGER - log automático en transacciones
-- ============================================================

create or replace function log_transaction_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into project_logs (project_id, user_id, action, details)
    values (new.project_id, new.created_by, 'transaction_created', jsonb_build_object(
      'transaction_id', new.id,
      'description',    new.description,
      'amount',         new.amount,
      'date',           new.date
    ));
  elsif TG_OP = 'UPDATE' then
    insert into project_logs (project_id, user_id, action, details)
    values (new.project_id, new.created_by, 'transaction_updated', jsonb_build_object(
      'transaction_id', new.id,
      'description',    new.description,
      'amount',         new.amount
    ));
  elsif TG_OP = 'DELETE' then
    insert into project_logs (project_id, user_id, action, details)
    values (old.project_id, old.created_by, 'transaction_deleted', jsonb_build_object(
      'transaction_id', old.id,
      'description',    old.description,
      'amount',         old.amount
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
-- PASO 7: TRIGGER - verificar alertas de presupuesto
-- ============================================================

create or replace function check_budget_alerts()
returns trigger language plpgsql security definer as $$
declare
  v_category  budget_categories%rowtype;
  v_alert     budget_alerts%rowtype;
  v_spent     numeric;
  v_pct       numeric;
  v_member    project_members%rowtype;
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
          'category_id',   new.category_id,
          'category_name', v_category.name,
          'threshold',     v_alert.threshold_percentage,
          'current_pct',   round(v_pct, 1)
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
-- PASO 8: ÍNDICES
-- ============================================================

create index if not exists idx_project_members_user    on project_members(user_id);
create index if not exists idx_project_members_project on project_members(project_id);
create index if not exists idx_transactions_project    on transactions(project_id);
create index if not exists idx_transactions_category   on transactions(category_id);
create index if not exists idx_transaction_comments_tx   on transaction_comments(transaction_id);
create index if not exists idx_notifications_user      on notifications(user_id, is_read);
create index if not exists idx_project_logs_project    on project_logs(project_id);
create index if not exists idx_companions_user         on companions(user_id);
create index if not exists idx_companions_companion    on companions(companion_id);
