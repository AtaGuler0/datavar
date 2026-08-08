#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    vec, Event, IntoVal,
};

/// Ledger timestamps start at zero in tests, which makes "in the past" hard to
/// express. Start the clock somewhere real instead.
const NOW: u64 = 1_770_000_000;
const DAY: u64 = 86_400;

/// 201 characters — one past `MAX_PURPOSE_LEN`.
const OVERSIZED_PURPOSE: &str = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

struct Harness {
    env: Env,
    client: ConsentClient<'static>,
    contract_id: Address,
    admin: Address,
    contributor: Address,
    buyer: Address,
}

fn setup() -> Harness {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(Consent, (&admin,));
    let client = ConsentClient::new(&env, &contract_id);

    let contributor = Address::generate(&env);
    let buyer = Address::generate(&env);

    Harness {
        env,
        client,
        contract_id,
        admin,
        contributor,
        buyer,
    }
}

fn purpose(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

fn grant(h: &Harness) -> u64 {
    h.client.grant(
        &h.contributor,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, "LLM pre-training"),
        &(NOW + 30 * DAY),
    )
}

#[test]
fn grant_records_the_terms_and_is_valid() {
    let h = setup();
    let hash = BytesN::random(&h.env);
    let expires_at = NOW + 30 * DAY;

    let id = h.client.grant(
        &h.contributor,
        &h.buyer,
        &hash,
        &purpose(&h.env, "LLM pre-training"),
        &expires_at,
    );

    assert_eq!(id, 0);
    assert!(h.client.is_valid(&id));

    let receipt = h.client.receipt(&id);
    assert_eq!(receipt.contributor, h.contributor);
    assert_eq!(receipt.buyer, h.buyer);
    assert_eq!(receipt.dataset_hash, hash);
    assert_eq!(receipt.purpose, purpose(&h.env, "LLM pre-training"));
    assert_eq!(receipt.granted_at, NOW);
    assert_eq!(receipt.expires_at, expires_at);
    assert_eq!(receipt.revoked_at, None);
}

#[test]
fn grant_publishes_the_terms_as_an_event() {
    let h = setup();
    let hash = BytesN::random(&h.env);
    let expires_at = NOW + 30 * DAY;

    let id = h.client.grant(
        &h.contributor,
        &h.buyer,
        &hash,
        &purpose(&h.env, "evaluation only"),
        &expires_at,
    );

    let expected = Granted {
        contributor: h.contributor.clone(),
        buyer: h.buyer.clone(),
        id,
        dataset_hash: hash,
        purpose: purpose(&h.env, "evaluation only"),
        expires_at,
    };
    assert_eq!(
        h.env.events().all(),
        [expected.to_xdr(&h.env, &h.contract_id)]
    );
}

#[test]
fn ids_increment_across_contributors() {
    let h = setup();
    let other = Address::generate(&h.env);

    let first = grant(&h);
    let second = h.client.grant(
        &other,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, "fine-tuning"),
        &(NOW + DAY),
    );

    assert_eq!(first, 0);
    assert_eq!(second, 1);
    assert_eq!(h.client.receipt_ids(&h.contributor), vec![&h.env, 0]);
    assert_eq!(h.client.receipt_ids(&other), vec![&h.env, 1]);
}

#[test]
fn consent_that_has_already_ended_cannot_be_granted() {
    let h = setup();

    let past = h.client.try_grant(
        &h.contributor,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, "LLM pre-training"),
        &(NOW - 1),
    );
    assert_eq!(past, Err(Ok(Error::InvalidExpiry)));

    // Expiring exactly now is already over.
    let now = h.client.try_grant(
        &h.contributor,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, "LLM pre-training"),
        &NOW,
    );
    assert_eq!(now, Err(Ok(Error::InvalidExpiry)));
}

#[test]
fn purpose_is_bounded() {
    let h = setup();

    let result = h.client.try_grant(
        &h.contributor,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, OVERSIZED_PURPOSE),
        &(NOW + DAY),
    );
    assert_eq!(result, Err(Ok(Error::PurposeTooLong)));
}

#[test]
fn granting_needs_the_contributor_not_just_a_caller() {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);

    let admin = Address::generate(&env);
    let contract_id = env.register(Consent, (&admin,));
    let client = ConsentClient::new(&env, &contract_id);

    let contributor = Address::generate(&env);
    let buyer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let hash = BytesN::random(&env);
    let text = purpose(&env, "LLM pre-training");
    let expires_at = NOW + DAY;

    // A stranger authorising their own call does not authorise the contributor.
    let attempt = client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "grant",
                args: (
                    contributor.clone(),
                    buyer.clone(),
                    hash.clone(),
                    text.clone(),
                    expires_at,
                )
                    .into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_grant(&contributor, &buyer, &hash, &text, &expires_at);
    assert!(attempt.is_err());
}

#[test]
fn revoke_ends_validity_and_keeps_the_record() {
    let h = setup();
    let id = grant(&h);
    assert!(h.client.is_valid(&id));

    h.env.ledger().set_timestamp(NOW + DAY);
    h.client.revoke(&id);

    assert!(!h.client.is_valid(&id));
    let receipt = h.client.receipt(&id);
    assert_eq!(receipt.revoked_at, Some(NOW + DAY));
    // The terms survive revocation — the question "what was allowed, until when"
    // still has an answer afterwards.
    assert_eq!(receipt.expires_at, NOW + 30 * DAY);
}

