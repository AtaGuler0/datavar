#![cfg(test)]

use super::*;
use consent::{Consent, ConsentClient as ConsentContractClient};
use payout::{Payout, PayoutClient};
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger as _},
    vec,
};

const XLM: i128 = 10_000_000;
const DAY: u64 = 24 * 60 * 60;
/// 10% fee and a seven day hold, the values we plan to deploy with.
const FEE_BPS: u32 = 1_000;
const HOLD: u64 = 7 * DAY;
const START: u64 = 1_800_000_000;

struct Harness {
    env: Env,
    licence: LicenceContractClient<'static>,
    licence_id: Address,
    consent: ConsentContractClient<'static>,
    vault: PayoutClient<'static>,
    vault_id: Address,
    token: Address,
    admin: Address,
    treasury: Address,
    contributor: Address,
    buyer: Address,
    market: Address,
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let contributor = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market = Address::generate(&env);
    let operator = Address::generate(&env);

    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    token::StellarAssetClient::new(&env, &token).mint(&buyer, &(1_000 * XLM));

    let consent_id = env.register(Consent, (&admin,));
    let vault_id = env.register(Payout, (&admin, &operator, &token));
    let licence_id = env.register(
        LicenceContract,
        (
            &admin,
            &consent_id,
            &vault_id,
            &token,
            &treasury,
            FEE_BPS,
            HOLD,
        ),
    );

    let vault = PayoutClient::new(&env, &vault_id);
    vault.add_operator(&licence_id);

    Harness {
        licence: LicenceContractClient::new(&env, &licence_id),
        licence_id,
        consent: ConsentContractClient::new(&env, &consent_id),
        vault,
        vault_id,
        token,
        admin,
        treasury,
        contributor,
        buyer,
        market,
        env,
    }
}

/// A receipt from the contributor to the market, valid for `days`.
fn grant(h: &Harness, days: u64) -> u64 {
    h.consent.grant(
        &h.contributor,
        &h.market,
        &BytesN::random(&h.env),
        &String::from_str(&h.env, "LLM pre-training"),
        &(h.env.ledger().timestamp() + days * DAY),
    )
}

fn item(h: &Harness, receipt_id: u64, price: i128) -> Item {
    Item {
        receipt_id,
        price,
        reference: BytesN::random(&h.env),
    }
}

fn balance(h: &Harness, who: &Address) -> i128 {
    token::Client::new(&h.env, &h.token).balance(who)
}

fn advance(h: &Harness, secs: u64) {
    let now = h.env.ledger().timestamp();
    h.env.ledger().set_timestamp(now + secs);
}

#[test]
fn purchase_holds_the_payment_and_records_the_terms() {
    let h = setup();
    let receipt = grant(&h, 365);

    let ids = h
        .licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    assert_eq!(ids, vec![&h.env, 0u64]);
    assert_eq!(balance(&h, &h.licence_id), 100 * XLM);
    assert_eq!(balance(&h, &h.buyer), 900 * XLM);

    let licence = h.licence.licence(&0);
    assert_eq!(licence.contributor, h.contributor);
    assert_eq!(licence.paid, 100 * XLM);
    assert_eq!(licence.fee, 10 * XLM);
    assert_eq!(licence.due_at, START + HOLD);
    assert_eq!(licence.expires_at, START + 365 * DAY);
    assert_eq!(licence.state, State::Held);
    assert_eq!(h.licence.count(), 1);
}

#[test]
fn a_basket_is_one_transfer_and_one_licence_per_item() {
    let h = setup();
    let a = grant(&h, 365);
    let b = grant(&h, 30);

    let ids = h.licence.purchase(
        &h.buyer,
        &vec![&h.env, item(&h, a, 40 * XLM), item(&h, b, 60 * XLM)],
    );

    assert_eq!(ids, vec![&h.env, 0u64, 1u64]);
    assert_eq!(balance(&h, &h.licence_id), 100 * XLM);
    assert_eq!(h.licence.licence(&1).expires_at, START + 30 * DAY);
}

#[test]
fn purchase_refuses_a_revoked_receipt() {
    let h = setup();
    let receipt = grant(&h, 365);
    h.consent.revoke(&receipt);

    let result = h
        .licence
        .try_purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 10 * XLM)]);

    assert_eq!(result, Err(Ok(Error::ConsentNotValid)));
    assert_eq!(balance(&h, &h.buyer), 1_000 * XLM);
}

