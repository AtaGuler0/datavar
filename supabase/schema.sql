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
alter table public.datasets
  add column if not exists synthetic boolean not null default false;

-- Ordering for the public network view. Partial on `not synthetic` while that
-- filter existed; the view no longer has one, so neither does the index.
drop index if exists public.datasets_real_idx;
create index if not exists datasets_recent_idx
  on public.datasets (created_at desc);

alter table public.datasets enable row level security;

drop policy if exists "datasets read (testnet)"   on public.datasets;
drop policy if exists "datasets insert (testnet)" on public.datasets;
drop policy if exists "datasets read"             on public.datasets;
drop policy if exists "datasets insert"           on public.datasets;

create policy "datasets read"
  on public.datasets for select
  using (owner_wallet = public.current_wallet() or public.is_operator());


create policy "datasets insert"
  on public.datasets for insert
  with check (owner_wallet = public.current_wallet());

grant select, insert on public.datasets to authenticated;

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

-- Where this sale sits against the payout contract. A sale is credited when the
-- operator has written it into the vault on-chain, which is the moment the
-- money stops being ours: from then on the contributor can claim it whether we
-- cooperate or not. Nullable because a sale exists here first and reaches the
-- ledger a moment later — the row is the intent, the credit is the fact.
alter table public.sales add column if not exists credited_at timestamptz;
alter table public.sales add column if not exists credit_tx   text;

create index if not exists sales_owner_idx
  on public.sales (owner_wallet, created_at desc);

create index if not exists sales_dataset_idx
  on public.sales (dataset_id);

-- The operator's work queue: sales that haven't made it to the vault yet.
create index if not exists sales_uncredited_idx
  on public.sales (created_at)
  where credited_at is null;

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

-- Two writers, for two different facts. The settle token — minted by the claim
-- route and good for two minutes — records that a contributor's claim landed,
-- and only for their own rows. The operator records that a sale was credited
-- into the vault, which is a statement about the ledger rather than about any
-- one contributor. A contributor's ordinary session token is neither, so it
-- still cannot touch this table.
create policy "sales update"
  on public.sales for update
  using (
    (public.can_settle() and owner_wallet = public.current_wallet())
    or public.is_operator()
  )
  with check (
    (public.can_settle() and owner_wallet = public.current_wallet())
    or public.is_operator()
  );

-- Update is in the grant because the payout route has to write the outcome;
-- the policy above is what narrows it to the token that made the payment.
-- Delete is in nobody's, so it is in no grant either.
grant select, insert, update on public.sales to authenticated;

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
-- Schema: internal
--
-- Things the public surface needs and must never be able to read for itself.
-- Nothing is granted on it, and nothing outside this file looks in: the views
-- below run with their owner's rights, so they can read what a caller cannot.
-- ---------------------------------------------------------------------------
create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;

create table if not exists internal.secrets (
  name  text primary key,
  value text not null
);
revoke all on internal.secrets from public, anon, authenticated;

-- The salt under `contributor_id`. Minted once and never rotated by a re-run
-- of this file — `do nothing` is what keeps the public view's ids stable
-- across the idempotent replay this schema is written for.
--
-- Why it exists: the id used to be a plain md5 of the wallet address, which
-- hides nothing from anyone holding the list of addresses — and that list is
-- public by construction, because the consent contract publishes `contributor`
-- as an event topic. Hashing the candidates and joining to this view then
-- returns a named person's entire upload history: what kind of data, how much
-- of it, when, and whether it sold. Salting it costs nothing and makes the
-- guess unavailable, because the guesser cannot compute the digest.
--
-- gen_random_uuid() rather than gen_random_bytes(): 122 bits from a built-in,
-- with no extension to be missing on a fresh project.
insert into internal.secrets (name, value)
values ('contributor_id', gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (name) do nothing;

-- These three views are the whole public surface, and they count the whole
-- deployment: every dataset row and every sale, generated load included.
--
-- They used to carry `where not d.synthetic`, on the reasoning that generated
-- rows are not adoption. The deployment is testnet end to end — nothing here
-- is production adoption either way — so the filter was dropped and the public
-- pages now read the same totals the operator panel does. The `synthetic`
-- column stays: it is what the operator panel's `generated` badge reads, and
-- it is how the filter comes back if this ever runs against mainnet.

-- `contributor_id` is an opaque, stable key and nothing more. Everything that
-- reads it counts distinct values and asks when each was first seen, so the
-- digest never has to be reversible — and it isn't, because the salt lives in
-- a schema no caller can reach. Truncated to 128 bits, far past collision
-- range for a protocol counted in hundreds of contributors.
--
-- The salt is joined rather than looked up inline on purpose: a missing salt
-- row then yields no rows at all, which the page renders as zero. Inline it
-- would yield a null id on every row, and the dashboard would confidently
-- report one contributor. Same rule as everywhere else here — fall to zero,
-- never to a made-up number.
drop view if exists public.network_activity;
create view public.network_activity as
  select
    left(
      encode(sha256(convert_to(salt.value || d.owner_wallet, 'UTF8')), 'hex'),
      32
    ) as contributor_id,
    d.source_type,
    d.byte_size,
    d.created_at,
    exists (select 1 from public.sales s where s.dataset_id = d.id) as sold
  from public.datasets d
  cross join internal.secrets salt
  where salt.name = 'contributor_id';

-- `paid_stroops` and `gross_stroops` answer two different questions and the
-- gap between them is the point: gross is everything a buyer has paid for,
-- paid is the part a contributor has actually claimed and settled on-chain.
-- Neither is the other, so nothing renders one under the other's label.
drop view if exists public.protocol_totals;
create view public.protocol_totals as
  select
    (select count(distinct owner_wallet) from public.datasets)      as contributors,
    (select count(*) from public.datasets)                          as datasets,
    (select coalesce(sum(price_stroops), 0)
       from public.sales where status = 'claimed')                  as paid_stroops,
    (select count(*)
       from public.sales where status = 'claimed')                  as payouts,
    (select count(*) from public.sales)                             as sales,
    (select coalesce(sum(price_stroops), 0) from public.sales)      as gross_stroops,
    (select count(distinct dataset_id) from public.sales)           as datasets_sold;

-- What each kind of data has actually fetched. A category with no sales is
-- absent — the landing page shows a dash rather than inventing a rate for it.
drop view if exists public.source_rates;
create view public.source_rates as
  select
    d.source_type,
    round(avg(s.price_stroops))::bigint as avg_price_stroops,
    count(*)                            as sale_count
  from public.sales s
  join public.datasets d on d.id = s.dataset_id
  group by d.source_type;

-- Briefly published as a separate "testnet load" total beside the filtered
-- ones. Now that protocol_totals counts everything, it has no reason to exist,
-- and this drop clears it from deployments that already ran that version.
drop view if exists public.testnet_totals;

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

-- Unlike the other two tables, anon belongs here: a published post is meant to
-- be readable without a session, and the blog renders on the server with no
-- token to send. The read policy still hides drafts. Writing is operators, who
-- are signed in by definition.
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

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
