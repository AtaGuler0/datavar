# Metrics

`compute.mjs` computes Datavar's protocol metrics from contract events only. No
database row goes into any number, so anyone can rerun it and should get the
same result.

```bash
node metrics/compute.mjs                               # whole history, markdown
node metrics/compute.mjs --from=2026-11-01 --to=2027-01-01
node metrics/compute.mjs --json
node metrics/compute.mjs --no-exclude                  # include our bot wallets
```

It needs `@stellar/stellar-sdk` from this repo's `node_modules` to decode event
bodies. Events come from the Stellar Expert API, because public Soroban RPC
nodes only keep about a week of them.

Contract ids default to the testnet deployment. Override them with `--consent=`,
`--payout=`, `--payout-usdc=`, `--licence=` and `--licence-usdc=`, or with the
matching `NEXT_PUBLIC_*` variables.

| Metric | From |
|---|---|
| M1 Gross licence value | `Licensed.paid` |
| M2 Protocol revenue settled | `fee` in `Settled` and `Refunded` |
| M3 Contributor payouts | `Credited.amount`, `Claimed.amount` |
| M4 Dataset value licensed | `Licensed.paid` by the receipt's `dataset_hash` |
| M5 Net contributor retention | `Granted` cohorts, `Credited` per month |
| M6 Revocation rate | `Revoked` / `Granted` |
| M7 Weekly active contributors | Distinct `Granted` wallets per ISO week |

`excluded-wallets.txt` lists the 120 wallets our load-test bot generated on
testnet. Every event naming one of them is dropped unless you pass
`--no-exclude`.
