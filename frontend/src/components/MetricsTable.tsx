import type { RecentMetric } from "../metrics";

interface MetricsTableProps {
  metrics: RecentMetric[];
  loading: boolean;
  error: boolean;
  /** Distinguishes "nothing matches your filters" from "nothing recorded yet". */
  hasActiveFilters: boolean;
}

export function MetricsTable({
  metrics,
  loading,
  error,
  hasActiveFilters,
}: MetricsTableProps) {
  if (loading)
    return (
      <section className="table-panel empty-state">Loading requests...</section>
    );
  if (error)
    return (
      <section className="table-panel empty-state">
        Could not load request metrics.
      </section>
    );

  return (
    <section className="table-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Request log</p>
          <h2>Recent requests</h2>
        </div>
        <span className="table-hint">
          Newest {metrics.length}
          {hasActiveFilters ? " matching" : ""} requests
        </span>
      </div>
      {metrics.length === 0 ? (
        <div className="empty-state">
          {hasActiveFilters
            ? "No requests match these filters."
            : "No requests recorded in this scope yet."}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Host</th>
                <th>Model</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Tokens (In/Out)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.observed_at).toLocaleTimeString()}</td>
                  <td className="host-cell">{m.host}</td>
                  <td>{m.model || "-"}</td>
                  <td>
                    <span
                      className={`status-pill ${m.status === 200 ? "success" : "failure"}`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td>{m.duration_ms === null ? "-" : `${m.duration_ms}ms`}</td>
                  <td>
                    {m.input_tokens
                      ? `${m.input_tokens} / ${m.output_tokens}`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
