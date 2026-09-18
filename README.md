# InsightFlow

**AI-powered real-time product analytics & intelligence platform** — a self-hosted, SaaS-style analytics product: create projects, ship a lightweight tracking SDK, ingest events through a rate-limited API, and get live dashboards, funnels, segmentation, statistical anomaly detection, and LLM-generated insights & reports.

## Feature highlights

| Area | What it does |
|---|---|
| **Auth** | Register/login with bcrypt hashing, short-lived JWT access tokens, rotating refresh tokens in httpOnly cookies (stored hashed, revocable), role model (`ADMIN`/`ANALYST`/`USER`) |
| **Projects** | Multi-tenant workspaces — every query is scoped & verified server-side; member roles (owner/editor/viewer); non-members get 404, never data leaks |
| **API keys** | `if_live_…` keys stored as SHA-256 hashes only; create / rotate / revoke; plaintext shown exactly once; per-key Redis rate limiting |
| **Ingestion** | `POST /api/events` + `/api/events/batch` with strict zod validation, UA parsing, traffic-source derivation, session upserts in the same transaction |
| **Realtime** | Socket.IO gateway — ingest → event bus → project room → dashboard updates with no refresh |
| **Analytics** | Real SQL aggregations (distinct users/sessions, `date_trunc` timeseries, top pages/events, sources, device/browser/OS/country breakdowns) — no raw-row loading, no hard-coded numbers |
| **Segmentation** | Filter by country/device/source; new vs returning users computed from first-ever event timestamps |
| **Funnels** | Ordered first-occurrence funnel SQL with completion windows; per-step users, drop-off, conversion % |
| **Anomalies** | Statistical z-score detection (hourly/daily series vs trailing baseline) run by a scheduled BullMQ job — *not* "the AI said so" |
| **AI** | OpenAI-compatible client (configurable base URL/model) — Q&A over aggregated, privacy-safe project context; AI narrative inside weekly/monthly reports |
| **Jobs** | BullMQ: report generation (retries + backoff), repeatable anomaly scan every 30 min |
| **Caching** | Redis cache-aside for analytics, versioned per project and invalidated on every ingested event — never serves stale data |
| **Exports** | CSV for events/analytics datasets; Markdown download for reports |
| **Docs** | Swagger UI at `/api-docs`, interactive demo event generator at `/demo`, tracking SDK at `/sdk/insightflow.js` |

## Architecture

```
Tracked site ──SDK──▶ POST /api/events ──▶ zod validate ──▶ Postgres (Event + Session upsert)
   (x-api-key)              │ rate limit (Redis)
                            ├─▶ bump project cache version (Redis)
                            └─▶ event bus ──▶ Socket.IO room ──▶ Realtime dashboard

Dashboard ──JWT──▶ /api/projects/:id/analytics/* ──▶ cache-aside (Redis) ──▶ SQL aggregations
BullMQ worker ◀── repeatable: anomaly scan (z-score) · on-demand: report generation (+AI summary)
```

## Tech stack

- **Frontend** — Next.js 15 (App Router), TypeScript, Tailwind, React Query, Recharts, socket.io-client
- **Backend** — Node.js, Express, TypeScript, Prisma, Socket.IO, BullMQ, ioredis, zod, swagger-ui
- **Data** — PostgreSQL 16 (events, sessions, projects, users, keys, funnels, anomalies, reports), Redis 7 (cache, rate limits, queues)
- **AI** — `openai` SDK against any OpenAI-compatible endpoint (env-configured)

## Repository layout

```
frontend/     Next.js dashboard (app router, charts, realtime feed)
backend/      Express API + Prisma schema/migrations + workers + swagger + demo page
sdk/          Tracking SDK (plain JS — <script> or npm, zero deps)
docker-compose.yml   Postgres + Redis for local dev
```

## Quick start

### 1. Infrastructure

**Option A — zero install (embedded Postgres):**

```bash
cd backend
npm run db:dev        # real PostgreSQL 18 in ~/.insightflow/pgdata — keep running
```

**Option B — Docker:**

```bash
docker compose up -d  # Postgres :5432 + Redis :6379
```

**Option C — local install:** PostgreSQL 16+ and Redis 7.

