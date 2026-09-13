import type { RecentMetric } from "../App";

interface MetricsTableProps {
  metrics: RecentMetric[];
  loading: boolean;
  error: boolean;
}

export function MetricsTable({ metrics, loading, error }: MetricsTableProps) {
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
        <span className="table-hint">Latest 100 events</span>
      </div>
      {metrics.length === 0 ? (
        <div className="empty-state">No requests match these filters.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Host</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Tokens (In/Out)</th>
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
                  <td>{m.duration_ms}ms</td>
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
