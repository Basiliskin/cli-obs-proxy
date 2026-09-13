/** Shared metric model: UI filter state, the GraphQL variables it maps to, and polling config. */

export interface RecentMetric {
  id: string;
  observed_at: string;
  host: string;
  model: string | null;
  status: number | null;
  /** Null when no response arrived (client disconnect, DNS/TLS failure). */
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface MetricFacets {
  hosts: string[];
  models: string[];
  statuses: number[];
}

/** Which slice of proxy traffic the dashboard is scoped to. */
export type TrafficMode = "llm" | "all";

/** Sentinel for "no constraint" in the dropdowns. */
export const ALL = "all";

export interface MetricFilters {
  traffic: TrafficMode;
  search: string;
  host: string;
  model: string;
  status: string;
}

export const initialFilters: MetricFilters = {
  traffic: "llm",
  search: "",
  host: ALL,
  model: ALL,
  status: ALL,
};

/** The `MetricFiltersInput` shape the API accepts. */
export interface MetricFiltersInput {
  llmOnly?: boolean;
  search?: string;
  host?: string;
  model?: string;
  status?: number;
}

/**
 * Mirrors the backend's `toMetricFilters`: unset UI values are omitted rather
 * than sent as null, so the API never has to interpret a null as a constraint.
 */
export function toFilterInput(filters: MetricFilters): MetricFiltersInput {
  const search = filters.search.trim();
  return {
    llmOnly: filters.traffic === "llm",
    ...(search ? { search } : {}),
    ...(filters.host === ALL ? {} : { host: filters.host }),
    ...(filters.model === ALL ? {} : { model: filters.model }),
    ...(filters.status === ALL ? {} : { status: Number(filters.status) }),
  };
}

/** Facets are scoped by traffic mode alone — see MetricService.getFacets. */
export function toFacetInput(filters: MetricFilters): MetricFiltersInput {
  return { llmOnly: filters.traffic === "llm" };
}

export const POLL_INTERVAL_MS = 3000;

/**
 * The facet option set changes at human timescales, and each poll costs three
 * whole-table GROUP BYs — polling it at the row cadence would be pure waste.
 * A traffic-mode change alters the variables and refetches immediately anyway.
 */
export const FACET_POLL_INTERVAL_MS = 30000;

export const RECENT_LIMIT = 100;
