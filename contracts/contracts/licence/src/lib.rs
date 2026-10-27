#![no_std]

//! Datavar licences.
//!
//! Before this contract a purchase was a `fund` call on the payout vault plus a
//! row in our database. The ledger saw money arrive and nothing else: not what
//! was bought, not under which receipt, and not what happens to the buyer's
//! money if the contributor revokes the next morning. This contract records the
//! purchase itself and holds the money for a short window before paying out.
//!
//! The flow for one licence:
//!
//! 1. `purchase` checks the consent receipt on the consent contract, takes the
//!    buyer's payment into this contract and emits `Licensed`. The fee is fixed
//!    at this point from the current `fee_bps`.
//! 2. The payment stays here until `due_at`, which is `purchased_at + hold`,
//!    or the receipt's expiry if that comes first.
//! 3. `settle` closes the licence. Anyone may call it. If the receipt was
//!    revoked before `due_at`, the buyer gets back the share of the price for
//!    the part of the term they lost, and the contributor and the fee keep the
//!    rest. Otherwise the contributor's share goes to the payout vault as a
//!    credit and the fee goes to the treasury.
//!
//! Money that has reached the vault never comes back. A revocation after
//! `due_at` changes nothing here, which keeps the vault's rule that a credited
//! balance is always claimable. The buyer's protection is limited to the hold
//! window, and the purchase screen says so before they pay.
//!
//! This contract has to be an operator of the payout vault, because `settle`
//! calls `credit` with its own address as the operator.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, BytesN, Env, String, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const ENTRY_TTL: u32 = 90 * DAY_IN_LEDGERS;
const ENTRY_TTL_THRESHOLD: u32 = ENTRY_TTL - 30 * DAY_IN_LEDGERS;
const INSTANCE_TTL: u32 = 120 * DAY_IN_LEDGERS;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL - 30 * DAY_IN_LEDGERS;

/// Datasets in one purchase. Matches the marketplace basket.
const MAX_BASKET: u32 = 25;
/// Licences one `settle_many` call will look at.
const MAX_SETTLE: u32 = 25;
/// The fee can be set up to 30%. Above that it stops being a fee.
const MAX_FEE_BPS: u32 = 3_000;
/// The hold can be set up to 90 days.
const MAX_HOLD_SECS: u64 = 90 * 24 * 60 * 60;
const BPS: i128 = 10_000;
/// How long proposed code waits before `upgrade` will apply it. For that week
/// the new code's hash is on the ledger, so a buyer or contributor can read it
/// before it holds their money.
pub const UPGRADE_DELAY: u64 = 7 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// A price of zero or less.
    InvalidAmount = 1,
    /// A purchase with no items.
    EmptyBasket = 2,
    /// More than `MAX_BASKET` items, or more than `MAX_SETTLE` ids.
    BasketTooLarge = 3,
    /// The receipt does not exist, is revoked, or has expired.
    ConsentNotValid = 4,
    /// This sale reference was already used by an earlier purchase.
    ReferenceUsed = 5,
    /// No licence with that id.
    NotFound = 6,
    /// The licence was already settled or refunded.
    AlreadyClosed = 7,
    /// The hold has not ended and the receipt has not been revoked.
    NotDue = 8,
    /// `fee_bps` above `MAX_FEE_BPS`.
    FeeTooHigh = 9,
    /// `hold` above `MAX_HOLD_SECS`.
    HoldTooLong = 10,
    /// No upgrade to that code has been proposed.
    UpgradeNotProposed = 11,
    /// The proposed upgrade's `UPGRADE_DELAY` has not passed yet.
    UpgradeNotReady = 12,
}

