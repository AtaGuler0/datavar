#![no_std]

//! Datavar payouts.
//!
//! What a contributor is owed used to be a row in our database and a payment
//! our server chose to send. Both halves of that sentence were a promise rather
//! than a guarantee: we could forget the row, and we could decline to send the
//! payment. This contract removes the second half. Money for payouts sits here,
//! in ledger state, and the only key that can move it to a contributor is the
//! contributor's own.
//!
//! The shape is a vault with a ledger attached:
//!
//! - The **operator** (our server) can say *this wallet is owed this much*, and
//!   nothing else. It cannot pay anyone, cannot pay itself, and cannot take a
//!   credit back once given.
//! - The **contributor** calls `claim` with their own signature and the balance
//!   leaves the contract for their wallet. Nobody can claim on their behalf, and
//!   nobody — operator or admin — can stop them.
//! - The **admin** can upgrade the contract and withdraw *surplus*, meaning the
//!   funds beyond what is currently owed. Money already credited to a
//!   contributor is out of the admin's reach by construction.
//!
//! Three invariants carry the whole argument, and each has a test:
//!
//! 1. **A credit is always funded.** `credit` refuses if it would push the total
//!    owed past what the contract actually holds. A balance shown to a
//!    contributor is money already sitting here, not an IOU.
//! 2. **A credited balance is always claimable.** Follows from (1) plus a
//!    `withdraw` that can only touch surplus. There is no state where the
//!    dashboard says 41 XLM and the claim fails for want of funds.
//! 3. **A sale is credited once.** Each credit carries the reference of the sale
//!    it settles, and the contract remembers it. An operator that retries a
//!    failed batch cannot double-pay.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env, Vec,
};

/// Ledgers close roughly every 5 seconds, so this is about a day.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Balances and spent references are kept ~90 days per touch. A balance is
/// renewed whenever it is read or written, so an unclaimed payout stays alive
/// as long as anyone is still looking at it.
const ENTRY_TTL: u32 = 90 * DAY_IN_LEDGERS;
const ENTRY_TTL_THRESHOLD: u32 = ENTRY_TTL - 30 * DAY_IN_LEDGERS;
const INSTANCE_TTL: u32 = 120 * DAY_IN_LEDGERS;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL - 30 * DAY_IN_LEDGERS;

/// Largest batch `credit_many` accepts. A batch writes one ledger entry per
/// credit plus one per distinct contributor, and a transaction has a resource
/// budget; this keeps a well-formed call from failing on limits instead of
/// logic. The server sends smaller groups than this in practice.
const MAX_BATCH: u32 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// A credit amount that is zero or negative. Both are caller bugs: a sale
    /// worth nothing is not a sale, and a negative credit is a clawback this
    /// contract deliberately does not offer.
    InvalidAmount = 1,
    /// This sale reference has already been credited.
    AlreadyCredited = 2,
    /// The credit would leave the contract owing more than it holds. Fund it
    /// first — a balance a contributor cannot claim is worse than no balance.
    Underfunded = 3,
    /// Nothing is owed to this wallet.
    NothingToClaim = 4,
    /// A batch larger than `MAX_BATCH`.
    BatchTooLarge = 5,
    /// The admin tried to withdraw into money that is already owed to
    /// contributors. Only surplus can leave by that door.
    LockedFunds = 6,
}

/// One line of a batch: pay this contributor this much, for this sale.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credit {
    pub contributor: Address,
    /// In stroops, matching the asset's own precision. Money is integers here.
    pub amount: i128,
    /// Identifies the sale being settled — SHA-256 of the sale id. The contract
    /// treats it as opaque; all it does is refuse to see the same one twice.
    pub reference: BytesN<32>,
}

