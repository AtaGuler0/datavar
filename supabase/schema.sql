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

-- Permission to count a request against a rate limit, and nothing else. Only
-- our own routes mint a token carrying this claim; the one a browser gets when
-- it signs in never has it. See `public.rate_limit_hit()` below for why that
-- distinction is the whole point — a counter anyone may increment on anyone
-- else's behalf is a way to lock people out, not a way to protect them.
create or replace function public.can_rate_limit()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'rl')::boolean, false)
$$;

-- Permission to file a dataset that is admitted fiction. Generated rows live
-- under a `seed/` path and carry `synthetic`, and until this claim existed both
-- of those were honour-system: a contributor's ordinary token could write a row
-- claiming to be seeded, and the demo generator's token was indistinguishable
-- from theirs. Only /api/dev/seed mints this, and only for the length of a run.
create or replace function public.can_seed()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'seed')::boolean, false)
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

-- ---------------------------------------------------------------------------
-- What a dataset row has to look like
--
-- Every one of these columns used to arrive from the browser and none of them
-- was checked. A wallet with a session could file unlimited rows describing
-- files that were never uploaded, at any size it liked — and the landing page's
-- contributor and dataset counts, and `source_rates`, read straight off this
-- table. Those are the numbers this project is judged on, so "the client says
-- so" is not a good enough provenance for them.
--
-- These are table constraints rather than more conditions on the insert policy
-- because they are not about who is writing. They are what makes a row internally
-- consistent, and they should hold for every writer this schema ever grows,
-- including one that bypasses row-level security entirely.
--
-- `not valid` throughout: rows written before this existed are grandfathered
-- rather than blocking the migration, because a re-run of this file must never
-- fail on data it inherited. Every new row is checked. Dropping first is what
-- keeps the pair idempotent.
-- ---------------------------------------------------------------------------

-- A Stellar ed25519 public key: 'G' and 55 more base32 characters. Worth
-- stating for its own sake, and load-bearing for the path check below, which
-- builds a pattern out of this column — a wallet holding regex metacharacters
-- would quietly turn that check into one that matches anything.
alter table public.datasets drop constraint if exists datasets_owner_wallet_ck;
alter table public.datasets add constraint datasets_owner_wallet_ck
  check (owner_wallet ~ '^G[A-Z2-7]{55}$') not valid;

-- The digest the browser computed, as a digest and not as a sentence.
alter table public.datasets drop constraint if exists datasets_sha256_ck;
alter table public.datasets add constraint datasets_sha256_ck
  check (sha256 ~ '^[0-9a-f]{64}$') not valid;

-- Nothing is a zero-byte contribution, and the ceiling is the upload form's own
-- 50 MB (MAX_BYTES in components/dashboard/upload-flow.tsx). A row bigger than
-- the product accepts describes a file it could not have taken.
alter table public.datasets drop constraint if exists datasets_byte_size_ck;
alter table public.datasets add constraint datasets_byte_size_ck
  check (byte_size > 0 and byte_size <= 52428800) not valid;

-- The categories in SOURCE_TYPES (lib/supabase/datasets.ts). Written out rather
-- than joined to a lookup table: nine values that change when the product's
-- vocabulary changes, which is a schema edit either way.
alter table public.datasets drop constraint if exists datasets_source_type_ck;
alter table public.datasets add constraint datasets_source_type_ck
  check (source_type in (
    'browsing', 'purchases', 'health', 'location', 'media',
    'voice', 'messaging', 'dashcam', 'other'
  )) not valid;

alter table public.datasets drop constraint if exists datasets_title_ck;
alter table public.datasets add constraint datasets_title_ck
  check (length(btrim(title)) between 1 and 200) not valid;

-- The path has to name the row's own owner and its own digest, which is what
-- ties the metadata to a file in storage instead of letting it float free. Two
-- shapes are legal:
--
--   <wallet>/<sha256>[.ext]   a file that was actually uploaded
--   seed/<wallet>/<sha256>    the demo generator, which uploads nothing
--
-- The extension is bounded and lowercase because it comes from a user's file
-- name; see safeExtension() in lib/supabase/datasets.ts, which now whitelists it
-- on the way in. Who may write the seeded shape is a question of authority, so
-- it is the insert policy below that asks for `can_seed()`, not this.
--
-- This used to read the other way round — it asked `synthetic` which shape to
-- expect, on the reasoning that a generated row is a seeded row. That is not
-- true of this deployment and never was. The load bot marks its rows
-- `synthetic` because they are not adoption, and it uploads real files to real
-- paths, so 485 of 525 rows were `synthetic` at an upload path and broke a rule
-- nobody had noticed, because `not valid` meant it was never checked. It was
-- noticed the first time a migration wrote to those rows: adding a price
-- column and backfilling it re-checks every constraint on each row it touches,
-- and the whole statement failed on inherited data.
--
-- So the path decides, and `synthetic` follows it in one direction only: a
-- seeded path has to be marked seeded, and an upload path may be either. A
-- contributor still cannot claim the seeded shape, because setting `synthetic`
-- needs `can_seed()` and only /api/dev/seed mints it.
alter table public.datasets drop constraint if exists datasets_storage_path_ck;
alter table public.datasets add constraint datasets_storage_path_ck
  check (
    case when storage_path like 'seed/%'
      then synthetic and storage_path = 'seed/' || owner_wallet || '/' || sha256
      else storage_path ~ ('^' || owner_wallet || '/' || sha256 || '(\.[a-z0-9]{1,10})?$')
    end
  ) not valid;

-- The 36 rows on the other side of that mismatch: demo rows under `seed/` that
-- say they are not generated. Unlike the 485 this one is a wrong row rather
-- than a wrong rule — nothing was ever uploaded for them — so it is corrected
-- rather than tolerated. Narrow on purpose: only rows whose path is exactly the
-- seeded shape are touched, so a row that is wrong in some other way is left
-- alone rather than being given a marker that makes it look fixed.
do $$
declare
  r       record;
  fixed   integer := 0;
  skipped integer := 0;
begin
  for r in
    select id
      from public.datasets
     where not synthetic
       and storage_path = 'seed/' || owner_wallet || '/' || sha256
  loop
    begin
      update public.datasets set synthetic = true where id = r.id;
      fixed := fixed + 1;
    exception when check_violation then
      -- Wrong in some other way too. Left exactly as it was found.
      skipped := skipped + 1;
    end;
  end loop;

  if fixed > 0 or skipped > 0 then
    raise notice 'marked % seeded row(s) as generated, left % alone', fixed, skipped;
  end if;
