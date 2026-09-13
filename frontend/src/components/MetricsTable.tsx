import { useQuery } from "@apollo/client/react";
import { GET_RECENT_METRICS } from "../queries";

interface RecentMetric {
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

export function MetricsTable() {
  const { data, loading } = useQuery<RecentMetricsData>(GET_RECENT_METRICS, {
    variables: { limit: 20 },
  });

  if (loading) return <p>Loading table...</p>;
  if (!data) return <p>No metrics available.</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
      <h2 className="text-xl font-bold mb-4">Recent Requests</h2>
      <table className="min-w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
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
          {data.recentMetrics.map((m) => (
            <tr key={m.id} className="bg-white border-b hover:bg-gray-50">
              <td className="px-4 py-2">
                {new Date(m.observed_at).toLocaleTimeString()}
              </td>
              <td className="px-4 py-2 font-medium text-gray-900">{m.host}</td>
              <td className="px-4 py-2">{m.model || "-"}</td>
              <td className="px-4 py-2">
                <span
                  className={`px-2 py-1 rounded text-xs ${m.status === 200 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                >
                  {m.status}
                </span>
              </td>
              <td className="px-4 py-2">{m.duration_ms}ms</td>
              <td className="px-4 py-2">
                {m.input_tokens
                  ? `${m.input_tokens} / ${m.output_tokens}`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
