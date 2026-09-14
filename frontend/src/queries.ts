import { gql } from "@apollo/client";

export const GET_RECENT_METRICS = gql`
  query GetRecentMetrics($limit: Int!, $filters: MetricFiltersInput) {
    recentMetrics(limit: $limit, filters: $filters) {
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
      has_details
    }
  }
`;

export const GET_MODEL_USAGE = gql`
  query GetModelUsage($filters: MetricFiltersInput) {
    modelUsage(filters: $filters) {
      model
      request_count
      total_input_tokens
      total_output_tokens
    }
  }
`;

export const GET_METRIC_FACETS = gql`
  query GetMetricFacets($filters: MetricFiltersInput) {
    metricFacets(filters: $filters) {
      hosts
      models
      statuses
    }
  }
`;

export const GET_CALL_DETAILS = gql`
  query GetCallDetails($id: ID!) {
    callDetails(id: $id) {
      id
      observed_at
      method
      host
      path
      request_body
      response_body
      request_headers
      response_headers
    }
  }
`;