#[test]
fn purchase_refuses_an_expired_or_unknown_receipt() {
    let h = setup();
    let receipt = grant(&h, 1);
    advance(&h, 2 * DAY);

    assert_eq!(
        h.licence
            .try_purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 10 * XLM)]),
        Err(Ok(Error::ConsentNotValid))
    );
    assert_eq!(
        h.licence
            .try_purchase(&h.buyer, &vec![&h.env, item(&h, 99, 10 * XLM)]),
        Err(Ok(Error::ConsentNotValid))
    );
}

#[test]
fn purchase_refuses_bad_baskets() {
    let h = setup();
    let receipt = grant(&h, 365);

    assert_eq!(
        h.licence.try_purchase(&h.buyer, &Vec::new(&h.env)),
        Err(Ok(Error::EmptyBasket))
    );
    assert_eq!(
        h.licence
            .try_purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 0)]),
        Err(Ok(Error::InvalidAmount))
    );

    let mut big = Vec::new(&h.env);
    for _ in 0..26 {
        big.push_back(item(&h, receipt, XLM));
    }
    assert_eq!(
        h.licence.try_purchase(&h.buyer, &big),
        Err(Ok(Error::BasketTooLarge))
    );
}

#[test]
fn a_sale_reference_buys_once() {
    let h = setup();
    let receipt = grant(&h, 365);
    let first = item(&h, receipt, 10 * XLM);
    h.licence.purchase(&h.buyer, &vec![&h.env, first.clone()]);

    assert_eq!(
        h.licence.try_purchase(&h.buyer, &vec![&h.env, first.clone()]),
        Err(Ok(Error::ReferenceUsed))
    );
    assert_eq!(h.licence.licence_for(&first.reference), Some(0));
}

#[test]
fn settle_waits_for_the_hold() {
    let h = setup();
    let receipt = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    advance(&h, HOLD - 1);
    assert_eq!(h.licence.try_settle(&0), Err(Ok(Error::NotDue)));
}

#[test]
fn settle_after_the_hold_credits_the_vault_and_pays_the_fee() {
    let h = setup();
    let receipt = grant(&h, 365);
    let bought = item(&h, receipt, 100 * XLM);
    h.licence.purchase(&h.buyer, &vec![&h.env, bought.clone()]);

    advance(&h, HOLD);
    assert_eq!(h.licence.settle(&0), State::Settled);

    assert_eq!(balance(&h, &h.treasury), 10 * XLM);
    assert_eq!(balance(&h, &h.vault_id), 90 * XLM);
    assert_eq!(balance(&h, &h.licence_id), 0);
    assert_eq!(h.vault.balance_of(&h.contributor), 90 * XLM);
    assert!(h.vault.is_credited(&bought.reference));

    let licence = h.licence.licence(&0);
    assert_eq!(licence.credited, 90 * XLM);
    assert_eq!(licence.refunded, 0);

    // And the contributor can take it out with their own signature.
    assert_eq!(h.vault.claim(&h.contributor), 90 * XLM);
    assert_eq!(balance(&h, &h.contributor), 90 * XLM);
}

#[test]
fn a_licence_closes_once() {
    let h = setup();
    let receipt = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);
    advance(&h, HOLD);
    h.licence.settle(&0);

    assert_eq!(h.licence.try_settle(&0), Err(Ok(Error::AlreadyClosed)));
    assert_eq!(h.licence.try_settle(&7), Err(Ok(Error::NotFound)));
}

#[test]
fn revoking_during_the_hold_refunds_the_unused_term() {
    let h = setup();
    // A 100 day receipt, revoked on day 1 of a 7 day hold.
    let receipt = grant(&h, 100);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    advance(&h, DAY);
    h.consent.revoke(&receipt);

    assert_eq!(h.licence.settle(&0), State::Refunded);

    // 1 of 100 days used: the buyer pays 1 XLM of it, 0.1 of which is fee.
    assert_eq!(balance(&h, &h.buyer), 900 * XLM + 99 * XLM);
    assert_eq!(balance(&h, &h.treasury), XLM / 10);
    assert_eq!(h.vault.balance_of(&h.contributor), XLM - XLM / 10);
    assert_eq!(balance(&h, &h.licence_id), 0);

    let licence = h.licence.licence(&0);
    assert_eq!(licence.refunded, 99 * XLM);
    assert_eq!(licence.credited, XLM - XLM / 10);
}

