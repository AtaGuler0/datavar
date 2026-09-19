# datavar.xyz

Your data already trains AI models. You just never see a cent of it.

Datavar is our attempt to fix that. We are building a data protocol where people contribute data on their own terms and get paid when it gets used. Every record carries a signed consent receipt, so an AI team licensing a dataset knows exactly who agreed to what, for which purpose, and until when. Nothing in it is scraped or pulled from some legal gray area.

Two pieces of that protocol are live on Stellar testnet, both in
[`contracts/`](contracts/README.md): a Soroban contract that holds consent
receipts as ledger state, and a payout vault that holds contributor earnings
until the contributor's own signature moves them out. The buy side runs on the
same two contracts — see [the marketplace](#the-marketplace) below.

## Why a protocol and not just a marketplace

A marketplace can sell you a dataset. It can't prove consent, and it can't revoke access when consent expires. We want consent, licensing terms, and payouts to live at the record level, enforced by the protocol rather than by a PDF nobody reads. That's the part we think is actually hard, and the part worth building.

## Consent receipts on Stellar

A receipt says who allowed which dataset to be used by whom, for what purpose,
and until when. It lives in contract state rather than in our database, which is
the whole argument: a buyer can check a receipt without an account with us, and
revoking one ends it somewhere we cannot quietly edit. Two rules are enforced by
the contract rather than by policy — consent always has an end date, and only the
contributor who granted it can withdraw it.

Deploy your own or point at the existing testnet deployment, then set
`NEXT_PUBLIC_CONSENT_CONTRACT_ID`. Grant and revoke from
`/dashboard/data`; the signature comes from the contributor's wallet, and
nothing on the server can sign in their place. Full instructions, the contract's
interface, and how to query it yourself are in
[`contracts/README.md`](contracts/README.md).

## The marketplace

`/market` is the demand side, and it is built out of the consent contract
rather than beside it. A dataset is listed for sale when its contributor grants
consent to the marketplace address (`NEXT_PUBLIC_MARKET_ADDRESS`), which makes
delisting a revoke and makes every listing checkable against the ledger by
someone who does not trust us.

What a buyer sees is deliberately thin: the category, the format, the size, when
it was contributed, the consent behind it and the price. No title, no
description, no contributor address — those are what someone wrote in their own
dashboard about a file from their own life, and buying attributes is enough to
buy a cohort. Filters run in Postgres against `market_listings`, so a catalogue
of any size narrows in one query.

Paying is one signature for the whole basket: the buyer calls `fund` on the
payout vault, their own money into the same contract every contributor claims
from. The server checks the transaction it is about to relay — right function,
right signer, exact total — and re-reads every consent receipt on-chain before
it writes a licence. A licence expires when the consent behind it does, and
storage enforces that: the bucket hands a buyer their file for exactly as long
as the receipt holds.

Prices are not typed by anyone. `internal.list_price` computes them from the
source type and the size, a trigger applies it on every insert, and only an
operator can override a single row.

Two currencies, two vaults. A basket is paid in XLM or in USDC, the buyer
picks at the top of the catalogue, and the choice decides three things at once:
which price list the basket is read against, which vault the money lands in,
and which vault the contributor later claims from. The vaults are two
deployments of the same contract — its token is fixed at construction, so an
asset is a deployment rather than a setting — and they share nothing: separate
balances, separate credited references, separate operator sets.

The USDC list is a second list rather than a conversion: the XLM rates at 0.25
USD per XLM, fixed when they were written. Nothing here holds a price feed, and
a marketplace that repriced itself from one would have to answer what a
checkout does when the oracle is stale. Two published lists answer it by not
asking. The cost is stated in `internal.list_price_usdc`: when XLM moves, one
list is the cheaper way to buy the same file, and that is the day to put a
quote engine there.

## Turkish lira

`/anchor` is a TRY ⇄ USDC ramp, and it exists because the marketplace takes
USDC and a team with a budget in lira has no way to hold any. It works the
other way for contributors, who earn USDC and pay their bills in lira.

It is the ecosystem's own standard rather than an integration with one company:
SEP-1 discovery, SEP-10 auth, SEP-12 KYC, SEP-38 quotes and SEP-6 transfers,
against `NEXT_PUBLIC_ANCHOR_HOME_DOMAIN`. Two values are the whole handoff — a
home domain and an asset code — and everything else is read from that domain's
stellar.toml at runtime, so pointing this at a real Turkish anchor on mainnet
is a change to two lines and the network.

The browser talks to the anchor directly; datavar's own API is not in the path.
That is the honest shape of it: the user's key is the identity on both sides,
so a server in the middle would only be somewhere for a token to leak. The
anchor learns a Stellar address and nothing else — no name reaches it, and none
of it is written to our database.

Two things are worth knowing before using it. The bank leg is simulated, and
the deposit screen says so on the button that stands in for it. And a SEP-10
challenge is a transaction the wallet will sign without reading, so
`assertIsChallenge` in `lib/anchor/session.ts` refuses anything that is not one
before the wallet is asked — sequence zero, the anchor's declared signing key,
this domain, open timebounds. Without that check a login button is a signing
oracle.

## What gets in

Uploads are checked before they happen, in the contributor's browser
([`src/lib/scan`](src/lib/scan)). It reads the file's own header and measures
the image: a generator that named itself in the metadata, a Stable Diffusion
prompt block, an IPTC field declaring synthetic media, a screenshot, a blank, an
empty export, the same file twice. Anything it refuses is never uploaded — the
bytes stay on the machine they came from.

It claims only what it checks. There is no AI-image detector in it, because a
browser cannot honestly run one; what it finds are files that *declare* how they
were made. A generated image with its metadata stripped gets in, and every
sentence in the interface says so.

The verdict lands on the row (`quality`), and the catalogue drops anything
flagged. Rows filed before the scanner existed say `unscanned`, stay listed, and
are marked as such — buyers can filter them out, and their contributor can
recheck them from `/dashboard/data` (they hold the file; nobody else, operators
included, can read it).

## Running locally

You'll need Node 20 or newer.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

`npm run build` creates a production build, `npm start` serves it, and `npm run lint` runs ESLint.

### Configuration

Copy `.env.example` to `.env.local` and fill it in. The Supabase pair is enough
to run the landing page and the contributor dashboard; the rest turns on
payouts and the admin panel.

Run `supabase/schema.sql` in the Supabase SQL editor to create the tables,
policies and storage bucket. It's idempotent — re-run it after pulling changes
that add to it. Row-level security is on and keyed to the signed-in wallet, so
the dashboard shows nothing until sign-in is configured (below).

### Wallet sign-in

Connecting a wallet only asks it what address it holds; anyone can claim any
address. Signing in makes it prove it: the server issues a
[SEP-10](https://stellar.org/protocol/sep-10) challenge — a transaction built
on sequence 0, which no network will ever accept — the wallet signs it, and the
server mints a session token carrying the proved address.

That token is a JWT Supabase accepts, which is the point of it. Row-level
security reads the wallet out of the token, so the database refuses to hand
over someone else's rows rather than trusting this code to filter. A stranger
holding the anon key reaches three aggregate views and nothing else: no dataset
row, no sale row, no file.

Two server-side secrets make it work:

1. `STELLAR_AUTH_SECRET` — the key that signs challenges. Never funded, holds
   nothing; generate one with `stellar keys generate datavar-auth` and read it
   back with `stellar keys show datavar-auth`.
2. `SUPABASE_JWT_SECRET` — Supabase → Project Settings → API Keys → JWT Keys,
   listed as **Legacy JWT Secret** (older projects: Settings → API → JWT
   Settings). It is the same secret that signs the anon key, so if the anon
   key's header decodes to `HS256`, this is the one. Treat it like a password:
   anyone holding it can mint a session for any wallet.

   Should the project ever move to asymmetric signing keys and revoke the
   legacy secret, this stops working — Supabase keeps the private half of an
   asymmetric key. The migration is to publish a JWKS endpoint, register it
   under Third-Party Auth, and sign with our own key in `src/lib/auth/jwt.ts`.

Operators are named in `ADMIN_WALLETS`, server-side. The browser is told whether
it is an operator, inside the signed token, and never gets to decide — and the
same claim is checked again by row-level security on every query the panel
makes.

### Google sign-in

A wallet is still the identity: a dataset is owned by an address, a payout is
addressed to one, a receipt names one. Google is a second door to the same
wallet, not a way to do without one.

It is attached once. Sign in with Google, connect the wallet, sign the SEP-10
challenge — both proofs arrive in the same request, and `public.identities`
records that the account and the address belong together. After that the Google
session alone is traded at `/api/auth/google` for exactly the token a signature
would have produced, which is what makes the second visit a click instead of a
browser extension.

What it deliberately cannot do is sign. The server holds no key, before this
and after it, so granting consent, funding a purchase and claiming a payout all
still ask the wallet — `canSign` in the wallet context is false until one is
connected, and every surface that spends money reads it before offering a
button. Signing in with Google gets you to your data; it does not spend your
money.

Turning it on is three steps in two dashboards, and no new environment
variables:

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type
   **Web application**. Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the client ID and
   secret, enable it.
3. Supabase → Authentication → URL Configuration: add your dev origin
   (`http://localhost:3000`, or whichever port `npm run dev` picked) and the
   deployed origin to **Redirect URLs**. The browser comes back to
   `/auth/callback` on whichever origin it left from.

The Google session is verified server-side against the same
`SUPABASE_JWT_SECRET` the wallet sessions are signed with, so the asymmetric-key
caveat above applies to both. The two token kinds are told apart by issuer —
see `src/lib/auth/google.ts`, which refuses one of ours wearing the other's hat.

### Payouts on testnet

Earnings are held in a Soroban contract on testnet and leave it only on the
contributor's own signature. Sales reach it two ways: a buyer paying for a
licence at `/market`, or an operator recording one by hand. To turn it on:

1. Deploy the payout contract and set `NEXT_PUBLIC_PAYOUT_CONTRACT_ID` — the
   command is in `.env.example`, and the contract's interface is in
   [`contracts/README.md`](contracts/README.md).
2. Put your own wallet address in `ADMIN_WALLETS` (comma-separated for more
   than one) to get into `/admin`.
3. Let those wallets credit. The contract keeps its own list — `ADMIN_WALLETS`
   opens the panel, the contract decides whose signature it takes — and the
   vault card manages it: the contract's admin can add or remove any wallet
   there, up to ten. Each one needs a few test XLM for fees and nothing more.
4. Put test XLM into the vault by calling `fund` from any funded key. There is
   no button for this: the server holds no money and cannot move any.

Then sell a dataset — from `/market` as a buyer, or from `/admin` by hand on
the Datasets page or as a random round on the Sales page — and claim it from
`/dashboard/earnings`. Selling
credits the sale into the vault in the same step, which takes one signature from
the operator's wallet; the vault card credits anything left over. The claim
returns a transaction hash that resolves on
[stellar.expert](https://stellar.expert/explorer/testnet).

There is no server-held Stellar key anywhere in this. Crediting was the last
thing the server signed, and it now goes through the operator's wallet like
every other call — so a deployment needs no key material to run the payout side,
and a compromised server has none to leak.

What the server can and cannot do is worth stating plainly. It can read the
ledger, prepare transactions for other people to sign, and keep our copy of what
happened. That is the entire list. It cannot credit a sale, pay a contributor,
pay itself, take a credit back, or move funds into or out of the vault — every
one of those needs a signature it has no key to produce, and the contract pays
the address that signed the call. The
database is still ours to write, so marking a sale settled needs a `settle`
claim that only the claim route mints, for two minutes at a time; but a wrong
row there changes bookkeeping, not who gets paid.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.

The App Router entry lives in `src/app`, and each landing page section (hero, stats, buyers, FAQ and so on) is its own component in `src/components`.

### Why package.json has an `overrides` block

`@creit.tech/stellar-wallets-kit` depends on adapters for chains this product does not use — Trezor, WalletConnect, Ledger, and through Reown a further tree reaching Solana, NEAR and Coinbase. They are ordinary dependencies rather than optional ones, so installing the kit installs all of them, and most of the advisories `npm audit` reports come from there rather than from anything we call.

Nothing in that tree is shipped. The kit is imported per module, and this app loads four: Freighter, xBull, Albedo and Lobstr. Grepping a production build for the rest finds nothing in either the client chunks or the server output.

The pins are still worth having. `axios` is the one that matters — it arrives under our own `@stellar/stellar-sdk`, it is in the server build, and it is what talks to Horizon and the Soroban RPC. The rest (`protobufjs`, `nanoid`, `ip-address`, `uuid`) are pinned to keep the audit readable, so a real advisory is not lost among a page of unreachable ones.

`elliptic` is the one that stays. Every version is affected and there is no fixed release, so the only thing `npm audit fix --force` can offer is a downgrade of the wallet kit to 1.5.0 — an older kit, in exchange for an advisory in code that is never loaded. Not worth it.

## License

MIT. See [LICENSE](LICENSE).
