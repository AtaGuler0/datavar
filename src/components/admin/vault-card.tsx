"use client";

import { useCallback, useEffect, useState } from "react";
import { changeOperator, creditPending } from "@/lib/payouts";
import {
  explorerContractUrl,
  explorerTxUrl,
  formatXlm,
  PAYOUT_CONTRACT_ID,
  truncateAddress,
} from "@/lib/stellar/config";
import { useWallet } from "@/components/dashboard/wallet-provider";

/**
 * The payout vault, from the operator's side.
 *
 * Two numbers matter and they are in tension: what the contract holds, and how
 * much of that is already owed to contributors. The difference is the headroom
 * for crediting new sales — and it is also the only part the operator can ever
 * take back out. Once a sale is credited, that money answers to the
 * contributor's key, not ours.
 *
 * Crediting is the operator's whole job here. It is what turns a row in our
 * database into a claim nobody needs our permission to collect — and the
 * operator signs it with their own wallet, like a contributor signs a claim.
 * The server has no key for this and cannot do it alone, which is why the roles
 * are shown rather than assumed: the contract keeps its own list of who may
 * credit, and a panel that doesn't say who is on it leaves you guessing at a
 * refusal.
 *
 * Being in `ADMIN_WALLETS` gets you into this panel. It does not get you past
 * the contract, which has never heard of our environment — the two lists are
 * kept in step by hand, from here.
 */

/** The vault's on-chain roles, as GET /api/payouts reports them. */
type Roles = { operators: string[] | null; admin: string | null };