end;
$$;

alter table public.datasets enable row level security;

drop policy if exists "datasets read (testnet)"   on public.datasets;
drop policy if exists "datasets insert (testnet)" on public.datasets;
drop policy if exists "datasets read"             on public.datasets;
drop policy if exists "datasets insert"           on public.datasets;

create policy "datasets read"
  on public.datasets for select
  using (owner_wallet = public.current_wallet() or public.is_operator());


-- You may only file a dataset as yourself, and you may only file admitted
-- fiction if you are the thing that generates it. `synthetic` rows are counted
-- by the public aggregates exactly like every other row, so a contributor free
-- to set it would be free to inflate the very numbers the constraints above
-- protect — the marker would say "not adoption" while the total said otherwise.
-- The shape of the two storage paths is datasets_storage_path_ck's business;
-- this decides who is allowed to be in the seeded one.
create policy "datasets insert"
  on public.datasets for insert
  with check (
    owner_wallet = public.current_wallet()
    and (not synthetic or public.can_seed())
  );

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

-- Which asset the money was in. `price_stroops` is the amount either way —
-- USDC on Stellar has seven decimals too, so the integer means the same size
-- of thing — and this column is what says what that integer is denominated in.
-- Defaulting to XLM is what makes the 223 sales that predate the second vault
-- correct rather than ambiguous: they were all paid in XLM.
--
-- It lives here, beside the table, rather than down in the marketplace
-- section where it was written: `protocol_totals` and `source_rates` are
-- created a few hundred lines below this and read it, and a view resolves
-- its columns when it is created. Added after them, it does not exist yet.
alter table public.sales add column if not exists asset text not null default 'XLM';

alter table public.sales drop constraint if exists sales_asset_ck;
alter table public.sales add constraint sales_asset_ck
  check (asset in ('XLM', 'USDC')) not valid;


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

-- ---------------------------------------------------------------------------
-- Rate limiting
--
-- Every route that reaches the network on an anonymous caller's say-so needs a
-- ceiling, and the worst of them is consent submission: no session, and a poll
-- loop that holds a server connection for up to fifteen seconds while the
-- ledger closes. A handful of concurrent callers is a slow site; a script is an
-- outage. Sign-in is the same shape more cheaply — a challenge is a keypair
-- operation, handed out to anyone who asks.
--
-- The counter lives here rather than in the server's memory because there is no
-- server: on Vercel each request may land in a fresh instance, so a process
-- local counter is a counter of one request. Postgres is the only thing every
-- instance already shares, and this is small enough to sit beside the salt.
--
-- Fixed windows, not a sliding log. A caller who times it right gets up to
-- twice the limit across a window boundary, which is the well known cost of
-- this being one row and one statement instead of a row per request. The point
-- is a ceiling on sustained load, and a fixed window gives that.
create table if not exists internal.rate_limits (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, subject, window_start)
);
revoke all on internal.rate_limits from public, anon, authenticated;

-- Old windows are dead weight the moment they close; this is how the sweep
-- inside the function finds them without scanning the live rows.
create index if not exists rate_limits_window_idx
  on internal.rate_limits (window_start);

-- Counts one hit and says whether it may proceed: 0 to allow, otherwise the
-- seconds until that subject's window resets, ready to be handed back as
-- `Retry-After`.
--
-- The counting lives here, in a schema nothing can reach, because it has two
-- callers that need it on different terms — the HTTP routes, through the guarded
-- wrapper below, and the trigger on `datasets`, which has no token to check. It
-- is `security definer` for the table's sake; neither caller could write it.
create or replace function internal.count_hit(
  p_bucket  text,
  p_subject text,
  p_limit   integer,
  p_window  integer
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits         integer;
begin
  -- The rule arrives from the caller, so it is checked rather than trusted. A
  -- window of zero would divide by zero below; an enormous one would keep rows
  -- alive past the sweep.
  if p_limit < 1 or p_window < 1 or p_window > 86400 then
    raise exception 'invalid rate limit rule' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window) * p_window
  );

  -- One statement: the row is created or incremented and read back in the same
  -- breath, so two requests arriving together cannot both read "0 so far".
  -- Subjects are truncated because one of them is a header a client controls.
  insert into internal.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, left(p_subject, 200), v_window_start, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Closed windows are never read again. Sweeping one call in a hundred keeps
  -- the table flat without paying for a delete on the hot path, and without a
  -- scheduled job this file cannot install.
  if random() < 0.01 then
    delete from internal.rate_limits
    where window_start < clock_timestamp() - interval '1 day';
  end if;

  if v_hits > p_limit then
    return greatest(
      ceil(
        extract(
          epoch from (v_window_start + make_interval(secs => p_window))
                     - clock_timestamp()
        )
      )::integer,
      1
    );
  end if;

  return 0;
end;
$$;

