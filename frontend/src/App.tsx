import { useQuery } from "@apollo/client/react";
import { useMemo, useState } from "react";
import { GET_CALL_DETAILS } from "./queries";
import { TokenChart } from "./components/TokenChart";
import { MetricsTable } from "./components/MetricsTable";
import { UsageOverview } from "./components/UsageOverview";
import { LiveStatus } from "./components/LiveStatus";
import { GET_METRIC_FACETS, GET_RECENT_METRICS } from "./queries";
import type {
  MetricFacets,
  MetricFilters,
  RecentMetric,
  CallDetails,
  TrafficMode,
} from "./metrics";
import {
  ALL,
  FACET_POLL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  RECENT_LIMIT,
  initialFilters,
  toFacetInput,
  toFilterInput,
} from "./metrics";

/**
 * Keeps the active selection present in the dropdown even when the facet list
 * does not contain it (facets failed, or lag behind a fresh selection).
 * Without this the <select> would render blank while the table stays filtered
 * by that value — which reads as broken filtering.
 */
function withSelection(options: string[], selected: string): string[] {
  return selected !== ALL && !options.includes(selected)
    ? [selected, ...options]
    : options;
}

interface RecentMetricsData {
  recentMetrics: RecentMetric[];
}

interface FacetsData {
  metricFacets: MetricFacets;
}

interface CallDetailsData {
  callDetails: CallDetails | null;
}

const trafficOptions: { value: TrafficMode; label: string }[] = [
  { value: "llm", label: "LLM traffic" },
  { value: "all", label: "All traffic" },
];

