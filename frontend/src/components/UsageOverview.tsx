import {
  Area,
  AreaChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RecentMetric } from "../metrics";
import { RECENT_LIMIT, formatTokens } from "../metrics";

interface UsageOverviewProps {
  metrics: RecentMetric[];
}

// Same palette as the per-model breakdown chart (TokenChart), so the two
// views read as one system rather than inventing a second color language.
const TOKEN_TYPE_COLORS = {
  input: "#3b82f6",
  cache_creation: "#f59e0b",
  cache_read: "#a855f7",
  output: "#10b981",
} as const;

interface TrendPoint {
  label: string;
  input: number;
  cache_creation: number;
  cache_read: number;
  output: number;
  total: number;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Cache tokens (creation + read) are frequently the majority of a request's
// tokens under prompt caching, so they must count toward every total here —
// input_tokens + output_tokens alone silently drops most of the volume.
function totalTokensFor(metric: RecentMetric) {
  return (
    (metric.input_tokens ?? 0) +
    (metric.output_tokens ?? 0) +
    (metric.cache_creation_input_tokens ?? 0) +
    (metric.cache_read_input_tokens ?? 0)
  );
}

// Bucketed in UTC to match getTrend's `toISOString().slice(0, 10)`. Using the
// local day here instead made the trend and the heatmap disagree about which
// day a request belonged to.
function dayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function getTrend(metrics: RecentMetric[]): TrendPoint[] {
  const byDay = new Map<
    string,
    { input: number; cache_creation: number; cache_read: number; output: number }
  >();

  metrics.forEach((metric) => {
    const date = new Date(metric.observed_at);
    const key = date.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? {
      input: 0,
      cache_creation: 0,
      cache_read: 0,
      output: 0,
    };

    bucket.input += metric.input_tokens ?? 0;
    bucket.cache_creation += metric.cache_creation_input_tokens ?? 0;
    bucket.cache_read += metric.cache_read_input_tokens ?? 0;
    bucket.output += metric.output_tokens ?? 0;

    byDay.set(key, bucket);
  });

  return [...byDay.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-7)
    .map(([date, bucket]) => ({
      label: new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      ...bucket,
      total: bucket.input + bucket.cache_creation + bucket.cache_read + bucket.output,
    }));
}

function getHeatmap(metrics: RecentMetric[]) {
  const cells = weekdayLabels.map((label) => ({
    label,
    values: Array(12).fill(0) as number[],
  }));

  metrics.forEach((metric) => {
    const date = new Date(metric.observed_at);
    const period = Math.min(11, Math.floor((date.getUTCDate() - 1) / 3));
    cells[dayIndex(date)].values[period] += totalTokensFor(metric);
  });

  return { cells, max: Math.max(...cells.flatMap((cell) => cell.values), 1) };
}

export function UsageOverview({ metrics }: UsageOverviewProps) {
  const trend = getTrend(metrics);
  const { cells, max } = getHeatmap(metrics);
  const totalTokens = metrics.reduce(
    (sum, metric) => sum + totalTokensFor(metric),
    0,
  );
  const peakTokens = Math.max(...trend.map((point) => point.total), 0);
  const cacheBreakdown = metrics.reduce(
    (sums, metric) => ({
      input: sums.input + (metric.input_tokens ?? 0),
      cache_creation:
        sums.cache_creation + (metric.cache_creation_input_tokens ?? 0),
      cache_read: sums.cache_read + (metric.cache_read_input_tokens ?? 0),
      output: sums.output + (metric.output_tokens ?? 0),
    }),
    { input: 0, cache_creation: 0, cache_read: 0, output: 0 },
  );
  const activeDays = new Set(
    metrics.map((metric) =>
      new Date(metric.observed_at).toISOString().slice(0, 10),
    ),
  ).size;

  // Every figure below is derived from the request page in view, not from the
  // whole table, so the copy says so rather than implying a server-side total.
  const scope =
    metrics.length >= RECENT_LIMIT
      ? `Newest ${RECENT_LIMIT} requests in view`
      : `${metrics.length} requests in view`;

  return (
    <section className="usage-overview">
      <div className="usage-kpis">
        <div>
          <strong>{formatTokens(totalTokens)}</strong>
          <span>Tokens in view</span>
        </div>
        <div>
          <strong>{formatTokens(peakTokens)}</strong>
          <span>Peak day</span>
        </div>
        <div>
          <strong>{activeDays}</strong>
          <span>Days in view</span>
        </div>
      </div>
      <div className="usage-panels">
        <section className="usage-trend">
          <div className="usage-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Usage trend</h2>
            </div>
            <span>{metrics.length ? scope : "Waiting for requests"}</span>
          </div>
          {trend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={trend}
                margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#82958e", fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value, name) => [
                    formatTokens(Number(value)),
                    name,
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === "input"
                      ? "Input (uncached)"
                      : value === "cache_creation"
                        ? "Cache Creation"
                        : value === "cache_read"
                          ? "Cache Read"
                          : "Output Tokens"
                  }
                />
                <Area
                  type="monotone"
                  dataKey="input"
                  stackId="tokens"
                  stroke={TOKEN_TYPE_COLORS.input}
                  fill={TOKEN_TYPE_COLORS.input}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="cache_creation"
                  stackId="tokens"
                  stroke={TOKEN_TYPE_COLORS.cache_creation}
                  fill={TOKEN_TYPE_COLORS.cache_creation}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="cache_read"
                  stackId="tokens"
                  stroke={TOKEN_TYPE_COLORS.cache_read}
                  fill={TOKEN_TYPE_COLORS.cache_read}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="output"
                  stackId="tokens"
                  stroke={TOKEN_TYPE_COLORS.output}
                  fill={TOKEN_TYPE_COLORS.output}
                  fillOpacity={0.7}
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
            <span>{scope}</span>
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
            <strong>{metrics.length}</strong>
            <span>Requests in view</span>
          </div>
          <div>
            <strong>{activeDays}</strong>
            <span>Days in view</span>
          </div>
          <div className="usage-cache-breakdown">
            <span className="cache-breakdown-label">Where the tokens go</span>
            <div className="cache-breakdown-row">
              <span
                className="token-swatch"
                style={{ background: TOKEN_TYPE_COLORS.input }}
              />
              <span>Input</span>
              <strong>{formatTokens(cacheBreakdown.input)}</strong>
            </div>
            <div className="cache-breakdown-row">
              <span
                className="token-swatch"
                style={{ background: TOKEN_TYPE_COLORS.cache_creation }}
              />
              <span>Cache Creation</span>
              <strong>{formatTokens(cacheBreakdown.cache_creation)}</strong>
            </div>
            <div className="cache-breakdown-row">
              <span
                className="token-swatch"
                style={{ background: TOKEN_TYPE_COLORS.cache_read }}
              />
              <span>Cache Read</span>
              <strong>{formatTokens(cacheBreakdown.cache_read)}</strong>
            </div>
            <div className="cache-breakdown-row">
              <span
                className="token-swatch"
                style={{ background: TOKEN_TYPE_COLORS.output }}
              />
              <span>Output</span>
              <strong>{formatTokens(cacheBreakdown.output)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