-- What the HTTP routes call, which is the counter plus one question about who
-- is asking. Guarded by `can_rate_limit()`, because an unguarded definer
-- function here would be worse than no limit at all: on the routes with no
-- session the subject is an IP address, so anyone able to reach this with the
-- anon key could spend a stranger's budget and lock them out of signing in.
-- Only a token the server mints for itself carries the claim.
create or replace function public.rate_limit_hit(
  p_bucket  text,
  p_subject text,
  p_limit   integer,
  p_window  integer
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.can_rate_limit() then
    raise exception 'not authorised to record rate limit hits'
      using errcode = '42501';
  end if;

  return internal.count_hit(p_bucket, p_subject, p_limit, p_window);
end;
$$;

-- Postgres grants execute on a new function to `public` by default, and `anon`
-- is in `public` — so the revoke is not tidiness, it is the control itself.
revoke all on function public.rate_limit_hit(text, text, integer, integer)
  from public, anon;
grant execute on function public.rate_limit_hit(text, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- A ceiling on filing datasets
--
-- The constraints on the table say what a row must look like; they say nothing
-- about how many of them one wallet may write. Without this, a contributor who
-- is willing to hash and upload a real file — or just to write rows a hundred at
-- a time — still moves the public counters as far as they like, only tidily.
--
-- A trigger rather than the route helper, because this insert never passes
-- through a route: the browser writes to PostgREST directly and row-level
-- security is the whole of the server it meets. So the ceiling has to live where
-- the write does.
--
-- Seeding is exempt. It is already gated twice over at /api/dev/seed (operator
-- session, and NODE_ENV or ALLOW_DEMO_SEED), it writes a wallet's rows in one
-- burst by design, and the claim it carries is minted nowhere else.
create or replace function internal.datasets_insert_limit()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_retry integer;
begin
  if public.can_seed() then
    return new;
  end if;

  v_retry := internal.count_hit(
    'datasets:insert',
    coalesce(public.current_wallet(), '-'),
    60,     -- rows per wallet
    3600    -- per hour
  );

  if v_retry > 0 then
    raise exception
      'too many datasets filed from this wallet; try again in % seconds', v_retry
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists datasets_insert_limit on public.datasets;
create trigger datasets_insert_limit
  before insert on public.datasets
  for each row execute function internal.datasets_insert_limit();

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
    -- Split by asset rather than summed across them. Adding stroops to USDC
    -- units because both are seven-decimal integers would produce a number
    -- with no unit, printed under a currency symbol.
    (select coalesce(sum(price_stroops), 0)
       from public.sales
      where status = 'claimed' and asset = 'XLM')                   as paid_stroops,
    (select coalesce(sum(price_stroops), 0)
       from public.sales
      where status = 'claimed' and asset = 'USDC')                  as paid_usdc,
    (select count(*)
       from public.sales where status = 'claimed')                  as payouts,
    (select count(*) from public.sales)                             as sales,
    (select coalesce(sum(price_stroops), 0)
       from public.sales where asset = 'XLM')                       as gross_stroops,
    (select coalesce(sum(price_stroops), 0)
       from public.sales where asset = 'USDC')                      as gross_usdc,
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
  -- XLM only, because an average across two assets is not an average of
  -- anything. The USDC list is the same shape a quarter of the size, so the
  -- ranking this view is read for would survive either way; the number would
  -- not.
  where s.asset = 'XLM'
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

-- ===========================================================================
-- The buy side
--
-- Everything above this line describes one half of the protocol: a person
-- contributes data, consents to a use of it, and is paid. The other half — a
-- company that wants that data and is willing to pay for it — existed only as
-- a string in `sales.buyer`, written by an operator running a simulated round.
--
-- This section is the missing half. A dataset becomes purchasable when its
-- contributor grants consent to the marketplace address on-chain; a buyer
-- signs in with a wallet, files who they are, filters the catalogue, and pays
-- by funding the payout vault with their own signature. What they get is a
-- licence row and read access to the file itself, for as long as the consent
-- that sold it stays valid.
--
-- Three rules shape all of it, and each shows up as a policy or a constraint
-- rather than as something the application remembers to do:
--
--   * A price is not the contributor's to assert, and not the buyer's to send.
--     It is computed from what the dataset is, by the trigger below.
--   * A listing is not a row we wrote. It is an unrevoked, unexpired receipt
--     on the consent contract, mirrored here so it can be filtered — and the
--     catalogue view has no way to show a dataset that has none.
--   * Nothing in a purchase is taken from the browser: the route reads the
--     price from the catalogue, checks the transaction it is about to relay
--     really funds the vault for that amount, and only then writes the sale.
-- ===========================================================================

-- Permission to record a purchase, and only one's own. Minted for two minutes
-- by /api/market when a buyer's funding transaction has landed, and by nothing
-- else — a contributor's ordinary token cannot write a sale, which is the same
-- rule as before: a sale is a payout, and payouts are not self-service.
create or replace function public.can_market()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'market')::boolean, false)
$$;

-- Permission to bring this database's copy of the consent ledger up to date
-- with the ledger. Minted by /api/consent after a grant or revoke lands, for
-- the contributor whose receipts are being read back, and by /api/consent/sync
-- for an operator filling in receipts granted before this table existed. The
-- values written always come from the contract, never from a request body.
create or replace function public.can_mirror()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'mirror')::boolean, false)
$$;

-- ---------------------------------------------------------------------------
-- The marketplace address
--
-- A receipt names the buyer it was granted to. Listing a dataset for sale is
-- therefore not a flag on a row — it is a receipt naming *this* address, which
-- is the one the web app puts in the grant form (NEXT_PUBLIC_MARKET_ADDRESS).
-- The two have to agree or the catalogue is empty, and empty is the right way
-- for that mistake to show: better a visible nothing than a listing the ledger
-- does not support.
--
-- `do nothing` so a re-run never silently changes what is already listed.
-- Moving the marketplace to a different address is a deliberate act:
--   update internal.secrets set value = 'G…' where name = 'market_address';
-- ---------------------------------------------------------------------------
insert into internal.secrets (name, value)
values ('market_address', 'GCH4IEQLBTHNSWSWUNPOKL6THH6SZI2KQSMVO7ZPWUL3FKNRP5JTZD4B')
on conflict (name) do nothing;

-- For an operator at a psql prompt, and for nothing else. The catalogue reads
-- the row directly: calling a function in this schema is checked against the
-- caller, and the caller is usually a stranger with the anon key.
create or replace function internal.market_address()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select value from internal.secrets where name = 'market_address'
$$;

-- ---------------------------------------------------------------------------
-- What a dataset costs
--
-- One price, computed from the two things about a dataset that a buyer is
-- actually paying for: what kind of data it is, and how much of it there is.
-- Written as a function so the catalogue, the backfill and every future row
-- agree by construction — a price the contributor typed would be a number
-- nobody could check, and a price an operator typed would be 525 of them.
--
-- The bands are the same ones the simulated rounds used (1–10 XLM), so the
-- averages in `source_rates` stay comparable across the change. Health, voice
-- and location lead because they are the categories a buyer cannot scrape.
-- Rounded to a tenth of an XLM: a price with seven decimal places reads as a
-- number that fell out of a machine, which is not what a price should look
-- like even when it did.
-- ---------------------------------------------------------------------------
create or replace function internal.list_price(p_source text, p_bytes bigint)
  returns bigint
  language sql
  immutable
  set search_path = ''
as $$
  select (least(
    120000000::numeric,                     -- 12 XLM ceiling
    greatest(
      10000000::numeric,                    -- 1 XLM floor
      (round(
        (case p_source
           when 'health'    then 60000000
           when 'voice'     then 50000000
           when 'location'  then 50000000
           when 'dashcam'   then 40000000
           when 'purchases' then 40000000
           when 'messaging' then 30000000
           when 'browsing'  then 30000000
           when 'media'     then 25000000
           else                  20000000
         end)::numeric
        -- 0.6× for a small file, 3.0× once it passes ~12 MB. Size matters and
        -- stops mattering; a 40 MB dump is not four times the dataset a 10 MB
        -- one is.
        * (0.6 + least(p_bytes::numeric / 5242880, 2.4))
        / 1000000
      ) * 1000000)
    )
  ))::bigint;