#[contracttype]
enum DataKey {
    Admin,
    Operator,
    /// The asset payouts are denominated in. Native XLM's SAC on testnet, but
    /// the contract never assumes that — it holds whatever token it was given.
    Token,
    /// Sum of every unclaimed balance. The number `withdraw` is measured
    /// against, kept as a running total so no call has to walk every balance.
    Owed,
    Balance(Address),
    Reference(BytesN<32>),
}

#[contractevent]
pub struct Funded {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Credited {
    #[topic]
    pub contributor: Address,
    pub amount: i128,
    pub reference: BytesN<32>,
    /// The contributor's balance after this credit — saves an indexer a read.
    pub balance: i128,
}

#[contractevent]
pub struct Claimed {
    #[topic]
    pub contributor: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Withdrawn {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct OperatorChanged {
    #[topic]
    pub operator: Address,
}

#[contract]
pub struct Payout;

#[contractimpl]
impl Payout {
    /// `admin` upgrades the contract and withdraws surplus. `operator` records
    /// what is owed. `token` is the asset payouts are paid in, and is fixed for
    /// the life of the contract — changing it would strand every balance
    /// credited under the old one.
    pub fn __constructor(env: &Env, admin: Address, operator: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Operator, &operator);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Owed, &0i128);
    }

    /// Move funds into the vault. Anyone may fund; the treasury is just the one
    /// that does. Sending the token to this address directly works too — this
    /// exists so the deposit shows up as an event rather than as a balance that
    /// silently changed.
    pub fn fund(env: &Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        Self::token_client(env).transfer(&from, &env.current_contract_address(), &amount);
        Self::bump_instance(env);

        Funded { from, amount }.publish(env);
        Ok(())
    }

    /// Record that one sale is owed to one contributor.
    ///
    /// The operator authorises this and gets nothing from it: the money is
    /// already in the contract, and this call only decides whose it is.
    pub fn credit(
        env: &Env,
        contributor: Address,
        amount: i128,
        reference: BytesN<32>,
    ) -> Result<i128, Error> {
        Self::operator(env).require_auth();

        let owed = Self::apply_credit(env, &contributor, amount, &reference, Self::owed(env))?;
        Self::assert_funded(env, owed)?;
        env.storage().instance().set(&DataKey::Owed, &owed);
        Self::bump_instance(env);

        Ok(Self::balance_of(env, contributor))
    }

    /// The same, for a whole sale round in one transaction.
    ///
    /// All or nothing on purpose: a partially applied batch would leave our
    /// database and the ledger disagreeing about which sales were settled, and
    /// the operator would have no way to tell which half landed.
    pub fn credit_many(env: &Env, credits: Vec<Credit>) -> Result<i128, Error> {
        Self::operator(env).require_auth();

        if credits.len() > MAX_BATCH {
            return Err(Error::BatchTooLarge);
        }

        let mut owed = Self::owed(env);
        for entry in credits.iter() {
            owed = Self::apply_credit(
                env,
                &entry.contributor,
                entry.amount,
                &entry.reference,
                owed,
            )?;
        }

        // Checked once, against the batch total: crediting five wallets is one
        // decision about whether the vault covers it, not five.
        Self::assert_funded(env, owed)?;
        env.storage().instance().set(&DataKey::Owed, &owed);
        Self::bump_instance(env);

        Ok(owed)
    }

    /// Take everything owed to you. This is the only way value leaves the
    /// contract for a contributor, and only their own signature opens it.
    pub fn claim(env: &Env, contributor: Address) -> Result<i128, Error> {
        contributor.require_auth();

        let amount = Self::balance_of(env, contributor.clone());
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }

        // Zero the balance before paying. A token whose transfer re-entered this
        // contract would find nothing left to claim twice — the same ordering
        // the sales row uses off-chain, for the same reason.
        env.storage()
            .persistent()
            .set(&DataKey::Balance(contributor.clone()), &0i128);
        env.storage()
            .instance()
            .set(&DataKey::Owed, &(Self::owed(env) - amount));