Without Redis the app runs in a degraded mode (`ALLOW_NO_REDIS=true`: caching/rate
limits fall back to memory, background jobs run inline), but **PostgreSQL is required**.

### 2. Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
npm install
npx prisma migrate deploy     # or: npm run db:migrate
npm run db:seed               # demo user + project + ~45 days of events + API key
npm run dev                   # API on :4000 (workers embedded; or npm run dev:worker separately)
```

Seed output prints the demo credentials and the project API key **once**:

- Login: `demo@insightflow.dev / Demo123!` (admin: `admin@insightflow.dev / Admin123!`)
- API key: `if_live_…`

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000
```

### 4. Generate live traffic

Open `http://localhost:4000/demo`, paste your project API key, hit **Connect SDK**,
then fire events or start the traffic simulator — watch the **Realtime** page update live.

## API overview

Interactive docs: **`http://localhost:4000/api-docs`** (Swagger/OpenAPI).

| Group | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` · `login` · `refresh` · `logout` · `GET/PATCH /api/auth/me` · `POST /api/auth/change-password` |
| Projects | `GET/POST /api/projects` · `GET/PATCH/DELETE /api/projects/:id` · member management |
| API keys | `GET/POST /api/projects/:id/api-keys` · `POST …/:keyId/rotate` · `DELETE …/:keyId` |
| Ingestion | `POST /api/events` · `POST /api/events/batch` (x-api-key, rate-limited) |
| Analytics | `GET …/analytics/{overview,timeseries,top-pages,top-events,traffic-sources,breakdown/:dim,realtime,segments,users,sessions,events}` |
| Funnels | `GET/POST /api/projects/:id/funnels` · `GET …/funnels/:fid/results` · `DELETE` |
| Anomalies | `GET /api/projects/:id/anomalies` · `POST …/anomalies/scan` |
| Insights | `GET/POST /api/projects/:id/insights[/ask]` |
| Reports | `GET/POST /api/projects/:id/reports` · `GET/DELETE …/reports/:rid` · `GET …/download` |
| Export | `GET …/export/events.csv` · `GET …/export/analytics.csv` |

## Database schema

`User` · `RefreshToken` · `Project` · `ProjectMember` · `ApiKey` (hashed) · `Event` (indexed on projectId+timestamp, name, userId, sessionId) · `Session` (upserted on ingest: duration, event count, conversion flag) · `Funnel`/`FunnelStep` · `Anomaly` · `AIInsight` · `Report`

## Testing

```bash
cd backend
npm test
```

- **Unit tests** (crypto, UA parsing, zod schemas, z-score math) run with zero infra.
- **Integration tests** (auth flow, project isolation, API-key lifecycle, ingestion, analytics correctness, funnel ordering) run against a real Postgres via supertest and **auto-skip** when the DB is unreachable.

## Security notes

- Passwords: bcrypt (cost 12). Refresh tokens: random 48B, stored SHA-256, rotated on use, revoked on logout/password change.
- API keys: 24-byte random, stored as SHA-256 hash; only prefix + last4 ever displayed.
- All analytics routes verify project membership server-side; non-members receive 404.
- AI prompts contain **aggregates only** — never raw events or user identifiers.
- Rate limiting on auth + ingestion, helmet headers, strict zod validation, uniform error shape, no stack traces in responses.

## Configuration

See `backend/.env.example` — all secrets via env vars, nothing committed.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` / `ALLOW_NO_REDIS` | Cache/queue/rate-limit backend; degraded mode flag |
| `JWT_SECRET` · `JWT_ACCESS_TTL` · `JWT_REFRESH_TTL_DAYS` | Token signing + lifetimes |
| `OPENAI_API_KEY` · `OPENAI_BASE_URL` · `OPENAI_MODEL` | Any OpenAI-compatible LLM endpoint |
| `RATE_LIMIT_*` | Ingestion & auth per-minute limits |

## Known limitations / next steps

- In-process event bus (single node) — swap for Redis pub/sub to scale realtime horizontally
- Anomaly metrics are a fixed set; per-project custom metric subscriptions would be the natural extension
- Cursor pagination on the events explorer is forward-only
- Playwright e2e specs are a next step (API-level integration tests cover the same flows)