$$;

-- ---------------------------------------------------------------------------
-- The same dataset, priced in USDC
--
-- A second list rather than a conversion. The rates below are the XLM ones at
-- 0.25 USD per XLM, fixed at the moment they were written and not tracking
-- anything afterwards — because the alternative is a price feed, and a
-- marketplace that reprices itself from an oracle has to answer what happens
-- to a checkout when the oracle is stale, wrong or down. Two published lists
-- answer it by not asking: what a buyer is shown is what a buyer pays, in
-- whichever asset they chose.
--
-- The knock-on is worth stating plainly: when XLM moves, one of the two lists
-- is the cheaper way to buy the same file. On testnet that is an accounting
-- curiosity. On a network with real money it is the day to put a quote engine
-- here, and this function is where it would go.
--
-- Rounded to five cents, for the same reason the XLM list rounds to a tenth.
-- ---------------------------------------------------------------------------
create or replace function internal.list_price_usdc(p_source text, p_bytes bigint)
  returns bigint
  language sql
  immutable
  set search_path = ''
as $$
  select (least(
    30000000::numeric,                      -- 3.00 USDC ceiling
    greatest(
      2500000::numeric,                     -- 0.25 USDC floor
      (round(
        (case p_source
           when 'health'    then 15000000   -- 1.50
           when 'voice'     then 12500000   -- 1.25
           when 'location'  then 12500000
           when 'dashcam'   then 10000000   -- 1.00
           when 'purchases' then 10000000
           when 'messaging' then  7500000   -- 0.75
           when 'browsing'  then  7500000
           when 'media'     then  6250000   -- 0.625
           else                   5000000   -- 0.50
         end)::numeric
        * (0.6 + least(p_bytes::numeric / 5242880, 2.4))
        / 500000
      ) * 500000)
    )
  ))::bigint;
$$;

alter table public.datasets add column if not exists price_stroops bigint;
alter table public.datasets add column if not exists price_usdc bigint;

-- A sanity band rather than a pricing rule: anything outside it is a bug in
-- the function above or an operator's slip, not a dataset worth that much.
alter table public.datasets drop constraint if exists datasets_price_ck;
alter table public.datasets add constraint datasets_price_ck
  check (price_stroops is null or (price_stroops >= 1000000 and price_stroops <= 1000000000))
  not valid;

-- USDC is a seven-decimal asset here too, so the units are the same size as
-- stroops and the band is the same shape: 0.05 to 100.00.
alter table public.datasets drop constraint if exists datasets_price_usdc_ck;
alter table public.datasets add constraint datasets_price_usdc_ck
  check (price_usdc is null or (price_usdc >= 500000 and price_usdc <= 1000000000))
  not valid;

-- The price is set here and not by the writer. `datasets` is written straight
-- from the browser through PostgREST, so a column left to the client is a
-- column the client decides — and this one decides what a buyer pays and what
-- a contributor earns. Overwriting unconditionally is the point.
--
-- `security definer` because a trigger function runs as whoever wrote the row,
-- and whoever wrote the row is a contributor with no rights in `internal` at
-- all — line 366 revokes them. Without it every upload fails with `permission
-- denied for schema internal` at the moment the price is computed, which is
-- exactly what happened the first time this schema met a real insert.
--
-- Safe to elevate because of what it does with the privilege: it reads two
-- columns of the row being written, calls one pure function, and assigns one
-- integer. No dynamic SQL, no client string reaches a query, and the search
-- path is pinned empty so every name in it resolves where this file says.
create or replace function internal.datasets_set_price()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.price_stroops := internal.list_price(new.source_type, new.byte_size);
  new.price_usdc    := internal.list_price_usdc(new.source_type, new.byte_size);
  return new;
end;
$$;

drop trigger if exists datasets_set_price on public.datasets;
create trigger datasets_set_price
  before insert on public.datasets
  for each row execute function internal.datasets_set_price();

-- Everything filed before the column existed. Idempotent: it only touches rows
-- that have no price, so a re-run never undoes an operator's override.
--
-- Row at a time, and forgiving, because an update re-checks every constraint on
-- the row it writes — including the ones added `not valid` precisely so they
-- would not have to be true of inherited data. A single statement would abort
-- the whole migration on the first row that has been sitting there, wrong and
-- harmless, since before the rule existed. That is what happened the first time
-- this ran: see the note on datasets_storage_path_ck above.
--
-- A row that cannot be priced is left unpriced, which keeps it out of the
-- catalogue rather than putting a broken listing in it, and the count is
-- reported so it is a known number rather than a silent one.
--
-- The guard trigger further down puts `price_stroops` back to whatever it was
-- unless the writer is an operator, and the SQL editor is nobody. On a first
-- run the trigger does not exist yet and this is moot; on every run after that
-- it would quietly turn this whole block into a no-op. So it is dropped here
-- and created again below, once the backfill has happened.
drop trigger if exists datasets_guard_update on public.datasets;

do $$
declare
  r       record;
  skipped integer := 0;
  priced  integer := 0;
begin
  for r in
    select id, source_type, byte_size
      from public.datasets
     where price_stroops is null
        or price_usdc is null
  loop
    begin
      update public.datasets
         set price_stroops = coalesce(
               price_stroops, internal.list_price(r.source_type, r.byte_size)),
             price_usdc    = coalesce(
               price_usdc, internal.list_price_usdc(r.source_type, r.byte_size))
       where id = r.id;
      priced := priced + 1;
    exception when check_violation then
      skipped := skipped + 1;
    end;
  end loop;

  raise notice 'priced % dataset(s)', priced;
  if skipped > 0 then
    raise notice
      '% dataset(s) left unpriced: they break a constraint added after they were written, so they stay out of the catalogue',
      skipped;
  end if;
end;
$$;

-- An operator may correct a price, and that is all they may correct. The grant
-- is column-scoped, so this update policy cannot be used to rewrite a title, a
-- hash or an owner — Postgres refuses the statement before the policy is even
-- consulted.
drop policy if exists "datasets update" on public.datasets;
create policy "datasets update"
  on public.datasets for update
  using (public.is_operator())
  with check (public.is_operator());

grant update (price_stroops, price_usdc) on public.datasets to authenticated;

