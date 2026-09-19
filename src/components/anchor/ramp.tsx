"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { AnchorError, anchorCurrency, loadAnchorToml } from "@/lib/anchor/client";
import { buildTrustlineTx, readAssetState, submitSigned, submitFailureReason } from "@/lib/anchor/chain";
import { ANCHOR_ASSET_CODE, ANCHOR_HOME_DOMAIN, FIAT_CODE } from "@/lib/anchor/config";
import { acceptCustomer, fetchCustomer } from "@/lib/anchor/sep12";
import { fetchHeadlineRate } from "@/lib/anchor/sep38";
import { authenticate, readAnchorSession } from "@/lib/anchor/session";
import type { AnchorCurrency, AnchorSession } from "@/lib/anchor/types";
import { Activity } from "./activity";
import { DepositFlow } from "./deposit-flow";
import { WithdrawFlow } from "./withdraw-flow";

/**
 * The TRY ramp.
 *
 * This is the only part of datavar that touches a bank. It is also the only
 * part that talks to a server we do not run: everything below goes straight
 * from the browser to the anchor, authenticated by the same wallet the rest of
 * the product uses and by nothing else. No API key, no account, no password —
 * the user's key is the identity, on both sides.
 *
 * Why it exists here at all: the marketplace takes USDC, and a Turkish team
 * with a budget in lira has no way to hold any. The ramp is the missing step
 * between "we would license this data" and "we have paid for it". It works the
 * other way round for contributors, who earn USDC and spend lira.
 *
 * The anchor is a testnet mock. The bank leg is simulated and says so on every
 * screen; the Stellar leg is real testnet USDC, and the same code speaks to a
 * production SEP anchor by changing the home domain.
 */

type Tab = "deposit" | "withdraw" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "deposit", label: `${FIAT_CODE} → ${ANCHOR_ASSET_CODE}` },
  { id: "withdraw", label: `${ANCHOR_ASSET_CODE} → ${FIAT_CODE}` },
  { id: "activity", label: "Activity" },
];

