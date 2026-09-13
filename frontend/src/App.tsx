import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { TokenChart } from "./components/TokenChart";
import { MetricsTable } from "./components/MetricsTable";
import { GET_RECENT_METRICS } from "./queries";

export interface RecentMetric {
  id: string;
  observed_at: string;
  host: string;
  model: string | null;
  status: number | null;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

interface RecentMetricsData {
  recentMetrics: RecentMetric[];
}

export interface MetricFilters {
  search: string;
  host: string;
  model: string;
  status: string;
}

const initialFilters: MetricFilters = {
  search: "",
  host: "all",
  model: "all",
  status: "all",
};

function App() {
  const [filters, setFilters] = useState(initialFilters);
  const { data, loading, error } = useQuery<RecentMetricsData>(
    GET_RECENT_METRICS,
    { variables: { limit: 100 } },
  );
  const metrics = data?.recentMetrics ?? [];
  const filteredMetrics = metrics.filter((metric) => {
    const query = filters.search.toLowerCase();
    const matchesSearch = [metric.host, metric.model ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesHost = filters.host === "all" || metric.host === filters.host;
    const matchesModel =
      filters.model === "all" || metric.model === filters.model;
    const matchesStatus =
      filters.status === "all" || String(metric.status) === filters.status;
    return matchesSearch && matchesHost && matchesModel && matchesStatus;
  });
  const hosts = [...new Set(metrics.map((metric) => metric.host))];
  const models = [
    ...new Set(
      metrics
        .map((metric) => metric.model)
        .filter((model): model is string => Boolean(model)),
    ),
  ];
  const statuses = [
    ...new Set(
      metrics
        .map((metric) => metric.status)
        .filter((status): status is number => status !== null),
    ),
  ];
  const updateFilter = (key: keyof MetricFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

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
        <div className="live-status">
          <span /> Live monitoring
        </div>
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
          <div className="metric-count">
            <strong>{filteredMetrics.length}</strong>
            <span>visible requests</span>
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
              <option value="all">All hosts</option>
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
              <option value="all">All models</option>
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
              <option value="all">Any status</option>
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
        <div className="dashboard-grid">
          <TokenChart />
          <section className="health-panel">
            <p className="eyebrow">System health</p>
            <div className="health-value">
              <span className="health-dot" />
              Operational
            </div>
            <p>Requests are flowing through the proxy normally.</p>
          </section>
        </div>
        <MetricsTable
          metrics={filteredMetrics}
          loading={loading}
          error={Boolean(error)}
        />
      </main>
    </div>
  );
}

export default App;
