/**
 * Pure client-side filter/sort logic for the prerendered homepage grid.
 *
 * Extracted from the page script so the semantics can be unit-tested without a
 * DOM. The homepage script reads each card's data-* attributes into a
 * FilterableCard and uses these helpers to decide visibility and order; tests
 * exercise the same functions against plain objects.
 *
 * The default ("featured") order is whatever order the caller passes in — the
 * page prerenders cards in the D1 "featured" order (is_featured DESC,
 * published_at DESC), so featured-sort is a no-op that preserves that order.
 */

export const SORT_OPTIONS = ["featured", "newest", "name-az"] as const;
export type SortValue = (typeof SORT_OPTIONS)[number];

export interface StartupFilterState {
  type: string;
  stage: string;
  region: string;
  sort: SortValue;
}

export interface FilterableCard {
  name: string;
  type: string | null;
  stage: string | null;
  region: string | null;
  published: string | null;
}

export function normalizeSort(value: string | null | undefined): SortValue {
  const v = (value ?? "").trim();
  return (SORT_OPTIONS as readonly string[]).includes(v) ? (v as SortValue) : "featured";
}

/** Parse a query string / URLSearchParams into a normalized filter state. */
export function readFilterState(params: URLSearchParams): StartupFilterState {
  return {
    type: (params.get("type") ?? "").trim(),
    stage: (params.get("stage") ?? "").trim(),
    region: (params.get("region") ?? "").trim(),
    sort: normalizeSort(params.get("sort")),
  };
}

/** Serialize a filter state to a clean query string (omits defaults). */
export function filterStateToQuery(state: StartupFilterState): string {
  const params = new URLSearchParams();
  if (state.type) params.set("type", state.type);
  if (state.stage) params.set("stage", state.stage);
  if (state.region) params.set("region", state.region);
  if (state.sort && state.sort !== "featured") params.set("sort", state.sort);
  return params.toString();
}

export function cardMatchesFilters(card: FilterableCard, state: StartupFilterState): boolean {
  return (
    (!state.type || card.type === state.type) &&
    (!state.stage || card.stage === state.stage) &&
    (!state.region || card.region === state.region)
  );
}

/** Number of active facets (featured-sort doesn't count), for the filter badge. */
export function activeFacetCount(state: StartupFilterState): number {
  return [state.type, state.stage, state.region, state.sort !== "featured" ? state.sort : ""].filter(
    Boolean
  ).length;
}

/**
 * Return the matching cards in display order. `cards` must be passed in the
 * default (prerendered "featured") order so that sort="featured" preserves it.
 */
export function orderVisibleCards<T extends FilterableCard>(
  cards: T[],
  state: StartupFilterState
): T[] {
  const visible = cards.filter((card) => cardMatchesFilters(card, state));
  if (state.sort === "newest") {
    return visible
      .slice()
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  }
  if (state.sort === "name-az") {
    return visible
      .slice()
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  return visible;
}
