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
4. When it sells, your earnings are credited to you in a contract — claim them in XLM with your own signature.

## What makes it different

A data broker sells data you never knowingly handed over and keeps the proceeds. A privacy setting stops the collection and pays you nothing.

Here the terms live on a public ledger rather than in a contract nobody reads. Consent always has an end date, and only you can revoke it — both enforced by the contract itself, not by our policy.

The money works the same way. Your earnings sit in a payout contract, credited to your wallet, and only your signature moves them out. All we can do is record who money in the contract belongs to; we cannot pay it to ourselves, cannot move it back out, and cannot stop you claiming it.

> Datavar runs on Stellar testnet today. Both contracts — consent and payouts — are real and on-chain; the buyers are simulated while the demand side is built, so payouts settle in test XLM.

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

When a dataset is licensed, the payout is credited to your wallet in a contract on Stellar. Claiming signs a transaction with your wallet, the contract pays you, and you get back a hash you can check on a public explorer rather than take our word for it.

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
        body: `When a dataset of yours is licensed, the payout is written into a contract on Stellar and credited to your wallet. It shows on your earnings page as something to claim.

## Where the money sits

Not with us. There is no Datavar account holding payout money — there used to be, and closing it was the point. Earnings sit in the payout contract, and the contract has one rule about paying them out: it pays the wallet that signed the request. All Datavar can do is record who the money belongs to. It cannot pay itself, redirect a payout, move funds out, or stop you claiming yours.

That is the difference between being owed money and holding it. The contract refuses to credit a sale it can't cover, so a balance on your earnings page is money already sitting in the contract — not an IOU against an account you have to trust us with.

## Claiming

One press, then your wallet asks you to sign. The contract pays you and returns a transaction hash, which resolves on a public explorer whether or not this site is up.

Your wallet has to exist on Stellar to sign — the same requirement as granting consent. Testnet accounts open with [friendbot](https://friendbot.stellar.org) in a click.

## Why XLM

A Stellar payment costs a fraction of a cent and settles in seconds, which is what makes a fifty-cent payout worth sending at all. On most rails the fee would eat it.

Fiat payouts through PayPal are planned.

## What a dataset earns

Rare data earns more than common data. The estimator on the home page quotes the average settled price per category, computed from real sales — a category nobody has bought yet shows a dash rather than a number we invented.

> Buyers are simulated while the demand side is built, and payouts settle in test XLM on Stellar testnet. The contract and the payment are real and on-chain; the demand behind them isn't yet.`,
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
- Both contracts and their tests live in \`contracts/\`.

## On-chain

- Consent contract on Stellar testnet: [\`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI\`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI)
- Payout contract on Stellar testnet: [\`CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL\`](https://stellar.expert/explorer/testnet/contract/CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL)
- Explorer: [stellar.expert testnet](https://stellar.expert/explorer/testnet)

The payout contract will tell you what it holds and what it owes without asking us — \`funded\`, \`owed\` and \`balance_of\` are view calls anyone can simulate. Every settled payout links to its own transaction from the earnings page.

## Reading

- [Blog](/blog) — what we're building, and what we got wrong.

## Contact

Open an issue on the repository. There's no support address yet, and pointing you at one nobody reads would be worse than saying so.`,
      },
    ],
  },
  {
    title: "Legal",
    pages: [
      {
        slug: "terms",
        title: "Terms & Privacy",
        summary:
          "You licence your data, you don't sell it, and nothing promises you an income. Here is everything we hold.",
        body: `*Last updated: 27 August 2026. One document, because the two halves are the same subject: what you agree to, and what we hold. It covers datavar.ai, the contributor dashboard and the protocol contracts.*

Datavar is a marketplace for consented data. You contribute data you hold the rights to, you decide who may use it and for what, and you are paid when someone licenses it. Sections 1 to 11 are the terms of that arrangement. Sections 12 to 20 are the privacy half: what we collect, what we cannot see, and what the ledger keeps forever.

Where a rule below is enforced by code rather than by our word, it says so. Those are the ones you do not have to trust us on. If what you want to know is how much you will earn, read section 7 first.

Datavar Labs ("Datavar", "we", "us") operates the service. By connecting a wallet and using it you accept this document. If you do not accept it, do not connect a wallet.

## 1. Who this is between

You must be at least 18 years old and legally able to enter into a contract where you live. If you are contributing on behalf of a company, you confirm you are authorised to bind it.

## 2. Your wallet is your account

You sign in by proving you control a Stellar address. There is no email, no password and no recovery flow, because there is nothing for us to reset.

That has a hard consequence: **if you lose the key, you lose the account**, along with the datasets filed under it, the earnings credited to it and the receipts signed by it. We cannot move an account to a new address, and we cannot sign anything on your behalf. Anyone holding your key is you as far as the protocol is concerned.

## 3. What you may contribute

By contributing a file you represent, each time, that:

- You own it, or hold the rights needed to license it for the purposes you consent to.
- It does not contain personal data about other people unless you have a lawful basis to share it. A group photo, a message thread, a contact list and a call recording all fall here.
- It is not confidential to an employer, a client or anyone else, and contributing it breaks no agreement you are under.
- It is not unlawful to hold or to share, and contains no material depicting the abuse or sexual exploitation of children, no stolen credentials or payment data, and no malware.

We do not open, scan or filter files. That is a deliberate privacy choice (see section 14), and it means these representations are the only thing standing between the protocol and content that should not be in it. Breaking them is the fastest way to lose the account.

You keep responsibility for what a file contains. Nothing is redacted for you.

## 4. What you grant is a licence, not a sale

You keep ownership of everything you contribute. What a consent receipt grants a buyer is a **licence**: permission to use a named dataset, on named terms, for a while.

Every licence you grant is:

- **Named.** It runs to a specific buyer, not to the market.
- **Purpose-limited.** It permits the purpose written into the receipt and nothing else.
- **Time-limited.** Consent that never ends is refused by the contract itself. There are no perpetual grants on Datavar.
- **Non-exclusive.** You may license the same data to others, and you may use it yourself however you like.
- **Non-transferable.** A buyer may not resell, sublicense or pass the data on. If they want it for a different purpose or a longer period, that is a new grant, and yours to give or refuse.
- **Revocable.** You end it whenever you decide to.

You also grant Datavar a narrow licence: to store your file, to show it and its metadata back to you, and to deliver it to a buyer you have consented to. Not to train on it, not to publish it, not to sell it on our own account, not to pass it to anyone you have not named.

## 5. Revoking, and what revoking cannot do

Only you can revoke a receipt. Not the buyer, not us. That rule is in the contract, not in this document, which is why it is worth more than this document.

What revocation does: it ends the permission from that moment, publicly and verifiably, so a buyer continuing to use the data is doing so without consent.

What it cannot do: reach into a model that has already been trained. Nobody can unlearn data from a trained model, and any service that tells you otherwise is describing something it cannot deliver. This is exactly why consent here expires by default: a limit to weigh before you grant it, not after.

## 6. How payment works

When a dataset of yours is licensed, the price is credited to your address inside the payout contract on Stellar. It then works like this:

1. The contract refuses to record a credit it cannot cover, so a balance shown to you is money already in the contract, not an invoice we intend to honour.
2. You claim it by signing with your own wallet. The contract pays the address that signed. We cannot redirect it, cannot pay it to ourselves, and cannot stop you claiming it.
3. You get a transaction hash that resolves on a public explorer, whether or not this site is running.

Datavar does not take a cut of a sale today: the price a buyer pays is the amount credited to you. If that ever changes, the rate will be published here before it applies to any sale, and no change will reach back and reduce a balance you have already been credited.

The network fee for the claim transaction is yours, and on Stellar it is a fraction of a cent. Your account has to exist on the network to sign anything.

## 7. There is no guaranteed income

This is the part people skim, so it is stated plainly. **Datavar does not guarantee that you will earn anything.** Contributing data is not a job, an investment, or a promise of return.

Specifically:

- **There is no minimum.** No floor per file, per month or per year. Many datasets earn nothing at all, and a dataset nobody licenses earns nothing indefinitely.
- **There is no schedule.** Sales happen when a buyer wants a particular kind of data. Weeks or months may pass between them, or none may ever come.
- **Prices move.** What a category earned last month is what it earned last month. Rare, hard-to-find data has tended to be worth more than common data, and that is a tendency, not a rate card.
- **Estimates are estimates.** Any figure the site shows before a sale, whether the earnings estimator, a per-category average or a projection, is computed from past settled sales and is illustrative only. It is not an offer, a quote, a forecast or a commitment, and no part of it is payable to you until a real buyer licenses your data.
- **Totals shown are protocol-wide.** Aggregate figures on the home page and the protocol page describe network activity in total. They say nothing about what any one contributor will receive.
- **You are not our employee.** No employment, agency, partnership or joint venture is created by this document. There is no wage, no severance and no notice period; you contribute when you choose and stop when you choose.
- **Nothing here is financial advice.** Do not treat contributed data as an income stream you can plan around.

> Datavar runs on Stellar **testnet** today. Both contracts are real and on-chain, and payouts really settle in test XLM, which has **no monetary value and cannot be exchanged for money**. Buyers are simulated while the demand side is built. Anything you claim today is a working demonstration of the payment path, not income, and test balances carry no promise of future tokens, airdrop or conversion.

## 8. Taxes

Any tax on what you receive is yours to declare and to pay, under the rules of wherever you live. We do not withhold tax, issue tax documents, or advise on them.

## 9. What you must not do

Do not contribute data you have no right to, or data about other people who have not agreed. Do not fabricate or pad datasets to game category pricing. Do not attempt to impersonate another wallet, interfere with the contracts, or extract data belonging to other contributors. Do not use the service where doing so would break the law that applies to you.

## 10. Suspension and ending the arrangement

You can walk away at any time: revoke your receipts and stop contributing. Balances already credited to you in the contract stay claimable: the contract does not have a switch that would let us take them back.

We may suspend or close an account that breaks section 3 or section 9, or where we are required to by law. Where we can do so without making things worse, we will say why.

We may also change or discontinue parts of the service. Consent receipts and credited balances live on-chain and survive us: a receipt stays verifiable and a credited balance stays claimable whether or not this website exists.

## 11. If you are licensing data

A licence you take is defined by the receipt on the ledger: the dataset by its hash, you as the named buyer, the purpose, the expiry. Using the data outside that purpose, past that date, or after revocation is use without consent, and the ledger records enough for anyone to establish that. Data you license may not be resold, sublicensed or redistributed.

## 12. What we collect

Most privacy policies describe how much a company collects. This part mostly describes how little it can.

- **Your Stellar address.** It is your whole account. You prove you hold the key by signing a challenge; we store the address, never the key.
- **Dataset records.** For each file: a title, a category, your description if you write one, the size, the content type, the SHA-256 hash, the storage path and the time it arrived.
- **The file itself,** in private storage, under a path beginning with your own address.
- **Sale and payout records.** Which dataset was licensed, to which buyer, at what price, and the transaction hash once you claim.
- **Ordinary technical logs** kept by the hosting and database providers that run the service (IP address, timestamp, request), used to operate and secure it.

## 13. What we don't collect

No email address, no name, no phone number, no password, no date of birth. No tracking cookies, no analytics script, no advertising pixel, no third-party tag anywhere on the site.

Your session is a signed token in your browser's local storage. It is not a cookie, it is not shared, and clearing your browser data ends it.

There is nothing here to sell to an ad network. That is deliberate for a company whose argument is that data should be licensed with consent rather than harvested.

## 14. Your files

We do not open, read, index, scan or scrub the files you contribute. Two things follow, and the second is on you:

- We cannot build a profile of you out of them, and cannot hand a regulator or a buyer contents we have never looked at.
- Nothing is redacted for you. What is inside a file stays inside it. Check a file before contributing it. See [what you can contribute](/docs/data-sources).

Isolation is enforced by the database rather than by application code remembering to check: row-level security matches every dataset row and every stored object against the wallet inside your signed session, so one contributor cannot read another's rows or files. Operators can see dataset records in order to run the marketplace.

## 15. What the ledger makes public, permanently

A consent receipt is a public record. Granting consent writes your address, the dataset's hash, the named buyer, the purpose and the expiry to the Stellar ledger. Revoking writes that too. The file never goes on-chain; the hash does. Treat the rest as public forever:

- **Ledger entries cannot be deleted.** Not by you, not by us. Revocation ends a receipt going forward; it does not erase the record that it existed.
- **Your address and its payments are public.** Anyone can look up what a wallet has been paid, and any address you have made public elsewhere links back to it.
- **Aggregates count contributors through a hash** of the address rather than the address itself, on the home and protocol pages. The ledger underneath stays public regardless, so this is tidiness, not anonymity.

If you want distance between your name and your contributions, use an address that is not tied to your identity anywhere else.

## 16. Who your data reaches

Infrastructure providers who store and serve it: our database and object-storage provider, our hosting provider, and the public Stellar network. Buyers reach a dataset only through a consent receipt you signed, naming them.

We do not sell your data, rent it to brokers, or hand it to anyone else, including advertisers and data-enrichment services. We disclose data to authorities only where a valid legal order compels it, and where we are permitted to tell you, we will.

## 17. Keeping and deleting

Dataset records and files are kept while your account exists so you can see and license them. Sale and payout records are kept as the accounting history behind money that moved on a public chain.

**There is no delete button in the dashboard yet.** That is a gap in the product, not a policy, and saying so is better than pointing you at a control that does not exist. Until it ships: write to [support@datavar.xyz](mailto:support@datavar.xyz), name the wallet, and we will verify it by asking you to sign a challenge with that wallet, then delete the file, the record, or the whole account.

What deletion cannot touch: receipts already on the ledger (revoke them instead: that is the on-chain equivalent, and it is yours to do without asking us) and data a buyer already received under a valid licence.

## 18. Your rights

Wherever you live, you can ask us to give you a copy of the records we hold about your wallet, correct them, delete them, or restrict what we do with them, and you can withdraw consent at any time. For on-chain consent, that means revoking, which needs nobody's approval but yours. Depending on where you live, you may also have the right to complain to a data-protection authority.

Requests go to [support@datavar.xyz](mailto:support@datavar.xyz) and are answered within 30 days. Because a wallet is the only identity we hold, we verify a request by asking you to sign with it.

## 19. Children

The service is for adults. It is not directed at anyone under 18, and we do not knowingly hold data from or about children. If you believe a contributed dataset contains a child's personal data, tell us and we will remove it.

## 20. Security, and its limits

Files sit in a private bucket reachable only through your signed session. Sessions are short-lived signed tokens. The operator allowlist lives on the server, never in the browser. Contract keys are held server-side and never shipped to a client.

No system is perfectly secure, and this one is early software running on Stellar testnet. Do not contribute anything whose exposure you could not live with.

## 21. Beta, warranties and liability

The service is early software and is provided **as is**, without warranties of any kind, express or implied. We do not warrant that it will be uninterrupted, error-free or secure, or that a dataset will ever sell.

To the maximum extent the law allows, Datavar is not liable for indirect, incidental, special or consequential damages, or for lost profits, lost earnings or lost data. Our total liability for any claim relating to the service is capped at the total amount actually paid out to you through the protocol in the twelve months before the claim.

Nothing here excludes liability that cannot lawfully be excluded, including for fraud or for death or personal injury caused by negligence. If a consumer-protection law where you live gives you rights this document cannot remove, those rights stand.

## 22. Changes

We may update this document. Material changes will be posted here with a new date before they take effect, and continuing to use the service after that is acceptance. A change never applies retroactively to a receipt you have already signed or a balance already credited to you. What is already on the ledger is unaffected either way, which is rather the point of putting it there.

## 23. Governing law

This document is governed by the law of the jurisdiction in which Datavar Labs is established, and the courts of that jurisdiction hear any dispute arising out of it, subject to the sentence that follows. If you are a consumer, nothing here removes the protection of the mandatory law of the country you live in, or your right to bring a claim before your local courts. Before either of us goes to a court, write to [support@datavar.xyz](mailto:support@datavar.xyz) and give us thirty days to settle the matter; we will do the same before taking any step against you.

A ruling about this document does not reach the ledger. Consent receipts and credited balances are enforced by the contracts on Stellar, and no judgment about these terms can revoke a receipt you signed or move a balance already credited to you.

## 24. Contact

[support@datavar.xyz](mailto:support@datavar.xyz), or an issue on the [repository](https://github.com/AtaGuler0/datavar).

See also: [consent receipts](/docs/consent-receipts), the rule this whole document defers to.`,
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
