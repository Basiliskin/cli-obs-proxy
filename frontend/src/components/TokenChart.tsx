import { useQuery } from "@apollo/client/react";
import { GET_MODEL_USAGE } from "../queries";
import type { MetricFiltersInput } from "../metrics";
import { POLL_INTERVAL_MS } from "../metrics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ModelUsage {
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
}

interface ModelUsageData {
  modelUsage: ModelUsage[];
}

interface TokenChartProps {
  /** Same filters the request table uses, so the chart narrows with the filters. */
  filters: MetricFiltersInput;
}

export function TokenChart({ filters }: TokenChartProps) {
  const { data, loading } = useQuery<ModelUsageData>(GET_MODEL_USAGE, {
    variables: { filters },
    pollInterval: POLL_INTERVAL_MS,
    fetchPolicy: "network-only",
  });

  // Only block on the first load; later polls must not blank out the chart.
  if (loading && !data)
    return (
      <section className="chart-panel empty-state">Loading chart...</section>
    );
  if (!data?.modelUsage?.length)
    return (
      <section className="chart-panel empty-state">
        <div>
          <p className="eyebrow">Token usage</p>
          <p>No token data yet. Run some LLM requests!</p>
        </div>
      </section>
    );

  return (
    <section className="chart-panel">
      <h2>Token usage by model</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.modelUsage}>
          <XAxis dataKey="model" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="total_input_tokens"
            fill="#3b82f6"
            name="Input Tokens"
          />
          <Bar
            dataKey="total_output_tokens"
            fill="#10b981"
            name="Output Tokens"
          />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
