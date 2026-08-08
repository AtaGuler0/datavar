#![no_std]

//! Datavar consent receipts.
//!
//! The whole claim of the product is that consent is enforced by the protocol
//! rather than by a PDF nobody reads. This contract is where that claim either
//! becomes true or stays marketing. A receipt says: *this contributor allowed
//! this buyer to use the record with this hash, for this purpose, until this
//! moment.* It lives in ledger state, so a buyer can check it without asking us
//! for permission and without trusting our database — which is the one thing a
//! Postgres table we own can never offer.
//!
//! Two deliberate choices worth stating up front:
//!
//! - **Consent always expires.** `grant` refuses an `expires_at` that is not in
//!   the future. There is no perpetual grant, because perpetual consent is the
//!   thing this product exists to argue against.
//! - **`is_valid` answers `false` for a receipt that does not exist.** A caller
//!   asking "may I use this data?" wants the safe answer, not an error to catch.
//!   Use `receipt` when the difference between *unknown* and *invalid* matters.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String, Vec,
};

/// Ledgers close roughly every 5 seconds, so this is about a day.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Receipts are kept alive for ~90 days per touch, renewed whenever they are
/// read or written. A receipt nobody looks at for three months is archived by
/// the network rather than paid for forever.
const RECEIPT_TTL: u32 = 90 * DAY_IN_LEDGERS;
const RECEIPT_TTL_THRESHOLD: u32 = RECEIPT_TTL - 30 * DAY_IN_LEDGERS;
const INSTANCE_TTL: u32 = 120 * DAY_IN_LEDGERS;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL - 30 * DAY_IN_LEDGERS;

/// Purposes are human-readable strings ("LLM pre-training", "evaluation only").
/// Capped so a grant cannot be used to park arbitrary payloads in ledger state.
const MAX_PURPOSE_LEN: u32 = 200;
/// Ceiling on the per-contributor id index, which is a single ledger entry and
/// therefore bounded. Well past what a real contributor produces; the events
/// emitted here are the path to an off-chain index if that ever changes.
const MAX_RECEIPTS_PER_CONTRIBUTOR: u32 = 1_000;
/// Largest page `receipts_of` will return in one call.
const MAX_PAGE: u32 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// No receipt with that id.
    NotFound = 1,
    /// The receipt was already revoked; revoking twice is a caller bug.
    AlreadyRevoked = 2,
    /// `expires_at` is not in the future. Consent that has already ended cannot
    /// be granted.
    InvalidExpiry = 3,
    /// Purpose string is longer than `MAX_PURPOSE_LEN`.
    PurposeTooLong = 4,
    /// This contributor has reached `MAX_RECEIPTS_PER_CONTRIBUTOR`.
    IndexFull = 5,
    /// A page request larger than `MAX_PAGE`.
    PageTooLarge = 6,
}

/// A single consent record. `revoked_at` is `None` while the consent stands, and
/// carries the revocation timestamp once it does not — the history is kept
/// rather than deleted, because "when was this withdrawn?" is a question both
/// sides will eventually need answered.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub id: u64,
    pub contributor: Address,
    pub buyer: Address,
    /// SHA-256 of the dataset, the same digest the upload flow computes in the
    /// browser before the file ever reaches storage.
    pub dataset_hash: BytesN<32>,
    pub purpose: String,
    pub granted_at: u64,
    pub expires_at: u64,
    pub revoked_at: Option<u64>,
}

#[contracttype]
enum DataKey {
    Admin,
    NextId,
    Receipt(u64),
    /// Receipt ids belonging to one contributor, in grant order.
    Index(Address),
}

#[contractevent]
pub struct Granted {
    #[topic]
    pub contributor: Address,
    #[topic]
    pub buyer: Address,
    pub id: u64,
    pub dataset_hash: BytesN<32>,
    pub purpose: String,
    pub expires_at: u64,
}

#[contractevent]
pub struct Revoked {
    #[topic]
    pub contributor: Address,
    pub id: u64,
    pub revoked_at: u64,
}

#[contract]
pub struct Consent;

