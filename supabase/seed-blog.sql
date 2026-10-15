-- Datavar — the first four posts.
--
-- Run after schema.sql, in the same SQL editor. Idempotent: re-running it
-- overwrites these by slug and leaves everything else alone, so it is safe to
-- run again after editing the text here.
--
-- Posts are normally written in /admin/blog. These are seeded instead because
-- they are part of the change they describe and belong in the same review as
-- the code.

insert into public.posts
  (slug, title, excerpt, body, author, cover_url, cover_alt, published_at)
values (
  'we-deleted-our-own-numbers',
  'We deleted our own numbers',
  'The front of this site claimed 128,400 contributors and $4.2M paid out. Both were placeholder text nobody remembered to take out.',
  $body$
Until this week the front page of this site said that 128,400 people had been paid, that $4.2M had gone out to them, and that they were spread across 41 countries. Underneath sat a chart of 128 dots, one for every thousand contributors, captioned "The crowd, so far".

The real figures were zero, zero and zero. Nobody had contributed anything, because nobody could yet.

## How it got there

The numbers went in as placeholder text while the page was being designed. That part is ordinary. What is not ordinary is leaving them in, and they survived for a reason worth naming: a section called "The crowd, so far" reads terribly with a zero in it. Every time somebody opened the page, they saw a section that worked.

That is the failure mode. A placeholder that looks wrong gets replaced. A placeholder that looks good gets shipped.

## Why it mattered more here

We are asking people to hand over data on the strength of a promise: that we will be straight with them about who uses it and what it earns. Anyone who checks the first checkable claim on the page and finds nothing behind it has learned what they need to know about every claim after it.

The awkward part is that we would have argued the numbers were obviously illustrative. Nothing on the page said so.

## What replaced them

The counters read from the database now. Contributors, datasets, payouts settled and total paid all come from a Postgres view that counts rows. The earnings estimator quotes what datasets in each category have actually sold for, averaged over real sales, in XLM.

Two behaviours matter more than the numbers themselves. When a category has no sales, the estimator shows a dash and says there is nothing to average yet. When the query fails, every figure falls to zero. It never falls back to a number, because a fallback number is an invented one with extra steps.

## The rest of the sweep

Pulling on one thread found others.

- A scrolling wall of client logos, for clients we do not have. It now names where the people building this worked before, which is checkable.
- A footer line reading "SOC 2 Type II". That is an audited certification, not a posture, and we do not hold one.
- Twenty footer links and three social accounts, all pointing at the top of the page. The ones with a destination got it. The rest stopped being links.
- An FAQ describing identity stripping at ingestion, buyers notified within 24 hours, and $20 to $60 a month. None of those exist. It has been rewritten to answer for the product that does.

## The rule now

No number appears on this site without something behind it, and no failure path invents one. Where a thing is not built, the page says it is not built. That reads worse today. It is the only version that survives being checked.
$body$,
  'Datavar',
  null,
  null,
  '2026-08-08T09:00:00Z'
), (
  'consent-is-a-contract-now',
  'Consent is a contract now',
  'Our receipts page spent weeks promising records "once they are on-chain". As of this week they are, on Stellar testnet, and anyone can check one without going through us.',
  $body$
The contributor dashboard has had a page called Consent since the first week. Until now it held an empty state and a promise: receipts would appear once they were on-chain, and the protocol would enforce them rather than a PDF nobody reads.

There was no protocol. No contracts directory, no Rust, not one Soroban call anywhere in the repository. The strongest claim in the product was the one thing that had not been built.

It is built now.

## What a receipt is

A receipt records that one contributor allowed one buyer to use the record with one hash, for a stated purpose, until a stated date. It lives in contract state on Stellar rather than in a table we own.

That difference is the whole argument. A buyer can check a receipt without an account with us, without an API key, and without taking our word that the row has not been edited since. They call `is_valid` on the contract and get an answer we are not standing between them and.

The hash in the receipt is the SHA-256 your browser computes before the file leaves your device, so the record commits to exactly what was shared without exposing any of it.

## Two rules the contract enforces

**Consent always ends.** `grant` refuses an expiry that is not in the future, so there is no way to write a perpetual grant. Consent without an end date is the thing this product exists to argue against, and a rule that lives in a contract is harder to quietly relax than one that lives in a policy document.

**Only the person who gave it can take it back.** Not the buyer, not an operator, not us. We checked this rather than assuming it: on testnet we signed a revocation of somebody else's receipt with our own admin key and submitted it. The transaction failed and the consent stayed standing.

Revoking keeps the record. The terms and the moment of withdrawal both stay readable afterwards, because "what was allowed, and when did it stop" is a question both sides eventually need answered.

## What it cannot do

It cannot reach into a model that has already trained on the data. Nothing can, and any product telling you otherwise is selling you a story. What expiry buys is a bounded window rather than an open one, which is a smaller promise and a real one.

## What is still not real

The buyer is a simulation we run ourselves. Prices are placeholders. Everything above runs on Stellar testnet, where the XLM is play money and the payouts, though genuinely settled on-chain, settle in it.

So this is one piece of a protocol rather than the protocol. It happens to be the piece the rest of it rests on.

## Check it yourself

The contract is at `CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI` on Stellar testnet, and the source is in the repository under `contracts/`. Nineteen tests cover it, including every path where somebody who should not be able to revoke a receipt tries to.

There is an `upgrade` entrypoint, deliberately, from the first deployment. Retrofitting one means a new address and a migration for every change, and we have paid that bill before.
$body$,
  'Datavar',
  null,
  null,
  '2026-08-08T15:00:00Z'
), (
  'anatomy-of-a-consent-receipt',
  'Anatomy of a consent receipt',
  'One receipt, field by field, and the three parties who can touch it. Every line of this is readable on testnet right now, by you, without asking us.',
  $body$
We announced the consent contract last week without showing anyone what is actually in a receipt. This is that, field by field, using a real one from testnet rather than a description of an ideal one.

## Seven fields

Receipt 3, read straight off the contract:

- `id` is 3. Assigned by the contract, and what everything else quotes.
- `contributor` is `GDBN…MI5H`. The only key that can withdraw this.
- `buyer` is `GCCG…4XWA`. Named, not consulted: a grant needs one signature and it is not theirs.
- `dataset_hash` is `ae52eb3727…`
- `purpose` is "Speech model fine-tuning". Plain words, capped at 200 characters.
- `expires_at` is 6 November 2026.
- `revoked_at` is empty, so the consent stands.

Three of those do work worth explaining.

`dataset_hash` is a SHA-256 your browser computes before the file leaves your device. It is what the receipt commits to, which means the record can prove exactly which bytes were covered without anyone holding those bytes. If a buyer later shows up with a file, you can hash it and see whether it is the one you agreed to.

`expires_at` is required, and required to be in the future. There is no field to leave blank and no flag for "forever". A grant that has already ended cannot be written at all, which sounds like an edge case and is really the rule stated in code.

`revoked_at` is empty until you withdraw, and then it holds the moment you did. It is set rather than deleted. Deleting would answer "is this consent live" and destroy the answer to "when did it stop", and the second question is the one that comes up in an argument.

## Who can touch it

Three parties, and the contract decides between them rather than our code.

**The contributor** can `grant` and `revoke`, signing with their own key. What they cannot do is untrain a model, which is why every grant carries an end date.

**Anyone at all** can call `is_valid`, `receipt` and `receipts_of`. No account, no API key, no request to us. This is the part that justifies the whole design: a buyer deciding whether they may use a record gets the same answer our own dashboard gets, from the same place, at the same moment.

**We, and operators** hold the admin key. It upgrades the contract code and does nothing else. That is the claim we would most like you to check rather than believe, so we checked it too: a revocation of somebody else's receipt, signed with the admin key, failed on-chain and the consent stayed standing.

## Doing it yourself

If you have the Stellar CLI, nothing below needs an account with us.

```
stellar contract invoke --network testnet --send=no \
  --id CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \
  --source <any-funded-key> \
  -- receipt --id 3
```

Swap `receipt` for `is_valid` and you get a plain true or false. Swap it for `receipts_of` and you get a page of everything one wallet has granted.

## What this does not settle

A receipt proves what was agreed. It does not prove what a buyer did afterwards, and no ledger entry can. What it changes is who has to be trusted for the first half of that sentence, which used to be us and is now nobody.

The buyer side is still simulated, and all of this is testnet. The contract is not.
$body$,
  'Datavar',
  null,
  null,
  '2026-08-08T18:00:00Z'
), (
  'data-got-expensive-the-people-who-make-it-still-get-nothing',
  'Data got expensive. The people who make it still get nothing.',
  'Where Datavar came from, what a row of personal data has been worth over twenty years, and the plumbing that has to exist before anyone is paid for theirs.',
  $body$
Datavar started because somebody asked for it.

The people building it came from io.net and Hacken. io.net rents out GPUs to teams training models, and working there shows you where the bottleneck in AI actually sits. Compute is a commodity. You can rent an H100 by the hour from a dozen suppliers, and the price drops every quarter. Data never went the same way. Nobody runs a spot market for a hundred thousand hours of consented speech, and there is no quick way to buy it that a lawyer will sign off on.

Hacken audits smart contracts, which teaches a narrower lesson: a claim and a checked claim are different things. Audits exist because "trust us" stopped working as a security model, and crypto learned that before anyone else, mostly by losing money.

Someone who knew both worlds asked whether we could build a data protocol. The ask was specific. What a person agreed to should be written down somewhere neither the buyer nor the seller can quietly edit afterwards. We said yes, and most of the time since has gone on finding out which parts of that we had underestimated.

## What data used to be worth

![Three eras of what a record of personal data has been worth: byproduct, inventory, input.](/illustrations/data-got-expensive/three-eras.svg)

For most of the internet's life your data was exhaust. It got produced on the way to something else, kept because storage was cheap, and sold by pointing ads at it. Clive Humby called data the new oil in 2006. People tend to drop the second half of his point, and it's the useful half: oil is worth nothing until somebody refines it.

Then language models refined it. Train a model on a trillion tokens and text becomes a product, and the pile suddenly had a price.

## What data is worth now

![Content flows from people to a platform to an AI lab. Money flows back from the lab to the platform and stops before it reaches the people.](/illustrations/data-got-expensive/where-money-stops.svg)

In 2024 Reddit licensed its content to Google for a reported $60 million a year, and signed a separate deal with OpenAI a few months later. News Corp's agreement with OpenAI was reported at more than $250 million over five years. Shutterstock booked over $100 million in AI licensing revenue in 2023. These are real prices, negotiated by lawyers on both sides.

Look at who sits at that table: the platform and the lab. The people who wrote the posts are the inventory, and they aren't a party to the sale.

It's easy to call that theft, and it's slightly wrong. The reason it happens can be fixed, so it's worth getting it right. Nothing records who agreed to what. Without that record the smallest unit anyone can sell is the whole platform, and the only party who can sell it is the platform. Nobody is holding your contribution back from the deal. The deal has no way to express it.

## What data is about to be worth

![A rising curve of tokens per frontier training run meets the finite stock of public human text somewhere between 2026 and 2032.](/illustrations/data-got-expensive/supply-and-demand.svg)

Epoch AI has estimated the effective stock of public human text at around 300 trillion tokens. They project that training runs reach datasets of that size somewhere between 2026 and 2032, most likely around 2028.

You can argue with the estimate. The direction is harder to argue with. Compute gets cheaper every year, and people write about as much as they always have.

When the free text runs thin, a lab can train on synthetic data, which means a model learning from its own output, and there's a growing literature on how that goes wrong. It can reach for data that is private today, which is where email and messages live. Or it can pay people for data that doesn't exist yet.

Only the last of those gets better with time, and nobody has built the plumbing for it. Paying people at scale means answering a question nothing answers today. Who agreed to what, for which buyer, for what purpose, and until when? And can the buyer check the answer without trusting the seller?

That's the part we're building.

## How Datavar works

![Five steps from a file on your device to a payout: hash, signed grant, ledger receipt, public check, payment.](/illustrations/data-got-expensive/receipt-flow.svg)

Your Stellar wallet is your account. You sign once to prove it's yours, and there is no password anywhere in the product. You can sign in with Google too, but only as a second door to a wallet you've already attached. Google can't sign anything on your behalf.

When you add a file, your browser computes its SHA-256 before anything uploads, and reads the file's own headers. Files that say they were generated by an AI, screenshots, blank images and duplicates are turned away before they leave your machine.

To sell a dataset you grant consent to a named buyer, for a stated purpose, until a date you pick. Your wallet signs it, and the grant becomes a receipt in a Soroban contract on Stellar instead of a row in our database. The contract enforces two rules on its own. Consent always has an end date, and only the person who granted it can withdraw it. We tried to break the second rule on testnet with our own admin key. The transaction failed and the receipt stayed where it was.

That's why it lives on a ledger. A buyer who wants to know whether they may use a record calls `is_valid` on the contract and gets the same answer our dashboard gets. They don't need an account with us, and they don't have to take our word that nothing changed.

Listing a dataset in the marketplace works the same way. You grant consent to the marketplace's address, so a listing is ledger state, and taking it down is a revoke. A buyer pays for a whole basket with one signature, in XLM or USDC. Before a licence is written, our server reads every consent receipt in the basket back from the chain, and a licence can't outlive the consent behind it. If you withdraw, the next delivery stops.

When something sells, the money goes into a payout contract. You claim it with your own signature, and the payment shows up on a public explorer like any other.

The consent contract is at `CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI` on Stellar testnet, and the source is in the repository. The full walkthrough is in [the docs](/docs/how-it-works).

All of this runs on testnet. Purchases settle in test XLM and test USDC, so nobody has paid real money for anything yet.

## Why Stellar

A consent receipt has to be cheap to write and cheap for a stranger to read, and it has to settle fast enough that a buyer can check one inside a single request. A two-dollar payout still has to be worth sending after fees. Those two needs are why the contract sits in Soroban and not in a Postgres table we control. A table we own settles nothing, because the whole question is what happens when someone stops trusting us.

## What has to be true a year from now

- The simulated buyers are gone from the repository, and a real buyer has licensed a real dataset.
- The contracts are on mainnet, and a contributor has been paid XLM or USDC they can spend.
- Someone outside the company has verified a receipt from our published docs, without asking us how.
- One person has been paid for data because they agreed to it, and can name the buyer, the purpose and the date the permission runs out.

The last one is the product. The rest is machinery for making it possible.

Until then this is a testnet protocol with a market that hasn't seen real money. We'd rather say so here than have you find it out.
$body$,
  'Datavar',
  '/illustrations/data-got-expensive/cover.png',
  'Data got expensive. The people who make it still get nothing.',
  '2026-08-08T12:00:00Z'
)
on conflict (slug) do update set
  title        = excluded.title,
  excerpt      = excluded.excerpt,
  body         = excluded.body,
  author       = excluded.author,
  cover_url    = excluded.cover_url,
  cover_alt    = excluded.cover_alt,
  published_at = excluded.published_at;
