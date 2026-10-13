# SupportFlow AI

A thoughtful workspace for AI-assisted customer support, built from the supplied
[implementation specification](SupportFlow_AI_README.md). The original spec is
preserved. **This is an initial implementation, not the completed production MVP.**

## Try the interface

```bash
pnpm install
pnpm db:generate
pnpm dev:web
```

Open [localhost:3000/preview](http://localhost:3000/preview). No database or paid
AI key is needed for the preview. It includes fictional conversations, working
local reply/note composition, resolution, ticket creation, article editing,
approval decisions, filters, workspace switching, and light/dark appearances.
Preview changes reset on refresh. An approved preview refund is **not executed**.

The interface applies the user-provided Apple design skill: system typography,
frosted navigation, layered surfaces, instant press feedback, restrained motion,
responsive layouts, reduced motion/transparency, and higher contrast preferences.

## Run the connected stack

Requirements: Node 24, pnpm 11.25.0, Docker with Compose.

```bash
cp .env.example .env
pnpm install
pnpm db:generate
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
cp .env apps/web/.env.local
pnpm dev
```

On PowerShell, use `Copy-Item` in place of `cp` if preferred. The one-command
container alternative is `docker compose up --build` after creating `.env`.
Docker Desktop and WSL are installed on the development machine. PostgreSQL and
Redis, migrations, seed data, and the connected browser workflow have been verified.

- Web: [localhost:3000](http://localhost:3000)
- Staff sign-in: [localhost:3000/login](http://localhost:3000/login)
- Socket.IO gateway: port 3001
- Demo storefront: [localhost:3002](http://localhost:3002)
- Fictional local accounts: [docs/local-demo.md](docs/local-demo.md)

## What exists

| Area | Implementation status |
|---|---|
| Interface | Inbox, tickets, knowledge editor, approvals, AI policy, analytics, settings, onboarding, login, widget |
| Authentication | Registration, Auth.js credentials, Argon2 hashes, rotating visitor refresh credentials |
| Tenancy | Membership-derived authorization, scoped repositories, composite DB foreign keys; eight integration tests passed |
| Persistence | PostgreSQL/Prisma schema, committed SQL migrations, repeatable two-tenant seed |
| Messaging | Persist-first writes, duplicate client-ID handling, outbox, independent gateway and worker |
| AI | Deterministic mock only: published full-text knowledge, visitor-owned orders, handoff, refund proposals |
| Approvals | Conditional human decisions, execution-time authorization, unique transactional simulated effect |
| Delivery | pnpm scripts, Compose, Dockerfile, CI, tests, architecture/security/operations docs |

## Verification and remaining work

See [docs/testing.md](docs/testing.md) for actual local results. A passing preview
test is **not** evidence that the database-backed application works end to end.
The integration suite passed against real PostgreSQL and Redis. A connected
browser test verified tenant and socket isolation, visitor messaging, mock order
lookup, human-approved simulated refunds, duplicate rejection, and history recovery.

The original specification remains open. Required follow-up includes:

- Staff invitations, member management, installation configuration,
  agent history pagination and read/delivery receipts.
- Real provider adapter, bounded tool schemas and streaming/cancellation, AI usage
  telemetry, durable notifications, failed-job UI, scheduled retention.
- Full analytics definitions, OpenTelemetry, accessibility audit, chaos/load tests,
  clean-host Compose verification, backups/restore, and deployment hardening.

No public deployment, live refunds, fabricated benchmarks, or production-ready
security claims are made. All orders/refunds in this project are simulated.

## Project map

`apps/web` is the Next.js product and BFF; `apps/realtime` is the persistent gateway;
`apps/worker` owns outbox dispatch and jobs. `packages/core` owns domain operations,
`packages/contracts` validates input, `packages/db` contains Prisma/migrations/seed,
and `packages/config` validates service configuration.

Read [architecture](docs/architecture.md), [API](docs/api.md),
[threat model](docs/threat-model.md), [runbook](docs/runbook.md),
[observability](docs/observability.md), and [deployment](docs/deployment.md).

MIT licensed. AI where useful, deterministic systems where correctness matters.
