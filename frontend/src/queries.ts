import { gql } from "@apollo/client";

export const GET_RECENT_METRICS = gql`
  query GetRecentMetrics($limit: Int!) {
    recentMetrics(limit: $limit) {
      id
      observed_at
      method
      host
      path
      status
      duration_ms
      model
      input_tokens
      output_tokens
      total_tokens
    }
  }
`;

export const GET_MODEL_USAGE = gql`
  query GetModelUsage {
    modelUsage {
      model
      request_count
      total_input_tokens
      total_output_tokens
    }
  }
`;
