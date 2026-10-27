# Datavar's contracts

Three contracts:

- [Consent receipts](#consent-receipts): what a contributor agreed to, in
  ledger state.
- [Payout vault](#payout-vault): contributor earnings, which leave only with
  the contributor's signature.
- [Licences](#licences): a buyer's purchase, held for a short period so a
  revocation can be refunded, then paid into the vault minus the protocol fee.
  Written and tested, not deployed yet.

## Consent receipts

A consent receipt says that this contributor allowed this buyer to use the
record with this hash, for this purpose, until this time. If it lived in a
table we own, a buyer would have to take our word for it and we could change
it. On the ledger, a buyer can check it without an account or an API key, and
neither side can change what was agreed.

The contract enforces two rules:

- Consent always ends. `grant` refuses an expiry that is not in the future.
- Only the contributor can withdraw it. The buyer and the admin can't. The
  admin key can upgrade the code and hand that right on, and nothing else.
- New code waits a week. The admin proposes it, the hash is on the ledger for
  seven days, and only then can `upgrade` apply it.

## Layout

```text
contracts/
├── contracts/consent/
│   ├── src/lib.rs      # the consent contract
│   ├── src/test.rs     # 19 tests, including every authorisation path
│   └── Cargo.toml
├── contracts/payout/
│   ├── src/lib.rs      # the payout vault
│   ├── src/test.rs     # 28 tests, one per invariant and per authorisation path
│   └── Cargo.toml
├── contracts/licence/
│   ├── src/lib.rs      # purchases, hold, fee, refund on revocation
│   ├── src/test.rs     # 19 tests, run against the real consent and payout contracts
│   └── Cargo.toml
├── Cargo.toml          # workspace
└── README.md
```

## Interface

| Function | Who may call it | What it does |
|---|---|---|
| `grant(contributor, buyer, dataset_hash, purpose, expires_at)` | the contributor, signed | Records a receipt, returns its id |
| `revoke(id)` | the receipt's contributor, signed | Ends it; the record and its terms stay |
| `is_valid(id) -> bool` | anyone | Not revoked, not expired. Unknown ids answer `false` |
| `receipt(id) -> Receipt` | anyone | The full terms; errors on an unknown id |
| `receipt_ids(contributor)` / `receipt_count(contributor)` | anyone | The contributor's index |
| `receipts_of(contributor, start, limit)` | anyone | One page of receipts, which is what the dashboard reads |
| `propose_upgrade(new_wasm_hash)` | admin, signed | Announces new code; returns when it can be applied, seven days on |
| `pending_upgrade()` | anyone | The announced hash and when it can be applied, or nothing |
| `cancel_upgrade()` | admin, signed | Drops the announced code |
| `upgrade(new_wasm_hash)` | admin, signed | Swaps in the announced code, and only once its seven days have passed |
| `set_admin(new_admin)` | admin, signed | Hands over that right |

`dataset_hash` is the SHA-256 that the upload flow computes in the browser
before the file leaves the device. The receipt commits to the exact bytes
without containing them.

`upgrade` has been there since the first deployment. Adding it later would have
meant a new address and a migration. The seven-day wait came later: every
proposal emits `upgrade_proposed` with the new code's hash, so anyone relying on
the contract can read that code before it runs. The same wait applies in the
payout and licence contracts, where it gives a contributor a week to claim a
balance before code they don't trust holds it.

## Working on it

```bash
cargo test              # 72 tests across the three contracts, no network needed
cargo fmt --all
cargo clippy --all-targets
stellar contract build  # → target/wasm32v1-none/release/{consent,payout,licence}.wasm
```

## Releasing and upgrading

A `v*` tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml):
`cargo test`, then Stellar Expert's
[soroban-build-workflow](https://github.com/stellar-expert/soroban-build-workflow)
builds each contract, publishes the wasm as a GitHub release with a build
attestation, and reports its hash so the deployed contract shows as verified
source. The package versions in each `Cargo.toml` should match the tag.

To move a deployed contract onto a release, upload that release's wasm and
propose its hash; seven days later, apply it:

```bash
stellar contract upload --wasm consent_v0.1.0.wasm \
  --source datavar-admin --network testnet          # prints the hash

stellar contract invoke --id <contract-id> --source datavar-admin --network testnet \
  -- propose_upgrade --new_wasm_hash <hash>

# seven days later
stellar contract invoke --id <contract-id> --source datavar-admin --network testnet \
  -- upgrade --new_wasm_hash <hash>
```

A contract still on code from before the wait existed has a one-step
`upgrade` and moves straight to the release; from then on every upgrade waits.

## Deploying

```bash
stellar keys generate datavar-admin --network testnet --fund

stellar contract deploy \
  --wasm target/wasm32v1-none/release/consent.wasm \
  --source datavar-admin --network testnet \
  -- --admin "$(stellar keys address datavar-admin)"
```

Put the contract id it prints into `NEXT_PUBLIC_CONSENT_CONTRACT_ID` in the
app's `.env.local`. The id is public, since anyone should be able to verify a
receipt.

The current testnet deployment is
[`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI).

## Checking it yourself

You can check a receipt without our dashboard:

```bash
stellar contract invoke --network testnet --send=no \
  --id CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \
  --source <any-funded-key> \
  -- is_valid --id 0
```

---

# Payout vault

Before this contract, a contributor's earnings were a row in our database and a
payment our server chose to send. We could lose the row or decline to send the
payment. Now the test XLM for payouts sits in the contract, and only the
contributor's own key can move it to them.

There are three roles:

- An operator can record that a wallet is owed an amount. It can't pay anyone,
  pay itself or take a credit back. There can be up to ten operators. The role
  started as one server key, and a team of two or three needs that many wallets
  able to credit without sharing a key. Each credit names the operator signing
  it, and the contract checks the name against the set.
- The contributor calls `claim` with their own signature and the balance goes
  to their wallet. Nobody else can claim for them, and neither an operator nor
  the admin can stop them.
- The admin upgrades the contract and can withdraw surplus, meaning funds
  beyond what is currently owed. Money credited to a contributor is out of the
  admin's reach.

## Invariants

Each has a test:

1. A credit is always funded. `credit` fails if it would push the total owed
   past what the contract holds, so a balance shown to a contributor is money
   already in the vault.
2. A credited balance is always claimable. This follows from (1) and from
   `withdraw` only touching surplus. The dashboard can't show 41 XLM while the
   claim fails for lack of funds.
3. A sale is credited once. Each credit carries the sale's reference,
   `sha256(sale_id)`, and the contract remembers it, so retrying a failed batch
   can't pay twice.

## Interface

| Function | Who may call it | What it does |
|---|---|---|
| `fund(from, amount)` | anyone, signed | Moves tokens into the vault |
| `credit(operator, contributor, amount, reference)` | an operator, signed | Records one sale as owed |
| `credit_many(operator, credits)` | an operator, signed | The same for a sale round, all or nothing |
| `claim(contributor)` | the contributor, signed | Pays their whole balance out |
| `balance_of(contributor)` | anyone | What that wallet can claim right now |
| `is_credited(reference)` | anyone | Whether that sale is already on the ledger |
| `operators()` / `is_operator(who)` | anyone | Who may credit |
| `funded()` / `owed()` / `surplus()` | anyone | What it holds, owes, and has spare |
| `withdraw(to, amount)` | admin, signed | Takes back surplus only |
| `add_operator(operator)` / `remove_operator(operator)` | admin, signed | Changes who may credit |
| `propose_upgrade` / `pending_upgrade` / `cancel_upgrade` / `upgrade` / `set_admin` | as in the consent contract | Seven days between proposing code and applying it |

The token is fixed at deployment. Ours is the native XLM SAC, but the contract
doesn't assume that. There is no way to change the token, because doing so
would strand every balance credited in the old one.

## Deploying

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payout.wasm \
  --source datavar-admin --network testnet \
  -- --admin "$(stellar keys address datavar-admin)" \
     --operator "$(stellar keys address datavar-operator)" \
     --token "$(stellar contract id asset --asset native --network testnet)"
```

The `--operator` here is the first one. Add others from the operator panel or
with `add_operator`. A contract deployed before the operator set existed needs
no migration: `operators()` returns the original operator until the first
`add_operator` writes the set.

Put the contract id into `NEXT_PUBLIC_PAYOUT_CONTRACT_ID`, then move test XLM in
from the operator panel, or:

```bash
stellar contract invoke --id <contract> --source <any-funded-key> \
  --network testnet -- fund \
  --from "$(stellar keys address <any-funded-key>)" --amount 5000000000
```

The current testnet deployment is
[`CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL`](https://stellar.expert/explorer/testnet/contract/CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL).

## Checking it yourself

To check what you are owed without the earnings page:

```bash
stellar contract invoke --network testnet --send=no \
  --id CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL \
  --source <any-funded-key> \
  -- balance_of --contributor <your-address>
```

`funded` and `owed` show whether the vault can cover what it owes everyone.

---

# Licences

Before this contract, a purchase was a `fund` call on the vault plus a row in
our database. The ledger saw money arrive and nothing about what it bought, and
a buyer whose contributor revoked the next day had no recourse. The licence
contract records the purchase and holds the money for a short time first.

1. `purchase(buyer, items)` checks each item's receipt on the consent contract
   (it must exist, not be revoked and not be expired), takes the whole basket
   in one transfer from the buyer, and records one licence per item. The fee is
   fixed at this point from `fee_bps`. Each item carries a sale reference, which
   is later used as the vault credit reference.
2. The money stays in the licence contract until `due_at`: `purchased_at +
   hold`, or the receipt's expiry if that is sooner.
3. `settle(id)` or `settle_many(ids)` closes licences, and anyone can call
   them. If the receipt was revoked before `due_at`, the buyer is refunded the
   share of the price for the unused term, and the contributor and the fee keep
   the share for the time used. Otherwise, once `due_at` has passed, `price -
   fee` goes into the vault as a credit for the contributor and the fee goes to
   the treasury.

Money that has reached the vault never comes back, so a revocation after the
hold refunds nothing and the vault keeps its rule that a credited balance is
always claimable.

The licence contract credits the vault as an operator, under its own contract
address, so it has to be added to the vault's operator set after deployment.

## Interface

| Function | Who may call it | What it does |
|---|---|---|
| `purchase(buyer, items)` | the buyer, signed | Pays for up to 25 licences, returns their ids |
| `settle(id)` | anyone | Refunds or pays out one licence, or fails with `NotDue` |
| `settle_many(ids)` | anyone | The same for up to 25, skipping any that can't close yet |
| `licence(id)` | anyone | The licence and its state: `Held`, `Settled` or `Refunded` |
| `licence_for(reference)` | anyone | The licence bought under a sale reference |
| `count()` / `config()` | anyone | Licences issued; consent, vault, token, treasury, fee and hold |
| `set_fee(fee_bps)` / `set_hold(secs)` | admin, signed | Changes terms for new purchases only. Ceilings: 30% and 90 days |
| `set_treasury(address)` | admin, signed | Where fees go |
| `propose_upgrade` / `pending_upgrade` / `cancel_upgrade` / `upgrade` / `set_admin` | as in the other contracts | Seven days between proposing code and applying it |

## Deploying

One licence contract per vault, since the token is fixed.

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/licence.wasm \
  --source datavar-admin --network testnet \
  -- --admin "$(stellar keys address datavar-admin)" \
     --consent CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \
     --vault CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL \
     --token "$(stellar contract id asset --asset native --network testnet)" \
     --treasury <treasury address> --fee_bps 1000 --hold 604800

stellar contract invoke --network testnet --source datavar-admin \
  --id CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL \
  -- add_operator --operator <licence contract id>
```

Then set `NEXT_PUBLIC_LICENCE_CONTRACT_ID` in the app. Purchases in that asset
go through the contract from then on, and the operator panel gets a "Settle
licences" button. Without it, purchases keep paying straight into the vault.
