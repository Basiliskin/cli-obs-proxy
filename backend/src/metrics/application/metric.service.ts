import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma.service';
import {
  MetricFacets,
  MetricFilters,
  HttpCallDetails,
  ModelUsageAggregate,
} from '../domain/metric.model';

/** Upper bound on `recentMetrics`, so the caller-supplied limit cannot request the whole table. */
const MAX_RECENT_LIMIT = 1000;
const MAX_NETWORK_LOG_LIMIT = 1000;

@Injectable()
export class MetricService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Single definition of "which rows match", shared by every query so the table,
   * the per-model chart and the filter dropdowns can never drift apart.
   */
  private buildWhere(filters?: MetricFilters): Prisma.HttpMetricWhereInput {
    if (!filters) return {};

    const where: Prisma.HttpMetricWhereInput = {};

    // The proxy persists requests that produced no token usage with model = NULL,
    // so a non-null model is what separates LLM traffic from generic proxy noise.
    if (filters.llmOnly) where.model = { not: null };
    if (filters.host) where.host = filters.host;
    // Applied after llmOnly: equality on a concrete model already excludes NULL,
    // so filtering by model subsumes the llmOnly constraint.
    if (filters.model) where.model = filters.model;
    // status is nullable in the DB, so "any status" must omit the key entirely
    // rather than pass null (which would match only the NULL rows).
    if (filters.status !== undefined) where.status = filters.status;

    if (filters.search) {
      // Prisma's `contains` maps to LIKE without escaping the value, so a literal
      // % or _ typed into the search box would otherwise act as a wildcard. Escape
      // them (and the escape character itself) to keep the search literal.
      const term = filters.search.replace(/[\\%_]/g, (char) => `\\${char}`);
      where.OR = [
        { host: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Per-model aggregates only make sense for rows that have a model. */
  private requireModel(
    where: Prisma.HttpMetricWhereInput,
  ): Prisma.HttpMetricWhereInput {
    return where.model === undefined
      ? { ...where, model: { not: null } }
      : where;
  }

  async getRecentMetrics(limit: number, filters?: MetricFilters) {
    const metrics = await this.prisma.httpMetric.findMany({
      where: this.buildWhere(filters),
      // The arg is caller-supplied, so clamp it rather than let one request ask
      // for the entire table.
      take: Math.min(Math.max(limit, 1), MAX_RECENT_LIMIT),
      orderBy: [{ observed_at: 'desc' }, { id: 'desc' }],
    });

    // Map BigInt to String for GraphQL ID
    return metrics.map((m) => ({
      ...m,
      id: m.id.toString(),
      has_details:
        m.request_body !== null ||
        m.response_body !== null ||
        m.request_headers !== null ||
        m.response_headers !== null,
    }));
  }

  async getNetworkLogs(limit: number, domain?: string) {
    const metrics = await this.prisma.httpMetric.findMany({
      where: domain ? { host: domain } : undefined,
      take: Math.min(Math.max(limit, 1), MAX_NETWORK_LOG_LIMIT),
      orderBy: [{ observed_at: 'desc' }, { id: 'desc' }],
    });

    return metrics.map((m) => ({
      ...m,
      id: m.id.toString(),
      has_details:
        m.request_body !== null ||
        m.response_body !== null ||
        m.request_headers !== null ||
        m.response_headers !== null,
    }));
  }

  async getCallDetails(id: string): Promise<HttpCallDetails | null> {
    const metric = await this.prisma.httpMetric.findUnique({
      where: { id: BigInt(id) },
    });

    if (
      !metric ||
      (metric.request_body === null &&
        metric.response_body === null &&
        metric.request_headers === null &&
        metric.response_headers === null)
    ) {
      return null;
    }

    const headers = (value: Prisma.JsonValue | null): string[] =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).map(([key, headerValue]) => {
            const text =
              typeof headerValue === 'string'
                ? headerValue
                : JSON.stringify(headerValue);
            return `${key}: ${text}`;
          })
        : [];

    return {
      id: metric.id.toString(),
      observed_at: metric.observed_at,
      method: metric.method,
      host: metric.host,
      path: metric.path,
      request_body: metric.request_body,
      response_body: metric.response_body,
      request_headers: headers(metric.request_headers),
      response_headers: headers(metric.response_headers),
    };
  }

  async getModelUsageAggregates(
    filters?: MetricFilters,
  ): Promise<ModelUsageAggregate[]> {
    const grouped = await this.prisma.httpMetric.groupBy({
      by: ['model'],
      where: this.requireModel(this.buildWhere(filters)),
      // Field-selected rather than `_count: true` / `_sum: true`: the latter
      // would pull in the summed BigInt `id`, which cannot be serialized.
      _count: { _all: true },
      _sum: {
        input_tokens: true,
        output_tokens: true,
        cache_creation_input_tokens: true,
        cache_read_input_tokens: true,
      },
    });

    // Sorted here rather than in SQL: `_sum` ordering accepts only a bare
    // SortOrder, so it cannot express NULLS LAST, and a group whose tokens are
    // all NULL would otherwise sort to the top. Ordering the coalesced numbers
    // instead reproduces the original `ORDER BY ... DESC` on COALESCE(SUM(...)).
    return grouped
      .flatMap((row) =>
        row.model === null
          ? []
          : [
              {
                model: row.model,
                request_count: row._count._all,
                total_input_tokens: row._sum.input_tokens ?? 0,
                total_output_tokens: row._sum.output_tokens ?? 0,
                total_cache_creation_input_tokens:
                  row._sum.cache_creation_input_tokens ?? 0,
                total_cache_read_input_tokens:
                  row._sum.cache_read_input_tokens ?? 0,
              },
            ],
      )
      .sort((a, b) => b.total_output_tokens - a.total_output_tokens);
  }

  /**
   * Distinct values for the filter dropdowns.
   *
   * Scoped by the traffic mode alone and deliberately NOT by the other active
   * filters: if the host facet honoured the host filter, selecting a host would
   * drop every other host from the dropdown and you could never switch away.
   */
  async getFacets(filters?: MetricFilters): Promise<MetricFacets> {
    const scope = this.buildWhere(
      filters?.llmOnly ? { llmOnly: true } : undefined,
    );

    const [hosts, models, statuses] = await Promise.all([
      this.prisma.httpMetric.groupBy({
        by: ['host'],
        where: scope,
        orderBy: { host: 'asc' },
      }),
      this.prisma.httpMetric.groupBy({
        by: ['model'],
        where: this.requireModel(scope),
        orderBy: { model: 'asc' },
      }),
      this.prisma.httpMetric.groupBy({
        by: ['status'],
        where: { ...scope, status: { not: null } },
        orderBy: { status: 'asc' },
      }),
    ]);

    return {
      hosts: hosts.map((row) => row.host),
      models: models.flatMap((row) => (row.model === null ? [] : [row.model])),
      statuses: statuses.flatMap((row) =>
        row.status === null ? [] : [row.status],
      ),
    };
  }
}