#[contractimpl]
impl Consent {
    /// The admin exists only to upgrade the contract and hand over that right.
    /// It cannot grant, revoke, or read anything a stranger cannot read.
    pub fn __constructor(env: &Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    /// Record a contributor's consent for one buyer to use one dataset.
    ///
    /// Only the contributor authorises this; the buyer is named, not consulted.
    /// Returns the receipt id, which is what the rest of the system quotes.
    pub fn grant(
        env: &Env,
        contributor: Address,
        buyer: Address,
        dataset_hash: BytesN<32>,
        purpose: String,
        expires_at: u64,
    ) -> Result<u64, Error> {
        contributor.require_auth();

        if purpose.len() > MAX_PURPOSE_LEN {
            return Err(Error::PurposeTooLong);
        }

        let now = env.ledger().timestamp();
        if expires_at <= now {
            return Err(Error::InvalidExpiry);
        }

        let index_key = DataKey::Index(contributor.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(env));
        if ids.len() >= MAX_RECEIPTS_PER_CONTRIBUTOR {
            return Err(Error::IndexFull);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let receipt = Receipt {
            id,
            contributor: contributor.clone(),
            buyer: buyer.clone(),
            dataset_hash: dataset_hash.clone(),
            purpose: purpose.clone(),
            granted_at: now,
            expires_at,
            revoked_at: None,
        };

        let receipt_key = DataKey::Receipt(id);
        env.storage().persistent().set(&receipt_key, &receipt);
        env.storage()
            .persistent()
            .extend_ttl(&receipt_key, RECEIPT_TTL_THRESHOLD, RECEIPT_TTL);

        ids.push_back(id);
        env.storage().persistent().set(&index_key, &ids);
        env.storage()
            .persistent()
            .extend_ttl(&index_key, RECEIPT_TTL_THRESHOLD, RECEIPT_TTL);

        Self::bump_instance(env);

        Granted {
            contributor,
            buyer,
            id,
            dataset_hash,
            purpose,
            expires_at,
        }
        .publish(env);

        Ok(id)
    }

    /// Withdraw consent. Only the contributor who granted it can, and the
    /// receipt stays on the ledger with the moment of withdrawal recorded.
    pub fn revoke(env: &Env, id: u64) -> Result<(), Error> {
        let mut receipt = Self::load(env, id)?;
        receipt.contributor.require_auth();

        if receipt.revoked_at.is_some() {
            return Err(Error::AlreadyRevoked);
        }

        let now = env.ledger().timestamp();
        receipt.revoked_at = Some(now);

        let key = DataKey::Receipt(id);
        env.storage().persistent().set(&key, &receipt);
        env.storage()
            .persistent()
            .extend_ttl(&key, RECEIPT_TTL_THRESHOLD, RECEIPT_TTL);
        Self::bump_instance(env);

        Revoked {
            contributor: receipt.contributor,
            id,
            revoked_at: now,
        }
        .publish(env);

        Ok(())
    }

    /// The question a buyer asks before touching the data: is this consent still
    /// standing? Not revoked, not expired. Unknown ids answer `false`.
    pub fn is_valid(env: &Env, id: u64) -> bool {
        match Self::load(env, id) {
            Ok(receipt) => {
                receipt.revoked_at.is_none() && env.ledger().timestamp() < receipt.expires_at
            }
            Err(_) => false,
        }
    }

    /// The full record, for callers that need to show terms rather than a
    /// yes/no — or that need to tell *unknown* apart from *invalid*.
    pub fn receipt(env: &Env, id: u64) -> Result<Receipt, Error> {
        Self::load(env, id)
    }

    /// Every receipt id this contributor has granted, in order.
    pub fn receipt_ids(env: &Env, contributor: Address) -> Vec<u64> {
        Self::index_of(env, &contributor)
    }

    /// How many receipts this contributor has granted.
    pub fn receipt_count(env: &Env, contributor: Address) -> u32 {
        Self::index_of(env, &contributor).len()
    }

    /// One page of a contributor's receipts — what the dashboard reads. Paged
    /// because a single call has to fit in one transaction's return value, and a
    /// prolific contributor's whole history will not.
    pub fn receipts_of(
        env: &Env,
        contributor: Address,
        start: u32,
        limit: u32,
    ) -> Result<Vec<Receipt>, Error> {
        if limit > MAX_PAGE {
            return Err(Error::PageTooLarge);
        }

        let ids = Self::index_of(env, &contributor);
        let mut page = Vec::new(env);
        if start >= ids.len() {
            return Ok(page);
        }

        let end = ids.len().min(start.saturating_add(limit));
        for i in start..end {
            let id = ids.get_unchecked(i);
            // An id in the index whose receipt entry has been archived is skipped
            // rather than fatal: the page is a view, not an audit.
            if let Ok(receipt) = Self::load(env, id) {
                page.push_back(receipt);
            }
        }

        Ok(page)
    }

    /// Swap the contract's code. Present from the first deployment on purpose —
    /// retrofitting an upgrade path means a new address and a migration every
    /// time the contract changes.
    pub fn upgrade(env: &Env, new_wasm_hash: BytesN<32>) {
        Self::admin(env).require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Self::bump_instance(env);
    }

    /// Hand the upgrade right to someone else.
    pub fn set_admin(env: &Env, new_admin: Address) {
        Self::admin(env).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Self::bump_instance(env);
    }

    pub fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract not initialised")
    }

    fn load(env: &Env, id: u64) -> Result<Receipt, Error> {
        let key = DataKey::Receipt(id);
        let receipt: Receipt = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        // Reading is enough to keep a receipt alive — consent people still check
        // on should not quietly expire out of storage.
        env.storage()
            .persistent()
            .extend_ttl(&key, RECEIPT_TTL_THRESHOLD, RECEIPT_TTL);
        Ok(receipt)
    }

    fn index_of(env: &Env, contributor: &Address) -> Vec<u64> {
        let key = DataKey::Index(contributor.clone());
        match env.storage().persistent().get::<_, Vec<u64>>(&key) {
            Some(ids) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, RECEIPT_TTL_THRESHOLD, RECEIPT_TTL);
                ids
            }
            None => Vec::new(env),
        }
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL);
    }
}

mod test;
