"use client";

import { SOURCE_TYPES, sourceLabel } from "@/lib/supabase/datasets";
import {
  FORMAT_GROUPS,
  type Facet,
  type ListingFilters,
} from "@/lib/supabase/market";
import { formatCount } from "@/lib/format";
import { STROOPS_PER_XLM, type PayAsset } from "@/lib/stellar/config";

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

  return (
    <aside className="space-y-7">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-ink">Filters</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-ink-faint transition-colors hover:text-ink"
        >
          Reset
        </button>
      </div>

      <Group label="Source">
        <div className="space-y-1.5">
          {SOURCE_TYPES.map((source) => {
            const count = countFor(source.id);
            return (
              <Check
                key={source.id}
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
        <div className="space-y-1.5">
          {FORMAT_GROUPS.map((group) => (
            <Check
              key={group.id}
              label={group.label}
              checked={filters.formats.includes(group.id)}
              onChange={() => toggle("formats", group.id)}
            />
          ))}
        </div>
      </Group>

      <Group
        label={`Price in ${filters.asset}`}
        note={
          filters.asset === "USDC"
            ? "The same datasets, on the USDC list. Switching currency at the top of the results clears this band, because the numbers mean something different on each list."
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <Money
            label="Min"
            asset={filters.asset}
            value={filters.minPrice}
            onChange={(stroops) => set({ minPrice: stroops })}
          />
          <span className="pt-5 text-ink-faint">–</span>
          <Money
            label="Max"
            asset={filters.asset}
            value={filters.maxPrice}
            onChange={(stroops) => set({ maxPrice: stroops })}
          />
        </div>
      </Group>

      <Group label="Size">
        <div className="space-y-1.5">
          {SIZES.map((size) => (
            <Radio
              key={size.id}
              name="size"
              label={size.label}
              checked={sizeId === size.id}
              onChange={() =>
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
        <div className="space-y-1.5">
          {FRESHNESS.map((option) => (
            <Radio
              key={option.id}
              name="freshness"
              label={option.label}
              checked={(filters.freshDays ?? 0) === ("days" in option ? option.days : 0)}
              onChange={() =>
                set({ freshDays: "days" in option ? option.days : undefined })
              }
            />
          ))}
        </div>
      </Group>

      <Group
        label="Consent remaining"
        note="How long the contributor's permission still has to run. A licence expires when the consent behind it does."
      >
        <div className="space-y-1.5">
          {RUNWAY.map((option) => (
            <Radio
              key={option.id}
              name="runway"
              label={option.label}
              checked={
                (filters.consentDays ?? 0) === ("days" in option ? option.days : 0)
              }
              onChange={() =>
                set({ consentDays: "days" in option ? option.days : undefined })
              }
            />
          ))}
        </div>
      </Group>

      <Group
        label="Provenance"
        note="Uploads are checked in the contributor's own browser: metadata that declares a generator, screenshots, blanks and empty exports are refused at the door. Datasets filed before that check say so."
      >
        <Check
          label="Checked at upload"
          hint={scannedCount === null ? undefined : formatCount(scannedCount)}
          checked={filters.scannedOnly === true}
          onChange={() =>
            set({ scannedOnly: filters.scannedOnly ? undefined : true })
          }
        />
      </Group>

      <Group label="Exclusivity">
        <Check
          label="Not licensed by anyone yet"
          checked={filters.unlicensedOnly === true}
          onChange={() =>
            set({ unlicensedOnly: filters.unlicensedOnly ? undefined : true })
          }
        />
      </Group>
    </aside>
  );
}

function Group({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="eyebrow text-ink-faint">{label}</h3>
      {note && <p className="mt-1.5 text-xs text-pretty text-ink-faint">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Check({
  label,
  hint,
  muted,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  muted?: boolean;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 text-sm ${
        muted ? "text-ink-faint" : "text-ink-dim"
      } transition-colors hover:text-ink`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 rounded-[0.25rem] border-rule-strong text-slate-deep accent-slate-deep"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="font-mono text-[0.6875rem] tabular-nums">{hint}</span>}
    </label>
  );
}

function Radio({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-dim transition-colors hover:text-ink">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 border-rule-strong accent-slate-deep"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

/** A decimal amount in, integer units out — money stays integers elsewhere. */
function Money({
  label,
  asset,
  value,
  onChange,
}: {
  label: string;
  asset: PayAsset;
  value: number | undefined;
  onChange: (stroops: number | undefined) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="block text-[0.6875rem] text-ink-faint">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-rule bg-paper px-2.5 py-1.5 focus-within:border-rule-strong">
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
          placeholder="—"
          className="w-full min-w-0 bg-transparent text-sm tabular-nums text-ink outline-none placeholder:text-ink-faint"
        />
        <span className="ml-1 shrink-0 font-mono text-[0.625rem] text-ink-faint">
          {asset}
        </span>
      </div>
    </label>
  );
}

/** Re-exported for the mobile sheet, which renders the same rail in a drawer. */
export { sourceLabel };
