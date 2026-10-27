# datavar.xyz

Your data already trains AI models, and you are not paid for it.

Datavar is a data protocol where people contribute data on their own terms and get paid when it is used. Every record carries a signed consent receipt, so an AI team licensing a dataset knows who agreed to what, for which purpose, and until when. Nothing in it is scraped.

The protocol is three Soroban contracts, all in
[`contracts/`](contracts/README.md). Two are deployed on Stellar testnet: a
consent contract that holds receipts as ledger state, and a payout vault that
holds contributor earnings until the contributor signs to move them out. The
third, a licence contract, is written and tested but not deployed. The three
have 72 tests between them (consent 23, payout 29, licence 20). The buy side
runs on the two deployed contracts; see [the marketplace](#the-marketplace)
below.

| Contract | Source | Testnet id |
|---|---|---|
| Consent receipts | [`contracts/consent`](contracts/contracts/consent) | [`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI) |
| Payout vault, XLM | [`contracts/payout`](contracts/contracts/payout) | [`CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL`](https://stellar.expert/explorer/testnet/contract/CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL) |
| Payout vault, USDC | [`contracts/payout`](contracts/contracts/payout) | [`CDPL2GASC24NPIYSME4KRL3HV2UXTQTW65NTKITTNMBDMXR342QSD4P2`](https://stellar.expert/explorer/testnet/contract/CDPL2GASC24NPIYSME4KRL3HV2UXTQTW65NTKITTNMBDMXR342QSD4P2) |
| Licence escrow | [`contracts/licence`](contracts/contracts/licence) | not deployed |

Pushing a `v*` tag builds all three on GitHub Actions
([`release.yml`](.github/workflows/release.yml)) and publishes each wasm as a
release with a build attestation. A deployed contract running one of those
builds shows as verified source on stellar.expert, and its wasm hash can be
checked against the release.

## Why a protocol

A marketplace can sell a dataset, but on its own it can't prove consent or cut off access when consent expires. We want consent, licensing terms and payouts attached to each record and enforced by contracts, instead of by a terms PDF that nobody reads. We think that is the hard part, and it is the part we are building.

## Consent receipts on Stellar

A receipt records who allowed which dataset to be used by whom, for what
purpose, and until when. It is stored in contract state on Stellar, so a buyer
can check it without an account with us, and a revocation is recorded somewhere
we cannot quietly edit. The contract enforces two rules: consent always has an
end date, and only the contributor who granted it can withdraw it.

Deploy your own or point at the existing testnet deployment, then set
`NEXT_PUBLIC_CONSENT_CONTRACT_ID`. Grant and revoke from
`/dashboard/data`; the signature comes from the contributor's wallet, and the
server cannot sign in their place. Full instructions, the contract's
interface, and how to query it yourself are in
[`contracts/README.md`](contracts/README.md).

To check the numbers we report, [`metrics/compute.mjs`](metrics/README.md)
computes on-chain metrics from contract events alone and leaves out our own
wallets: the team's and the ones our load-test bot generated (listed in
`metrics/excluded-wallets.txt`).

## The marketplace

`/market` is the demand side, and it is built on the consent contract. A
dataset is listed for sale when its contributor grants consent to the
marketplace address (`NEXT_PUBLIC_MARKET_ADDRESS`). Delisting is a revoke, and
anyone who does not trust us can check every listing against the ledger.

A buyer sees the category, the format, the size, when it was contributed, the
consent behind it and the price. Titles, descriptions and contributor addresses
are hidden. Contributors write those in their own dashboard about files from
their own lives, and a buyer only needs the attributes to buy a cohort. Filters
run in Postgres against `market_listings`, so a catalogue of any size narrows
in one query.

Paying takes one signature for the whole basket. On the live deployment the
buyer calls `fund` on the payout vault, so their money goes into the same
contract every contributor claims from. Before relaying the transaction, the
server checks that it calls the right function, is signed by the right
account and pays the exact total, and it re-reads every consent receipt
on-chain before it writes a licence. A licence expires when the consent behind
it does, and storage enforces that: the bucket serves a buyer their file only
while the receipt holds.

The licence contract in `contracts/contracts/licence` changes where the money
goes first. When `NEXT_PUBLIC_LICENCE_CONTRACT_ID` (or
`NEXT_PUBLIC_LICENCE_USDC_CONTRACT_ID`) is set, a purchase pays into that
contract instead of the vault. It holds the money for a hold period (planned at
7 days, or until the receipt expires if that is sooner) and takes a protocol
fee (planned at 10%). If the contributor revokes during the hold, the buyer is
refunded the unused share of the term. After the hold, the contributor's share
is credited into the payout vault and the fee goes to the treasury, and a
revocation from then on refunds nothing. Without either variable, purchases pay
straight into the vault with no fee and no refund. That is how datavar.xyz
works today.

Before the buyer pays, checkout says that a contributor can withdraw before
the end date and that access ends then, how much a withdrawal tomorrow would
refund, that a withdrawal after the hold returns nothing, and that downloaded
files can't be recalled and are governed by the licence terms from then on.
On a deployment without the licence contract it says there is no refund.

Nobody types a price. `internal.list_price` computes it from the source type
and the size, a trigger applies it on every insert, and only an operator can
override a single row.

There are two currencies and two vaults. A basket is paid in XLM or in USDC.
The buyer picks one at the top of the catalogue, and the choice decides which
price list the basket is read against, which vault the money lands in, and
which vault the contributor later claims from. The vaults are two deployments
of the same contract. Its token is fixed at construction, so each asset needs
its own deployment, and the two share nothing: balances, credited references
and operator sets are all separate.

The USDC prices are a separate list, written by rating XLM at 0.25 USD and
fixed at that point. There is no price feed. A marketplace that repriced itself
from one would have to decide what checkout does when the oracle is stale, and
two published lists avoid the question. The cost is noted in
`internal.list_price_usdc`: when XLM moves, one list becomes the cheaper way to
buy the same file, and at that point a quote engine belongs there.

## What gets in

Uploads are checked in the contributor's browser before they happen
([`src/lib/scan`](src/lib/scan)). The scanner reads the file's own header and
measures the image. It looks for a generator that named itself in the
metadata, a Stable Diffusion prompt block, an IPTC field declaring synthetic
media, a screenshot, a blank image, an empty export, or the same file twice. A
file it refuses is never uploaded, and the bytes stay on the contributor's
machine.

The scanner only reports what it can check. There is no AI-image detector in
it, because a browser cannot run one reliably. It finds files that *declare*
how they were made. A generated image with its metadata stripped gets in, and
the interface says so.

The verdict is stored on the row (`quality`), and the catalogue drops anything
flagged. Rows filed before the scanner existed are marked `unscanned` and stay
listed with that label. Buyers can filter them out, and their contributor can
recheck them from `/dashboard/data`. Only the contributor can do this, because
nobody else can read the file, operators included.

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
policies and storage bucket. It is idempotent, so re-run it after pulling
changes that add to it. Row-level security is on and keyed to the signed-in
wallet, so the dashboard shows nothing until sign-in is configured (below).

### Wallet sign-in

Connecting a wallet only asks it which address it holds, and anyone can claim
any address. Signing in proves it. The server issues a
[SEP-10](https://stellar.org/protocol/sep-10) challenge, a transaction built on
sequence 0 that no network will accept. The wallet signs it, and the server
mints a session token carrying the proved address.

The token is a JWT that Supabase accepts. Row-level security reads the wallet
out of the token, so the database itself refuses to return someone else's rows
and does not rely on this code to filter them. Someone holding only the anon
key can reach three aggregate views and nothing else: no dataset row, no sale
row, no file.

Two server-side secrets make it work:

1. `STELLAR_AUTH_SECRET`: the key that signs challenges. It is never funded and
   holds nothing. Generate one with `stellar keys generate datavar-auth` and read
   it back with `stellar keys show datavar-auth`.
2. `SUPABASE_JWT_SECRET`: Supabase → Project Settings → API Keys → JWT Keys,
   listed as **Legacy JWT Secret** (older projects: Settings → API → JWT
   Settings). It is the same secret that signs the anon key, so if the anon
   key's header decodes to `HS256`, this is the one. Treat it like a password:
   anyone holding it can mint a session for any wallet.

   If the project moves to asymmetric signing keys and revokes the legacy
   secret, this stops working, because Supabase keeps the private half of an
   asymmetric key. The fix is to publish a JWKS endpoint, register it under
   Third-Party Auth, and sign with our own key in `src/lib/auth/jwt.ts`.

Operators are named in `ADMIN_WALLETS`, server-side. The signed token tells the
browser whether it is an operator, and the browser never decides this itself.
Row-level security checks the same claim again on every query the panel makes.

### Google sign-in

The wallet is still the identity. Datasets are owned by an address, payouts go
to an address, and receipts name one. Google sign-in is a second way into the
same wallet account and does not replace the wallet.

You link the two once: sign in with Google, connect the wallet and sign the
SEP-10 challenge. Both proofs arrive in the same request, and
`public.identities` records that the account and the address belong together.
After that, `/api/auth/google` exchanges the Google session alone for the same
token a signature would have produced, so a returning visit is one click and
doesn't need the browser extension.

Google sign-in cannot sign transactions. The server holds no key, so granting
consent, funding a purchase and claiming a payout all still go through the
wallet. `canSign` in the wallet context is false until a wallet is connected,
and every screen that spends money checks it before showing a button.

Setup takes four steps across two dashboards and one environment variable:

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type
   **Web application**. Authorised redirect URIs: `https://<your
   domain>/auth/callback` and `http://localhost:3000/auth/callback` for
   development, plus `https://<project-ref>.supabase.co/auth/v1/callback` if
   you also want the fallback flow below.
2. Supabase → Authentication → Providers → Google: paste the client ID and
   secret, enable it. The same client ID has to be in the provider's
   **Client IDs** list, which is what lets Supabase accept Google's ID tokens.
3. Supabase → Authentication → URL Configuration: add your dev origin and the
   deployed origin to **Redirect URLs**.
4. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the client ID.

With the variable set, the browser goes to Google directly and comes back to
our `/auth/callback` with an ID token, which `signInWithIdToken` turns into a
Supabase session. Google's account chooser then shows our domain. The request
carries a `state` kept in sessionStorage and a nonce: Google gets its SHA-256
and Supabase gets the nonce, so a token minted for another request is
refused. Without the variable, sign-in goes through Supabase's own OAuth
endpoint, and the chooser shows the Supabase project's domain instead.

The server verifies the Google session against the same `SUPABASE_JWT_SECRET`
that signs wallet sessions, so the asymmetric-key caveat above applies to both.
`src/lib/auth/google.ts` tells the two token kinds apart by issuer and rejects
a token of one kind presented as the other.

### Payouts on testnet

Earnings are held in a Soroban contract on testnet and leave it only when the
contributor signs. Sales reach it in two ways: a buyer paying for a licence at
`/market`, or an operator recording one by hand. To turn it on:

1. Deploy the payout contract and set `NEXT_PUBLIC_PAYOUT_CONTRACT_ID`. The
   command is in `.env.example`, and the contract's interface is in
   [`contracts/README.md`](contracts/README.md).
2. Put your own wallet address in `ADMIN_WALLETS` (comma-separated for more
   than one) to get into `/admin`.
3. Let those wallets credit. `ADMIN_WALLETS` opens the panel, but the contract
   keeps its own list of whose signatures it accepts, and the vault card
   manages that list: the contract's admin can add or remove wallets there, up
   to ten. Each one needs a few test XLM for fees and nothing more.
4. Put test XLM into the vault by calling `fund` from any funded key. There is
   no button for this, because the server holds no money and cannot move any.

Then sell a dataset, either from `/market` as a buyer or from `/admin` by hand
(on the Datasets page, or as a random round on the Sales page), and claim it
from `/dashboard/earnings`. Selling credits the sale into the vault in the same
step, which takes one signature from the operator's wallet; the vault card
credits anything left over. The claim returns a transaction hash that resolves
on [stellar.expert](https://stellar.expert/explorer/testnet).

The earnings page shows each sale as the price minus the protocol fee minus any
refund. Without the licence contract both are zero, so for every sale so far
the contributor has been credited the full price.

The server holds no Stellar key for any of this. Crediting was the last thing
it signed, and that now goes through the operator's wallet like every other
call. A deployment needs no key material to run the payout side, and a
compromised server has none to leak.

The server can read the ledger, prepare transactions for other people to sign,
and keep our copy of what happened, and that is all. It cannot credit a sale,
pay a contributor, pay itself, take a credit back, or move funds into or out of
the vault. Each of those needs a signature it has no key to produce, and the
contract pays the address that signed the call. The database is still ours to
write, so marking a sale settled needs a `settle` claim that only the claim
route mints, valid for two minutes at a time. A wrong row there changes the
bookkeeping but cannot change who gets paid.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.

The App Router entry lives in `src/app`, and each landing page section (hero, stats, buyers, FAQ and so on) is its own component in `src/components`.

### Why package.json has an `overrides` block

`@creit.tech/stellar-wallets-kit` depends on adapters for chains this product does not use: Trezor, WalletConnect, Ledger, and, through Reown, a further tree reaching Solana, NEAR and Coinbase. They are ordinary dependencies, not optional ones, so installing the kit installs all of them, and most of the advisories `npm audit` reports come from that tree and not from code we call.

None of that tree ships. The kit is imported per module, and this app loads four: Freighter, xBull, Albedo and Lobstr. Grepping a production build for the rest finds nothing in the client chunks or the server output.

We pin some of it anyway. `axios` matters most: it comes in under our own `@stellar/stellar-sdk`, it is in the server build, and it talks to Horizon and the Soroban RPC. The others (`protobufjs`, `nanoid`, `ip-address`, `uuid`) are pinned to keep the audit output short enough that a real advisory stands out.

We leave `elliptic` alone. Every version is affected and there is no fixed release, so the only thing `npm audit fix --force` can offer is a downgrade of the wallet kit to 1.5.0. That would trade a newer kit for removing an advisory in code that is never loaded, so we have not done it.

## License

MIT. See [LICENSE](LICENSE).
