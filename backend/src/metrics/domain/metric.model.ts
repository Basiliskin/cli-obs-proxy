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

  @Field(() => Int)
  duration_ms!: number;

  @Field({ nullable: true })
  model!: string;

  @Field(() => Int, { nullable: true })
  input_tokens!: number;

  @Field(() => Int, { nullable: true })
  output_tokens!: number;

  @Field(() => Int, { nullable: true })
  total_tokens!: number;
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
}
