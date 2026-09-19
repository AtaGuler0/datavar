"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { formatBytes, formatCount } from "@/lib/format";
import { configuredAssets, formatAmount, type PayAsset } from "@/lib/stellar/config";
import {
  DEFAULT_FILTERS,
  listFacets,
  priceOf,
  listLicensedIds,
  listListings,
  PAGE_SIZE,
  readBuyerProfile,
  SORTS,
  type BuyerProfile,
  type Facet,
  type Listing,
  type ListingFilters,
} from "@/lib/supabase/market";
import { ActivityStrip } from "./activity-strip";
import { Basket } from "./basket";
import { FilterRail } from "./filter-rail";
import { ListingCard } from "./listing-card";

/**
 * The catalogue.
 *
 * Filtering happens in Postgres and paging with it, so what this component
 * owns is one query's worth of state and the basket. The two things it has to
 * get right are both about not lying to a buyer: a stale result set must never
 * outrun the filters that asked for it (hence the request counter), and a
 * dataset the buyer already licensed must say so rather than offer itself for
 * sale again.
 */

/** One shared empty set, so a signed-out render isn't a new object each time. */
const EMPTY: Set<string> = new Set();

/**
 * The assets this deployment can take money in. Read once at module scope
 * because it is env, not state — and when only one is configured the switch
 * does not render at all rather than offering a currency nobody can pay in.
 */
const ASSETS = configuredAssets();

