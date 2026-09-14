import { Resolver, Query, Args, Int, ID } from '@nestjs/graphql';
import { MetricService } from '../application/metric.service';
import {
  HttpMetric,
  HttpCallDetails,
  MetricFacets,
  ModelUsageAggregate,
} from '../domain/metric.model';
import { MetricFiltersInput, toMetricFilters } from './metric-filters.input';

@Resolver(() => HttpMetric)
export class MetricResolver {
  constructor(private readonly metricService: MetricService) {}

  @Query(() => [HttpMetric], { name: 'recentMetrics' })
  async getRecentMetrics(
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
    @Args('filters', { type: () => MetricFiltersInput, nullable: true })
    filters?: MetricFiltersInput,
  ) {
    return this.metricService.getRecentMetrics(limit, toMetricFilters(filters));
  }

  @Query(() => HttpCallDetails, { name: 'callDetails', nullable: true })
  async getCallDetails(@Args('id', { type: () => ID }) id: string) {
    return this.metricService.getCallDetails(id);
  }

  @Query(() => [ModelUsageAggregate], { name: 'modelUsage' })
  async getModelUsage(
    @Args('filters', { type: () => MetricFiltersInput, nullable: true })
    filters?: MetricFiltersInput,
  ) {
    return this.metricService.getModelUsageAggregates(toMetricFilters(filters));
  }

  @Query(() => MetricFacets, {
    name: 'metricFacets',
    description:
      'Distinct hosts, models and statuses for the current traffic mode, used to populate the filter dropdowns.',
  })
  async getMetricFacets(
    @Args('filters', { type: () => MetricFiltersInput, nullable: true })
    filters?: MetricFiltersInput,
  ) {
    return this.metricService.getFacets(toMetricFilters(filters));
  }
}
