"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GoogleLink } from "@/components/auth/google-link";
import { WalletGate } from "@/components/dashboard/wallet-gate";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { formatDate } from "@/lib/format";
import { explorerAccountUrl, formatMoney } from "@/lib/stellar/config";
import {
  listLicences,
  readBuyerProfile,
  type BuyerProfile,
  type Licence,
} from "@/lib/supabase/market";
import { BuyerProfileForm } from "./buyer-profile";

/**
 * The buyer's account.
 *
 * Who you are, on the side of the product that has to say so. The contributor
 * side asks for nothing — a wallet uploads and is paid — and that asymmetry is
 * deliberate: a buyer is making a commercial claim about what they will do
 * with someone else's data, and "an address paid" is not something a
 * contributor can hold anyone to.
 *
 * It used to be askable only once, inside the checkout sheet, at the worst
 * possible moment: filling in a company name with a signature request waiting.
 * It lives here now, editable whenever, and the checkout only interrupts when
 * there is nothing on file at all.
 */
export function BuyerProfilePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <header>
        <p className="eyebrow text-ink-faint">Marketplace</p>
        <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
          Your profile
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-ink-dim">
          What a licence says about who bought it, and which account reaches
          this wallet.
        </p>
      </header>

      <WalletGate message="Sign in to see and edit your buyer details.">
        <Inner />
      </WalletGate>
    </div>
  );
}

function Inner() {
  const { address, session } = useWallet();
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [licences, setLicences] = useState<Licence[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const wallet = session?.wallet ?? address ?? null;

  const read = useCallback(async (owner: string) => {
    const [found, held] = await Promise.all([
      readBuyerProfile(owner).catch(() => null),
      listLicences(owner).catch(() => [] as Licence[]),
    ]);
    return { found, held };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    read(wallet)
      .then(({ found, held }) => {
        if (!live) return;
        setProfile(found);
        setLicences(held);
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [wallet, read]);

  if (!wallet || !loaded) {
    return (
      <div className="mt-10 space-y-3">
        <div className="h-64 animate-pulse rounded-2xl border border-rule bg-paper" />
        <div className="h-28 animate-pulse rounded-2xl border border-rule bg-paper" />
      </div>
    );
  }

  // Everything this wallet has spent, per asset. Read from the licences it
  // holds rather than from a total anyone else keeps.
  const spent = (licences ?? []).reduce<Record<string, number>>(
    (total, licence) => ({
      ...total,
      [licence.asset]:
        (total[licence.asset] ?? 0) + Number(licence.price_stroops),
    }),
    {},
  );

  return (
    <div className="mt-10 space-y-3">
      <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-ink">Buyer details</h2>
          {saved && (
            <span className="text-xs text-rise">Saved</span>
          )}
        </div>
        <p className="mt-2 max-w-lg text-pretty text-sm text-ink-dim">
          Licences name the organisation that bought them, and the contributors
          you license from can see it. Self-declared: nothing here verifies that
          a company is who it says, and what it establishes is that whoever
          holds this key said this.
        </p>

        <div className="mt-5">
          <BuyerProfileForm
            wallet={wallet}
            profile={profile}
            onSaved={(next) => {
              setProfile(next);
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-7">
        <h2 className="text-sm font-medium text-ink">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Wallet">
            <a
              href={explorerAccountUrl(wallet)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-ink-dim underline-offset-4 hover:text-ink hover:underline"
            >
              {wallet}
            </a>
          </Field>
          <Field label="Licences held">
            <Link
              href="/market/licences"
              className="text-ink-dim underline-offset-4 hover:text-ink hover:underline"
            >
              {(licences ?? []).length}
            </Link>
          </Field>
          <Field label="Spent">
            <span className="tabular-nums text-ink-dim">
              {formatMoney(spent)}
            </span>
          </Field>
        </dl>

        {profile && (
          <p className="mt-4 text-xs text-ink-faint">
            Filed {formatDate(profile.created_at)}
            {profile.updated_at !== profile.created_at && (
              <> · last changed {formatDate(profile.updated_at)}</>
            )}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-7">
        <GoogleLink />
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