function App() {
  const [filters, setFilters] = useState<MetricFilters>(initialFilters);
  const [selectedCall, setSelectedCall] = useState<RecentMetric | null>(null);
  const {
    data: detailsData,
    loading: detailsLoading,
    error: detailsError,
  } = useQuery<CallDetailsData>(GET_CALL_DETAILS, {
    variables: { id: selectedCall?.id ?? "0" },
    skip: !selectedCall,
  });

  const filterInput = useMemo(() => toFilterInput(filters), [filters]);
  const facetInput = useMemo(() => toFacetInput(filters), [filters]);

  // Filtering happens server-side, so `recentMetrics` is already the filtered
  // set; polling keeps it live without a page reload.
  const { data, loading, error, networkStatus } = useQuery<RecentMetricsData>(
    GET_RECENT_METRICS,
    {
      variables: { limit: RECENT_LIMIT, filters: filterInput },
      pollInterval: POLL_INTERVAL_MS,
      fetchPolicy: "network-only",
      // LiveStatus renders `networkStatus`, which only reaches this component
      // while this is on. It defaults to true today, but the badge would freeze
      // silently if a future perf pass turned it off — so it is set explicitly.
      notifyOnNetworkStatusChange: true,
      // A backgrounded tab has nobody watching it, and the proxy ingests
      // continuously; don't keep querying for it.
      skipPollAttempt: () => document.hidden,
    },
  );

  // Dropdown options come from the whole filtered scope, not just the visible
  // page — otherwise a host outside the last N requests could never be selected.
  // Polled far more slowly than the table; see FACET_POLL_INTERVAL_MS.
  const { data: facetData, error: facetError } = useQuery<FacetsData>(
    GET_METRIC_FACETS,
    {
      variables: { filters: facetInput },
      pollInterval: FACET_POLL_INTERVAL_MS,
      fetchPolicy: "network-only",
      skipPollAttempt: () => document.hidden,
    },
  );

  const metrics = data?.recentMetrics ?? [];
  const hosts = withSelection(
    facetData?.metricFacets.hosts ?? [],
    filters.host,
  );
  const models = withSelection(
    facetData?.metricFacets.models ?? [],
    filters.model,
  );
  const statuses = withSelection(
    (facetData?.metricFacets.statuses ?? []).map(String),
    filters.status,
  );

  // The dashboard can only attest to what it can reach: the API, and the newest
  // request it can see. It has no independent view of proxy health.
  const degraded = Boolean(error) || Boolean(facetError);
  const newestRequest = metrics.length
    ? new Date(metrics[0].observed_at).toLocaleTimeString()
    : null;

  const updateFilter = (key: keyof MetricFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  // Field filters are scoped to the traffic mode they were picked under, so
  // switching modes clears them rather than landing on a guaranteed-empty view.
  const setTraffic = (traffic: TrafficMode) =>
    setFilters((current) => ({
      ...current,
      traffic,
      host: ALL,
      model: ALL,
      status: ALL,
    }));

  const hasActiveFilters =
    filters.search !== "" ||
    filters.host !== ALL ||
    filters.model !== ALL ||
    filters.status !== ALL;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">&gt;_</div>
          <div>
            <p className="eyebrow">Proxy telemetry</p>
            <h1>CLI LLM Observability</h1>
          </div>
        </div>
        <LiveStatus networkStatus={networkStatus} />
      </header>
      <main>
        <section className="intro-row">
          <div>
            <p className="eyebrow">Command center</p>
            <h2>See every request clearly.</h2>
            <p className="intro-copy">
              Track model usage, latency, and proxy health from one quiet,
              focused view.
            </p>
          </div>
          <div className="intro-scope">
            <div className="segmented" role="group" aria-label="Traffic scope">
              {trafficOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filters.traffic === option.value}
                  onClick={() => setTraffic(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="metric-count">
              <strong>{metrics.length}</strong>
              <span>visible requests</span>
            </div>
          </div>
        </section>
        <section className="filter-bar" aria-label="Filter requests">
          <label className="search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Search host or model"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </label>
          <label>
            <span>Host</span>
            <select
              value={filters.host}
              onChange={(event) => updateFilter("host", event.target.value)}
            >
              <option value={ALL}>All hosts</option>
              {hosts.map((host) => (
                <option key={host} value={host}>
                  {host}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select
              value={filters.model}
              onChange={(event) => updateFilter("model", event.target.value)}
            >
              <option value={ALL}>All models</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value={ALL}>Any status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="clear-button"
            type="button"
            onClick={() => setFilters(initialFilters)}
          >
            Clear
          </button>
        </section>
        <UsageOverview metrics={metrics} />
        <div className="dashboard-grid">
          <TokenChart filters={filterInput} />
          <section className={`health-panel${degraded ? " degraded" : ""}`}>
            <p className="eyebrow">API status</p>
            <div className="health-value">
              <span className="health-dot" />
              {degraded ? "Degraded" : "Operational"}
            </div>
            <p>
              {degraded
                ? "The metrics API is unreachable — what you see may be stale."
                : newestRequest
                  ? `Polling every ${POLL_INTERVAL_MS / 1000}s · newest request at ${newestRequest}.`
                  : `Polling every ${POLL_INTERVAL_MS / 1000}s · no requests yet in this scope.`}
            </p>
          </section>
        </div>
        <MetricsTable
          metrics={metrics}
          loading={loading && !data}
          // A failed *poll* keeps the last good rows on screen (LiveStatus flags
          // them as stale); only a failure with nothing to show is an error state.
          error={Boolean(error) && !data}
          hasActiveFilters={hasActiveFilters}
          onInspect={setSelectedCall}
        />
      </main>
      {selectedCall && (
        <dialog className="call-dialog" open>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">Full call</p>
              <h2>
                {selectedCall.method} {selectedCall.path}
              </h2>
            </div>
            <button
              className="dialog-close"
              type="button"
              onClick={() => setSelectedCall(null)}
              aria-label="Close call details"
            >
              Close
            </button>
          </div>
          {detailsLoading ? (
            <div className="empty-state">Loading call...</div>
          ) : detailsError ? (
            <div className="empty-state">
              Could not load call details: {detailsError.message}
            </div>
          ) : detailsData?.callDetails ? (
            <div className="call-detail-grid">
              <CallPayload
                title="Request headers"
                value={
                  detailsData.callDetails.request_headers.join("\n") || "-"
                }
              />
              <CallPayload
                title="Request body"
                value={detailsData.callDetails.request_body ?? "-"}
              />
              <CallPayload
                title="Response headers"
                value={
                  detailsData.callDetails.response_headers.join("\n") || "-"
                }
              />
              <CallPayload
                title="Response body"
                value={detailsData.callDetails.response_body ?? "-"}
              />
            </div>
          ) : (
            <div className="empty-state">
              This call is outside the retained history window.
            </div>
          )}
        </dialog>
      )}
    </div>
  );
}

function CallPayload({ title, value }: { title: string; value: string }) {
  return (
    <section className="call-payload">
      <p className="eyebrow">{title}</p>
      <pre>{value}</pre>
    </section>
  );
}

export default App;
