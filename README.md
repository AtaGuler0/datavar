# datavar.xyz

Your data already trains AI models. You just never see a cent of it.

Datavar is our attempt to fix that. We are building a data protocol where people contribute data on their own terms and get paid when it gets used. Every record carries a signed consent receipt, so an AI team licensing a dataset knows exactly who agreed to what, for which purpose, and until when. Nothing in it is scraped or pulled from some legal gray area.

The first piece of that protocol is live on Stellar testnet: a Soroban contract
that holds consent receipts as ledger state, in
[`contracts/`](contracts/README.md). The demand side is still simulated — see
the caveats below for exactly what is and isn't real.

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

### Payouts on testnet

Sales are simulated, but the payout that settles one is a real Stellar testnet
payment. To turn it on:

1. Create a testnet keypair in the
   [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test).
2. Put the public key in `NEXT_PUBLIC_STELLAR_TREASURY` and the secret in
   `STELLAR_TREASURY_SECRET`. The secret has no `NEXT_PUBLIC_` prefix on
   purpose: it stays on the server, and only `src/app/api/claims/route.ts`
   reads it.
3. Put your own wallet address in `ADMIN_WALLETS` (comma-separated for more
   than one) to get into `/admin`.
4. Fund the treasury with friendbot — there's a button on the admin overview.

Then sell a dataset from `/admin` (by hand on the Datasets page, or a random
round on the Sales page) and claim it from `/dashboard/earnings`. The claim
returns a transaction hash that resolves on
[stellar.expert](https://stellar.expert/explorer/testnet).

Claiming needs a signed-in wallet, and the wallet being paid is read out of the
session rather than the request body — a stranger cannot force someone else's
payout out early. Marking a sale settled needs a `settle` claim that only the
payout route mints, for two minutes at a time, so a contributor cannot record
their own payout as claimed with an invented hash.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.

The App Router entry lives in `src/app`, and each landing page section (hero, stats, buyers, FAQ and so on) is its own component in `src/components`.

## License

MIT. See [LICENSE](LICENSE).
