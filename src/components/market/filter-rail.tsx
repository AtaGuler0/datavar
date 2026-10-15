"use client";

import { SOURCE_TYPES, sourceLabel } from "@/lib/supabase/datasets";
import {
  FORMAT_GROUPS,
  type Facet,
  type ListingFilters,
} from "@/lib/supabase/market";
import { formatCount } from "@/lib/format";
import { STROOPS_PER_XLM, type PayAsset } from "@/lib/stellar/config";
import { SourceTile } from "./source-tile";

/**
 * The filters.
 *
 * Every control here maps to a column the catalogue view actually has, and
 * that constraint is doing the work: there is no "region", no "demographic"
 * and no "quality score", because this protocol does not collect any of them
 * and a filter for data we do not hold would be a lie with a checkbox next to
 * it. What a buyer can narrow by is what a contributor actually filed — the
 * kind of data, the format, the size, how recent it is — plus the two facts
 * that only exist because the consent is on a ledger: how long the permission
 * still has to run, and whether anyone has licensed it before.
 *
 * Counts come from `market_facets`, which counts listings rather than
 * datasets. A category with data but no live consent shows as absent, which is
 * the honest answer to "what can I buy".
 */

/** Size bands, as a buyer thinks about them rather than in bytes. */
const SIZES = [
  { id: "any", label: "Any size" },
  { id: "small", label: "Under 1 MB", max: 1_048_576 },
  { id: "medium", label: "1 – 10 MB", min: 1_048_576, max: 10_485_760 },
  { id: "large", label: "Over 10 MB", min: 10_485_760 },
] as const;

/** How recently the data was contributed. */
const FRESHNESS = [
  { id: "any", label: "Any time" },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
] as const;

/** How much of the consent term is left to run. */
const RUNWAY = [
  { id: "any", label: "Any remaining term" },
  { id: "30", label: "At least 30 days", days: 30 },
  { id: "90", label: "At least 90 days", days: 90 },
  { id: "180", label: "At least 6 months", days: 180 },
] as const;

