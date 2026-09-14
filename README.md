<p align="center">
  <img src="docs/assets/dashboard.png" alt="cli-obs-proxy dashboard" />
</p>

# cli-obs-proxy

<p align="center">
  <img src="https://img.shields.io/badge/stack-python%20%C2%B7%20nest%20%C2%B7%20react-blueviolet" alt="Stack" />
  <img src="https://img.shields.io/badge/runs%20on-docker%20compose-2496ED" alt="Docker" />
  <img src="https://img.shields.io/badge/license-TBD-lightgrey" alt="License" />
</p>

<p align="center">
  <em>Observability for the LLM tools you already run from your terminal.</em>
</p>

A four-service stack — `proxy` + `backend` + `frontend` + `postgres` — that watches the HTTP traffic
your favourite LLM CLIs send to the network, parses the token usage out of both Anthropic and OpenAI
responses (including SSE streaming), and renders it as a live dashboard you can read at a glance.

## Features

- **Proxy capture:** A Python `mitmproxy` add-on records every request a wrapped CLI makes — method,
  scheme, host, port, path, status, request/response bytes, and latency.
- **Token accounting:** Anthropic and OpenAI usage are parsed from both JSON and SSE streaming
  responses, with the model name and `input_tokens` / `output_tokens` / `total_tokens` extracted and
  tagged by source (`response_usage` or `sse_usage`).
- **Persistent history:** All observations land in PostgreSQL with indexes on `observed_at`, `host`,
  and `model`.
- **Call inspection:** The newest `CALL_HISTORY_LIMIT` calls retain request and response headers and
  bodies for on-demand inspection from the dashboard; older metric summaries remain available.
- **GraphQL API:** A NestJS + Prisma 7 + Apollo backend exposes `recentMetrics(limit)`,
  `callDetails(id)`, and `modelUsage` (per-model token aggregates).
- **Live dashboard:** A React + Vite + Tailwind + Recharts UI renders a filterable request log, a
  per-model token bar chart, a 7-day usage trend, and a weekday heatmap.
- **Layered backend:** The NestJS service splits into `domain`, `application`, `infrastructure`, and
  `interface` modules, so the GraphQL boundary, the domain model, and the persistence layer stay
  cleanly separated.
- **Drop-in shell wrapper:** A zsh `llmobs` function routes any CLI through the proxy, sets
  `NODE_EXTRA_CA_CERTS` so Node-based tools (like Claude Code) trust the mitm CA, and pre-flights
  the proxy port and cert file before every call.

## Installation

This project ships as a Docker Compose stack. Bring it up with one command:

```sh
git clone https://github.com/<owner>/cli-obs-proxy.git
cd cli-obs-proxy
docker compose up -d --build
```

The first build pulls `postgres:16-alpine`, a Python 3.11 image with `mitmproxy` + `psycopg`, a Node 20
image that runs `prisma migrate deploy` + `node dist/main`, and a Node 20 + nginx image for the
dashboard. On the host you get:

| Service  | Port                                   |
| -------- | -------------------------------------- |
| Frontend | `http://localhost` (nginx, port 80)    |
| Backend  | `http://localhost:3000/graphql`        |
| Proxy    | `http://localhost:8080` (mitmproxy)    |
| Postgres | `localhost:5432` (`cliobs` / `cliobs`) |

### macOS — install the mitmproxy CA cert

The proxy MITM-decrypts HTTPS for traffic shaping, so its CA cert needs to be trusted by your system
keychain (and by Node-based CLIs via `NODE_EXTRA_CA_CERTS`).

```sh
# 1. Find the cert volume and copy the cert out
VOLUME_NAME=$(docker volume ls -q | grep mitmproxy_certs)
docker run --rm -v "$VOLUME_NAME":/certs -v "$PWD":/local alpine \
  cp /certs/mitmproxy-ca-cert.pem /local/

# 2. Trust it system-wide
security add-trusted-cert -d -r trustRoot \
  -k ~/Library/Keychains/login.keychain-db \
  ./mitmproxy-ca-cert.pem
```

## Usage

### Wrap any CLI command through the proxy

Drop the helper into `~/.zshrc`, then prefix any command with `llmobs`:

```sh
llmobs claude -p "hello"
llmobs curl https://api.anthropic.com
llmobs -- claude --some-flag
```

The wrapper exports `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` (and their lowercase variants), sets
`NO_PROXY` for localhost, and points `NODE_EXTRA_CA_CERTS` at the mitmproxy CA so Node-based tools
trust the intercepted TLS. Set `LLMOBS_INJECT_CA_ENV=1` to additionally export `SSL_CERT_FILE`,
`REQUESTS_CA_BUNDLE`, and `CURL_CA_BUNDLE` for Python/OpenSSL clients that don't read the system
keychain.