export function VaultCard({
  pendingCount,
  pendingStroops,
  onCredited,
}: {
  pendingCount: number;
  pendingStroops: number;
  onCredited: () => void;
}) {
  const { address, signTransaction } = useWallet();

  const [vault, setVault] = useState<{
    funded: number;
    owed: number;
    surplus: number;
  } | null>(null);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"credit" | "role" | null>(null);
  const [note, setNote] = useState<{ text: string; hash?: string } | null>(null);

  const read = useCallback(async () => {
    const res = await fetch("/api/payouts");
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error);
    return {
      vault: body.vault as { funded: number; owed: number; surplus: number },
      roles: (body.roles ?? { operators: null, admin: null }) as Roles,
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await read();
      setVault(next.vault);
      setRoles(next.roles);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [read]);

  useEffect(() => {
    let cancelled = false;
    read()
      .then((next) => {
        if (cancelled) return;
        setVault(next.vault);
        setRoles(next.roles);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [read]);

  // Whether the contract will accept a credit from this wallet, and whether
  // this wallet is the one that decides who it accepts them from.
  const operators = roles?.operators ?? null;
  const isOperator = !!address && !!operators?.includes(address);
  const isContractAdmin = !!address && roles?.admin === address;

  /** Crediting is the only thing this panel can ask the contract to do. */
  const credit = async () => {
    if (busy) return;
    setBusy("credit");
    setNote(null);
    try {
      const result = await creditPending(signTransaction);
      await refresh();

      const reconciled =
        result.reconciled > 0
          ? ` ${result.reconciled} were already on-chain and have been put right.`
          : "";
      setNote({
        text:
          result.warning ??
          (result.credited === 0
            ? `Nothing was waiting to be credited.${reconciled}`
            : `${result.credited} sale${result.credited === 1 ? "" : "s"} credited on-chain.${reconciled}`),
        hash: result.hashes[0],
      });
      onCredited();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "That didn't go through." });
    } finally {
      setBusy(null);
    }
  };

  /** The contract's admin letting a wallet credit, or stopping it. */
  const changeRole = async (
    action: "add-operator" | "remove-operator",
    operator?: string,
  ) => {
    if (busy) return;
    setBusy("role");
    setNote(null);
    try {
      const hash = await changeOperator(signTransaction, action, operator);
      await refresh();
      setNote({
        text:
          action === "add-operator"
            ? `${operator ? truncateAddress(operator, 4, 4) : "This wallet"} can now credit the vault.`
            : `${truncateAddress(operator ?? "", 4, 4)} can no longer credit the vault.`,
        hash,
      });
    } catch (e) {
      setNote({
        text: e instanceof Error ? e.message : "The change didn't go through.",
      });
    } finally {
      setBusy(null);
    }
  };

  if (!PAYOUT_CONTRACT_ID) {
    return (
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-7 sm:p-9">
        <p className="eyebrow text-chalk-faint">Payout vault</p>
        <p className="mt-3 text-lg text-balance text-chalk">
          No payout contract configured.
        </p>
        <p className="mt-2 max-w-md text-sm text-pretty text-chalk-dim">
          Set NEXT_PUBLIC_PAYOUT_CONTRACT_ID and restart. Sales can still be
          recorded, but nothing can be credited and nobody can claim.
        </p>
      </div>
    );
  }

  const short = vault !== null && pendingStroops > vault.surplus;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-7 p-7 sm:flex-row sm:items-start sm:justify-between sm:p-9">
        <div className="min-w-0">
          <p className="eyebrow text-chalk-faint">Payout vault</p>
          <p className="mt-3 display text-[2.5rem] font-medium tabular-nums text-chalk sm:text-[3rem]">
            {failed ? "—" : vault === null ? "…" : formatXlm(vault.funded)}
            <span className="ml-2 text-lg font-normal text-chalk-dim">XLM</span>
          </p>

          <p className="mt-3 text-sm text-pretty text-chalk-dim">
            {failed
              ? "The contract didn't answer."
              : vault === null
                ? "Reading the contract…"
                : `${formatXlm(vault.owed)} XLM is already owed to contributors and can't be taken back. ${formatXlm(vault.surplus)} XLM is free to credit against.`}
          </p>

          {vault !== null && pendingCount > 0 && (
            <p className="mt-2 text-sm text-pretty text-chalk-dim">
              {short
                ? `${formatXlm(pendingStroops)} XLM of sales is waiting and the vault is short — fund it before crediting.`
                : `${formatXlm(pendingStroops)} XLM across ${pendingCount} sale${pendingCount === 1 ? "" : "s"} is waiting to be credited.`}
            </p>
          )}

          {/* Which wallets the contract will take a credit from. Said out loud
              because the panel can't do it for you: the signature comes from
              whoever is signed in, and a refusal is otherwise a mystery. */}
          {roles && !isOperator && (
            <p className="mt-2 text-sm text-pretty text-amber-200/80">
              {operators === null
                ? "The contract didn't say who may credit it."
                : operators.length === 0
                  ? "No wallet may credit this vault yet."
                  : `Crediting is signed by an operator, and this wallet isn't one of the ${operators.length}.`}
              {isContractAdmin
                ? " You hold the contract's admin key, so you can add it below."
                : " Sign in as an operator, or ask the contract's admin to add this wallet."}
            </p>
          )}

          <a
            href={explorerContractUrl(PAYOUT_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            {truncateAddress(PAYOUT_CONTRACT_ID, 6, 6)}
            <ExternalArrow />
          </a>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={credit}
            disabled={busy !== null || pendingCount === 0 || !isOperator}
            className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-40"
          >
            {busy === "credit"
              ? "Waiting for your wallet…"
              : pendingCount === 0
                ? "Nothing to credit"
                : `Credit ${pendingCount} sale${pendingCount === 1 ? "" : "s"}`}
          </button>

          {isContractAdmin && !isOperator && (
            <button
              type="button"
              onClick={() => changeRole("add-operator")}
              disabled={busy !== null}
              className="inline-flex items-center rounded-lg border border-ink-800 px-5 py-2.5 text-sm font-medium text-chalk transition-colors duration-200 hover:bg-ink-800/60 disabled:opacity-40"
            >
              {busy === "role" ? "Waiting for your wallet…" : "Let this wallet credit"}
            </button>
          )}

          {/* No "fund the vault" control, on purpose: this server holds no
              money to move. Topping the vault up is done from outside, by
              whoever chooses to put test XLM into the contract. */}
          <button
            type="button"
            onClick={refresh}
            className="text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            Refresh vault
          </button>

          {note && (
            <p className="max-w-64 text-right text-xs text-pretty text-chalk-dim">
              {note.text}{" "}
              {note.hash && (
                <a
                  href={explorerTxUrl(note.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-ink-800 underline-offset-4 hover:decoration-chalk-dim"
                >
                  {note.hash.slice(0, 8)}…
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      {operators && (
        <OperatorList
          operators={operators}
          you={address}
          canChange={isContractAdmin}
          busy={busy !== null}
          onAdd={(who) => changeRole("add-operator", who)}
          onRemove={(who) => changeRole("remove-operator", who)}
        />
      )}
    </div>
  );
}

/**
 * Who may credit, and — for the wallet that decides it — the way to change that.
 *
 * This is the seam between our environment and the ledger. `ADMIN_WALLETS` says
 * who gets into this panel; the contract says whose signature it will take. Both
 * lists are short and neither can read the other, so the second one is shown
 * here in full rather than described.
 */
function OperatorList({
  operators,
  you,
  canChange,
  busy,
  onAdd,
  onRemove,
}: {
  operators: string[];
  you: string | null;
  canChange: boolean;
  busy: boolean;
  onAdd: (wallet: string) => void;
  onRemove: (wallet: string) => void;
}) {
  const [adding, setAdding] = useState("");

  return (
    <div className="border-t border-ink-800 px-7 py-5 sm:px-9">
      <p className="eyebrow text-chalk-faint">
        {operators.length === 0
          ? "Nobody may credit"
          : `${operators.length} wallet${operators.length === 1 ? "" : "s"} may credit`}
      </p>

      {operators.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {operators.map((operator) => (
            <li
              key={operator}
              className="flex items-center justify-between gap-4 font-mono text-xs text-chalk-dim"
            >
              <span className="truncate">
                {truncateAddress(operator, 6, 6)}
                {operator === you && (
                  <span className="ml-2 font-sans text-chalk-faint">this wallet</span>
                )}
              </span>
              {canChange && (
                <button
                  type="button"
                  onClick={() => onRemove(operator)}
                  disabled={busy}
                  className="shrink-0 font-sans text-chalk-faint transition-colors hover:text-chalk disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canChange && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const wallet = adding.trim();
            if (!wallet) return;
            setAdding("");
            onAdd(wallet);
          }}
        >
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="G… wallet to let credit"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-xs text-chalk placeholder:text-chalk-faint focus:border-chalk-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || adding.trim().length === 0}
            className="shrink-0 rounded-lg border border-ink-800 px-4 py-2 text-xs font-medium text-chalk transition-colors hover:bg-ink-800/60 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}

      <p className="mt-3 max-w-lg text-xs text-pretty text-chalk-faint">
        An operator can only say whose the money in the vault is. It cannot pay
        anyone, take a credit back, or move funds — so adding one costs nothing
        that was ever ours to keep.
        {!canChange && " Only the contract's admin can change this list."}
      </p>
    </div>
  );
}

function ExternalArrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.5 2.5h4v4M13.5 2.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 3.5H4A1.5 1.5 0 002.5 5v7A1.5 1.5 0 004 13.5h7a1.5 1.5 0 001.5-1.5V9.5" strokeLinecap="round" />
    </svg>
  );
}
