#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Events as _, MockAuth, MockAuthInvoke},
    vec, Event, IntoVal,
};

/// 1 XLM in stroops. Amounts here are written in the same units the product
/// uses end to end, so a test reads like a payout.
const XLM: i128 = 10_000_000;

struct Harness {
    env: Env,
    client: PayoutClient<'static>,
    contract_id: Address,
    token: Address,
    admin: Address,
    operator: Address,
    treasury: Address,
    contributor: Address,
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let treasury = Address::generate(&env);
    let contributor = Address::generate(&env);

    // A stand-in for XLM's own contract. The real deployment is handed the
    // native SAC; the contract itself never assumes which token it holds.
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();
    token::StellarAssetClient::new(&env, &token).mint(&treasury, &(1_000 * XLM));

    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);

    Harness {
        env,
        client,
        contract_id,
        token,
        admin,
        operator,
        treasury,
        contributor,
    }
}

/// A sale reference. Distinct per call, which is what the contract keys on.
fn sale(env: &Env) -> BytesN<32> {
    BytesN::random(env)
}

fn balance_of(h: &Harness, who: &Address) -> i128 {
    token::Client::new(&h.env, &h.token).balance(who)
}

/// Fund the vault and credit one contributor — the state most tests start from.
fn funded_with(h: &Harness, amount: i128) -> BytesN<32> {
    h.client.fund(&h.treasury, &(amount));
    let reference = sale(&h.env);
    h.client.credit(&h.contributor, &amount, &reference);
    reference
}

#[test]
fn funding_moves_tokens_into_the_vault() {
    let h = setup();

    h.client.fund(&h.treasury, &(100 * XLM));

    assert_eq!(h.client.funded(), 100 * XLM);
    assert_eq!(balance_of(&h, &h.contract_id), 100 * XLM);
    assert_eq!(balance_of(&h, &h.treasury), 900 * XLM);
    // Nothing is owed yet: funding is not crediting.
    assert_eq!(h.client.owed(), 0);
    assert_eq!(h.client.surplus(), 100 * XLM);
}

#[test]
fn a_credit_becomes_a_claimable_balance() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));

    let balance = h.client.credit(&h.contributor, &(4 * XLM), &sale(&h.env));

    assert_eq!(balance, 4 * XLM);
    assert_eq!(h.client.balance_of(&h.contributor), 4 * XLM);
    assert_eq!(h.client.owed(), 4 * XLM);
    assert_eq!(h.client.surplus(), 96 * XLM);
}

#[test]
fn credits_accumulate_into_one_balance() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));

    for _ in 0..10 {
        h.client.credit(&h.contributor, &(4 * XLM), &sale(&h.env));
    }

    // Ten sales, one balance, one claim to make.
    assert_eq!(h.client.balance_of(&h.contributor), 40 * XLM);
    assert_eq!(h.client.owed(), 40 * XLM);
}

#[test]
fn claiming_pays_the_whole_balance_out_of_the_contract() {
    let h = setup();
    funded_with(&h, 12 * XLM);

    let paid = h.client.claim(&h.contributor);

    assert_eq!(paid, 12 * XLM);
    // The money came from the contract, not from the treasury account.
    assert_eq!(balance_of(&h, &h.contributor), 12 * XLM);
    assert_eq!(balance_of(&h, &h.contract_id), 0);
    assert_eq!(h.client.balance_of(&h.contributor), 0);
    assert_eq!(h.client.owed(), 0);
}

#[test]
fn claiming_twice_is_refused() {
    let h = setup();
    funded_with(&h, 12 * XLM);
    h.client.claim(&h.contributor);

    assert_eq!(
        h.client.try_claim(&h.contributor),
        Err(Ok(Error::NothingToClaim))
    );
    assert_eq!(balance_of(&h, &h.contributor), 12 * XLM);
}

#[test]
fn a_wallet_owed_nothing_cannot_claim() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));

    let stranger = Address::generate(&h.env);
    assert_eq!(h.client.balance_of(&stranger), 0);
    assert_eq!(h.client.try_claim(&stranger), Err(Ok(Error::NothingToClaim)));
    // The vault is untouched by the attempt.
    assert_eq!(h.client.funded(), 100 * XLM);
}

