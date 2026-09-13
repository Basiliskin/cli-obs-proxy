# Product Facts

> Single source of truth for all downstream marketing skills. No promotional material may claim more
> than this document supports.

## Verified facts

Every fact traced to a repository file, the README, or the user. The `source:` field is restricted to
`<repo-relative path>` | `README` | `user`.

### Architecture and topology

- Four-service Docker Compose stack: `postgres`, `proxy`, `backend`, `frontend` — source: `docker-compose.yml`
- Brought up with `docker compose up -d --build` — source: `README.md`
- Local-first deploy; no cloud or hosted SaaS target is configured — source: `docker-compose.yml`
- Ports exposed: postgres `5432`, proxy `8080`, backend `3000`, frontend `80` — source: `docker-compose.yml`

### Proxy (mitmproxy) — `proxy/`

- Built on `python:3.11-slim`, runs `mitmdump` on `0.0.0.0:8080` with the addon script — source: `proxy/Dockerfile`
- Records one row per HTTP request observed by the addon — source: `proxy/addon.py`
- Captures `method`, `scheme`, `host`, `port`, `path` (query string stripped), `status`, `request_bytes`, `response_bytes`, `duration_ms`, `error` — source: `proxy/addon.py:54-122`
- Strips query parameters from the stored path to avoid leaking API keys/tokens in logs — source: `proxy/addon.py:62`
- Persists rows to PostgreSQL via an async connection pool (`psycopg_pool.AsyncConnectionPool`, `min_size=1`, `max_size=5`) — source: `proxy/db.py:62-74`
- Schema is created on startup (`CREATE TABLE IF NOT EXISTS http_metrics`) with idempotent `ALTER TABLE` migrations for the token columns — source: `proxy/db.py:15-59`
- Indexes on `observed_at`, `host`, and `model` — source: `proxy/db.py:38-51`
- Waits up to 30 seconds for Postgres readiness on startup — source: `proxy/db.py:90-108`

### Token usage extraction — `proxy/tokens.py`

- Parses token usage from non-streaming JSON responses (`usage.input_tokens` / `usage.output_tokens` for Anthropic, `usage.prompt_tokens` / `usage.completion_tokens` / `usage.total_tokens` for OpenAI) — source: `proxy/tokens.py:92-168`
- Parses token usage from Anthropic SSE streaming by reading `message_start.message.usage.input_tokens` and `message_delta.usage.output_tokens` — source: `proxy/tokens.py:171-273`
- Parses token usage from OpenAI-compatible SSE streaming via the final usage chunk — source: `proxy/tokens.py:241-273`
- Falls back to the request body's `model` field when the response does not declare one — source: `proxy/tokens.py:284-323`
- Caps parsed response text via `MAX_TOKEN_PARSE_BYTES` (default 10,000,000), keeping the head and tail of larger payloads to bound memory — source: `proxy/tokens.py:10`, `proxy/tokens.py:49-65`
- Supports an opt-in `ENABLE_OPENAI_USAGE_INJECTION` flag that mutates OpenAI streaming requests to add `stream_options.include_usage: true` (disabled by default) — source: `proxy/tokens.py:14-17`, `proxy/tokens.py:328-373`
- Records a `token_source` of either `response_usage` (non-streaming) or `sse_usage` (streaming) — source: `proxy/tokens.py:133-273`
- Failure in the addon never breaks the user's request — exceptions in token extraction / DB write are caught and logged — source: `proxy/addon.py:121-122`, `proxy/tokens.py:374-377`

### Backend (NestJS + Prisma + GraphQL) — `backend/`

- Built on Node 20, runs `prisma migrate deploy` then `node dist/main` — source: `backend/Dockerfile`
- NestJS 11 with `@nestjs/graphql`, `@nestjs/apollo`, code-first schema generation — source: `backend/src/app.module.ts`, `backend/package.json`
- GraphQL endpoint at `http://localhost:3000/graphql`, GraphQL Playground enabled — source: `backend/src/app.module.ts`, `backend/src/main.ts`
- CORS allows `http://localhost:5173` and `http://localhost:3000` — source: `backend/src/main.ts:7-8`
- Prisma 7 with the `@prisma/adapter-pg` driver adapter — source: `backend/src/metrics/infrastructure/prisma.service.ts`
- Prisma schema models `HttpMetric` mapping to the `http_metrics` table — source: `backend/prisma/schema.prisma`
- DDD layering under `src/metrics/`: `domain/` (GraphQL types), `application/` (`MetricService`), `infrastructure/` (`PrismaService`), `interface/` (`MetricResolver`) — source: `backend/src/metrics/`
- Two GraphQL queries: `recentMetrics(limit: Int! = 50)` and `modelUsage: [ModelUsageAggregate!]!` — source: `backend/src/schema.gql`
- `recentMetrics` orders by `observed_at DESC` — source: `backend/src/metrics/application/metric.service.ts:9-17`
- `modelUsage` aggregates via raw SQL grouped by `model`, summing `input_tokens` and `output_tokens`, ordered by `total_output_tokens DESC` — source: `backend/src/metrics/application/metric.service.ts:19-34`
- BigInt ids are stringified before being returned to GraphQL — source: `backend/src/metrics/application/metric.service.ts:16`

