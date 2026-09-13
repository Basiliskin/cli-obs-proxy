import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { MetricService } from '../application/metric.service';
import { HttpMetric, ModelUsageAggregate } from '../domain/metric.model';

@Resolver(() => HttpMetric)
export class MetricResolver {
  constructor(private readonly metricService: MetricService) {}

  @Query(() => [HttpMetric], { name: 'recentMetrics' })
  async getRecentMetrics(
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    return this.metricService.getRecentMetrics(limit);
  }

  @Query(() => [ModelUsageAggregate], { name: 'modelUsage' })
  async getModelUsage() {
    return this.metricService.getModelUsageAggregates();
  }
}
