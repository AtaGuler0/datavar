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
-- Table: sales
--
-- A dataset licensed to a buyer, and the payout the contributor can claim for
-- it. Buyers are simulated for now — admins run sale rounds from the admin
-- panel — but the claim itself is a real Stellar testnet payment, so every row
-- that reaches 'claimed' carries a transaction hash you can look up on-chain.
--
-- Price is stroops (1 XLM = 10,000,000), never a float: money that has to
-- match a Horizon operation to the last digit has no business being a double.
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id            uuid        primary key default gen_random_uuid(),
  dataset_id    uuid        not null references public.datasets (id) on delete cascade,
  owner_wallet  text        not null,
  buyer         text        not null,
  price_stroops bigint      not null check (price_stroops > 0),
  -- unclaimed → claiming → claimed. 'claiming' is held only while a payout is
  -- in flight; it's what keeps a double-clicked claim from paying twice.
  status        text        not null default 'unclaimed'
                            check (status in ('unclaimed', 'claiming', 'claimed')),
  tx_hash       text,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists sales_owner_idx
  on public.sales (owner_wallet, created_at desc);

create index if not exists sales_dataset_idx
  on public.sales (dataset_id);

alter table public.sales enable row level security;

-- Same trusted-client posture as datasets: the anon role may read, insert and
-- update. Payouts are still safe — the claim route is the only thing holding
-- the treasury key, so a forged update can move a row's status but never money.
drop policy if exists "sales read (testnet)"   on public.sales;
drop policy if exists "sales insert (testnet)" on public.sales;
drop policy if exists "sales update (testnet)" on public.sales;

create policy "sales read (testnet)"
  on public.sales for select
  using (true);

create policy "sales insert (testnet)"
  on public.sales for insert
  with check (true);

create policy "sales update (testnet)"
  on public.sales for update
  using (true)
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
