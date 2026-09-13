import { useQuery } from "@apollo/client/react";
import { GET_MODEL_USAGE } from "../queries";
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

export function TokenChart() {
  const { data, loading } = useQuery<ModelUsageData>(GET_MODEL_USAGE);

  if (loading) return <p>Loading chart...</p>;
  if (!data?.modelUsage?.length)
    return <p>No token data yet. Run some LLM requests!</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow mb-8">
      <h2 className="text-xl font-bold mb-4">Token Usage by Model</h2>
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
    </div>
  );
}