/// One line of a purchase.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Item {
    pub receipt_id: u64,
    /// What the buyer pays for this dataset, fee included, in stroops.
    pub price: i128,
    /// SHA-256 of our sale id. Passed on to the vault as the credit
    /// reference, so the vault's `is_credited` answers for this sale too.
    pub reference: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum State {
    /// Payment is in this contract.
    Held,
    /// Paid out to the vault and the treasury.
    Settled,
    /// Receipt revoked during the hold, unused part returned to the buyer.
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Licence {
    pub id: u64,
    pub buyer: Address,
    pub contributor: Address,
    pub receipt_id: u64,
    pub reference: BytesN<32>,
    /// Price paid, fee included.
    pub paid: i128,
    /// Fee on the full price, at the rate in force at purchase.
    pub fee: i128,
    pub purchased_at: u64,
    /// When the payment can be settled if nothing was revoked.
    pub due_at: u64,
    /// The receipt's expiry. The licence cannot outlast it.
    pub expires_at: u64,
    pub state: State,
    /// Credited to the contributor at close. Zero while held.
    pub credited: i128,
    /// Returned to the buyer at close. Zero unless refunded.
    pub refunded: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub consent: Address,
    pub vault: Address,
    pub token: Address,
    pub treasury: Address,
    pub fee_bps: u32,
    pub hold: u64,
}

/// Code the admin has announced, and the earliest moment it can replace this
/// contract's.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgrade {
    pub wasm_hash: BytesN<32>,
    pub ready_at: u64,
}

#[contracttype]
enum DataKey {
    Admin,
    Config,
    NextId,
    Licence(u64),
    Reference(BytesN<32>),
    PendingUpgrade,
}

/// The consent receipt, field for field as the consent contract stores it.
/// Redeclared here so this contract can read one without linking the other.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub id: u64,
    pub contributor: Address,
    pub buyer: Address,
    pub dataset_hash: BytesN<32>,
    pub purpose: String,
    pub granted_at: u64,
    pub expires_at: u64,
    pub revoked_at: Option<u64>,
}

#[contractclient(name = "ConsentClient")]
pub trait ConsentInterface {
    fn receipt(env: Env, id: u64) -> Receipt;
}

#[contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn credit(
        env: Env,
        operator: Address,
        contributor: Address,
        amount: i128,
        reference: BytesN<32>,
    ) -> i128;
}

#[contractevent]
pub struct Licensed {
    #[topic]
    pub buyer: Address,
    #[topic]
    pub contributor: Address,
    pub licence_id: u64,
    pub receipt_id: u64,
    pub paid: i128,
    pub fee: i128,
    pub expires_at: u64,
}

#[contractevent]
pub struct Settled {
    #[topic]
    pub contributor: Address,
    pub licence_id: u64,
    pub credited: i128,
    pub fee: i128,
}

#[contractevent]
pub struct Refunded {
    #[topic]
    pub buyer: Address,
    pub licence_id: u64,
    pub refunded: i128,
    pub credited: i128,
    pub fee: i128,
}

#[contractevent]
pub struct UpgradeProposed {
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub ready_at: u64,
}

#[contractevent]
pub struct UpgradeCancelled {
    #[topic]
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
pub struct Upgraded {
    #[topic]
    pub wasm_hash: BytesN<32>,
}

#[contract]
pub struct LicenceContract;

#[contractimpl]
impl LicenceContract {
    pub fn __constructor(
        env: &Env,
        admin: Address,
        consent: Address,
        vault: Address,
        token: Address,
        treasury: Address,
        fee_bps: u32,
        hold: u64,
    ) {
        if fee_bps > MAX_FEE_BPS {
            panic!("fee_bps above the ceiling");
        }
        if hold > MAX_HOLD_SECS {
            panic!("hold above the ceiling");
        }
        let config = Config {
            consent,
            vault,
            token,
            treasury,
            fee_bps,
            hold,
        };
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    /// Buy one licence per item, paid in one transfer from the buyer.
    /// Returns the new licence ids in item order.
    pub fn purchase(env: &Env, buyer: Address, items: Vec<Item>) -> Result<Vec<u64>, Error> {
        buyer.require_auth();

        if items.is_empty() {
            return Err(Error::EmptyBasket);
        }
        if items.len() > MAX_BASKET {
            return Err(Error::BasketTooLarge);
        }

        let config = Self::config(env);
        let consent = ConsentClient::new(env, &config.consent);
        let now = env.ledger().timestamp();
        let mut next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0);

        let mut total: i128 = 0;
        let mut ids = Vec::new(env);

        for item in items.iter() {
            if item.price <= 0 {
                return Err(Error::InvalidAmount);
            }

            let reference_key = DataKey::Reference(item.reference.clone());
            if env.storage().persistent().has(&reference_key) {
                return Err(Error::ReferenceUsed);
            }

            let receipt = match consent.try_receipt(&item.receipt_id) {
                Ok(Ok(receipt)) => receipt,
                _ => return Err(Error::ConsentNotValid),
            };
            if receipt.revoked_at.is_some() || now >= receipt.expires_at {
                return Err(Error::ConsentNotValid);
            }

            let fee = item.price * (config.fee_bps as i128) / BPS;
            let due_at = now.saturating_add(config.hold).min(receipt.expires_at);

            let licence = Licence {
                id: next,
                buyer: buyer.clone(),
                contributor: receipt.contributor.clone(),
                receipt_id: item.receipt_id,
                reference: item.reference.clone(),
                paid: item.price,
                fee,
                purchased_at: now,
                due_at,
                expires_at: receipt.expires_at,
                state: State::Held,
                credited: 0,
                refunded: 0,
            };
            Self::store(env, &licence);
            env.storage().persistent().set(&reference_key, &next);
            env.storage()
                .persistent()
                .extend_ttl(&reference_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);

            Licensed {
                buyer: buyer.clone(),
                contributor: receipt.contributor,
                licence_id: next,
                receipt_id: item.receipt_id,
                paid: item.price,
                fee,
                expires_at: receipt.expires_at,
            }
            .publish(env);

            ids.push_back(next);
            total += item.price;
            next += 1;
        }

        env.storage().instance().set(&DataKey::NextId, &next);
        token::Client::new(env, &config.token).transfer(
            &buyer,
            &env.current_contract_address(),
            &total,
        );
        Self::bump_instance(env);

        Ok(ids)
    }

