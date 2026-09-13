import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

export const client = new ApolloClient({
  link: new HttpLink({ uri: "http://localhost:3000/graphql" }),
  cache: new InMemoryCache({
    typePolicies: {
      // The request log is a "newest N rows" feed, not an entity graph: rows
      // enter and leave the window constantly. Normalizing by id would grow the
      // cache with orphaned entities on every poll (Apollo never calls gc()
      // itself), and nothing here benefits from cross-query identity.
      HttpMetric: { keyFields: false },
    },
  }),
});