/// Invariant 1. A balance shown to a contributor is money already in the vault.
#[test]
fn crediting_beyond_the_vault_is_refused() {
    let h = setup();
    h.client.fund(&h.treasury, &(10 * XLM));

    assert_eq!(
        h.client
            .try_credit(&h.contributor, &(11 * XLM), &sale(&h.env)),
        Err(Ok(Error::Underfunded))
    );

    // Nothing was recorded — not a partial credit, not a phantom balance.
    assert_eq!(h.client.balance_of(&h.contributor), 0);
    assert_eq!(h.client.owed(), 0);
}

/// Invariant 2, stated as the thing a contributor cares about: if the dashboard
/// says a number, the claim for that number goes through.
#[test]
fn every_credited_balance_can_be_claimed() {
    let h = setup();
    h.client.fund(&h.treasury, &(20 * XLM));

    let others: [Address; 3] = [
        Address::generate(&h.env),
        Address::generate(&h.env),
        Address::generate(&h.env),
    ];
    for who in others.iter() {
        h.client.credit(who, &(5 * XLM), &sale(&h.env));
    }

    // Everyone claims, in any order, and every one of them is paid in full.
    for who in others.iter() {
        assert_eq!(h.client.claim(who), 5 * XLM);
        assert_eq!(balance_of(&h, who), 5 * XLM);
    }
    assert_eq!(h.client.owed(), 0);
    assert_eq!(h.client.funded(), 5 * XLM);
}

/// Invariant 3. The operator retrying a batch it is not sure landed must not
/// pay twice.
#[test]
fn the_same_sale_cannot_be_credited_twice() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));
    let reference = sale(&h.env);

    h.client.credit(&h.contributor, &(4 * XLM), &reference);
    assert_eq!(
        h.client.try_credit(&h.contributor, &(4 * XLM), &reference),
        Err(Ok(Error::AlreadyCredited))
    );

    assert_eq!(h.client.balance_of(&h.contributor), 4 * XLM);
    assert!(h.client.is_credited(&reference));
    assert!(!h.client.is_credited(&sale(&h.env)));
}

#[test]
fn a_reference_stays_spent_after_the_balance_is_claimed() {
    let h = setup();
    let reference = funded_with(&h, 4 * XLM);
    h.client.claim(&h.contributor);

    // Claiming empties the balance; it does not make the sale creditable again.
    assert_eq!(
        h.client.try_credit(&h.contributor, &(4 * XLM), &reference),
        Err(Ok(Error::AlreadyCredited))
    );
}

#[test]
fn a_batch_credits_a_whole_sale_round() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));

    let second = Address::generate(&h.env);
    let owed = h.client.credit_many(&vec![
        &h.env,
        Credit {
            contributor: h.contributor.clone(),
            amount: 4 * XLM,
            reference: sale(&h.env),
        },
        Credit {
            contributor: h.contributor.clone(),
            amount: 6 * XLM,
            reference: sale(&h.env),
        },
        Credit {
            contributor: second.clone(),
            amount: 3 * XLM,
            reference: sale(&h.env),
        },
    ]);

    assert_eq!(owed, 13 * XLM);
    assert_eq!(h.client.balance_of(&h.contributor), 10 * XLM);
    assert_eq!(h.client.balance_of(&second), 3 * XLM);
}

#[test]
fn a_batch_with_one_bad_entry_writes_none_of_it() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));
    let already = sale(&h.env);
    h.client.credit(&h.contributor, &(4 * XLM), &already);

    let second = Address::generate(&h.env);
    let attempt = h.client.try_credit_many(&vec![
        &h.env,
        Credit {
            contributor: second.clone(),
            amount: 5 * XLM,
            reference: sale(&h.env),
        },
        // The retry of a sale that already landed.
        Credit {
            contributor: h.contributor.clone(),
            amount: 4 * XLM,
            reference: already,
        },
    ]);

    assert_eq!(attempt, Err(Ok(Error::AlreadyCredited)));
    // The good entry ahead of it is rolled back with the rest.
    assert_eq!(h.client.balance_of(&second), 0);
    assert_eq!(h.client.balance_of(&h.contributor), 4 * XLM);
    assert_eq!(h.client.owed(), 4 * XLM);
}