export function FilterRail({
  facets,
  filters,
  onChange,
  onReset,
}: {
  facets: Facet[] | null;
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<ListingFilters>) =>
    onChange({ ...filters, ...patch });

  const toggle = (key: "sources" | "formats", value: string) => {
    const current = filters[key];
    set({
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    } as Partial<ListingFilters>);
  };

  const countFor = (source: string) =>
    facets?.find((f) => f.source_type === source)?.listings ?? 0;

  const scannedCount =
    facets === null
      ? null
      : facets.reduce((sum, facet) => sum + Number(facet.scanned), 0);

  // Categories with nothing listed are shown greyed rather than hidden: a
  // buyer looking for health data should be able to see that the category
  // exists and is empty today, not conclude the protocol has no such thing.
  const sizeId =
    SIZES.find(
      (s) =>
        ("min" in s ? s.min : undefined) === filters.minBytes &&
        ("max" in s ? s.max : undefined) === filters.maxBytes,
    )?.id ?? "any";

  const active =
    filters.sources.length +
    filters.formats.length +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (sizeId !== "any" ? 1 : 0) +
    (filters.freshDays ? 1 : 0) +
    (filters.consentDays ? 1 : 0) +
    (filters.scannedOnly ? 1 : 0) +
    (filters.unlicensedOnly ? 1 : 0);

  return (
    <aside className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 font-mono text-[0.75rem] tracking-[0.12em] text-star uppercase">
          Filters
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-star px-1.5 text-[0.6875rem] tracking-normal text-night tabular-nums">
              {active}
            </span>
          )}
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="font-mono text-[0.6875rem] tracking-[0.08em] text-star-faint uppercase transition-colors hover:text-star"
          >
            Clear all
          </button>
        )}
      </div>

      <Group label="Source">
        <div className="-mx-2 space-y-0.5">
          {SOURCE_TYPES.map((source) => {
            const count = countFor(source.id);
            return (
              <Row
                key={source.id}
                icon={<SourceTile source={source.id} className="h-4 w-5 shrink-0" />}
                label={source.label}
                hint={count > 0 ? formatCount(count) : "—"}
                muted={count === 0}
                checked={filters.sources.includes(source.id)}
                onChange={() => toggle("sources", source.id)}
              />
            );
          })}
        </div>
      </Group>

      <Group label="Format">
        <div className="flex flex-wrap gap-1.5">
          {FORMAT_GROUPS.map((group) => (
            <Chip
              key={group.id}
              label={group.label}
              checked={filters.formats.includes(group.id)}
              onClick={() => toggle("formats", group.id)}
            />
          ))}
        </div>
      </Group>

      <Group label={`Price · ${filters.asset}`}>
        <div className="flex items-center rounded-[12px] border border-line transition-colors focus-within:border-line-strong">
          <Money
            label="Minimum price"
            placeholder="Min"
            asset={filters.asset}
            value={filters.minPrice}
            onChange={(stroops) => set({ minPrice: stroops })}
          />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <Money
            label="Maximum price"
            placeholder="Max"
            asset={filters.asset}
            value={filters.maxPrice}
            onChange={(stroops) => set({ maxPrice: stroops })}
          />
        </div>
      </Group>

      <Group label="Size">
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((size) => (
            <Chip
              key={size.id}
              label={size.label}
              checked={sizeId === size.id}
              onClick={() =>
                set({
                  minBytes: "min" in size ? size.min : undefined,
                  maxBytes: "max" in size ? size.max : undefined,
                })
              }
            />
          ))}
        </div>
      </Group>

      <Group label="Contributed">
        <div className="flex flex-wrap gap-1.5">
          {FRESHNESS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              checked={(filters.freshDays ?? 0) === ("days" in option ? option.days : 0)}
              onClick={() => set({ freshDays: "days" in option ? option.days : undefined })}
            />
          ))}
        </div>
      </Group>

      <Group label="Consent remaining">
        <div className="flex flex-wrap gap-1.5">
          {RUNWAY.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              checked={(filters.consentDays ?? 0) === ("days" in option ? option.days : 0)}
              onClick={() => set({ consentDays: "days" in option ? option.days : undefined })}
            />
          ))}
        </div>
      </Group>

      <div className="space-y-1 border-t border-line pt-6">
        <Switch
          label="Checked at upload"
          hint={scannedCount === null ? undefined : formatCount(scannedCount)}
          checked={filters.scannedOnly === true}
          onChange={() => set({ scannedOnly: filters.scannedOnly ? undefined : true })}
        />
        <Switch
          label="Not licensed by anyone yet"
          checked={filters.unlicensedOnly === true}
          onChange={() => set({ unlicensedOnly: filters.unlicensedOnly ? undefined : true })}
        />
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-mono text-[0.6875rem] tracking-[0.12em] text-star-faint uppercase">{label}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A source as a selectable row: its tile, its name, how many are listed. */
function Row({
  icon,
  label,
  hint,
  muted,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  muted?: boolean;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left text-sm transition-colors ${
        checked
          ? "bg-white/[0.06] text-star"
          : muted
            ? "text-star-ghost hover:bg-white/[0.03] hover:text-star-faint"
            : "text-star-dim hover:bg-white/[0.03] hover:text-star"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
          checked ? "border-star bg-star text-night" : "border-line-strong"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.2l2.3 2.3L9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="font-mono text-[0.6875rem] text-star-faint tabular-nums">{hint}</span>
      )}
    </button>
  );
}

/** One option of a set, as a pill: white when it is the one chosen. */
function Chip({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors ${
        checked
          ? "border-star bg-star text-night"
          : "border-line text-star-dim hover:border-line-strong hover:text-star"
      }`}
    >
      {label}
    </button>
  );
}

/** An on/off filter as a switch. */
function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-3 py-2 text-left text-sm text-star-dim transition-colors hover:text-star"
    >
      <span className="min-w-0 flex-1">{label}</span>
      {hint && <span className="font-mono text-[0.6875rem] text-star-faint tabular-nums">{hint}</span>}
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-star bg-star" : "border-line-strong bg-transparent"
        }`}
      >
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all duration-200 ${
            checked ? "left-[1.1rem] bg-night" : "left-0.5 bg-star-faint"
          }`}
        />
      </span>
    </button>
  );
}

/** A decimal amount in, integer units out — money stays integers elsewhere. */
function Money({
  label,
  placeholder,
  asset,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  asset: PayAsset;
  value: number | undefined;
  onChange: (stroops: number | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center px-3 py-2.5">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        min={0}
        step={asset === "USDC" ? 0.25 : 0.5}
        inputMode="decimal"
        value={value === undefined ? "" : value / STROOPS_PER_XLM}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(
            e.target.value === "" || Number.isNaN(parsed) || parsed < 0
              ? undefined
              : Math.round(parsed * STROOPS_PER_XLM),
          );
        }}
        placeholder={placeholder}
        className="w-full min-w-0 [appearance:textfield] bg-transparent text-sm text-star tabular-nums outline-none placeholder:text-star-faint [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}

/** Re-exported for the mobile sheet, which renders the same rail in a drawer. */
export { sourceLabel };
