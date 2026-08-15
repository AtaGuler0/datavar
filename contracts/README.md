# Datavar's contracts

Two contracts, for the two things a database cannot do: prove what someone
consented to, and hold their money somewhere we cannot reach into.

- [Consent receipts](#consent-receipts) — what was agreed, in ledger state.
- [Payout vault](#payout-vault) — earnings that leave only on their owner's
  signature.

## Consent receipts

A consent receipt says: *this contributor allowed this buyer to use the record
with this hash, for this purpose, until this moment.* Keeping that in a table we
own means a buyer has to take our word for it, and means we could rewrite it. In
ledger state, a buyer checks it themselves — no account with us, no API key, no
permission — and neither we nor they can quietly change what was agreed.

Two rules are built into the contract rather than into a policy document:

- **Consent always ends.** `grant` refuses an expiry that is not in the future.
  There is no perpetual grant.
- **Only the contributor can withdraw it.** Not the buyer, not the admin, not
  us. The admin key upgrades the code and nothing else.

## Layout

```text
contracts/
├── contracts/consent/
│   ├── src/lib.rs      # the consent contract
│   ├── src/test.rs     # 19 tests, including every authorisation path
│   └── Cargo.toml
├── contracts/payout/
│   ├── src/lib.rs      # the payout vault
│   ├── src/test.rs     # 26 tests, one per invariant and per authorisation path
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
| `receipts_of(contributor, start, limit)` | anyone | One page of receipts — what the dashboard reads |
| `upgrade(new_wasm_hash)` | admin, signed | Swaps the code |
| `set_admin(new_admin)` | admin, signed | Hands over that right |

`dataset_hash` is the SHA-256 the upload flow computes in the browser before the
file leaves the device, so the receipt commits to the exact bytes without
exposing them.

`upgrade` is here from the first deployment on purpose. Retrofitting an upgrade
path means a new address and a migration for every change.

## Working on it

```bash
cargo test              # 45 tests across both contracts, no network needed
cargo fmt --all
cargo clippy --all-targets
stellar contract build  # → target/wasm32v1-none/release/{consent,payout}.wasm
```

## Deploying

```bash
stellar keys generate datavar-admin --network testnet --fund

stellar contract deploy \
  --wasm target/wasm32v1-none/release/consent.wasm \
  --source datavar-admin --network testnet \
  -- --admin "$(stellar keys address datavar-admin)"
```

Put the contract id it prints into `NEXT_PUBLIC_CONSENT_CONTRACT_ID` in the
app's `.env.local`. It's public by design — verifying a receipt is meant to need
nobody's permission.

The current testnet deployment is
[`CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI`](https://stellar.expert/explorer/testnet/contract/CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI).

## Checking it yourself

The point of this contract is that you don't have to trust the dashboard. Ask
the ledger directly:

```bash
stellar contract invoke --network testnet --send=no \
  --id CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI \
  --source <any-funded-key> \
  -- is_valid --id 0
```

---

# Payout vault

This is the part of Datavar that an account cannot do.

Before this contract, a contributor's earnings were a row in our database and a
payment our server chose to send. Both halves of that were a promise: we could
forget the row, and we could decline to send the payment. The vault removes the
second half. Test XLM for payouts sits in the contract, and the only key that
can move it to a contributor is the contributor's own.

Three roles, deliberately unequal:

- The **operator** (our server) can say *this wallet is owed this much*, and
  nothing else. It cannot pay anyone, cannot pay itself, and cannot take a
  credit back.
- The **contributor** calls `claim` with their own signature and the balance
  leaves for their wallet. Nobody can claim on their behalf, and nobody —
  operator or admin — can stop them.
- The **admin** upgrades the contract and withdraws *surplus*: the funds beyond
  what is currently owed. Money already credited to a contributor is out of the
  admin's reach by construction.

## Three invariants

Each one has a test, and together they are the argument for holding payouts
here rather than in an account we control:

1. **A credit is always funded.** `credit` refuses if it would push the total
   owed past what the contract holds. A balance shown to a contributor is money
   already sitting in the vault, not an IOU.
2. **A credited balance is always claimable.** Follows from (1) plus a
   `withdraw` that can only touch surplus. There is no state where the dashboard
   says 41 XLM and the claim fails for want of funds.
3. **A sale is credited once.** Each credit carries the reference of the sale it
   settles — `sha256(sale_id)` — and the contract remembers it. An operator that
   retries a failed batch cannot double-pay.

## Interface

| Function | Who may call it | What it does |
|---|---|---|
| `fund(from, amount)` | anyone, signed | Moves tokens into the vault |
| `credit(contributor, amount, reference)` | operator, signed | Records one sale as owed |
| `credit_many(credits)` | operator, signed | The same for a sale round, all or nothing |
| `claim(contributor)` | the contributor, signed | Pays their whole balance out |
| `balance_of(contributor)` | anyone | What that wallet can claim right now |
| `is_credited(reference)` | anyone | Whether that sale is already on the ledger |
| `funded()` / `owed()` / `surplus()` | anyone | What it holds, owes, and has spare |
| `withdraw(to, amount)` | admin, signed | Takes back surplus only |
| `set_operator(new_operator)` | admin, signed | Rotates the crediting key |
| `upgrade(new_wasm_hash)` / `set_admin(new_admin)` | admin, signed | As in the consent contract |

The token is fixed at deployment — native XLM's SAC in our deployment, though
the contract never assumes that. Changing it would strand every balance credited
under the old one, so it cannot be changed at all.

## Deploying

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payout.wasm \
  --source datavar-admin --network testnet \
  -- --admin "$(stellar keys address datavar-admin)" \
     --operator "$(stellar keys address datavar-treasury)" \
     --token "$(stellar contract id asset --asset native --network testnet)"
```

Put the contract id into `NEXT_PUBLIC_PAYOUT_CONTRACT_ID`, then move test XLM in
— from the operator panel, or:

```bash
stellar contract invoke --id <contract> --source datavar-treasury \
  --network testnet -- fund \
  --from "$(stellar keys address datavar-treasury)" --amount 5000000000
```

The current testnet deployment is
[`CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL`](https://stellar.expert/explorer/testnet/contract/CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL).

## Checking it yourself

You don't have to trust the earnings page about what you are owed. Ask the
contract:

```bash
stellar contract invoke --network testnet --send=no \
  --id CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL \
  --source <any-funded-key> \
  -- balance_of --contributor <your-address>
```

`funded` and `owed` answer the other half of the question — whether the vault
can cover what it has promised everyone.
