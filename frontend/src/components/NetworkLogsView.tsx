import { useQuery } from "@apollo/client/react";
import { useMemo } from "react";
import { GET_METRIC_FACETS, GET_NETWORK_LOGS } from "../queries";
import type { RecentMetric } from "../metrics";

const NETWORK_LOG_LIMIT = 500;

interface NetworkLogsData {
  networkLogs: RecentMetric[];
}

interface FacetsData {
  metricFacets: { hosts: string[] };
}

interface NetworkLogsViewProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  onInspect: (metric: RecentMetric) => void;
}

function periodKey(observedAt: string): string {
  const date = new Date(observedAt);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupByPeriod(metrics: RecentMetric[]) {
  const groups: { label: string; metrics: RecentMetric[] }[] = [];
  const byPeriod = new Map<string, { label: string; metrics: RecentMetric[] }>();

  for (const metric of metrics) {
    const label = periodKey(metric.observed_at);
    let group = byPeriod.get(label);
    if (!group) {
      group = { label, metrics: [] };
      byPeriod.set(label, group);
      groups.push(group);
    }
    group.metrics.push(metric);
  }

  return groups;
}

export function NetworkLogsView({
  domain,
  onDomainChange,
  onInspect,
}: NetworkLogsViewProps) {
  const { data, loading, error } = useQuery<NetworkLogsData>(GET_NETWORK_LOGS, {
    variables: { limit: NETWORK_LOG_LIMIT, domain: domain || null },
    pollInterval: 3000,
    fetchPolicy: "network-only",
    skipPollAttempt: () => document.hidden,
  });
  const { data: facetData } = useQuery<FacetsData>(GET_METRIC_FACETS, {
    variables: { filters: { llmOnly: false } },
    pollInterval: 30000,
    fetchPolicy: "network-only",
    skipPollAttempt: () => document.hidden,
  });

  const groups = useMemo(
    () => groupByPeriod(data?.networkLogs ?? []),
    [data?.networkLogs],
  );
  const domains = facetData?.metricFacets.hosts ?? [];

  return (
    <section className="network-view">
      <div className="network-toolbar">
        <div>
          <p className="eyebrow">Full network inspection</p>
          <h2>Request sequence</h2>
          <p className="network-copy">
            Every recorded proxy exchange, grouped by period and kept newest
            first.
          </p>
        </div>
        <label className="domain-filter">
          <span>Domain</span>
          <select value={domain} onChange={(event) => onDomainChange(event.target.value)}>
            <option value="">All domains</option>
            {domains.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && !data ? (
        <div className="network-state">Loading network logs...</div>
      ) : error && !data ? (
        <div className="network-state">Could not load network logs.</div>
      ) : groups.length === 0 ? (
        <div className="network-state">No network requests recorded yet.</div>
      ) : (
        groups.map((group) => (
          <section className="network-period" key={group.label}>
            <div className="period-heading">
              <h3>{group.label}</h3>
              <span>{group.metrics.length} requests</span>
            </div>
            <div className="table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Method</th>
                      <th>Domain</th>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.metrics.map((metric) => (
                      <tr key={metric.id}>
                        <td>{new Date(metric.observed_at).toLocaleTimeString()}</td>
                        <td><span className="method-pill">{metric.method}</span></td>
                        <td className="host-cell">{metric.host}</td>
                        <td className="path-cell">{metric.path}</td>
                        <td>
                          <span className={`status-pill ${metric.status === 200 ? "success" : "failure"}`}>
                            {metric.status ?? "ERR"}
                          </span>
                        </td>
                        <td>{metric.duration_ms === null ? "-" : `${metric.duration_ms}ms`}</td>
                        <td>
                          <button
                            className="inspect-button"
                            type="button"
                            disabled={!metric.has_details}
                            onClick={() => onInspect(metric)}
                          >
                            {metric.has_details ? "View" : "-"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))
      )}
    </section>
  );
}