#[test]
fn a_revoke_does_not_need_to_wait_for_the_hold() {
    let h = setup();
    let receipt = grant(&h, 100);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);
    h.consent.revoke(&receipt);

    // Revoked in the same second it was bought: nothing used, all returned.
    assert_eq!(h.licence.settle(&0), State::Refunded);
    assert_eq!(balance(&h, &h.buyer), 1_000 * XLM);
    assert_eq!(h.vault.balance_of(&h.contributor), 0);
    assert_eq!(balance(&h, &h.treasury), 0);
}

#[test]
fn revoking_after_the_hold_changes_nothing() {
    let h = setup();
    let receipt = grant(&h, 100);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    // Nobody called settle in time, and then the contributor revoked.
    advance(&h, HOLD + DAY);
    h.consent.revoke(&receipt);

    assert_eq!(h.licence.settle(&0), State::Settled);
    assert_eq!(h.vault.balance_of(&h.contributor), 90 * XLM);
    assert_eq!(balance(&h, &h.buyer), 900 * XLM);
}

#[test]
fn a_short_receipt_ends_the_hold_early() {
    let h = setup();
    let receipt = grant(&h, 2);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 10 * XLM)]);

    assert_eq!(h.licence.licence(&0).due_at, START + 2 * DAY);
    advance(&h, 2 * DAY);
    assert_eq!(h.licence.settle(&0), State::Settled);
}

#[test]
fn settle_many_skips_what_it_cannot_close() {
    let h = setup();
    let a = grant(&h, 365);
    let b = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, a, 10 * XLM)]);
    advance(&h, HOLD);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, b, 10 * XLM)]);

    // 0 is due, 1 was just bought, 5 does not exist.
    let closed = h.licence.settle_many(&vec![&h.env, 0u64, 1u64, 5u64]);

    assert_eq!(closed, vec![&h.env, 0u64]);
    assert_eq!(h.licence.licence(&1).state, State::Held);
}

#[test]
fn fee_and_hold_changes_apply_to_new_purchases_only() {
    let h = setup();
    let receipt = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    h.licence.set_fee(&500);
    h.licence.set_hold(&DAY);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);

    assert_eq!(h.licence.licence(&0).fee, 10 * XLM);
    assert_eq!(h.licence.licence(&1).fee, 5 * XLM);
    assert_eq!(h.licence.licence(&1).due_at, START + DAY);
}

#[test]
fn fee_and_hold_have_ceilings() {
    let h = setup();
    assert_eq!(h.licence.try_set_fee(&3_001), Err(Ok(Error::FeeTooHigh)));
    assert_eq!(
        h.licence.try_set_hold(&(91 * DAY)),
        Err(Ok(Error::HoldTooLong))
    );
}

#[test]
fn a_zero_fee_sends_everything_to_the_contributor() {
    let h = setup();
    h.licence.set_fee(&0);
    let receipt = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);
    advance(&h, HOLD);
    h.licence.settle(&0);

    assert_eq!(h.vault.balance_of(&h.contributor), 100 * XLM);
    assert_eq!(balance(&h, &h.treasury), 0);
}

#[test]
fn settle_fails_if_the_contract_is_not_a_vault_operator() {
    let h = setup();
    h.vault.remove_operator(&h.licence_id);
    let receipt = grant(&h, 365);
    h.licence
        .purchase(&h.buyer, &vec![&h.env, item(&h, receipt, 100 * XLM)]);
    advance(&h, HOLD);

    assert!(h.licence.try_settle(&0).is_err());
    assert_eq!(h.licence.licence(&0).state, State::Held);
    assert_eq!(balance(&h, &h.licence_id), 100 * XLM);
}

#[test]
fn only_the_admin_changes_settings() {
    let h = setup();
    assert_eq!(h.licence.admin(), h.admin);

    // Without mocked auth, a stranger's call to set_fee fails.
    h.env.set_auths(&[]);
    assert!(h.licence.try_set_fee(&0).is_err());
    assert!(h.licence.try_set_hold(&0).is_err());
}
