# Consent receipts on Soroban

This is the part of Datavar that a database cannot do.

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
│   ├── src/lib.rs      # the contract
│   ├── src/test.rs     # 19 tests, including every authorisation path
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
cargo test              # 19 tests, no network needed
cargo fmt --all
cargo clippy --all-targets
stellar contract build  # → target/wasm32v1-none/release/consent.wasm
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