#[test]
fn revoke_publishes_an_event() {
    let h = setup();
    let id = grant(&h);
    h.env.ledger().set_timestamp(NOW + DAY);

    h.client.revoke(&id);

    let expected = Revoked {
        contributor: h.contributor.clone(),
        id,
        revoked_at: NOW + DAY,
    };
    assert_eq!(
        h.env.events().all(),
        [expected.to_xdr(&h.env, &h.contract_id)]
    );
}

#[test]
fn only_the_contributor_can_revoke() {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);

    let admin = Address::generate(&env);
    let contract_id = env.register(Consent, (&admin,));
    let client = ConsentClient::new(&env, &contract_id);

    let contributor = Address::generate(&env);
    let buyer = Address::generate(&env);
    let stranger = Address::generate(&env);

    env.mock_all_auths();
    let id = client.grant(
        &contributor,
        &buyer,
        &BytesN::random(&env),
        &purpose(&env, "LLM pre-training"),
        &(NOW + DAY),
    );

    // Neither the buyer nor the admin gets to withdraw someone else's consent.
    for impostor in [&stranger, &buyer, &admin] {
        let attempt = client
            .mock_auths(&[MockAuth {
                address: impostor,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "revoke",
                    args: (id,).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_revoke(&id);
        assert!(attempt.is_err());
    }

    env.mock_all_auths();
    assert!(client.is_valid(&id));
}

#[test]
fn revoking_twice_is_rejected() {
    let h = setup();
    let id = grant(&h);

    h.client.revoke(&id);
    assert_eq!(h.client.try_revoke(&id), Err(Ok(Error::AlreadyRevoked)));
}

#[test]
fn consent_expires_without_anyone_acting() {
    let h = setup();
    let id = grant(&h);

    h.env.ledger().set_timestamp(NOW + 30 * DAY - 1);
    assert!(h.client.is_valid(&id));

    h.env.ledger().set_timestamp(NOW + 30 * DAY);
    assert!(!h.client.is_valid(&id));

    // Expiry is not revocation, and the record still says so.
    assert_eq!(h.client.receipt(&id).revoked_at, None);
}

#[test]
fn an_unknown_receipt_is_invalid_rather_than_fatal() {
    let h = setup();

    assert!(!h.client.is_valid(&404));
    assert_eq!(h.client.try_receipt(&404), Err(Ok(Error::NotFound)));
    assert_eq!(h.client.try_revoke(&404), Err(Ok(Error::NotFound)));
}

#[test]
fn receipts_of_returns_pages_in_grant_order() {
    let h = setup();
    for _ in 0..5 {
        grant(&h);
    }

    assert_eq!(h.client.receipt_count(&h.contributor), 5);

    let first_two = h.client.receipts_of(&h.contributor, &0, &2);
    assert_eq!(first_two.len(), 2);
    assert_eq!(first_two.get_unchecked(0).id, 0);
    assert_eq!(first_two.get_unchecked(1).id, 1);

    let tail = h.client.receipts_of(&h.contributor, &3, &10);
    assert_eq!(tail.len(), 2);
    assert_eq!(tail.get_unchecked(0).id, 3);

    // Past the end is empty, not an error.
    assert_eq!(h.client.receipts_of(&h.contributor, &99, &10).len(), 0);
}

#[test]
fn receipts_of_refuses_an_oversized_page() {
    let h = setup();
    assert_eq!(
        h.client
            .try_receipts_of(&h.contributor, &0, &(MAX_PAGE + 1)),
        Err(Ok(Error::PageTooLarge))
    );
}

#[test]
fn a_contributor_only_sees_their_own_receipts() {
    let h = setup();
    let other = Address::generate(&h.env);

    grant(&h);
    h.client.grant(
        &other,
        &h.buyer,
        &BytesN::random(&h.env),
        &purpose(&h.env, "fine-tuning"),
        &(NOW + DAY),
    );

    assert_eq!(h.client.receipt_count(&h.contributor), 1);
    assert_eq!(h.client.receipt_count(&other), 1);
    assert_eq!(
        h.client
            .receipts_of(&h.contributor, &0, &10)
            .get_unchecked(0)
            .contributor,
        h.contributor
    );
}

#[test]
fn a_wallet_with_no_receipts_reads_as_empty() {
    let h = setup();
    let nobody = Address::generate(&h.env);

    assert_eq!(h.client.receipt_count(&nobody), 0);
    assert_eq!(h.client.receipt_ids(&nobody).len(), 0);
    assert_eq!(h.client.receipts_of(&nobody, &0, &10).len(), 0);
}

#[test]
fn admin_can_hand_over_the_upgrade_right() {
    let h = setup();
    let successor = Address::generate(&h.env);

    assert_eq!(h.client.admin(), h.admin);
    h.client.set_admin(&successor);
    assert_eq!(h.client.admin(), successor);
}

#[test]
fn upgrading_is_gated_on_the_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(Consent, (&admin,));
    let client = ConsentClient::new(&env, &contract_id);

    let stranger = Address::generate(&env);
    let wasm_hash = BytesN::<32>::random(&env);

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
fn the_admin_cannot_grant_on_someone_elses_behalf() {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);

    let admin = Address::generate(&env);
    let contract_id = env.register(Consent, (&admin,));
    let client = ConsentClient::new(&env, &contract_id);

    let contributor = Address::generate(&env);
    let buyer = Address::generate(&env);
    let hash = BytesN::random(&env);
    let text = purpose(&env, "LLM pre-training");
    let expires_at = NOW + DAY;

    let attempt = client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "grant",
                args: (
                    contributor.clone(),
                    buyer.clone(),
                    hash.clone(),
                    text.clone(),
                    expires_at,
                )
                    .into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_grant(&contributor, &buyer, &hash, &text, &expires_at);
    assert!(attempt.is_err());
}
