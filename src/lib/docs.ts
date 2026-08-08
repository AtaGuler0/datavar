/**
 * The documentation, as data.
 *
 * Pages are written here rather than stored in the database like blog posts,
 * and the difference is on purpose: a post is news and goes stale gracefully,
 * whereas docs describe the product in the same repository. Keeping them next
 * to it means a change that makes a page wrong shows up in the same diff.
 *
 * These explain the product to someone deciding whether to use it. Setup,
 * schema and contract internals belong in the READMEs, not here — a reader
 * who wants those is a different reader.
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
        title: "What Datavar is",
        summary: "The consented data layer for AI, built on Stellar.",
        body: `Your data already trains AI models. It is scraped, bought and resold, and the money stops somewhere before it reaches you.

Datavar is a data protocol where you contribute data on your own terms and get paid when it is used. Every dataset carries a consent receipt held on the Stellar ledger: who allowed it, for which buyer, for what purpose, and until when. An AI team can check that receipt without asking us, and you can withdraw it without asking anyone.

## The short version

1. Sign in with a Stellar wallet. No email, no password, no name.
2. Upload a dataset. It is hashed on your device before anything leaves it.
3. Grant consent — a named buyer, a named purpose, an end date — signed by your wallet.
4. When it sells, claim your payout in XLM, straight to your wallet.

## What makes it different

A data broker sells data you never knowingly handed over and keeps the proceeds. A privacy setting stops the collection and pays you nothing.

Here the terms live on a public ledger rather than in a contract nobody reads. Consent always has an end date, and only you can revoke it — both enforced by the contract itself, not by our policy.

> Datavar runs on Stellar testnet today. The consent contract and payouts are real and on-chain; the buyers are simulated while the demand side is built, so payouts settle in test XLM.

[How it works](/docs/how-it-works) walks through the whole path, from wallet to payout hash.`,
      },
      {
        slug: "how-it-works",
        title: "How it works",
        summary: "From connecting a wallet to a payout you can look up.",
        body: `## 1. Your wallet is your account

Connect a Stellar wallet and sign once to prove it is yours. That signature is your whole account — there is no email or password anywhere in the product, because none was ever collected.

## 2. Contribute a dataset

Pick a file and the category it belongs to. Your browser computes its SHA-256 before the file moves, and the file goes to private storage only you can reach.

That hash is what consent commits to later, so the protocol can name the exact data that was agreed to without exposing it.

## 3. Grant consent

Name a buyer, a purpose and an expiry date. Your wallet signs it, and the receipt becomes ledger state anyone can verify. Revoke it whenever you like and the ledger says so from that moment on.

See [consent receipts](/docs/consent-receipts).

## 4. Get paid

When a dataset is licensed, the payout is yours to claim. Claiming sends an XLM payment to your wallet and hands back the transaction hash, so you can check it on a public explorer rather than take our word for it.

See [getting paid](/docs/payouts).`,
      },
    ],
  },
  {
    title: "Contributing",
    pages: [
      {
        slug: "data-sources",
        title: "What you can contribute",
        summary: "The categories, and what happens to a file after you send it.",
        body: `## Categories

Every dataset is filed under one source category:

- Browsing & search
- Purchase history
- Health & wearables
- Location trails
- Streaming & media
- Voice samples
- Messaging metadata
- Dashcam & camera
- Something else

Rare, high-signal data is worth more than common data, so a category nobody else has covered is usually the more valuable upload.

## What happens to a file

Your browser hashes it first, then uploads it to private storage under your wallet's own path. A row records the title, category, size and hash — nothing else.

The limit is 50 MB per file.

## What we don't do

We don't open the file, index it, or scrub it. That cuts both ways, and you should know which way: nothing is redacted for you either. What's inside a file is yours to check before you send it.

## Connected sources

Linking accounts and devices directly — browsing, health, purchases, media — is the next thing being built. Direct uploads are how data enters the protocol today.`,
      },
      {
        slug: "consent-receipts",
        title: "Consent receipts",
        summary: "The terms live on the ledger, not in a document we control.",
        body: `A consent receipt says: *this contributor allowed this buyer to use the data with this hash, for this purpose, until this moment.*

If that lived in our database, a buyer would have to take our word for it and we could rewrite it. On the ledger, a buyer checks it themselves — no account with us, no permission — and neither side can quietly change what was agreed.

## Two rules the contract enforces

- **Consent always ends.** A grant without a future expiry is refused. There are no perpetual grants.
- **Only you can withdraw it.** Not the buyer, not us. Revoking ends the receipt while keeping the record of what was agreed.

These are code, not policy. That distinction is the whole reason for putting consent on a ledger.

## Verifying one

Anyone can ask the contract whether a receipt still stands:

\`\`\`bash
stellar contract invoke --network testnet --send=no \\
  --id CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \\
  --source <any-funded-key> \\
  -- is_valid --id 0
\`\`\`

The contract, its source and its tests are on the [links](/docs/links) page.

## What it can't do

A receipt can't reach into a model that already trained on your data. Revoking stops future use and makes the withdrawal publicly checkable; it doesn't unlearn anything. That limit is exactly why consent here has to expire.`,
      },
      {
        slug: "payouts",
        title: "Getting paid",
        summary: "Payouts settle in XLM, with a hash you can check yourself.",
        body: `When a dataset of yours is licensed, the payout appears on your earnings page as something to claim.

## Claiming

One press. Datavar sends the payment on Stellar and returns the transaction hash, which resolves on a public explorer whether or not this site is up.

If your wallet has never been used on Stellar before, the first claim opens the account and lands the payout in the same transaction — you don't need to fund anything to get started.

## Why XLM

A Stellar payment costs a fraction of a cent and settles in seconds, which is what makes a fifty-cent payout worth sending at all. On most rails the fee would eat it.

Fiat payouts through PayPal are planned.

## What a dataset earns

Rare data earns more than common data. The estimator on the home page quotes the average settled price per category, computed from real sales — a category nobody has bought yet shows a dash rather than a number we invented.

> Buyers are simulated while the demand side is built, and payouts settle in test XLM on Stellar testnet. The payment itself is real and on-chain; the demand behind it isn't yet.`,
      },
    ],
  },
  {
    title: "Enterprise",
    pages: [
      {
        slug: "licensing",
        title: "Licensing data",
        summary: "Provenance you can check against a ledger, not a warranty PDF.",
        body: `Scraped corpora have no answer to who agreed to them — the exact question a regulator or a plaintiff asks first. Buying from a broker moves the liability without answering it, because the broker's warranty is a document, and a document can't be checked against a ledger.

## What a licence is here

A consent receipt naming you as the buyer, the data by its hash, the purpose you agreed to, and the date the permission ends. That gives you three things a scraped corpus can't:

- **Provenance.** Every record resolves to a person who agreed to it.
- **Purpose limits.** The receipt names what it was for.
- **An expiry.** Consent ends by default; renewal is a new grant.

## Verify it without us

Call \`is_valid\` on the contract from any funded key. No account here, no API key. See [consent receipts](/docs/consent-receipts) for the exact call.

A warranty you have to ask the vendor to confirm is worth what the vendor is worth. This one is worth what the ledger is worth.

## Freshness

Contributors keep producing. Rather than a frozen snapshot of an internet that has moved on, you can commission a cohort that doesn't exist yet and have people opt in to produce it.

> The catalogue, cohort builder and delivery API aren't built yet — you can't buy data from Datavar today. If you'd want to, tell us which cohort and what you'd pay. That's worth more to us right now than another feature.`,
      },
    ],
  },
  {
    title: "Resources",
    pages: [
      {
        slug: "links",
        title: "Links",
        summary: "Everything you can go and check.",
        body: `## Code

- Repository: [github.com/AtaGuler0/datavar](https://github.com/AtaGuler0/datavar)
- The consent contract and its tests live in \`contracts/\`.

## On-chain

- Consent contract on Stellar testnet: [\`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI\`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI)
- Explorer: [stellar.expert testnet](https://stellar.expert/explorer/testnet)

Every settled payout links to its own transaction from the earnings page.

## Reading

- [Blog](/blog) — what we're building, and what we got wrong.

## Contact

Open an issue on the repository. There's no support address yet, and pointing you at one nobody reads would be worse than saying so.`,
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
