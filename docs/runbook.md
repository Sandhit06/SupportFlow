# Local operations

1. Copy `.env.example` to `.env`; change secrets before any non-local use.
2. Run `pnpm install` and `pnpm db:generate`.
3. Run `docker compose up -d postgres redis`.
4. Run `pnpm db:migrate` then `pnpm db:seed`.
5. Copy `.env` to `apps/web/.env.local` for Next local development.
6. Run `pnpm dev` to start web, gateway, worker, and storefront.

Alternatively `docker compose up --build` builds all services, migrates/seeds, and
serves the app on 3000, gateway on 3001, storefront on 3002. Compose requires `.env`.
Do not use `prisma db push` for deployment.

Readiness: GET `/api/v1/health/ready` checks both PostgreSQL and Redis. Liveness:
GET `/api/v1/health/live`. Gateway GET `:3001` reports process liveness only.

When Redis is unavailable, database messages remain in the outbox. After recovery,
the poller enqueues them. Keep Redis AOF and persistent volumes enabled. Database
backup/restore and Redis data-loss recovery have not yet been exercised.

Queue failures retain jobs with bounded retries. Inspect them with BullMQ tooling;
a dedicated failed-job dashboard is not implemented. Restart the worker after
correcting configuration. Do not manually set proposal state to EXECUTED.

Graceful shutdown closes the worker before Redis/database connections. Migrations
are forward-only: back up before applying, and prefer a corrective migration over
editing an already applied migration. No deployment has been performed.
