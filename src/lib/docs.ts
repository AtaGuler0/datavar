/**
 * The documentation, as data.
 *
 * Pages are written here rather than stored in the database like blog posts,
 * and the difference is on purpose: a post is news and goes stale gracefully,
 * whereas docs describe the code in the same repository. Keeping them next to
 * it means a change that makes a page wrong shows up in the same diff as the
 * change, and a reviewer has a chance to catch it.
 *
 * Bodies are markdown, rendered by `components/markdown.tsx` — the same
 * renderer the blog uses, which builds React elements rather than HTML, so
 * nothing here can produce markup. It supports `##`/`###` headings,
 * paragraphs, lists, blockquotes, code fences and inline links. No tables:
 * write a list instead.
 */

export type DocPage = {
  /** Empty string is the index at /docs; everything else is /docs/<slug>. */
  slug: string;
  title: string;
  /** One line, used as the page's lede and its meta description. */
  summary: string;
  body: string;
};

export type DocGroup = {
  title: string;
  pages: DocPage[];
};

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Getting started",
    pages: [
      {
        slug: "",
        title: "Welcome to Datavar",
        summary: "The consented data layer for AI, on Stellar.",
        body: `Datavar is a data protocol where people contribute data on their own terms and get paid when it is used. Every record carries a consent receipt held in ledger state, so an AI team licensing a dataset can check who agreed to what, for which purpose, and until when — without asking us.

> **Where Datavar is today.** The contributor side is built and the consent contract is live on Stellar testnet. The demand side is not: there are no real buyers, and the sales you see in the product come from a simulated buyer we run ourselves, priced in a placeholder band and settled in test XLM. Nothing here moves real money. [What isn't real yet](/docs/status) is the page that lists it line by line.

## The five-second version

You already produce data that trains models. Today it is scraped, bought and resold without you in the loop, and the money stops somewhere before it reaches you.

On Datavar you upload a dataset, keep the file private, and grant consent to a named buyer for a named purpose with an end date. When the dataset is licensed, the payout settles to your wallet as an on-chain payment you can look up yourself. When you revoke, the ledger says so, and the buyer's own check starts failing.

## What you can do today

- Sign in with a Stellar wallet — no email, no password, no name.
- Upload a dataset. It is hashed on your device before anything leaves.
- Grant and revoke consent receipts on the [consent contract](/docs/consent-receipts), signed by your wallet.
- Claim a payout in test XLM and get the transaction hash back.
- Read the protocol-wide numbers on the landing page, counted from real rows.

## What Datavar is not

It is not a data broker with better manners. A broker sells data you never knowingly handed over and keeps the proceeds. Here you choose what leaves, the terms are on a public ledger, and the payout is addressed to you.

It is also not finished. Read [what isn't real yet](/docs/status) before you form an opinion about the parts that are.`,
      },
      {
        slug: "why",
        title: "Why Datavar exists",
        summary:
          "Scraped data has no answer to who agreed to it. That is a problem for both sides.",
        body: `## The problem for people

Your browsing, purchases, health metrics and messages are already training models. You never agreed to it in any meaningful sense, you cannot find out which models, and you cannot take it back. The value is real — it is simply collected somewhere upstream of you.

The usual answer is a privacy setting, which at best stops the collection. It does not pay you, and it does not help the teams that would rather license data honestly.

## The problem for AI teams

Scraped corpora carry no provenance. A team training on one cannot say who consented, for what purpose, or whether that consent still stands, which is exactly the question a regulator or a plaintiff will ask. The corpus is also frozen: it is a snapshot of an internet that has moved on.

Buying from a broker moves the liability without answering the question. The broker's warranty is a PDF, and a PDF cannot be checked against a ledger.

## Why a protocol and not a marketplace

A marketplace can sell you a dataset. It cannot prove consent, and it cannot revoke access when consent expires — those need to be enforced somewhere neither party controls.

So the terms live at the record level, in contract state. A buyer verifies a receipt by asking the ledger. Revocation ends the receipt somewhere we cannot quietly edit. That is the hard part, and it is the part worth building first, which is why the consent contract exists before the catalogue does.

## What we are betting on

That data with a provable, revocable, expiring consent trail is worth more per record than data without one — enough to fund paying the people who produced it. If that bet is wrong, the protocol is an interesting artefact and nothing more. It is not proven yet, and no number in this product pretends otherwise.`,
      },
      {
        slug: "how-it-works",
        title: "How it works",
        summary: "From connecting a wallet to a payout hash, end to end.",
        body: `## 1. Sign in with a wallet

Your Stellar wallet is your account. Connecting it tells us an address; signing in makes the wallet prove it holds that address, which is what everything else keys off. See [wallet sign-in](/docs/wallet-sign-in).

There is no email, no password and no name anywhere in the product, because none was ever collected.

## 2. Contribute a dataset

Pick a file and a source category. The browser computes its SHA-256 before the file moves, and that hash is what a consent receipt commits to later — the protocol can name the exact bytes that were agreed to without exposing them.

The file goes to a private bucket under your wallet's own path. Nobody else can read it, including other contributors holding the same public key that the app uses. See [data sources](/docs/data-sources).

## 3. Grant consent

A receipt names a buyer, a purpose, the dataset hash, and an expiry. Your wallet signs it and it becomes ledger state on the [consent contract](/docs/consent-receipts).

Two rules are enforced by the contract rather than by us: consent always has an end date in the future, and only the contributor who granted it can withdraw it.

## 4. It sells

Today an operator records the sale from the admin panel, standing in for a demand side that does not exist yet — either by pricing a dataset by hand or by running a round that prices at random between 1 and 10 XLM. The sale writes a payout you are owed.

This is the step that is simulated. Everything after it is not.

## 5. Claim the payout

Claiming asks the server to pay you from the treasury account. It builds a Stellar payment, signs it, submits it, and hands back the transaction hash, which resolves on a public explorer whether or not this site is up.

If your wallet has never been funded on testnet, the first claim opens the account and lands the payout in the same transaction. See [sales and payouts](/docs/payouts).`,
      },
    ],
  },
  {
    title: "Protocol",
    pages: [
      {
        slug: "consent-receipts",
        title: "Consent receipts",
        summary:
          "The part of Datavar a database cannot do: consent as ledger state.",
        body: `A consent receipt says: *this contributor allowed this buyer to use the record with this hash, for this purpose, until this moment.*

Keeping that in a table we own would mean a buyer has to take our word for it, and would mean we could rewrite it. In contract state, a buyer checks it themselves — no account with us, no API key, no permission — and neither side can quietly change what was agreed.

## What the contract enforces

- **Consent always ends.** \`grant\` refuses an expiry that is not in the future. There is no perpetual grant.
- **Only the contributor can withdraw it.** Not the buyer, not the operator, not us. The admin key upgrades the code and nothing else.

Both are code, not policy. That distinction is the entire argument for putting this on a ledger.

## The interface

- \`grant(contributor, buyer, dataset_hash, purpose, expires_at)\` — the contributor, signed. Records a receipt and returns its id.
- \`revoke(id)\` — the receipt's contributor, signed. Ends it; the record and its terms stay.
- \`is_valid(id)\` — anyone. Not revoked, not expired. Unknown ids answer \`false\` rather than failing.
- \`receipt(id)\` — anyone. The full terms.
- \`receipts_of(contributor, start, limit)\` — anyone. One page of receipts, which is what the dashboard reads.
- \`upgrade(new_wasm_hash)\` and \`set_admin(new_admin)\` — admin, signed.

\`dataset_hash\` is the SHA-256 the upload flow computes in your browser, so the receipt commits to exact bytes without revealing them.

## Checking one yourself

The point of the contract is that you do not have to trust the dashboard. Ask the ledger:

\`\`\`bash
stellar contract invoke --network testnet --send=no \\
  --id CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \\
  --source <any-funded-key> \\
  -- is_valid --id 0
\`\`\`

The current testnet deployment and its source are on the [official links](/docs/links) page. The contract ships with 19 tests covering every authorisation path.

## What it does not do

A receipt cannot reach into a model that already trained on the data. Revoking stops future use and makes the withdrawal publicly checkable; it does not unlearn anything. That limitation is why the contract refuses consent without an end date — an expiry is the only honest guarantee available.`,
      },
      {
        slug: "wallet-sign-in",
        title: "Wallet sign-in",
        summary:
          "How a wallet proves it is yours, and why the database checks rather than the app.",
        body: `Connecting a wallet only asks it what address it holds. Anyone can claim any address, so connecting alone proves nothing.

Signing in makes the wallet prove it. The server issues a [SEP-10](https://stellar.org/protocol/sep-10) challenge — a transaction built on sequence 0, which no network will ever accept — your wallet signs it, and the server checks the signature and mints a session token carrying the proved address.

## Why the token is a Supabase JWT

Because then the database enforces ownership instead of the app remembering to.

Row-level security reads the wallet address out of the token and refuses to return anyone else's rows. If a query in this codebase forgot its \`where\` clause tomorrow, Postgres would still hand back only your rows. That is a meaningfully different guarantee from "the code filters correctly", which is a promise about every future change.

A stranger holding the public anon key reaches three aggregate views — protocol totals, average price per source, and an anonymous activity feed — and nothing else. No dataset row, no sale row, no file.

## Operators

Operators are named server-side in an environment variable. The browser is told whether it is an operator inside the signed token and never gets to decide, and the same claim is checked again by row-level security on every query the admin panel makes.

An earlier version of the admin panel read the allowlist in the browser. That hid the panel rather than defending it; it was replaced for a reason worth stating out loud.

## Settling a payout

Marking a sale as claimed requires a \`settle\` claim that only the payout route mints, for two minutes at a time. The token your browser holds never carries it.

So a contributor cannot record their own payout as settled with an invented transaction hash — the database will not accept the write, no matter what the client sends.`,
      },
      {
        slug: "data-sources",
        title: "Data sources",
        summary:
          "What you can contribute, what happens to the file, and what we never see.",
        body: `## The categories

A dataset is filed under one source category, and the same vocabulary runs end to end — the landing page, the dashboard, and the price averages all use it:

- Browsing & search
- Purchase history
- Health & wearables
- Location trails
- Streaming & media
- Voice samples
- Messaging metadata
- Dashcam & camera
- Something else

## What happens to a file

1. You pick it. Nothing has left your device yet.
2. The browser computes its SHA-256 with the Web Crypto API. This is the hash a consent receipt commits to.
3. The file uploads to a private bucket, at a path namespaced by your wallet address.
4. A metadata row records the title, category, size, content type and hash.

The cap is 50 MB per file, which is generous for a testnet demo and will move when there is a reason.

## What we do not do

We do not open the file, index its contents, or scrub it. That cuts both ways and you should know which way: nothing is redacted for you either. What is inside a file is yours to check before you send it.

## Connected sources

The dashboard has a Sources section for linking accounts and devices — browsing, health, purchases, media — each behind its own consent. **It is not wired up.** It is routed and named because that is the shape of the product, and it says plainly that it does nothing yet rather than showing an inviting empty state.

Direct uploads are the only way data enters the protocol today.`,
      },
      {
        slug: "payouts",
        title: "Sales and payouts",
        summary:
          "How a sale becomes an on-chain payment, and which half of that is simulated.",
        body: `## How a sale is recorded

There is no buyer side yet, so an operator stands in for it. From the admin panel a sale is created in one of two ways:

- **By hand.** Pick a dataset, pick a buyer from a placeholder roster, type a price. This is the path that becomes real pricing later.
- **A random round.** Pick a number of datasets and sell them at a price drawn between 1 and 10 XLM.

Either way the row records the dataset, its contributor, the buyer and the price, and the contributor now has a payout to claim.

> The buyer, the price band and the demand itself are invented. We run the simulation ourselves and label it everywhere it appears, because a number we made up is worse than no number when it is presented as a market.

## Money as integers

Prices are stored in stroops — 1 XLM is 10,000,000 of them — and never as a floating-point number. A value that has to match a ledger operation to the last digit has no business being a double, and rounding drift in money is the kind of bug that is only found by someone being underpaid.

## Claiming

Claiming is the only part of the product that moves value, so it is also the only place the treasury key is read. It lives on the server; the browser never sees it and never signs a payout.

The sequence:

1. The row is taken under a conditional update, moving it to a \`claiming\` state. Only the request that wins may continue, so a double-clicked button cannot pay twice.
2. If the destination account does not exist on testnet yet, the payment becomes an account creation with a reserve on top, so a first claim opens the wallet and lands the money in one transaction.
3. The transaction is signed, submitted, and its hash written back with a \`settle\` claim the browser cannot mint.
4. If the payment fails, the row returns to unclaimed and nothing is charged.

The wallet being paid is read from your session, not from the request body. A stranger cannot force someone else's payout out early.

## Verifying it

Every settled payout shows a transaction hash that resolves on a public explorer. The memo names the sale it settles. If this site disappeared tomorrow, the payments would still be there and still be checkable.

## The estimator

The landing page's earnings estimator quotes the average settled price per source category, computed from real sales. A category nobody has bought yet shows a dash instead of a number, which is the honest output and also, right now, most of them.`,
      },
    ],
  },
  {
    title: "For AI teams",
    pages: [
      {
        slug: "licensing",
        title: "Licensing data",
        summary:
          "What a buyer gets, what they can verify, and what does not exist yet.",
        body: `> **Read this first.** There is no catalogue, no cohort builder, no API and no delivery pipeline. You cannot buy data from Datavar today. What follows is what a licence is designed to be, and what already works well enough to check.

## What a licence is

A consent receipt, on-chain, naming you as the buyer, the dataset by its SHA-256, the purpose you agreed to, and the moment the permission ends.

That gives you three things a scraped corpus cannot:

- **Provenance.** Every record resolves to a wallet that agreed to it.
- **Purpose limits.** The receipt names what it was for, and a purpose you did not ask for is a receipt you do not hold.
- **An expiry.** Consent ends by default. Renewal is a new grant, not the absence of a revocation.

## Verifying without us

Call \`is_valid(id)\` on the contract. Anyone can, from any funded key, with no account here — see [consent receipts](/docs/consent-receipts) for the exact invocation.

This is deliberate. A warranty you have to ask the vendor to confirm is worth what the vendor is worth. This one is worth what the ledger is worth.

## Revocation

A contributor can withdraw consent at any time, and the receipt stops validating for everyone at once. There is no notification pipeline yet; the design assumes you re-check before a training run rather than trusting a webhook you did not receive.

Revocation cannot reach a model that has already trained. That is a real limit, stated plainly, and it is why every receipt has an end date.

## If you want this sooner

The catalogue and delivery are not built because we do not know what a buyer would actually pay for. If you would, tell us which cohort and what you would pay — that is worth more to us right now than another feature.`,
      },
    ],
  },
  {
    title: "Risk and status",
    pages: [
      {
        slug: "status",
        title: "What isn't real yet",
        summary:
          "The honest inventory, so nothing in this product has to be read carefully to be understood.",
        body: `Every product page in Datavar labels what it invented. This is the same list in one place.

## Simulated

- **Buyers.** Every buyer name in the product comes from a fixed roster we wrote. No AI team has licensed anything.
- **Demand.** Sales are recorded by an operator from the admin panel, by hand or in random rounds.
- **Prices.** The 1–10 XLM band is a placeholder with no market behind it. The per-category averages on the landing page are real averages *of simulated sales*.

## Real

- **The consent contract.** Deployed on Stellar testnet, 19 tests, verifiable by anyone.
- **Payouts.** A claim is a genuine Stellar payment with a hash you can look up. Test XLM, so no real value moves.
- **Sign-in.** SEP-10 challenge, signature checked, database-enforced row access.
- **The counts.** Contributors, datasets, payouts and totals are counted from rows, not typed in. When the protocol has done nothing, they are zeros and the page says zero.

## Not built

- Connected sources. The section exists and does nothing.
- A buyer catalogue, cohort builder, API or delivery.
- Mainnet. Everything is testnet; no real funds move.
- Fiat payouts. PayPal is planned, not live.

## Custody and trust

Uploaded files sit in a private bucket we operate. Consent is on-chain, but the data is not, and we could read a file if we chose to — we do not, and the honest framing is that this is a promise, not a proof, until content-level encryption exists.

The treasury is a single account holding a key on our server. It pays test XLM. Treat it as a demo of the settlement path, not as custody you would trust with money.`,
      },
      {
        slug: "security",
        title: "Security",
        summary:
          "Where the boundaries are, what holds them, and what we know is weak.",
        body: `## The database enforces ownership

Row-level security is on for every table, keyed to the wallet address inside your session token. The app does not filter and then hope; Postgres refuses.

- Datasets: you read your own, or all of them if you are an operator. There is no third case.
- Datasets: you can only file one as yourself. \`owner_wallet\` used to be whatever the browser claimed — it is now the address from your proved session.
- Sales: only operators create them. A contributor writing their own would be writing their own payout.
- Sales: only the payout route may mark one settled, using a short-lived claim a browser never receives.

There is no update or delete policy on datasets, so neither is possible for anyone.

## Files

The storage bucket is private, and objects live under \`<wallet>/<sha256>\`. The policies key off that first path segment, so a holder of the anon key cannot download someone else's file. Before that was true, any holder of the anon key could download every file anyone had uploaded, which was the worst thing in the schema and is worth naming rather than quietly fixing.

## Secrets

- The treasury key and the challenge-signing key are server-side, with no \`NEXT_PUBLIC_\` prefix. Only the routes that need them read them.
- The consent contract id, the treasury address and the Supabase anon key are public by design. An address is meant to be read, and verifying a receipt is meant to need nobody's permission.

## Rendered content

Markdown in blog posts and docs is rendered into React elements, never into an HTML string. There is no \`dangerouslySetInnerHTML\` anywhere, so the safety of a page does not depend on a sanitiser staying configured correctly forever. An author who types a script tag produces the characters of a script tag.

Links are checked before they render: anything that is not plainly http(s), \`mailto:\` or a path on this site is dropped and the label kept.

## Known weaknesses

- **Not audited.** Neither the contract nor the app has had an external review.
- **Testnet only.** No real value is at risk, which is also why the bar has not been tested by anyone hostile.
- **Files are readable by us.** See [what isn't real yet](/docs/status).
- **One treasury key.** No multisig, no rotation policy.

If you find something, the repository is on the [official links](/docs/links) page. We would rather hear it than not.`,
      },
    ],
  },
  {
    title: "Resources",
    pages: [
      {
        slug: "architecture",
        title: "Architecture",
        summary: "The pieces, and which of them can lie to you.",
        body: `## The stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS v4**.
- **Supabase** — Postgres for metadata and a private bucket for files. Row-level security does the enforcing.
- **Stellar** — testnet. Horizon for payments, Soroban for the consent contract.
- **stellar-wallets-kit** for the wallet connection, used headless: the wallet picker is ours, because the stock modal neither matches the product nor belongs in its DOM.

## What runs where

The browser holds no secrets. It connects a wallet, signs challenges and consent transactions, and reads whatever the database is willing to give its session.

The server holds three things: the challenge-signing key, the Supabase JWT secret used to mint sessions, and the treasury key. Only the routes that need each one import it.

The ledger holds consent receipts and payments. This is the layer that does not depend on us being honest, which is the point of putting anything there.

## Where the numbers come from

Protocol-wide figures read three aggregate views rather than the tables, because a landing page has no business pulling anyone's rows into a visitor's browser to count them. Postgres counts; four numbers come back.

Dashboard figures are computed in the browser from the rows your own session is allowed to read.

## Repository layout

\`\`\`text
src/app          routes: landing, dashboard, admin, blog, docs, api
src/components   one component per landing section; dashboard/ and admin/
src/lib          supabase clients, stellar config, auth, formatting
supabase         schema.sql — tables, policies, views, storage rules
contracts        the Soroban consent contract and its tests
\`\`\`

The schema file is idempotent and is the source of truth for what the database allows. If a claim on these pages disagrees with it, the schema is right and the page is wrong.`,
      },
      {
        slug: "links",
        title: "Official links",
        summary: "Everything you can verify, in one place.",
        body: `## Code

- Repository: [github.com/AtaGuler0/datavar](https://github.com/AtaGuler0/datavar)
- The consent contract source and its 19 tests live in \`contracts/\`.

## On-chain

- Consent contract, Stellar testnet: [\`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI\`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI)
- Explorer: [stellar.expert testnet](https://stellar.expert/explorer/testnet)
- Every settled payout links to its own transaction from the earnings page.

## Reading

- [Blog](/blog) — what we are building, and what we got wrong.
- [SEP-10](https://stellar.org/protocol/sep-10) — the sign-in standard used here.

## Getting testnet XLM

You do not need any to use the product: a first claim will open and fund your account. If you want some anyway, the [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test) creates and funds a testnet account.

## Contact

Open an issue on the repository. There is no support address yet, and pointing you at one that nobody reads would be worse than saying so.`,
      },
    ],
  },
];

/** Every page in reading order — the order the sidebar shows and Next follows. */
export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((group) => group.pages);

/** The index lives at /docs; everything else hangs off it. */
export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

/** The page before and after, for the footer links. */
export function docNeighbours(slug: string): {
  prev: DocPage | null;
  next: DocPage | null;
} {
  const i = DOC_PAGES.findIndex((page) => page.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? DOC_PAGES[i - 1] : null,
    next: i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : null,
  };
}
