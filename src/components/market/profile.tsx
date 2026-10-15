"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GoogleLink } from "@/components/auth/google-link";
import { Corners } from "@/components/dashboard/primitives";
import { BuyerCardFigure } from "../app-figures";
import { MarketPage } from "./chrome";
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
    <MarketPage
      section="Profile"
      title="Your profile."
      aside="Who a licence says bought it."
      description="The organisation your licences name, and which account reaches this wallet."
    >
      <WalletGate
        message="Sign in to see and edit your buyer details."
        figure={<BuyerCardFigure />}
      >
        <Inner />
      </WalletGate>
    </MarketPage>
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
        <div className="h-64 animate-pulse rounded-xl border border-line bg-white/[0.02]" />
        <div className="h-28 animate-pulse rounded-xl border border-line bg-white/[0.02]" />
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
    <div className="mt-10 space-y-4">
      <section className="relative rounded-xl border border-line bg-white/[0.018] p-5 sm:p-7">
        <Corners />
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[0.6875rem] tracking-[0.1em] text-star-dim uppercase">Buyer details</h2>
          {saved && (
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-signal uppercase">Saved</span>
          )}
        </div>
        <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
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

      <section className="relative rounded-xl border border-line bg-white/[0.018] p-5 sm:p-7">
        <Corners />
        <h2 className="font-mono text-[0.6875rem] tracking-[0.1em] text-star-dim uppercase">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Wallet">
            <a
              href={explorerAccountUrl(wallet)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-star-dim underline-offset-4 hover:text-star hover:underline"
            >
              {wallet}
            </a>
          </Field>
          <Field label="Licences held">
            <Link
              href="/market/licences"
              className="text-[1.5rem] font-medium tracking-[-0.03em] text-star underline-offset-4 hover:underline"
            >
              {(licences ?? []).length}
            </Link>
          </Field>
          <Field label="Spent">
            <span className="text-[1.5rem] font-medium tracking-[-0.03em] text-star tabular-nums">
              {formatMoney(spent)}
            </span>
          </Field>
        </dl>

        {profile && (
          <p className="mt-5 font-mono text-[0.6875rem] tracking-[0.06em] text-star-faint uppercase">
            Filed {formatDate(profile.created_at)}
            {profile.updated_at !== profile.created_at && (
              <> · last changed {formatDate(profile.updated_at)}</>
            )}
          </p>
        )}
      </section>

      <section className="relative rounded-xl border border-line bg-white/[0.018] p-5 sm:p-7">
        <Corners />
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
      <dt className="font-mono text-[0.625rem] tracking-[0.1em] text-star-faint uppercase">{label}</dt>
      <dd className="mt-2 text-sm">{children}</dd>
    </div>
  );
}
