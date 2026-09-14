# Update and Verification Playbook

Use this playbook after changing the Python proxy, Prisma schema or migrations, NestJS backend, or React frontend.

The stack has four services and one persistent database volume:

- `postgres`: PostgreSQL 16, persisted in the `pgdata` Docker volume
- `proxy`: Python `mitmproxy` add-on, writes observations to PostgreSQL
- `backend`: NestJS + Prisma + GraphQL API
- `frontend`: React/Vite dashboard served by nginx

## 1. Identify the change

Before starting the stack, classify the change:

| Change                               | Required follow-up                                                |
| ------------------------------------ | ----------------------------------------------------------------- |
| `backend/prisma/schema.prisma`       | Create a migration, regenerate Prisma Client, apply the migration |
| `backend/prisma/migrations/**`       | Apply with `prisma migrate deploy`                                |
| `backend/src/**`                     | Backend build and tests, then rebuild/restart `backend`           |
| `frontend/src/**`                    | Frontend lint/build, then rebuild/restart `frontend`              |
| `proxy/*.py` or proxy configuration  | Python syntax check, then rebuild/restart `proxy`                 |
| `docker-compose.yml` or a Dockerfile | Rebuild the affected service, usually with `--build`              |

Do not edit `backend/src/schema.gql` by hand. It is generated from GraphQL decorators. The source of truth is the resolver/domain code; regenerate it by starting the backend.

## 2. Validate locally

Run the checks for every changed layer before rebuilding Docker images.

### Proxy

From the repository root:

```sh
python3 -m py_compile proxy/addon.py proxy/db.py proxy/tokens.py
```

### Prisma and backend

From `backend/`:

```sh
npm ci
npx prisma generate
npm run build
npm test -- --runInBand
npx eslint "{src,apps,libs,test}/**/*.ts" --max-warnings 0
```

The backend Dockerfile also runs `prisma generate` and `npm run build`, so a successful local build catches most image build failures early.

### Frontend

From `frontend/`:

```sh
npm ci
npm run lint
npm run build
```

The frontend has no configured test runner currently; its executable checks are linting, TypeScript compilation, and the production Vite build.

## 3. Change the Prisma schema safely

If the database shape changes, do not only edit `schema.prisma`. Create a migration from the `backend/` directory:

```sh
cd backend
npx prisma migrate dev --name describe_the_change
npx prisma generate
```

Review the generated SQL before committing it. The migration must be committed together with:

- `backend/prisma/schema.prisma`
- the new directory under `backend/prisma/migrations/`
- any application code that reads or writes the new fields
- any proxy code that populates the fields

For an existing Docker database, deploy committed migrations with:

```sh
cd backend
npx prisma migrate deploy
npx prisma migrate status
```

The backend container runs `npx prisma migrate deploy` automatically before starting NestJS. Running it manually is useful when debugging an already-running PostgreSQL container or when the backend image is not being recreated.

## 4. Rebuild and start the stack

From the repository root:

```sh
docker compose up -d --build
```

This is the normal command after source changes. A plain `docker compose up -d` may reuse old images and leave the changed Python, backend, or frontend code out of the running stack.

Check service state:

```sh
docker compose ps
docker compose logs --tail=100 postgres
docker compose logs --tail=100 backend
docker compose logs --tail=100 proxy
docker compose logs --tail=100 frontend
```

The backend should log a successful Nest startup after migrations complete. The proxy should log that the database schema was ensured and that it is listening on port `8080`.

## 5. Verify the database and API

Check migration state from the host:

```sh
cd backend
npx prisma migrate status
```

Expected result:

```text
Database schema is up to date!
```

Inspect the actual columns when a schema error is suspected:

```sh
docker compose exec postgres psql -U cliobs -d cliobs -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'http_metrics' ORDER BY ordinal_position;"
```

Check that GraphQL responds:

```sh
curl -sS http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"{ recentMetrics(limit: 1) { id host has_details } }"}'
```

A successful response contains a JSON `data` object. An `errors` object means the backend or database contract is still mismatched.

## 6. Verify the full request path

Open the dashboard at `http://localhost` and confirm:

1. The page loads without a GraphQL error.
2. The request table updates after a proxied request.
3. A retained row shows `View` in the Inspect column.
4. Inspecting the row loads request/response headers and bodies.
5. Rows outside the detail retention window remain visible as metric summaries but are not inspectable.

Send a controlled request through the proxy if no traffic is visible:

```sh
curl -x http://127.0.0.1:8080 https://api.anthropic.com
```

For an LLM CLI, use the `llmobs` wrapper documented in the root README so the proxy and CA settings are applied only to that command.

## 7. Common failures

### `column http_metrics.request_body does not exist`

Prisma Client was generated from the new schema, but the persistent PostgreSQL volume still has the old table. Apply migrations:

```sh
cd backend
npx prisma migrate deploy
npx prisma migrate status
```

Then restart the backend:

```sh
docker compose restart backend
```

If the migration is present locally but the container is using an old image, rebuild:

```sh
docker compose up -d --build backend
```

### `UndefinedTypeError` for a GraphQL field

Nest cannot infer a GraphQL type, commonly for nullable unions such as `string | null`. Give the decorator an explicit type:

```ts
@Field(() => String, { nullable: true })
request_body!: string | null;
```

Rebuild the backend and check the generated `backend/src/schema.gql` after startup.

### The UI still shows old code

The frontend is compiled into the nginx image. Rebuild it and recreate the container:

```sh
docker compose up -d --build frontend
```

Hard-refresh the browser after the container is recreated.

### The proxy is running but no calls appear

Check the proxy logs and ports:

```sh
docker compose logs -f proxy
docker compose ps
```

Confirm the client has `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` pointing to `http://127.0.0.1:8080`, and that the client trusts the mitmproxy CA. For Node clients, set `NODE_EXTRA_CA_CERTS` to the extracted certificate.

### Containers are healthy but code is still stale

Inspect the image/container timestamps and rebuild the specific service:

```sh
docker compose up -d --build proxy backend frontend
```

Avoid relying on `docker compose restart` for source changes; restart does not rebuild an image.

## 8. Reset only when necessary

The normal recovery path preserves data:

```sh
docker compose down
docker compose up -d --build
```

Do not use `docker compose down -v` during routine updates. It deletes the `pgdata` volume and all captured metrics. Use it only when intentionally starting with an empty database:

```sh
docker compose down -v
docker compose up -d --build
```

After a volume reset, the initial migration creates the table and the backend applies all subsequent migrations automatically.

## 9. Release checklist

Before considering an update complete:

- [ ] Python proxy syntax check passes.
- [ ] Prisma schema and migration are committed together.
- [ ] `npx prisma generate` succeeds.
- [ ] Backend build, tests, and lint pass.
- [ ] Frontend lint and production build pass.
- [ ] `docker compose up -d --build` completes.
- [ ] `npx prisma migrate status` reports an up-to-date database.
- [ ] Backend GraphQL smoke query succeeds.
- [ ] Dashboard loads and displays current traffic.
- [ ] A retained call can be inspected in the UI.
- [ ] No secrets, request credentials, or sensitive payloads are copied into documentation or logs.
