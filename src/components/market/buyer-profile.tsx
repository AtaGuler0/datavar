"use client";

import { useState } from "react";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { saveBuyerProfile, type BuyerProfile } from "@/lib/supabase/market";

/**
 * Who is buying.
 *
 * The contributor side of this product asks for nothing — a wallet uploads and
 * is paid, and that asymmetry is on purpose. A buyer is the other case: they
 * are making a commercial claim about what they will do with someone else's
 * data, and "an address paid" is not something a contributor can hold anyone
 * to. So this is asked once, before the first licence, and it is written to a
 * row only that wallet can write.
 *
 * It is self-declared and the form says so. Nothing here verifies that a
 * company is who it says; what it establishes is that whoever holds this key
 * said this, which is exactly as much as a signature ever proves.
 */
export function BuyerProfileForm({
  wallet,
  profile,
  onSaved,
  compact = false,
}: {
  wallet: string;
  profile: BuyerProfile | null;
  onSaved: (profile: BuyerProfile) => void;
  compact?: boolean;
}) {
  // The Google address, when there is one, is the email this person already
  // proved they read. Prefilled rather than imposed: a buyer filing on behalf
  // of a team usually wants a shared inbox here, and can just type over it.
  const { google } = useWallet();
  const [org, setOrg] = useState(profile?.org ?? "");
  const [contact, setContact] = useState(
    profile?.contact ?? google?.email ?? "",
  );
  const [intent, setIntent] = useState(profile?.intent ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      onSaved(await saveBuyerProfile({ wallet, org, contact, intent }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That didn't save. Check the fields and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {!compact && (
        <p className="text-pretty text-sm text-ink-dim">
          Licences name the organisation that bought them, and the contributors
          you license from can see it. Filed once, editable any time.
        </p>
      )}

      <Field
        label="Organisation"
        value={org}
        onChange={setOrg}
        placeholder="Northwind AI"
        required
        maxLength={120}
      />
      <Field
        label="Contact email"
        value={contact}
        onChange={setContact}
        placeholder="data@northwind.ai"
        type="email"
        required
        maxLength={160}
      />
      <Field
        label="What you'll use the data for"
        value={intent}
        onChange={setIntent}
        placeholder="Training a driver-assistance model on dashcam footage."
        maxLength={400}
        optional
      />

      {error && <p className="text-sm text-fall">{error}</p>}

      <button
        type="submit"
        disabled={saving || org.trim().length < 2 || !contact.includes("@")}
        className="inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
      >
        {saving ? "Saving…" : profile ? "Update details" : "Save details"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  optional,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[0.6875rem] text-ink-faint">
        {label}
        {optional && <span>Optional</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-rule-strong"
      />
    </label>
  );
}