export function Catalogue() {
  const { address, session } = useWallet();

  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  const [basket, setBasket] = useState<Listing[]>([]);
  /**
   * Both of these are about one wallet, so they are stored with the wallet
   * they were read for rather than reset when it changes. A disconnect or a
   * switch then makes them stop applying immediately, with nothing to clear —
   * and there is no render where the previous wallet's licences are shown
   * against the new one's address.
   */
  const [licensedFor, setLicensedFor] = useState<{
    wallet: string;
    ids: Set<string>;
  } | null>(null);
  const [profileFor, setProfileFor] = useState<{
    wallet: string;
    profile: BuyerProfile | null;
  } | null>(null);

  const licensed =
    licensedFor && licensedFor.wallet === address ? licensedFor.ids : EMPTY;
  const profile =
    profileFor && profileFor.wallet === address ? profileFor.profile : null;

  useEffect(() => {
    listFacets()
      .then(setFacets)
      .catch(() => setFacets([]));
  }, []);

  // One counter, incremented per request: a slow query for an abandoned filter
  // resolving after a fast one would otherwise repaint the grid with results
  // nobody asked for.
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let current = true;
    listListings(filters, page)
      .then(({ rows, total }) => {
        if (!current) return;
        setRows(rows);
        setTotal(total);
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
    // `request` is in the deps so a manual retry re-runs the same query. The
    // grid is put back into its loading state by whoever changed the filters,
    // not here: an effect that writes state on the way in costs a render pass
    // for something the handler already knows.
  }, [filters, page, request]);

  // What this wallet already holds, and who they are. Both need a session, and
  // both are re-read when one arrives — signing in mid-browse should change
  // the page under you.
  useEffect(() => {
    if (!address || !session) return;
    const wallet = address;
    let current = true;
    listLicensedIds(wallet)
      .then((ids) => current && setLicensedFor({ wallet, ids: new Set(ids) }))
      .catch(() => current && setLicensedFor({ wallet, ids: new Set() }));
    readBuyerProfile(wallet)
      .then((profile) => current && setProfileFor({ wallet, profile }))
      .catch(() => current && setProfileFor({ wallet, profile: null }));
    return () => {
      current = false;
    };
  }, [address, session]);

  const changeFilters = useCallback((next: ListingFilters) => {
    setFilters(next);
    setPage(0);
    setRows(null);
  }, []);

  /**
   * Switching currency clears the price band with it.
   *
   * Keeping it would carry a number from one price list to the other: "3 to 6"
   * chosen against XLM would silently become "3 to 6 USDC", a band four times
   * as wide in what it actually selects, with the same digits sitting in the
   * boxes. Emptying it is the only honest thing to do with a filter whose
   * meaning just changed underneath it.
   */
  const changeAsset = useCallback(
    (asset: PayAsset) => {
      changeFilters({
        ...filters,
        asset,
        minPrice: undefined,
        maxPrice: undefined,
      });
      setBasket([]);
    },
    [changeFilters, filters],
  );

  const changePage = useCallback((next: number) => {
    setPage(next);
    setRows(null);
  }, []);

  const retry = useCallback(() => {
    setRows(null);
    setRequest((n) => n + 1);
  }, []);

  const toggleBasket = useCallback((listing: Listing) => {
    setBasket((current) =>
      current.some((item) => item.id === listing.id)
        ? current.filter((item) => item.id !== listing.id)
        : [...current, listing],
    );
  }, []);

  const purchased = useCallback((ids: string[]) => {
    setLicensedFor((current) =>
      current ? { ...current, ids: new Set([...current.ids, ...ids]) } : current,
    );
    setBasket([]);
    // The rows themselves changed — `licences_sold` went up — so re-read the
    // page rather than patching a number into a cached row.
    setRows(null);
    setRequest((n) => n + 1);
  }, []);

  const basketIds = useMemo(
    () => new Set(basket.map((item) => item.id)),
    [basket],
  );

  const listed = facets?.reduce((sum, f) => sum + Number(f.listings), 0) ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-[110rem] px-4 pb-32 pt-8 sm:px-6 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow text-ink-faint">Marketplace</p>
          <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
            Data people agreed to sell you.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-ink-dim">
            Every listing stands on a consent receipt its contributor signed
            on-chain. Testnet throughout.
          </p>
        </div>

        <dl className="flex gap-8">
          <Stat label="Listed now" value={formatCount(listed)} />
          <Stat label="Categories" value={formatCount(facets?.length ?? 0)} />
        </dl>
      </header>

      {/* Under the heading and above the filters: a buyer should see that this
          market trades before they see how to narrow it. `request` doubles as
          the refresh key — it is bumped by a purchase, so somebody who has just
          licensed something watches it appear. */}
      <ActivityStrip refreshKey={request} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2">
            <FilterRail
              facets={facets}
              filters={filters}
              onChange={changeFilters}
              onReset={() => changeFilters(DEFAULT_FILTERS)}
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
            <p className="text-sm text-ink-dim">
              {rows === null ? (
                "Reading the catalogue…"
              ) : (
                <>
                  <span className="tabular-nums text-ink">
                    {formatCount(total)}
                  </span>{" "}
                  dataset{total === 1 ? "" : "s"} match
                </>
              )}
            </p>

            <div className="flex items-center gap-2">
              {ASSETS.length > 1 && (
                <div
                  role="group"
                  aria-label="Currency"
                  className="flex items-center rounded-lg border border-rule bg-paper p-0.5"
                >
                  {ASSETS.map((asset) => (
                    <button
                      key={asset}
                      type="button"
                      onClick={() => changeAsset(asset)}
                      aria-pressed={filters.asset === asset}
                      className={`rounded-md px-2.5 py-1 font-mono text-[0.6875rem] transition-colors ${
                        filters.asset === asset
                          ? "bg-slate-deep text-paper"
                          : "text-ink-faint hover:text-ink"
                      }`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMobileFilters(true)}
                className="rounded-lg border border-rule bg-paper px-3 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink lg:hidden"
              >
                Filters
              </button>
              <label className="flex items-center gap-2 text-xs text-ink-faint">
                Sort
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    changeFilters({
                      ...filters,
                      sort: e.target.value as ListingFilters["sort"],
                    })
                  }
                  className="rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-xs text-ink outline-none transition-colors focus:border-rule-strong"
                >
                  {SORTS.map((sort) => (
                    <option key={sort.id} value={sort.id}>
                      {sort.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {failed ? (
            <Notice
              title="The catalogue didn't load."
              note="That is the database refusing or unreachable, not an empty market."
              action={{ label: "Try again", onClick: retry }}
            />
          ) : rows === null ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-56 animate-pulse rounded-2xl border border-rule bg-paper"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Notice
              title="Nothing matches those filters."
              note={
                listed === 0
                  ? "No dataset on this deployment carries live consent for the marketplace address yet. Contributors list one by granting consent from their dashboard."
                  : "Widen the price band or clear a category — the counts in the rail say where the data is."
              }
              action={{
                label: "Reset filters",
                onClick: () => changeFilters(DEFAULT_FILTERS),
              }}
            />
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {rows.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    asset={filters.asset}
                    inBasket={basketIds.has(listing.id)}
                    licensed={licensed.has(listing.id)}
                    onToggle={() => toggleBasket(listing)}
                  />
                ))}
              </div>

              {pages > 1 && (
                <nav className="mt-8 flex items-center justify-between border-t border-rule pt-5">
                  <button
                    type="button"
                    onClick={() => changePage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-[0.6875rem] text-ink-faint tabular-nums">
                    {page + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => changePage(Math.min(pages - 1, page + 1))}
                    disabled={page >= pages - 1}
                    className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}

          {rows !== null && rows.length > 0 && (
            <p className="mt-8 text-xs text-pretty text-ink-faint">
              Listings show what the protocol can stand behind: category,
              format, size, when it was contributed, and the consent receipt
              behind it. Titles and descriptions stay with the contributor — a
              buyer sees them only for datasets they have licensed.
            </p>
          )}
        </div>
      </div>

      {mobileFilters && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-sm lg:hidden"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setMobileFilters(false)
          }
        >
          <div className="ml-auto flex h-dvh w-[20rem] max-w-[88vw] flex-col bg-paper">
            <header className="flex items-center justify-between border-b border-rule px-5 py-4">
              <h2 className="text-sm font-medium text-ink">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFilters(false)}
                className="text-sm text-ink-faint transition-colors hover:text-ink"
              >
                Done
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <FilterRail
                facets={facets}
                filters={filters}
                onChange={changeFilters}
                onReset={() => changeFilters(DEFAULT_FILTERS)}
              />
            </div>
          </div>
        </div>
      )}

      <Basket
        items={basket}
        asset={filters.asset}
        profile={profile}
        onProfileSaved={(saved) =>
          setProfileFor({ wallet: saved.wallet, profile: saved })
        }
        onRemove={(id) =>
          setBasket((current) => current.filter((item) => item.id !== id))
        }
        onClear={() => setBasket([])}
        onPurchased={purchased}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-xl font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Notice({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-16 text-center">
      <p className="text-pretty text-ink-dim">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-ink-faint">
        {note}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-lg border border-rule px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Kept beside the grid's own formatting helpers so both read the same way. */
export { formatBytes, formatAmount, priceOf };
