-- Datavar — contributor data plane (Supabase).
-- Run this once in the Supabase SQL editor (SQL Editor → New query → paste → Run).
-- It is idempotent: re-run it after pulling changes that add to it.
--
-- Identity here is the connected Stellar wallet, not a Supabase Auth user. The
-- wallet proves itself by signing a SEP-10 challenge, and the server mints a
-- JWT carrying its address in a `wallet` claim (see src/lib/auth/). Everything
-- below keys off that claim, so the database enforces ownership rather than
-- trusting the app to remember to filter.
--
-- What a stranger holding the anon key can reach: the three aggregate views at
-- the bottom, and nothing else. No dataset row, no sale row, no file.

-- ---------------------------------------------------------------------------
-- Claims from the session token
--
-- Marked `stable` so the planner can call them once per statement rather than
-- once per row, and pinned to an empty search_path so a shadowing schema can't
-- change what they mean.
-- ---------------------------------------------------------------------------
create or replace function public.current_wallet()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'wallet', '')
$$;

create or replace function public.is_operator()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'admin')::boolean, false)
$$;

-- A payout may only be marked settled by the route that actually pays it. That
-- route mints itself a short-lived token carrying this claim; the token a
-- browser gets when it signs in never has it, because /api/auth/session does
-- not put it there. So a contributor cannot mark their own sale claimed with an
-- invented transaction hash.
create or replace function public.can_settle()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'settle')::boolean, false)
$$;

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

-- The permissive testnet policies this replaces.
drop policy if exists "datasets read (testnet)"   on public.datasets;
drop policy if exists "datasets insert (testnet)" on public.datasets;
drop policy if exists "datasets read"             on public.datasets;
drop policy if exists "datasets insert"           on public.datasets;

-- Your own rows, or every row if you're an operator. There is no third case:
-- the protocol-wide view the dashboard draws reads network_activity below,
-- which carries no addresses.
create policy "datasets read"
  on public.datasets for select
  using (owner_wallet = public.current_wallet() or public.is_operator());

-- You may only file a dataset as yourself. This is the one that matters most:
-- owner_wallet used to be whatever the browser said it was.
create policy "datasets insert"
  on public.datasets for insert
  with check (owner_wallet = public.current_wallet());

-- No update or delete policy, so neither is possible for anyone. A contributed
-- record's history is not something the contributor edits in place.

-- ---------------------------------------------------------------------------
-- Table: sales
--
-- A dataset licensed to a buyer, and the payout the contributor can claim for
-- it. Buyers are simulated for now — operators run sale rounds from the admin
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

drop policy if exists "sales read (testnet)"   on public.sales;
drop policy if exists "sales insert (testnet)" on public.sales;
drop policy if exists "sales update (testnet)" on public.sales;
drop policy if exists "sales read"             on public.sales;
drop policy if exists "sales insert"           on public.sales;
drop policy if exists "sales update"           on public.sales;

create policy "sales read"
  on public.sales for select
  using (owner_wallet = public.current_wallet() or public.is_operator());

-- Only operators record sales. A contributor writing their own would be
-- writing their own payout.
create policy "sales insert"
  on public.sales for insert
  with check (public.is_operator());

-- Settling is the payout route's job and nobody else's. Operators are not
-- exempt: they create sales and price them, but a sale's outcome is a fact
-- about a payment, and the only thing that may write it is the code that made
-- the payment. Nothing in the admin panel updates a sale, so this costs the
-- product nothing and closes the one way a row could claim a payout that never
-- happened.
create policy "sales update"
  on public.sales for update
  using (public.can_settle() and owner_wallet = public.current_wallet())
  with check (public.can_settle() and owner_wallet = public.current_wallet());

-- ---------------------------------------------------------------------------
-- Storage: private "datasets" bucket
--
-- Files are stored at <wallet>/<sha256><ext>, so the first path segment is the
-- owner and the policies key off it. Before this, any holder of the anon key
-- could download every file anyone had ever uploaded — in a product that sells
-- consent, the worst thing in the schema.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', false)
on conflict (id) do nothing;

drop policy if exists "datasets upload (testnet)"   on storage.objects;
drop policy if exists "datasets download (testnet)" on storage.objects;
drop policy if exists "datasets upload"             on storage.objects;
drop policy if exists "datasets overwrite"          on storage.objects;
drop policy if exists "datasets download"           on storage.objects;

create policy "datasets upload"
  on storage.objects for insert
  with check (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = public.current_wallet()
  );

-- Uploads are content-addressed and use upsert, so re-uploading the same file
-- lands as an update rather than an insert.
create policy "datasets overwrite"
  on storage.objects for update
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = public.current_wallet()
  )
  with check (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = public.current_wallet()
  );

-- Your own files, and nobody else's — operators included. An operator prices
-- datasets from their metadata and never needs the bytes, so granting the read
-- would hand the one party with a standing reason to look the ability to read
-- every contributor's raw file. In a product selling consent, that is the
-- capability least worth having.
create policy "datasets download"
  on storage.objects for select
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = public.current_wallet()
  );

