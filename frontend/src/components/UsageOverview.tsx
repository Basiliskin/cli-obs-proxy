import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RecentMetric } from "../App";

interface UsageOverviewProps {
  metrics: RecentMetric[];
}

interface TrendPoint {
  label: string;
  tokens: number;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function getTrend(metrics: RecentMetric[]): TrendPoint[] {
  const byDay = new Map<string, number>();
  metrics.forEach((metric) => {
    const date = new Date(metric.observed_at);
    const key = date.toISOString().slice(0, 10);
    const tokens = (metric.input_tokens ?? 0) + (metric.output_tokens ?? 0);
    byDay.set(key, (byDay.get(key) ?? 0) + tokens);
  });

  return [...byDay.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-7)
    .map(([date, tokens]) => ({
      label: new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      tokens,
    }));
}

function getHeatmap(metrics: RecentMetric[]) {
  const cells = weekdayLabels.map((label) => ({
    label,
    values: Array(12).fill(0) as number[],
  }));

  metrics.forEach((metric) => {
    const date = new Date(metric.observed_at);
    const period = Math.min(11, Math.floor((date.getDate() - 1) / 3));
    const tokens = (metric.input_tokens ?? 0) + (metric.output_tokens ?? 0);
    cells[dayIndex(date)].values[period] += tokens;
  });

  return { cells, max: Math.max(...cells.flatMap((cell) => cell.values), 1) };
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function UsageOverview({ metrics }: UsageOverviewProps) {
  const trend = getTrend(metrics);
  const { cells, max } = getHeatmap(metrics);
  const totalTokens = metrics.reduce(
    (sum, metric) =>
      sum + (metric.input_tokens ?? 0) + (metric.output_tokens ?? 0),
    0,
  );
  const peakTokens = Math.max(...trend.map((point) => point.tokens), 0);
  const activeDays = new Set(
    metrics.map((metric) =>
      new Date(metric.observed_at).toISOString().slice(0, 10),
    ),
  ).size;

  return (
    <section className="usage-overview">
      <div className="usage-kpis">
        <div>
          <strong>{formatTokens(totalTokens)}</strong>
          <span>Visible tokens</span>
        </div>
        <div>
          <strong>{formatTokens(totalTokens * 7)}</strong>
          <span>Projected 7 days</span>
        </div>
        <div>
          <strong>{activeDays}</strong>
          <span>Active days</span>
        </div>
      </div>
      <div className="usage-panels">
        <section className="usage-trend">
          <div className="usage-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Usage trend</h2>
            </div>
            <span>
              {metrics.length ? "Last 7 active days" : "Waiting for requests"}
            </span>
          </div>
          {trend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={trend}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff634d" stopOpacity={0.28} />
                    <stop
                      offset="100%"
                      stopColor="#ff634d"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#82958e", fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => [formatTokens(Number(value)), "Tokens"]}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#ff634d"
                  strokeWidth={3}
                  fill="url(#tokenFill)"
                  dot={{ r: 4, fill: "#ff634d", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No token activity to plot yet.</div>
          )}
        </section>
        <section className="usage-heatmap">
          <div className="usage-heading">
            <div>
              <p className="eyebrow">Request rhythm</p>
              <h2>Usage heatmap</h2>
            </div>
            <span>Recent 36 days</span>
          </div>
          <div className="heatmap-grid">
            <div className="heatmap-days">
              {cells.map((cell) => (
                <span key={cell.label}>{cell.label}</span>
              ))}
            </div>
            <div className="heatmap-cells">
              {cells.flatMap((cell) =>
                cell.values.map((value, index) => (
                  <span
                    key={`${cell.label}-${index}`}
                    className="heat-cell"
                    style={{
                      opacity: value ? 0.2 + (value / max) * 0.8 : 0.35,
                    }}
                    title={`${cell.label}, ${formatTokens(value)}`}
                  />
                )),
              )}
            </div>
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            <i />
            <i />
            <i />
            <i />
            <i />
            <span>More</span>
          </div>
        </section>
        <aside className="usage-summary">
          <div>
            <strong>{formatTokens(totalTokens)}</strong>
            <span>Total tokens</span>
          </div>
          <div>
            <strong>{formatTokens(peakTokens)}</strong>
            <span>Peak day</span>
          </div>
          <div>
            <strong>{activeDays}</strong>
            <span>Active days</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
