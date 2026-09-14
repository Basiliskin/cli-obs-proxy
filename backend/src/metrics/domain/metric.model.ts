import { Field, ObjectType, Int, ID } from '@nestjs/graphql';

@ObjectType()
export class HttpMetric {
  @Field(() => ID)
  id!: string;

  @Field()
  observed_at!: Date;

  @Field()
  method!: string;

  @Field()
  host!: string;

  @Field()
  path!: string;

  @Field(() => Int, { nullable: true })
  status!: number;

  // Nullable: the recorder cannot compute a duration when no response arrived
  // (client disconnect, DNS/TLS failure), so the column is nullable in the DB.
  @Field(() => Int, { nullable: true })
  duration_ms!: number | null;

  @Field({ nullable: true })
  model!: string;

  @Field(() => Int, { nullable: true })
  input_tokens!: number;

  @Field(() => Int, { nullable: true })
  output_tokens!: number;

  @Field(() => Int, { nullable: true })
  total_tokens!: number;

  @Field(() => Int, { nullable: true })
  cache_creation_input_tokens!: number;

  @Field(() => Int, { nullable: true })
  cache_read_input_tokens!: number;

  @Field()
  has_details!: boolean;
}

@ObjectType()
export class HttpCallDetails {
  @Field(() => ID)
  id!: string;

  @Field()
  observed_at!: Date;

  @Field()
  method!: string;

  @Field()
  host!: string;

  @Field()
  path!: string;

  @Field(() => String, { nullable: true })
  request_body!: string | null;

  @Field(() => String, { nullable: true })
  response_body!: string | null;

  @Field(() => [String])
  request_headers!: string[];

  @Field(() => [String])
  response_headers!: string[];
}

@ObjectType()
export class ModelUsageAggregate {
  @Field()
  model!: string;

  @Field(() => Int)
  request_count!: number;

  @Field(() => Int)
  total_input_tokens!: number;

  @Field(() => Int)
  total_output_tokens!: number;

  @Field(() => Int)
  total_cache_creation_input_tokens!: number;

  @Field(() => Int)
  total_cache_read_input_tokens!: number;
}

/**
 * Plain domain filter shape — deliberately not a GraphQL type. The transport-level
 * input lives in the interface layer and is mapped onto this, so the application
 * layer never depends on an untrusted-input DTO.
 */
export interface MetricFilters {
  /** Restrict to rows that produced token usage (non-LLM proxy noise is stored with model = NULL). */
  llmOnly?: boolean;
  /** Case-insensitive substring match across host and model. */
  search?: string;
  host?: string;
  model?: string;
  status?: number;
}

/** Distinct values present in the current traffic scope, used to populate the filter dropdowns. */
@ObjectType()
export class MetricFacets {
  @Field(() => [String])
  hosts!: string[];

  @Field(() => [String])
  models!: string[];

  @Field(() => [Int])
  statuses!: number[];
}
