-- Datavar — the first three posts.
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
)
on conflict (slug) do update set
  title        = excluded.title,
  excerpt      = excluded.excerpt,
  body         = excluded.body,
  author       = excluded.author,
  cover_url    = excluded.cover_url,
  cover_alt    = excluded.cover_alt,
  published_at = excluded.published_at;