-- ---------------------------------------------------------------------------
-- Table: buyers
--
-- Who is on the other side of a licence. The contributor side of this product
-- deliberately has no profile — a wallet is enough to upload and be paid — but
-- a buyer is a company making a commercial claim about what it will do with
-- someone's data, and "some address paid" is not a thing a contributor can
-- hold anyone to. So a buyer files a name, a way to reach them, and what they
-- want the data for, once, before their first purchase.
--
-- It is still self-declared, and this schema does not pretend otherwise: there
-- is no verification here and nothing checks that Northwind AI is Northwind
-- AI. What it does buy is a record that the person who paid said who they were
-- while signing with a key only they hold.
-- ---------------------------------------------------------------------------
create table if not exists public.buyers (
  wallet     text        primary key,
  org        text        not null,
  contact    text        not null,
  intent     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.buyers drop constraint if exists buyers_wallet_ck;
alter table public.buyers add constraint buyers_wallet_ck
  check (wallet ~ '^G[A-Z2-7]{55}$') not valid;

alter table public.buyers drop constraint if exists buyers_org_ck;
alter table public.buyers add constraint buyers_org_ck
  check (length(btrim(org)) between 2 and 120) not valid;

-- Shaped rather than validated. Nothing sends mail to it yet, so anything
-- stricter would be a promise this schema does not keep.
alter table public.buyers drop constraint if exists buyers_contact_ck;
alter table public.buyers add constraint buyers_contact_ck
  check (contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;

alter table public.buyers drop constraint if exists buyers_intent_ck;
alter table public.buyers add constraint buyers_intent_ck
  check (intent is null or length(intent) <= 400) not valid;

drop trigger if exists buyers_touch_updated_at on public.buyers;
create trigger buyers_touch_updated_at
  before update on public.buyers
  for each row execute function public.touch_updated_at();

alter table public.buyers enable row level security;

drop policy if exists "buyers read"   on public.buyers;
drop policy if exists "buyers insert" on public.buyers;
drop policy if exists "buyers update" on public.buyers;

-- Your own profile, and the operator's view of everyone's. A contributor
-- cannot read the buyer list: who is shopping is not public, and the licences
-- a contributor can see already name the buyer who bought from them.
create policy "buyers read"
  on public.buyers for select
  using (wallet = public.current_wallet() or public.is_operator());

create policy "buyers insert"
  on public.buyers for insert
  with check (wallet = public.current_wallet());

create policy "buyers update"
  on public.buyers for update
  using (wallet = public.current_wallet())
  with check (wallet = public.current_wallet());

grant select, insert, update on public.buyers to authenticated;

-- ---------------------------------------------------------------------------
-- Table: consents — this database's copy of the consent ledger
--
-- The contract is the record. This is a mirror of it, and it exists for one
-- reason: a catalogue you can filter. Asking the ledger whether a dataset is
-- consented means one simulation per contributor, and a buyer narrowing 525
-- datasets by category and size would be waiting on hundreds of round trips to
-- find out which of them they are even allowed to buy.
--
-- Everything here is written from what the contract returned, by a route that
-- had just read it — never from a request body. Two consequences worth stating:
-- a row here can be stale (a revoke lands, the mirror is written a second
-- later), and a row here is never authority. The purchase route re-reads the
-- receipt on-chain before it writes a sale, so the worst a stale mirror can do
-- is show a listing that then refuses to sell.
--
-- `receipt_id` is the contract's own id, which is why it is the primary key:
-- the same receipt read twice cannot become two rows, and a revoke updates the
-- row it revokes rather than appending a second opinion.
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  receipt_id   bigint      primary key,
  contributor  text        not null,
  buyer        text        not null,
  dataset_hash text        not null,
  purpose      text        not null,
  granted_at   timestamptz not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  synced_at    timestamptz not null default now()
);

alter table public.consents drop constraint if exists consents_contributor_ck;
alter table public.consents add constraint consents_contributor_ck
  check (contributor ~ '^G[A-Z2-7]{55}$') not valid;

alter table public.consents drop constraint if exists consents_buyer_ck;
alter table public.consents add constraint consents_buyer_ck
  check (buyer ~ '^G[A-Z2-7]{55}$') not valid;

alter table public.consents drop constraint if exists consents_hash_ck;
alter table public.consents add constraint consents_hash_ck
  check (dataset_hash ~ '^[0-9a-f]{64}$') not valid;

-- The join the catalogue makes: receipts covering one file, newest first.
create index if not exists consents_hash_idx
  on public.consents (dataset_hash, expires_at desc);

create index if not exists consents_contributor_idx
  on public.consents (contributor, granted_at desc);

alter table public.consents enable row level security;

drop policy if exists "consents read"   on public.consents;
drop policy if exists "consents insert" on public.consents;
drop policy if exists "consents update" on public.consents;

-- Contributors see their own receipts, operators see all, and the catalogue
-- reads this table without anyone reading it: `market_listings` runs with its
-- owner's rights, the same way the aggregate views do. A buyer never gets the
-- contributor's address, only the consent's terms.
create policy "consents read"
  on public.consents for select
  using (contributor = public.current_wallet() or public.is_operator());

create policy "consents insert"
  on public.consents for insert
  with check (
    (public.can_mirror() and contributor = public.current_wallet())
    or public.is_operator()
  );

create policy "consents update"
  on public.consents for update
  using (
    (public.can_mirror() and contributor = public.current_wallet())
    or public.is_operator()
  )
  with check (
    (public.can_mirror() and contributor = public.current_wallet())
    or public.is_operator()
  );

grant select, insert, update on public.consents to authenticated;

-- ---------------------------------------------------------------------------
-- What a sale gained when buyers became real
--
-- The old row said a dataset sold for a price to a name. A marketplace licence
-- has to say more: who bought it as an address rather than a string, what they
-- are licensed to do, until when, which receipt permitted it, and what they
-- paid with. Operator-written rounds keep the old shape — `channel` is what
-- tells the two apart, and it is the column every check below keys on.
-- ---------------------------------------------------------------------------
alter table public.sales add column if not exists buyer_wallet       text;
alter table public.sales add column if not exists channel            text not null default 'operator';
alter table public.sales add column if not exists purpose            text;
alter table public.sales add column if not exists licence_expires_at timestamptz;
alter table public.sales add column if not exists fund_tx            text;
alter table public.sales add column if not exists consent_receipt_id bigint;

alter table public.sales drop constraint if exists sales_channel_ck;
alter table public.sales add constraint sales_channel_ck
  check (channel in ('operator', 'market')) not valid;

alter table public.sales drop constraint if exists sales_buyer_wallet_ck;
alter table public.sales add constraint sales_buyer_wallet_ck
  check (buyer_wallet is null or buyer_wallet ~ '^G[A-Z2-7]{55}$') not valid;

-- A marketplace sale that cannot say who bought it, under which receipt, with
-- which payment, and for how long, is not a licence — it is a row that looks
-- like one. The four travel together or the insert fails.
alter table public.sales drop constraint if exists sales_market_shape_ck;
alter table public.sales add constraint sales_market_shape_ck
  check (
    channel <> 'market'
    or (
      buyer_wallet is not null
      and fund_tx is not null
      and consent_receipt_id is not null
      and licence_expires_at is not null
    )
  ) not valid;

-- One licence per dataset per buyer. Licences are non-exclusive, so a dataset
-- sells many times — but the same buyer paying twice for the same file is a
-- double-submitted checkout, and this is what makes the second one a no-op
-- instead of a second charge.
create unique index if not exists sales_market_unique_idx
  on public.sales (dataset_id, buyer_wallet)
  where channel = 'market';

-- The buyer's own licences, newest first.
create index if not exists sales_buyer_idx
  on public.sales (buyer_wallet, created_at desc)
  where channel = 'market';

drop policy if exists "sales read"   on public.sales;
drop policy if exists "sales insert" on public.sales;

-- Three readers now, and each sees the rows that are about them: the
-- contributor who is owed, the buyer who paid, the operator who runs it.
create policy "sales read"
  on public.sales for select
  using (
    owner_wallet = public.current_wallet()
    or buyer_wallet = public.current_wallet()
    or public.is_operator()
  );

-- Operators record simulated rounds; the marketplace route records purchases,
-- and only ever for the wallet whose signature paid. The `channel` condition
-- is not decoration — without it a market token could write an operator-shaped
-- row and skip every constraint above that keys on it.
create policy "sales insert"
  on public.sales for insert
  with check (
    public.is_operator()
    or (
      public.can_market()
      and channel = 'market'
      and buyer_wallet = public.current_wallet()
    )
  );

-- A buyer has to be able to read the row they licensed — the title, what kind
-- of data it is, where the file sits. Nothing else about the contributor comes
-- with it: `datasets` has never held a name or an email, and the address on the
-- row is the one the buyer already paid into the vault for.
drop policy if exists "datasets read" on public.datasets;
create policy "datasets read"
  on public.datasets for select
  using (
    owner_wallet = public.current_wallet()
    or public.is_operator()
    or exists (
      select 1
        from public.sales s
       where s.dataset_id = datasets.id
         and s.buyer_wallet = public.current_wallet()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: the licensed read
--
-- Until now the rule on this bucket was absolute — your own files, nobody
-- else's, operators included — and that absoluteness was the product's best
-- security property. This is the one exception, and it is the one the whole
-- protocol is for: a buyer who paid for a licence may read the file they
-- licensed, for as long as the licence lasts.
--
-- Three conditions, all of them facts in the database rather than assertions
-- in a request: a sale exists, it names this wallet as the buyer, and its
-- licence has not run out. Revoking consent does not reach back through this —
-- the contract cannot un-send bytes, and neither can a policy. What expiry
-- controls is whether they may fetch it again.
-- ---------------------------------------------------------------------------
drop policy if exists "datasets licensed download" on storage.objects;
create policy "datasets licensed download"
  on storage.objects for select
  using (
    bucket_id = 'datasets'
    and exists (
      select 1
        from public.sales s
        join public.datasets d on d.id = s.dataset_id
       where d.storage_path = objects.name
         and s.buyer_wallet = public.current_wallet()
         and s.channel = 'market'
         and (s.licence_expires_at is null or s.licence_expires_at > now())
    )
  );

-- ---------------------------------------------------------------------------
-- What a marketplace sale is allowed to say about itself
--
-- Two of the columns on a purchase decide where money goes: `owner_wallet`,
-- which is who gets paid, and `price_stroops`, which is how much. The buyer's
-- browser is the last thing that should be trusted with either, and the route
-- that writes the row is only slightly better — it is the buyer's request that
-- told it which datasets to look up.
--
-- So neither is taken from the insert. The owner is read off the dataset, and
-- the price has to be the one the catalogue is advertising or the row does not
-- go in. A purchase is then, by construction, a payment at the listed price to
-- the person who filed the data, whatever the request body said.
-- ---------------------------------------------------------------------------
create or replace function internal.sales_market_defaults()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner text;
  v_price bigint;
begin
  if new.channel is distinct from 'market' then
    return new;
  end if;

  -- The listed price of the asset actually paid. A row claiming to be a USDC
  -- purchase at the XLM price is the exact mistake this trigger exists to
  -- refuse, and it would otherwise look like a bargain rather than a bug.
  select d.owner_wallet,
         case new.asset
           when 'USDC' then d.price_usdc
           else             d.price_stroops
         end
    into v_owner, v_price
    from public.datasets d
   where d.id = new.dataset_id;

  if v_owner is null then
    raise exception 'that dataset does not exist' using errcode = '23503';
  end if;

  new.owner_wallet := v_owner;

  if v_price is null or new.price_stroops is distinct from v_price then
    raise exception 'a marketplace sale has to be at the listed price for the asset it paid in'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists sales_market_defaults on public.sales;
create trigger sales_market_defaults
  before insert on public.sales
  for each row execute function internal.sales_market_defaults();

-- ===========================================================================
-- What the door turned away
--
-- The upload form used to take anything: a screenshot of an app, an image a
-- model generated, a CSV with a header row and nothing under it, the same file
-- twice. Once any of those is a row here it is indistinguishable from a real
-- contribution — it is counted on the landing page, priced by the function
-- above, and eventually sold to somebody.
--
-- So uploads are now scanned before they happen, in the contributor's own
-- browser (src/lib/scan). The file is read locally, and one that fails never
-- leaves the device. These columns are where the verdict lands.
--
-- Two things this schema is careful not to claim.
--
-- The first: the scanner runs in the browser, so what arrives here is a
-- *report*, not a proof. A patched client can write `clean` on anything, the
-- same way it could always write any title it liked. That is tolerable because
-- of what the verdict is used for — it keeps junk out of the catalogue and off
-- the public counts, and the money still moves only when a buyer decides a
-- dataset is worth paying for. A server-side rescan is not available to us by
-- design: the storage policy refuses operators the bytes, and that rule is
-- worth more than this one.
--
-- The second: `clean` means "nothing known was found", not "this is genuine
-- human data". A generated image with its metadata stripped passes, because
-- nothing in a browser can honestly say otherwise. Every surface that shows
-- this column says it in those words.
--
-- `unscanned` is every row filed before the scanner existed. They stay
-- listable — they are the deployment's whole history — but they say so, and a
-- buyer can filter them out.
-- ===========================================================================
alter table public.datasets add column if not exists quality       text not null default 'unscanned';
alter table public.datasets add column if not exists quality_flags text[] not null default '{}';
alter table public.datasets add column if not exists scanned_at    timestamptz;
alter table public.datasets add column if not exists scan_version  integer;

alter table public.datasets drop constraint if exists datasets_quality_ck;
alter table public.datasets add constraint datasets_quality_ck
  check (quality in ('unscanned', 'clean', 'flagged')) not valid;

-- A flagged row has to say why, and a clean one has nothing to say. Without
-- this the two columns could disagree, and the reason a dataset is held back
-- from the marketplace would be a fact nobody could look up.
alter table public.datasets drop constraint if exists datasets_quality_flags_ck;
alter table public.datasets add constraint datasets_quality_flags_ck
  check (
    case quality
      when 'flagged' then array_length(quality_flags, 1) >= 1
      when 'clean'   then coalesce(array_length(quality_flags, 1), 0) = 0
      else true
    end
  ) not valid;

-- Rescanning an old row. The contributor can do this and nobody else can,
-- because the scan needs the bytes and they are the only party the storage
-- policy hands them to — operators included, deliberately. See the bucket
-- policies above, and `datasets_guard_update` below for why an update policy
-- here does not let a contributor price their own data.
drop policy if exists "datasets quality" on public.datasets;
create policy "datasets quality"
  on public.datasets for update
  using (owner_wallet = public.current_wallet())
  with check (owner_wallet = public.current_wallet());

grant update (quality, quality_flags, scanned_at, scan_version)
  on public.datasets to authenticated;

-- ---------------------------------------------------------------------------
-- Column grants are per role, not per policy
--
-- `authenticated` is now allowed to update `price_stroops` (for the operator)
-- and the quality columns (for the contributor), and Postgres checks the grant
-- before it checks which policy let the row through. Without this trigger a
-- contributor rescanning their own dataset could set its price in the same
-- statement — the policy above would happily allow it.
--
-- So the price is put back unless the writer is an operator. The same rule as
-- on insert, enforced the same way: not by asking the client nicely.
-- ---------------------------------------------------------------------------
create or replace function internal.datasets_guard_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not public.is_operator() then
    new.price_stroops := old.price_stroops;
    new.price_usdc    := old.price_usdc;
  end if;
  return new;
end;
$$;

drop trigger if exists datasets_guard_update on public.datasets;
create trigger datasets_guard_update
  before update on public.datasets
  for each row execute function internal.datasets_guard_update();

-- ---------------------------------------------------------------------------
-- The catalogue
--
-- What a buyer may browse, and the only place a dataset is ever visible to
-- someone who did not contribute it. The shape of it is an argument: there is
-- no title, no description, no owner address and no file name here.
--
-- Titles and descriptions are what a contributor wrote for themselves, in a
-- dashboard, about a file from their own life. Nobody uploading a photo folder
-- in July agreed to have the sentence they typed shown to a stranger, and a
-- title is exactly the field a person puts a name or a place into. So the
-- catalogue sells on attributes it can stand behind — what kind of data, how
-- big, what format, how recent, what it costs, and what the consent behind it
-- permits — and the words stay where they were written.
--
-- A row exists here only while a receipt does: the join is inner, against a
-- receipt that names the marketplace address, has not been revoked and has not
-- expired. That is what makes this a catalogue of consented data rather than a
-- list of files with a consent column, and it is why a revoke removes a listing
-- without anything having to remember to.
--
-- It also drops anything the upload scanner held back, and says of everything
-- else whether it was scanned at all. So a listing is three facts a buyer can
-- check rather than two: live consent, a price, and a file that got past the
-- door.
-- ---------------------------------------------------------------------------
drop view if exists public.market_facets;
drop view if exists public.market_listings;
create view public.market_listings as
  select
    d.id,
    left(
      encode(sha256(convert_to(salt.value || d.owner_wallet, 'UTF8')), 'hex'),
      32
    )                                           as contributor_id,
    d.source_type,
    d.byte_size,
    d.content_type,
    d.created_at,
    d.price_stroops,
    d.price_usdc,
    d.quality                                   as scan_status,
    d.scanned_at,
    c.receipt_id                                as consent_receipt_id,
    c.purpose                                   as consent_purpose,
    c.granted_at                                as consent_granted_at,
    c.expires_at                                as consent_expires_at,
    coalesce(sold.licences, 0)                  as licences_sold,
    sold.last_licensed_at                       as last_licensed_at
  from public.datasets d
  cross join internal.secrets salt
  -- Read rather than called. A view runs its *table* access as the view's
  -- owner, but a function inside it is checked against whoever is querying —
  -- so `internal.market_address()` here meant every anonymous visitor got
  -- `permission denied for schema internal` and the catalogue was empty for
  -- everyone but the database owner. The secret is the same secret; reaching
  -- it the way the salt is reached is what makes it readable through the view
  -- without opening the schema to anybody.
  cross join internal.secrets market
  join lateral (
    select k.receipt_id, k.purpose, k.granted_at, k.expires_at
      from public.consents k
     where k.dataset_hash = d.sha256
       and k.contributor  = d.owner_wallet
       and k.buyer        = market.value
       and k.revoked_at is null
       and k.expires_at > now()
     order by k.expires_at desc
     limit 1
  ) c on true
  left join lateral (
    select count(*) as licences, max(s.created_at) as last_licensed_at
      from public.sales s
     where s.dataset_id = d.id
  ) sold on true
  where salt.name   = 'contributor_id'
    and market.name = 'market_address'
    and d.price_stroops is not null
    and d.price_usdc   is not null
    and d.quality <> 'flagged';

grant select on public.market_listings to anon, authenticated;

create view public.market_facets as
  select
    source_type,
    count(*)                                        as listings,
    count(*) filter (where scan_status = 'clean')   as scanned,
    min(price_stroops)                              as min_price_stroops,
    max(price_stroops)                              as max_price_stroops,
    min(price_usdc)                                 as min_price_usdc,
    max(price_usdc)                                 as max_price_usdc,
    min(byte_size)                                  as min_bytes,
    max(byte_size)                                  as max_bytes,
    max(created_at)                                 as newest
  from public.market_listings
  group by source_type;

grant select on public.market_facets to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table: identities
--
-- Signing in with Google, and the precise size of what that buys.
--
-- A Stellar address is still the identity here. It is what a dataset is owned
-- by, what a payout is addressed to, what a consent receipt names and what a
-- buyer's licence is keyed to. Nothing in this schema knows what an email is
-- and nothing in it should: an account we could take away is not ownership.
--
-- So Google is a second door to the same wallet rather than an alternative to
-- having one. A person proves both once — the Google session and a SEP-10
-- signature, in the same request — and this table records that the two belong
-- together. After that the Google session alone is enough to be handed a
-- session token for that wallet, which is what makes the second visit a click
-- instead of a browser extension.
--
-- What it deliberately does not buy is a signature. The server holds no key,
-- before this table and after it, so granting consent, funding a purchase and
-- claiming a payout still ask the wallet, because there is nothing else that
-- could answer. Google gets you to your data; it does not spend your money.
--
-- The linking write is done by a route that has just checked both proofs, and
-- carries the `link` claim to say so — the same pattern as `market` and
-- `mirror`. A browser session never has it.
-- ---------------------------------------------------------------------------
create or replace function public.can_link()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'link')::boolean, false)
$$;

create table if not exists public.identities (
  -- auth.users.id: the Supabase Auth account behind the Google sign-in.
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  wallet     text        not null,
  -- Kept for one reason: so the dashboard can say which account is attached.
  -- Nothing is ever sent to it, and no policy anywhere reads it.
  email      text,
  provider   text        not null default 'google',
  created_at timestamptz not null default now(),
  linked_at  timestamptz not null default now()
);

alter table public.identities drop constraint if exists identities_wallet_ck;
alter table public.identities add constraint identities_wallet_ck
  check (wallet ~ '^G[A-Z2-7]{55}$') not valid;

-- One wallet, one account. Two Google logins pointing at the same wallet would
-- mean either of them is that contributor, which is a wider door than anybody
-- opened on purpose.
create unique index if not exists identities_wallet_idx
  on public.identities (wallet);

alter table public.identities enable row level security;

drop policy if exists "identities read"   on public.identities;
drop policy if exists "identities insert" on public.identities;
drop policy if exists "identities update" on public.identities;
drop policy if exists "identities delete" on public.identities;

-- Your own link, from either side of it: the wallet session sees which account
-- is attached, the Google session sees which wallet it reaches.
create policy "identities read"
  on public.identities for select
  using (
    public.can_link()
    or user_id = auth.uid()
    or wallet = public.current_wallet()
  );

-- The row's wallet has to be the wallet in the token, so a route holding a
-- `link` claim cannot attach an account to somebody else's address.
create policy "identities insert"
  on public.identities for insert
  with check (public.can_link() and wallet = public.current_wallet());

-- Re-pointing an account at a different wallet is allowed, and needs the new
-- wallet's signature to do it. Losing a link that way is a nuisance rather than
-- a breach: the wallet it used to name still owns everything it owned.
create policy "identities update"
  on public.identities for update
  using (public.can_link())
  with check (public.can_link() and wallet = public.current_wallet());

create policy "identities delete"
  on public.identities for delete
  using (
    (public.can_link() and wallet = public.current_wallet())
    or user_id = auth.uid()
  );

grant select, insert, update, delete on public.identities to authenticated;

-- PostgREST caches the schema it exposes, and a table it has not noticed is a
-- 404 that looks like a bug in the browser. Supabase reloads on DDL by itself;
-- this is here for the deployment where that did not happen.
-- ---------------------------------------------------------------------------
-- What the marketplace is doing
--
-- A catalogue with no visible trade is a shop with the lights off: a buyer
-- weighing a dataset has no way to tell whether anybody has ever bought one,
-- and a contributor deciding whether to list has no way to tell whether
-- listing leads anywhere. So licences are public — as events, not as records.
--
-- What is public is the shape of the trade: what kind of data, how big, what
-- it cost, in which asset, when, and how long the licence runs. What is not is
-- who. Both sides are salted digests of their addresses, the same digest the
-- catalogue uses, so the feed can say "this buyer has licensed three times
-- today" without saying which wallet that is or what company is behind it.
--
-- The buyer's organisation name is deliberately absent. It is in `sales.buyer`
-- and the contributor they bought from can read it — that is the point of
-- filing it — but a public ticker naming every company that buys data would be
-- a different product with a different consent behind it.
-- ---------------------------------------------------------------------------
drop view if exists public.market_activity;
create view public.market_activity as
  select
    s.id,
    left(
      encode(sha256(convert_to(salt.value || s.buyer_wallet, 'UTF8')), 'hex'),
      12
    )                          as buyer_id,
    -- The same digest as `market_listings.contributor_id`, so a buyer can see
    -- that the dataset they are looking at is from someone who has sold before.
    left(
      encode(sha256(convert_to(salt.value || s.owner_wallet, 'UTF8')), 'hex'),
      32
    )                          as contributor_id,
    d.source_type,
    d.byte_size,
    d.content_type,
    s.price_stroops,
    s.asset,
    s.created_at,
    s.licence_expires_at
  from public.sales s
  join public.datasets d on d.id = s.dataset_id
  cross join internal.secrets salt
  where s.channel = 'market'
    and s.buyer_wallet is not null
    and salt.name = 'contributor_id'
  order by s.created_at desc
  limit 60;

grant select on public.market_activity to anon, authenticated;

-- The same trade, counted. Separate from the feed because a view can be a list
-- or a total and this product needs both: the strip above the catalogue says
-- how much has moved, the feed under it says what moved last.
drop view if exists public.market_pulse;
create view public.market_pulse as
  select
    count(*)                                                   as licences,
    count(distinct buyer_wallet)                               as buyers,
    count(distinct dataset_id)                                 as datasets,
    coalesce(sum(price_stroops) filter (where asset = 'XLM'), 0)  as gross_stroops,
    coalesce(sum(price_stroops) filter (where asset = 'USDC'), 0) as gross_usdc,
    count(*) filter (where created_at > now() - interval '24 hours') as last_day,
    max(created_at)                                            as last_at
  from public.sales
  where channel = 'market';

grant select on public.market_pulse to anon, authenticated;

notify pgrst, 'reload schema';