#[test]
fn a_batch_is_funded_as_a_whole() {
    let h = setup();
    h.client.fund(&h.treasury, &(10 * XLM));

    let second = Address::generate(&h.env);
    let attempt = h.client.try_credit_many(&vec![
        &h.env,
        Credit {
            contributor: h.contributor.clone(),
            amount: 6 * XLM,
            reference: sale(&h.env),
        },
        // On its own this fits; after the first entry it does not.
        Credit {
            contributor: second.clone(),
            amount: 6 * XLM,
            reference: sale(&h.env),
        },
    ]);

    assert_eq!(attempt, Err(Ok(Error::Underfunded)));
    assert_eq!(h.client.owed(), 0);
    assert_eq!(h.client.balance_of(&h.contributor), 0);
}

#[test]
fn an_oversized_batch_is_refused() {
    let h = setup();
    h.client.fund(&h.treasury, &(1_000 * XLM));

    let mut credits = Vec::new(&h.env);
    for _ in 0..(MAX_BATCH + 1) {
        credits.push_back(Credit {
            contributor: h.contributor.clone(),
            amount: XLM,
            reference: sale(&h.env),
        });
    }

    assert_eq!(
        h.client.try_credit_many(&credits),
        Err(Ok(Error::BatchTooLarge))
    );
}

#[test]
fn zero_and_negative_credits_are_refused() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));

    for amount in [0i128, -1, -(5 * XLM)] {
        assert_eq!(
            h.client.try_credit(&h.contributor, &amount, &sale(&h.env)),
            Err(Ok(Error::InvalidAmount))
        );
    }
    assert_eq!(h.client.owed(), 0);
}

#[test]
fn only_the_operator_can_credit() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let contributor = Address::generate(&env);
    let treasury = Address::generate(&env);

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();

    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &token).mint(&treasury, &(100 * XLM));
    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);
    client.fund(&treasury, &(100 * XLM));

    let reference = BytesN::random(&env);
    // Not the admin, and not the contributor who stands to gain by it.
    for impostor in [&admin, &contributor, &treasury] {
        let attempt = client
            .mock_auths(&[MockAuth {
                address: impostor,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "credit",
                    args: (contributor.clone(), 4 * XLM, reference.clone()).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_credit(&contributor, &(4 * XLM), &reference);
        assert!(attempt.is_err());
    }

    env.mock_all_auths();
    assert_eq!(client.balance_of(&contributor), 0);
}

#[test]
fn only_the_contributor_can_claim_their_balance() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let contributor = Address::generate(&env);
    let treasury = Address::generate(&env);
    let stranger = Address::generate(&env);

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();

    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &token).mint(&treasury, &(100 * XLM));
    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);
    client.fund(&treasury, &(100 * XLM));
    client.credit(&contributor, &(4 * XLM), &BytesN::random(&env));

    // The operator that recorded the debt cannot collect it, and neither can
    // the admin that owns the contract.
    for impostor in [&stranger, &operator, &admin] {
        let attempt = client
            .mock_auths(&[MockAuth {
                address: impostor,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "claim",
                    args: (contributor.clone(),).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_claim(&contributor);
        assert!(attempt.is_err());
    }

    env.mock_all_auths();
    assert_eq!(client.balance_of(&contributor), 4 * XLM);
}

#[test]
fn the_admin_cannot_withdraw_what_is_owed() {
    let h = setup();
    h.client.fund(&h.treasury, &(10 * XLM));
    h.client.credit(&h.contributor, &(8 * XLM), &sale(&h.env));

    // Surplus is 2 XLM. Everything past it belongs to the contributor.
    assert_eq!(h.client.surplus(), 2 * XLM);
    assert_eq!(
        h.client.try_withdraw(&h.admin, &(3 * XLM)),
        Err(Ok(Error::LockedFunds))
    );
    assert_eq!(
        h.client.try_withdraw(&h.admin, &(10 * XLM)),
        Err(Ok(Error::LockedFunds))
    );

    h.client.withdraw(&h.admin, &(2 * XLM));
    assert_eq!(balance_of(&h, &h.admin), 2 * XLM);

    // And the contributor is still paid in full afterwards.
    assert_eq!(h.client.claim(&h.contributor), 8 * XLM);
}

#[test]
fn only_the_admin_can_withdraw_surplus() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let treasury = Address::generate(&env);
    let stranger = Address::generate(&env);

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();

    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &token).mint(&treasury, &(100 * XLM));
    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);
    client.fund(&treasury, &(100 * XLM));

    for impostor in [&stranger, &operator] {
        let attempt = client
            .mock_auths(&[MockAuth {
                address: impostor,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "withdraw",
                    args: (impostor.clone(), 5 * XLM).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_withdraw(impostor, &(5 * XLM));
        assert!(attempt.is_err());
    }

    env.mock_all_auths();
    assert_eq!(client.funded(), 100 * XLM);
}

#[test]
fn crediting_survives_an_operator_rotation() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));
    h.client.credit(&h.contributor, &(4 * XLM), &sale(&h.env));

    let new_operator = Address::generate(&h.env);
    h.client.set_operator(&new_operator);

    assert_eq!(h.client.operator(), new_operator);
    // Balances are untouched by who is allowed to write them.
    assert_eq!(h.client.balance_of(&h.contributor), 4 * XLM);
    h.client.credit(&h.contributor, &(2 * XLM), &sale(&h.env));
    assert_eq!(h.client.balance_of(&h.contributor), 6 * XLM);
}

