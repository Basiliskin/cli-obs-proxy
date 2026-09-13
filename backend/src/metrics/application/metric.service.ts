import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
import { ModelUsageAggregate } from '../domain/metric.model';

@Injectable()
export class MetricService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentMetrics(limit: number) {
    const metrics = await this.prisma.httpMetric.findMany({
      take: limit,
      orderBy: { observed_at: 'desc' },
    });

    // Map BigInt to String for GraphQL ID
    return metrics.map((m) => ({ ...m, id: m.id.toString() }));
  }

  async getModelUsageAggregates(): Promise<ModelUsageAggregate[]> {
    // Using raw query for clean aggregation (KISS)
    const result = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        model, 
        COUNT(*)::int as request_count,
        COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int as total_output_tokens
      FROM http_metrics
      WHERE model IS NOT NULL
      GROUP BY model
      ORDER BY total_output_tokens DESC
    `);

    return result;
  }
}