-- ---------------------------------------------------------------------------
-- Public aggregates
--
-- The landing page and the dashboard's network panel need protocol-wide
-- numbers, and neither has any business reading rows to get them. These views
-- are the entire public surface.
--
-- Views run with the privileges of their owner, so they see past the row-level
-- security above. That is the point here — it is what lets a stranger count
-- contributions without being able to read one. Supabase's linter flags this
-- shape; it is intentional, and the reason each view exposes only what it does.
--
-- Known limit: contributor_id is an unsalted md5 of the address. It stops the
-- casual exposure that publishing owner_wallet was, and still lets the panel
-- count distinct contributors, but someone who already suspects a particular
-- address can confirm it by hashing it. Salting it, or moving the bucketing
-- into Postgres so no per-contribution row leaves at all, is the tightening.
-- ---------------------------------------------------------------------------
drop view if exists public.network_activity;
create view public.network_activity as
  select
    md5(d.owner_wallet) as contributor_id,
    d.source_type,
    d.byte_size,
    d.created_at,
    exists (select 1 from public.sales s where s.dataset_id = d.id) as sold
  from public.datasets d;

drop view if exists public.protocol_totals;
create view public.protocol_totals as
  select
    (select count(distinct owner_wallet) from public.datasets)                       as contributors,
    (select count(*) from public.datasets)                                           as datasets,
    (select coalesce(sum(price_stroops), 0) from public.sales where status = 'claimed') as paid_stroops,
    (select count(*) from public.sales where status = 'claimed')                     as payouts;

-- What each kind of data has actually fetched, from real sales. A category
-- with no sales is absent — the landing page shows a dash rather than
-- inventing a rate for it.
drop view if exists public.source_rates;
create view public.source_rates as
  select
    d.source_type,
    round(avg(s.price_stroops))::bigint as avg_price_stroops,
    count(*)                            as sale_count
  from public.sales s
  join public.datasets d on d.id = s.dataset_id
  group by d.source_type;

grant select on public.network_activity to anon, authenticated;
grant select on public.protocol_totals  to anon, authenticated;
grant select on public.source_rates     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table: posts
--
-- The blog. Written in the operator panel rather than committed as files, so
-- publishing does not need a deploy, and stored as markdown rather than HTML
-- so nothing ever renders a string an author pasted in.
--
-- `published_at` carries three states in one column, which is why there is no
-- boolean beside it: null is a draft, a past timestamp is live, and a future
-- one is scheduled. Readers get the third for free.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique,
  title         text        not null,
  excerpt       text        not null,
  body          text        not null,
  author        text        not null default 'Datavar',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Added after the table existed, so this has to be conditional rather than
-- part of the create above. A cover is optional: a post without one is a
-- post, not a broken card.
alter table public.posts add column if not exists cover_url text;
alter table public.posts add column if not exists cover_alt text;

create index if not exists posts_published_idx
  on public.posts (published_at desc nulls last);

-- Touching a row should record when, without every caller remembering to.
create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

alter table public.posts enable row level security;

drop policy if exists "posts read"   on public.posts;
drop policy if exists "posts insert" on public.posts;
drop policy if exists "posts update" on public.posts;
drop policy if exists "posts delete" on public.posts;

-- A published post is public: no session, no anon key beyond the one the
-- browser already has. Drafts and scheduled posts are visible to operators
-- only, and the same policy is what keeps a draft out of the sitemap.
create policy "posts read"
  on public.posts for select
  using (
    (published_at is not null and published_at <= now())
    or public.is_operator()
  );

create policy "posts insert"
  on public.posts for insert
  with check (public.is_operator());

create policy "posts update"
  on public.posts for update
  using (public.is_operator())
  with check (public.is_operator());

create policy "posts delete"
  on public.posts for delete
  using (public.is_operator());

-- ---------------------------------------------------------------------------
-- Storage: public "post-images" bucket
--
-- Public on purpose, and the opposite of the datasets bucket in every way
-- that matters. These are illustrations meant to be fetched by strangers from
-- a link preview, so read is open to everyone; writing is operators only,
-- because the alternative is an open file host with our name on it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "post images read"   on storage.objects;
drop policy if exists "post images write"  on storage.objects;
drop policy if exists "post images update" on storage.objects;
drop policy if exists "post images delete" on storage.objects;

create policy "post images read"
  on storage.objects for select
  using (bucket_id = 'post-images');

create policy "post images write"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and public.is_operator());

create policy "post images update"
  on storage.objects for update
  using (bucket_id = 'post-images' and public.is_operator())
  with check (bucket_id = 'post-images' and public.is_operator());

create policy "post images delete"
  on storage.objects for delete
  using (bucket_id = 'post-images' and public.is_operator());
