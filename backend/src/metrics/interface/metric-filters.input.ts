import { Field, InputType, Int } from '@nestjs/graphql';
import { MetricFilters } from '../domain/metric.model';

/**
 * GraphQL view of the metric filters. Kept in the interface layer so the
 * application layer only ever sees the plain `MetricFilters` domain shape.
 */
@InputType()
export class MetricFiltersInput {
  @Field(() => Boolean, {
    nullable: true,
    description:
      'Restrict to requests that produced token usage, hiding non-LLM proxy traffic.',
  })
  llmOnly?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Case-insensitive substring match across host and model.',
  })
  search?: string;

  @Field(() => String, { nullable: true })
  host?: string;

  @Field(() => String, { nullable: true })
  model?: string;

  @Field(() => Int, { nullable: true })
  status?: number;
}

export function toMetricFilters(
  input?: MetricFiltersInput | null,
): MetricFilters | undefined {
  if (!input) return undefined;
  return {
    llmOnly: input.llmOnly ?? undefined,
    search: input.search ?? undefined,
    host: input.host ?? undefined,
    model: input.model ?? undefined,
    status: input.status ?? undefined,
  };
}
