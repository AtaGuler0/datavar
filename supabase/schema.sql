-- Datavar — contributor data plane (Supabase).
-- Run this once in the Supabase SQL editor (SQL Editor → New query → paste → Run).
--
-- Identity here is the connected Stellar wallet, not a Supabase Auth user, so
-- there is no auth.uid() to key RLS on. For the testnet build we run a
-- "trusted client" model: the anon role may read and insert, and the app sets
-- owner_wallet. This is deliberately permissive — good enough for a testnet
-- demo, and to be tightened later with wallet-signed JWTs. See README/notes.

-- ---------------------------------------------------------------------------
-- Table: datasets
-- ---------------------------------------------------------------------------
create table if not exists public.datasets (
  id            uuid primary key default gen_random_uuid(),
  owner_wallet  text        not null,
  title         text        not null,
  source_type   text        not null,
  description   text,
  sha256        text        not null,
  byte_size     bigint      not null,
  content_type  text,
  storage_path  text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists datasets_owner_idx
  on public.datasets (owner_wallet, created_at desc);

alter table public.datasets enable row level security;

-- Anyone with the anon key may read/insert; the app scopes by owner_wallet.
-- (Testnet posture — replace with wallet-JWT policies before real data.)
drop policy if exists "datasets read (testnet)"   on public.datasets;
drop policy if exists "datasets insert (testnet)" on public.datasets;

create policy "datasets read (testnet)"
  on public.datasets for select
  using (true);

create policy "datasets insert (testnet)"
  on public.datasets for insert
  with check (true);

-- ---------------------------------------------------------------------------
-- Storage: private "datasets" bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', false)
on conflict (id) do nothing;

drop policy if exists "datasets upload (testnet)"   on storage.objects;
drop policy if exists "datasets download (testnet)" on storage.objects;

create policy "datasets upload (testnet)"
  on storage.objects for insert
  with check (bucket_id = 'datasets');

create policy "datasets download (testnet)"
  on storage.objects for select
  using (bucket_id = 'datasets');