        Self::token_client(env).transfer(
            &env.current_contract_address(),
            &contributor,
            &amount,
        );
        Self::bump_instance(env);

        Claimed {
            contributor,
            amount,
        }
        .publish(env);

        Ok(amount)
    }

    /// What this wallet can claim right now.
    pub fn balance_of(env: &Env, contributor: Address) -> i128 {
        let key = DataKey::Balance(contributor);
        match env.storage().persistent().get::<_, i128>(&key) {
            Some(balance) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);
                balance
            }
            None => 0,
        }
    }

    /// Whether this sale has already been credited. What the server checks
    /// before rebuilding a batch it is not sure landed.
    pub fn is_credited(env: &Env, reference: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Reference(reference))
    }

    /// Everything the contract owes contributors, claimed or not yet.
    pub fn owed(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::Owed).unwrap_or(0)
    }

    /// What the vault holds.
    pub fn funded(env: &Env) -> i128 {
        Self::token_client(env).balance(&env.current_contract_address())
    }

    /// Funds beyond what is owed — the headroom for new credits, and the only
    /// part the admin can withdraw.
    pub fn surplus(env: &Env) -> i128 {
        Self::funded(env) - Self::owed(env)
    }

    /// Take surplus back out. Refuses to touch money already credited to a
    /// contributor, which is what makes a shown balance a real one.
    pub fn withdraw(env: &Env, to: Address, amount: i128) -> Result<(), Error> {
        Self::admin(env).require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if amount > Self::surplus(env) {
            return Err(Error::LockedFunds);
        }

        Self::token_client(env).transfer(&env.current_contract_address(), &to, &amount);
        Self::bump_instance(env);

        Withdrawn { to, amount }.publish(env);
        Ok(())
    }

    /// Hand crediting to a different key — a server key rotation, without
    /// touching balances or moving the vault.
    pub fn set_operator(env: &Env, new_operator: Address) {
        Self::admin(env).require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Operator, &new_operator);
        Self::bump_instance(env);

        OperatorChanged {
            operator: new_operator,
        }
        .publish(env);
    }

    /// Swap the contract's code. Present from the first deployment for the same
    /// reason it is in the consent contract: retrofitting it means a new address
    /// and a migration of every balance.
    pub fn upgrade(env: &Env, new_wasm_hash: BytesN<32>) {
        Self::admin(env).require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Self::bump_instance(env);
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

    pub fn operator(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Operator)
            .expect("contract not initialised")
    }

    pub fn token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .expect("contract not initialised")
    }

    /// Writes one credit and returns the new total owed. Split out so `credit`
    /// and `credit_many` cannot drift apart on the rules.
    fn apply_credit(
        env: &Env,
        contributor: &Address,
        amount: i128,
        reference: &BytesN<32>,
        owed: i128,
    ) -> Result<i128, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let reference_key = DataKey::Reference(reference.clone());
        if env.storage().persistent().has(&reference_key) {
            return Err(Error::AlreadyCredited);
        }
        env.storage().persistent().set(&reference_key, &amount);
        env.storage()
            .persistent()
            .extend_ttl(&reference_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);

        let balance_key = DataKey::Balance(contributor.clone());
        let balance = Self::balance_of(env, contributor.clone()) + amount;
        env.storage().persistent().set(&balance_key, &balance);
        env.storage()
            .persistent()
            .extend_ttl(&balance_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL);

        Credited {
            contributor: contributor.clone(),
            amount,
            reference: reference.clone(),
            balance,
        }
        .publish(env);

        Ok(owed + amount)
    }

    /// Invariant 1, in one place: never owe more than the vault holds.
    fn assert_funded(env: &Env, owed: i128) -> Result<(), Error> {
        if owed > Self::funded(env) {
            return Err(Error::Underfunded);
        }
        Ok(())
    }

    fn token_client(env: &Env) -> token::Client<'_> {
        token::Client::new(env, &Self::token(env))
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL);
    }
}

mod test;