### Frontend (React + Vite + Apollo + Recharts) — `frontend/`

- React 19 + Vite with Tailwind CSS v4 via `@tailwindcss/vite` — source: `frontend/package.json`, `frontend/vite.config.ts`
- Apollo Client points at `http://localhost:3000/graphql` — source: `frontend/src/apolloClient.ts`
- Two GraphQL queries defined: `GET_RECENT_METRICS($limit: Int!)` and `GET_MODEL_USAGE` — source: `frontend/src/queries.ts`
- Single-page dashboard with header, filter bar, KPI overview, bar chart, system-health panel, and metrics table — source: `frontend/src/App.tsx`
- Filter bar supports search (host or model substring), host dropdown, model dropdown, status dropdown, and a Clear button — source: `frontend/src/App.tsx:104-163`
- Fetches the most recent 100 metrics and filters client-side — source: `frontend/src/App.tsx:39-56`
- `MetricsTable` renders time, host, model, status (200 styled success, others styled failure), `duration_ms`, and `input_tokens / output_tokens` — source: `frontend/src/components/MetricsTable.tsx`
- `TokenChart` is a Recharts bar chart of `total_input_tokens` vs `total_output_tokens` per model — source: `frontend/src/components/TokenChart.tsx`
- `UsageOverview` shows total tokens, projected 7-day tokens (`totalTokens * 7`), active days, a 7-day Recharts area trend chart, and a weekday × 3-day-bucket heatmap — source: `frontend/src/components/UsageOverview.tsx`
- Production frontend build is a static SPA served by nginx — source: `frontend/Dockerfile`

### CLI wrapper — `README.md`

- Provides a `llmobs()` zsh function that exports `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and their lowercase variants, `NO_PROXY`/`no_proxy`, and `NODE_EXTRA_CA_CERTS` — source: `README.md:29-82`
- Pre-flight checks fail fast if the mitmproxy CA cert is missing or the proxy isn't listening on `127.0.0.1:8080` — source: `README.md:42-51`
- Optional `LLMOBS_INJECT_CA_ENV=1` exports `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE` for Python/OpenSSL tools — source: `README.md:74-78`
- Convenience aliases: `llmobs-up`, `llmobs-logs`, `claudeobs` — source: `README.md:85-87`
- The mitmproxy CA cert is installed into the macOS Keychain via `security add-trusted-cert` — source: `README.md:13-17`

## Repository evidence

Concrete file paths in this repository that back the Verified facts.

### Top-level

- `docker-compose.yml`
- `README.md`
- `.gitignore`

### `proxy/`

- `proxy/Dockerfile`
- `proxy/addon.py`
- `proxy/db.py`
- `proxy/tokens.py`

### `backend/`

- `backend/Dockerfile`
- `backend/package.json`
- `backend/.env`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260913152500_init/migration.sql`
- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/schema.gql`
- `backend/src/metrics/metrics.module.ts`
- `backend/src/metrics/domain/metric.model.ts`
- `backend/src/metrics/application/metric.service.ts`
- `backend/src/metrics/infrastructure/prisma.service.ts`
- `backend/src/metrics/interface/metric.resolver.ts`

### `frontend/`

- `frontend/Dockerfile`
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/apolloClient.ts`
- `frontend/src/queries.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/MetricsTable.tsx`
- `frontend/src/components/TokenChart.tsx`
- `frontend/src/components/UsageOverview.tsx`

## User-provided facts

Only the four non-derivable categories: production URL, primary goal, open-source status, features
not visible in the repository.

- Production URL: none — local-only via `docker compose up`
- Primary goal: portfolio / showcase piece
- Open-source status: public open source; no license has been chosen yet — `backend/package.json` currently declares `"license": "UNLICENSED"`, `frontend/package.json` declares `"private": true`, and no top-level `LICENSE` file is present
- Features not visible in the repository: none — the repository represents the full product

## Unknown

Gaps recorded as open. Never invent an answer here.

- Number of active users / adoption metrics
- Performance benchmarks (proxy latency overhead, request throughput, dashboard render time)
- Browser support matrix (only one explicit dev origin `localhost:5173` is listed in CORS; no browser-compatibility claim is documented)
- Authentication, multi-user, or tenant isolation — not implemented in the schema or GraphQL layer
- Alerting / anomaly detection / cost budgets — not present in the code
- Cost-per-model in USD — not implemented
- Data retention, archival, or pruning policy beyond Postgres defaults
- Database backup, restore, or disaster-recovery procedure
- HTTPS / TLS termination for the dashboard (nginx serves plain HTTP on port 80 inside the container)
- Any CI/CD pipeline configuration (no `.github/`, `.gitlab-ci.yml`, etc. present)
- Tests beyond the default `app.controller.spec.ts` and `app.e2e-spec.ts` — no coverage for the proxy, token parser, or frontend
- Whether the project has been audited for security, privacy, or data-handling compliance
- Real production traffic load or cardinality of `host` / `model` / `path` in the wild

## Forbidden assumptions

Never claim the following without explicit evidence. Un-evidenced occurrences are parked here, not in
Verified facts.

- fastest
- most secure
- better than competitors
- privacy-preserving