#[test]
fn rotating_the_operator_is_gated_on_the_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();

    env.mock_all_auths();
    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);

    let stranger = Address::generate(&env);
    let attempt = client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "set_operator",
                args: (stranger.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_operator(&stranger);

    assert!(attempt.is_err());
    env.mock_all_auths();
    assert_eq!(client.operator(), operator);
}

#[test]
fn upgrading_is_gated_on_the_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();

    env.mock_all_auths();
    let contract_id = env.register(Payout, (&admin, &operator, &token));
    let client = PayoutClient::new(&env, &contract_id);

    let stranger = Address::generate(&env);
    let wasm_hash = BytesN::random(&env);
    let attempt = client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "upgrade",
                args: (wasm_hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&wasm_hash);

    assert!(attempt.is_err());
}

#[test]
fn the_admin_can_hand_over_the_contract() {
    let h = setup();
    let new_admin = Address::generate(&h.env);

    h.client.set_admin(&new_admin);

    assert_eq!(h.client.admin(), new_admin);
}

#[test]
fn a_credit_publishes_what_is_owed_and_to_whom() {
    let h = setup();
    h.client.fund(&h.treasury, &(100 * XLM));
    let reference = sale(&h.env);

    h.client.credit(&h.contributor, &(4 * XLM), &reference);

    let expected = Credited {
        contributor: h.contributor.clone(),
        amount: 4 * XLM,
        reference,
        balance: 4 * XLM,
    };
    // Filtered to this contract: the token's own transfer events are the SAC's
    // business, and asserting on them here would test someone else's code.
    let ours = h.env.events().all().filter_by_contract(&h.contract_id);
    assert_eq!(
        ours.events().last().unwrap(),
        &expected.to_xdr(&h.env, &h.contract_id)
    );
}

#[test]
fn a_claim_publishes_the_payment() {
    let h = setup();
    funded_with(&h, 7 * XLM);

    h.client.claim(&h.contributor);

    let expected = Claimed {
        contributor: h.contributor.clone(),
        amount: 7 * XLM,
    };
    let ours = h.env.events().all().filter_by_contract(&h.contract_id);
    assert_eq!(
        ours.events().last().unwrap(),
        &expected.to_xdr(&h.env, &h.contract_id)
    );
}

#[test]
fn the_token_is_fixed_at_deployment() {
    let h = setup();

    assert_eq!(h.client.token(), h.token);
    assert_eq!(h.client.admin(), h.admin);
    assert_eq!(h.client.operator(), h.operator);
}