### Query the captured metrics directly

```sh
docker compose exec postgres psql -U cliobs -d cliobs
```

```sql
-- Recent traffic
SELECT observed_at, host, model, status, input_tokens, output_tokens, total_tokens, token_source
FROM http_metrics
ORDER BY observed_at DESC
LIMIT 20;

-- Per-model totals
SELECT model,
       COUNT(*)                          AS requests,
       SUM(input_tokens)                 AS input_tokens,
       SUM(output_tokens)                AS output_tokens,
       SUM(total_tokens)                 AS total_tokens
FROM http_metrics
GROUP BY model
ORDER BY total_tokens DESC NULLS LAST;
```

### Browse the dashboard

Open `http://localhost` in a browser. The filter bar narrows by free-text search, host, model, or
status. The charts update as new requests come in.

## Configuration

The proxy reads these environment variables (set on the `proxy` service in `docker-compose.yml`):

| Variable                        | Default                                           | Effect                                                                                                                                |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | `postgresql://cliobs:cliobs@postgres:5432/cliobs` | Postgres connection string used by both the proxy and the backend.                                                                    |
| `MAX_TOKEN_PARSE_BYTES`         | `10000000`                                        | Caps the body size the token parser will scan. Larger payloads are truncated head + tail.                                             |
| `CALL_HISTORY_LIMIT`            | `50`                                              | Number of newest calls whose request and response details are retained for dashboard inspection.                                      |
| `ENABLE_OPENAI_USAGE_INJECTION` | `false`                                           | Opt-in: rewrite OpenAI-compatible streaming requests to add `stream_options.include_usage: true` so the final usage chunk is emitted. |
| `METRICS_IGNORE_PATHS`          | `/favicon.ico`                                    | Comma-separated paths that are never recorded — browser probes that would otherwise flood the table.                                  |

Body capture is controlled by mitmproxy's `stream_large_bodies` (set in `proxy/Dockerfile`, default
`10m`). A streamed body is discarded and can never be parsed for token usage, so this threshold must
stay above the response sizes you want tokenised. Note that setting it to `0` does **not** disable
streaming — mitmproxy streams every body larger than the threshold, so `0` streams everything.

Out of the box, no other configuration is required.

## Project layout

```
cli-obs-proxy/
├── docker-compose.yml          # Wires the four services together
├── proxy/                     # Python mitmproxy add-on
│   ├── addon.py               #   – records every HTTP request/response
│   ├── tokens.py              #   – Anthropic + OpenAI token usage parser
│   ├── db.py                  #   – Postgres async pool + schema migrations
│   └── Dockerfile
├── backend/                   # NestJS + Prisma + GraphQL API
│   ├── prisma/schema.prisma   #   – HttpMetric model → http_metrics table
│   └── src/
│       ├── main.ts            #   – bootstrap + CORS
│       ├── app.module.ts      #   – GraphQL module wiring
│       └── metrics/
│           ├── domain/        #   – GraphQL object types
│           ├── application/   #   – MetricService
│           ├── infrastructure/ # – PrismaService
│           └── interface/     #   – GraphQL resolvers
└── frontend/                  # React + Vite + Recharts dashboard
    └── src/
        ├── App.tsx            #   – shell + filter bar
        ├── apolloClient.ts    #   – GraphQL client (http://localhost:3000/graphql)
        ├── queries.ts         #   – GET_RECENT_METRICS, GET_MODEL_USAGE
        └── components/
            ├── MetricsTable.tsx
            ├── TokenChart.tsx
            └── UsageOverview.tsx
```

## Development

Bring the whole stack up:

```sh
docker compose up -d --build
docker compose logs -f proxy
```

To work on a single service without rebuilding the world:

```sh
# Backend (NestJS, watch mode)
cd backend && npm install && npm run start:dev

# Frontend (Vite dev server)
cd frontend && npm install && npm run dev

# Proxy (run mitmdump against the local Python files)
cd proxy
DATABASE_URL="postgresql://cliobs:cliobs@localhost:5432/cliobs" \
  mitmdump --listen-port 8080 -s addon.py --set stream_large_bodies=10m
```

The Vite dev server runs on `http://localhost:5173`, which is already in the backend's CORS
allow-list alongside `http://localhost:3000`.

## Whatcha think?

Open a GitHub issue, send a PR, or just tell your terminal what you wish it would do — that's the
whole point of this project. Bug reports, dashboard mockups, and "please also parse X provider"
patches all welcome.

## License

This project is intended to be released as open source. A `LICENSE` file has not yet been chosen —

see [`docs/marketing/00-product-facts.md`](docs/marketing/00-product-facts.md) for the current
status.