    /// Close one licence: refund if the receipt was revoked during the hold,
    /// pay out if the hold is over. Anyone may call it.
    pub fn settle(env: &Env, id: u64) -> Result<State, Error> {
        let licence = Self::load(env, id)?;
        Self::close(env, licence)
    }

    /// `settle` for several licences. Ids that are not due, already closed or
    /// unknown are skipped rather than failing the batch. Returns the ids that
    /// were closed.
    pub fn settle_many(env: &Env, ids: Vec<u64>) -> Result<Vec<u64>, Error> {
        if ids.len() > MAX_SETTLE {
            return Err(Error::BasketTooLarge);
        }
        let mut closed = Vec::new(env);
        for id in ids.iter() {
            let licence = match Self::load(env, id) {
                Ok(licence) => licence,
                Err(_) => continue,
            };
            if Self::close(env, licence).is_ok() {
                closed.push_back(id);
            }
        }
        Ok(closed)
    }

    pub fn licence(env: &Env, id: u64) -> Result<Licence, Error> {
        Self::load(env, id)
    }

    /// The licence bought under this sale reference, if any.
    pub fn licence_for(env: &Env, reference: BytesN<32>) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::Reference(reference))
    }

    /// Licences issued so far. Ids run from 0 to this minus one.
    pub fn count(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0)
    }

    pub fn config(env: &Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .expect("contract not initialised")
    }

    /// Change the fee for purchases from now on. Licences already bought keep
    /// the fee they were sold with.
    pub fn set_fee(env: &Env, fee_bps: u32) -> Result<(), Error> {
        Self::admin(env).require_auth();
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let mut config = Self::config(env);
        config.fee_bps = fee_bps;
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(env);
        Ok(())
    }

    /// Change the hold for purchases from now on.
    pub fn set_hold(env: &Env, hold: u64) -> Result<(), Error> {
        Self::admin(env).require_auth();
        if hold > MAX_HOLD_SECS {
            return Err(Error::HoldTooLong);
        }
        let mut config = Self::config(env);
        config.hold = hold;
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(env);
        Ok(())
    }

    pub fn set_treasury(env: &Env, treasury: Address) {
        Self::admin(env).require_auth();
        let mut config = Self::config(env);
        config.treasury = treasury;
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(env);
    }

    /// Announce new code. `upgrade` applies it once `UPGRADE_DELAY` has passed
    /// and not before. Proposing again replaces the pending code and restarts
    /// the clock. Returns the moment it becomes applicable.
    pub fn propose_upgrade(env: &Env, new_wasm_hash: BytesN<32>) -> u64 {
        Self::admin(env).require_auth();
        let ready_at = env.ledger().timestamp() + UPGRADE_DELAY;
        let pending = PendingUpgrade {
            wasm_hash: new_wasm_hash.clone(),
            ready_at,
        };
        env.storage().instance().set(&DataKey::PendingUpgrade, &pending);
        Self::bump_instance(env);

        UpgradeProposed {
            wasm_hash: new_wasm_hash,
            ready_at,
        }
        .publish(env);
        ready_at
    }

    /// Drop the pending upgrade.
    pub fn cancel_upgrade(env: &Env) -> Result<(), Error> {
        Self::admin(env).require_auth();
        let pending = Self::pending_upgrade(env).ok_or(Error::UpgradeNotProposed)?;
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        Self::bump_instance(env);

        UpgradeCancelled {
            wasm_hash: pending.wasm_hash,
        }
        .publish(env);
        Ok(())
    }

    pub fn pending_upgrade(env: &Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    /// Swap the contract's code for the proposed code once its delay is up.
    pub fn upgrade(env: &Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(env).require_auth();
        let pending = Self::pending_upgrade(env).ok_or(Error::UpgradeNotProposed)?;
        if pending.wasm_hash != new_wasm_hash {
            return Err(Error::UpgradeNotProposed);
        }
        if env.ledger().timestamp() < pending.ready_at {
            return Err(Error::UpgradeNotReady);
        }

        env.storage().instance().remove(&DataKey::PendingUpgrade);
        Self::bump_instance(env);
        Upgraded {
            wasm_hash: new_wasm_hash.clone(),
        }
        .publish(env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

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

    fn close(env: &Env, mut licence: Licence) -> Result<State, Error> {
        if licence.state != State::Held {
            return Err(Error::AlreadyClosed);
        }

        let config = Self::config(env);
        let now = env.ledger().timestamp();

        // An archived or missing receipt reads as not revoked. The licence then
        // settles normally once due.
        let revoked_at = match ConsentClient::new(env, &config.consent)
            .try_receipt(&licence.receipt_id)
        {
            Ok(Ok(receipt)) => receipt.revoked_at,
            _ => None,
        };

        let (credited, fee, refunded) = match revoked_at {
            Some(at) if at < licence.due_at => {
                // The buyer keeps paying for the time they had. Everything
                // after the revocation comes back, fee included.
                let term = (licence.expires_at - licence.purchased_at) as i128;
                let used = (at.saturating_sub(licence.purchased_at) as i128).min(term);
                let earned = licence.paid * used / term;
                let fee = licence.fee * used / term;
                (earned - fee, fee, licence.paid - earned)
            }
            _ => {
                if now < licence.due_at {
                    return Err(Error::NotDue);
                }
                (licence.paid - licence.fee, licence.fee, 0)
            }
        };

        let token = token::Client::new(env, &config.token);
        let here = env.current_contract_address();

        if refunded > 0 {
            token.transfer(&here, &licence.buyer, &refunded);
        }
        if fee > 0 {
            token.transfer(&here, &config.treasury, &fee);
        }
        if credited > 0 {
            // Moved in first so the vault's funded check passes, then credited
            // under the sale's own reference.
            token.transfer(&here, &config.vault, &credited);
            VaultClient::new(env, &config.vault).credit(
                &here,
                &licence.contributor,
                &credited,
                &licence.reference,
            );
        }

        licence.credited = credited;
        licence.refunded = refunded;
        licence.state = if refunded > 0 {
            State::Refunded
        } else {
            State::Settled
        };
        Self::store(env, &licence);
        Self::bump_instance(env);

        if refunded > 0 {
            Refunded {
                buyer: licence.buyer.clone(),
                licence_id: licence.id,
                refunded,
                credited,
                fee,
            }
            .publish(env);
        } else {
            Settled {
                contributor: licence.contributor.clone(),
                licence_id: licence.id,
                credited,
                fee,
            }
            .publish(env);
        }

        Ok(licence.state)
    }

    fn load(env: &Env, id: u64) -> Result<Licence, Error> {
        let key = DataKey::Licence(id);
        let licence: Licence = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);
        Ok(licence)
    }

    fn store(env: &Env, licence: &Licence) {
        let key = DataKey::Licence(licence.id);
        env.storage().persistent().set(&key, licence);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL);
    }
}

mod test;
