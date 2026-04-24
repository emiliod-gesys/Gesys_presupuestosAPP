-- Ejecutar en Supabase SQL Editor (bases existentes).
-- Transacciones: proveedor y adjunto (URL); comentarios por transacción.

alter table public.transactions
  add column if not exists vendor text,
  add column if not exists attachment_url text;

create table if not exists public.transaction_comments (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transaction_comments_tx on public.transaction_comments(transaction_id);

alter table public.transaction_comments enable row level security;

drop policy if exists "transaction_comments_select" on public.transaction_comments;
create policy "transaction_comments_select" on public.transaction_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      inner join public.project_members pm on pm.project_id = t.project_id and pm.user_id = auth.uid()
      where t.id = transaction_comments.transaction_id
    )
  );

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
  );

drop policy if exists "transaction_comments_delete" on public.transaction_comments;
create policy "transaction_comments_delete" on public.transaction_comments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.transactions t
      inner join public.project_members pm
        on pm.project_id = t.project_id and pm.user_id = auth.uid() and pm.role = 'admin'
      where t.id = transaction_comments.transaction_id
    )
  );
