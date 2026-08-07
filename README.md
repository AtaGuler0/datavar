# datavar.ai

Your data already trains AI models. You just never see a cent of it.

Datavar is our attempt to fix that. We are building a data protocol where people contribute data on their own terms and get paid when it gets used. Every record carries a signed consent receipt, so an AI team licensing a dataset knows exactly who agreed to what, for which purpose, and until when. Nothing in it is scraped or pulled from some legal gray area.

The protocol itself is still in the works. What you're looking at is the landing page for [datavar.ai](https://datavar.ai), which explains the idea to both sides of the market: the people supplying data and the teams buying it.

## Why a protocol and not just a marketplace

A marketplace can sell you a dataset. It can't prove consent, and it can't revoke access when consent expires. We want consent, licensing terms, and payouts to live at the record level, enforced by the protocol rather than by a PDF nobody reads. That's the part we think is actually hard, and the part worth building.

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
that add to it.

### Payouts on testnet

Sales are simulated, but the payout that settles one is a real Stellar testnet
payment. To turn it on:

1. Create a testnet keypair in the
   [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test).
2. Put the public key in `NEXT_PUBLIC_STELLAR_TREASURY` and the secret in
   `STELLAR_TREASURY_SECRET`. The secret has no `NEXT_PUBLIC_` prefix on
   purpose: it stays on the server, and only `src/app/api/claims/route.ts`
   reads it.
3. Put your own wallet address in `NEXT_PUBLIC_ADMIN_WALLETS` (comma-separated
   for more than one) to get into `/admin`.
4. Fund the treasury with friendbot — there's a button on the admin overview.

Then sell a dataset from `/admin` (by hand on the Datasets page, or a random
round on the Sales page) and claim it from `/dashboard/earnings`. The claim
returns a transaction hash that resolves on
[stellar.expert](https://stellar.expert/explorer/testnet).

A caveat worth naming: the admin allowlist ships to the browser and nothing is
signed, so it hides the panel rather than defending it. Nothing behind it can
move money — the treasury key is server-side — but it does write sale rows, and
it needs a signed challenge before this is pointed at anything real.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.

The App Router entry lives in `src/app`, and each landing page section (hero, stats, buyers, FAQ and so on) is its own component in `src/components`.

## License

MIT. See [LICENSE](LICENSE).