export function Ramp() {
  const { address, canSign, connect, signTransaction } = useWallet();

  const [tab, setTab] = useState<Tab>("deposit");
  const [session, setSession] = useState<AnchorSession | null>(null);
  const [currency, setCurrency] = useState<AnchorCurrency | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [busy, setBusy] = useState<"auth" | "trust" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What the anchor advertises, before anybody signs anything. Deliberately
  // ahead of the wallet: a visitor should be able to read the rate and decide
  // whether this is worth connecting for.
  useEffect(() => {
    let live = true;
    loadAnchorToml()
      .then(async (toml) => {
        if (!live) return;
        setOrgName(toml.orgName ?? toml.homeDomain);
        setCurrency(await anchorCurrency());
        const headline = await fetchHeadlineRate("1000").catch(() => null);
        if (live && headline) setRate(headline.price);
      })
      .catch((e) => live && setError(said(e)));
    return () => {
      live = false;
    };
  }, []);

  // A session from earlier in this tab, and what the account can hold. Both
  // are external state read on the way in, so both land through a callback:
  // writing them straight into the effect body costs a render pass for
  // something nothing has asked to see yet.
  useEffect(() => {
    if (!address || !currency) return;
    let live = true;

    (async () => {
      const stored = readAnchorSession(ANCHOR_HOME_DOMAIN, address);
      if (live && stored) setSession(stored);

      const state = await readAssetState(address, currency).catch(() => null);
      if (!live || !state) return;
      setTrusted(state.trusted);
      setBalance(state.balance);
    })();

    return () => {
      live = false;
    };
  }, [address, currency]);

  /** Re-reads the trustline and balance after something has changed them. */
  const readState = useCallback(async () => {
    if (!address || !currency) return;
    const state = await readAssetState(address, currency);
    setTrusted(state.trusted);
    setBalance(state.balance);
  }, [address, currency]);

  /** SEP-10 against the anchor, then its simulated KYC in the same breath. */
  const signIn = async () => {
    if (!address || busy) return;
    setBusy("auth");
    setError(null);
    try {
      const next = await authenticate(address, signTransaction);
      setSession(next);
      // The mock asks for nothing, but the call is real: a production anchor
      // answers it with the fields it needs, and this is where that form goes.
      const status = await fetchCustomer(address, next.token).catch(() => null);
      if (status && status.status !== "ACCEPTED") {
        await acceptCustomer(address, next.token).catch(() => undefined);
      }
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(null);
    }
  };

  /** The trustline. Without it USDC cannot reach this account at all. */
  const addTrustline = async () => {
    if (!address || !currency || busy) return;
    setBusy("trust");
    setError(null);
    try {
      const xdr = await buildTrustlineTx(address, currency);
      const signed = await signTransaction(xdr);
      await submitSigned(signed);
      await readState();
    } catch (e) {
      setError(submitFailureReason(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <header>
        <p className="eyebrow text-ink-faint">Ramp</p>
        <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
          Turkish lira in, USDC out.
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-ink-dim">
          The marketplace takes USDC. This is where you get some, and where the
          data you sell turns back into lira. The bank leg is simulated; the
          Stellar leg is real testnet USDC.
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          <Fact label="Anchor" value={orgName ?? ANCHOR_HOME_DOMAIN} />
          <Fact
            label={`${ANCHOR_ASSET_CODE}/${FIAT_CODE}`}
            value={rate ? Number(rate).toFixed(4) : "—"}
          />
          <Fact
            label="Your balance"
            value={`${Number(balance).toFixed(2)} ${ANCHOR_ASSET_CODE}`}
          />
        </dl>
      </header>

      {!address ? (
        <Panel
          message="Sign in to use the ramp. The anchor authenticates the same wallet datavar does, with a signature and nothing else."
          label="Sign in"
          onClick={connect}
        />
      ) : !canSign ? (
        <Panel
          message="Connect your Stellar wallet to use the ramp. Every step here is a signature, and a Google session cannot give one."
          label="Connect wallet"
          onClick={connect}
        />
      ) : !session ? (
        <Panel
          message={`Sign in at ${orgName ?? ANCHOR_HOME_DOMAIN}. It is a SEP-10 challenge: a transaction that can never reach the network, signed to prove the wallet is yours. The anchor learns your address and nothing else.`}
          label={busy === "auth" ? "Waiting for your wallet…" : "Sign in to the anchor"}
          onClick={signIn}
          disabled={busy !== null}
        />
      ) : (
        <>
          {trusted === false && (
            <div className="mt-8 rounded-2xl border border-rule bg-paper-raised/60 p-5">
              <p className="text-sm text-pretty text-ink-dim">
                Your account cannot hold {ANCHOR_ASSET_CODE} yet. A trustline is
                one signed transaction, and it is what gives the asset somewhere
                to land — for a deposit, and for a {ANCHOR_ASSET_CODE} payout
                you claim from the vault.
              </p>
              <button
                type="button"
                onClick={addTrustline}
                disabled={busy !== null}
                className="mt-3 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
              >
                {busy === "trust"
                  ? "Waiting for your wallet…"
                  : `Add the ${ANCHOR_ASSET_CODE} trustline`}
              </button>
            </div>
          )}

          <nav className="mt-8 flex items-center gap-1 border-b border-rule">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                  tab === t.id
                    ? "border-slate-deep text-ink"
                    : "border-transparent text-ink-dim hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="mt-6">
            {tab === "deposit" && currency && (
              <DepositFlow
                session={session}
                trusted={trusted !== false}
                onSettled={readState}
              />
            )}
            {tab === "withdraw" && currency && (
              <WithdrawFlow
                session={session}
                currency={currency}
                balance={balance}
                signTransaction={signTransaction}
                onSettled={readState}
              />
            )}
            {tab === "activity" && <Activity session={session} />}
          </div>
        </>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-pretty text-fall">
          {error}
        </p>
      )}
    </div>
  );
}

/** The anchor's own sentence where there is one, ours where there isn't. */
export function said(e: unknown): string {
  if (e instanceof AnchorError) return e.message;
  return e instanceof Error ? e.message : "That didn't go through.";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Panel({
  message,
  label,
  onClick,
  disabled,
}: {
  message: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-rule bg-paper px-6 py-12 text-center shadow-sm shadow-ink/[0.03]">
      <p className="mx-auto max-w-md text-pretty text-ink-dim">{message}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-6 rounded-lg bg-slate-deep px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-70"
      >
        {label}
      </button>
    </div>
  );
}
