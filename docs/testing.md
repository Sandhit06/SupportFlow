# Verification — 2026-10-12

Environment: Windows, Node 24.19.0, pnpm 11.25.0, Docker Desktop 4.94.0,
WSL 2.7.13, PostgreSQL 16 and Redis 7. The connected browser tests below also
passed against the production app, gateway and worker running in Docker Compose.
No performance benchmark or completion of the entire specification is claimed.

| Command / check | Actual result |
|---|---|
| `pnpm install` | Pass; exact resolutions recorded in pnpm-lock.yaml |
| `pnpm db:generate` | Pass; Prisma Client 6.19.3 generated |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass after adding DOM.Iterable to strict TS config |
| `pnpm test` | 15 unit tests passed |
| `pnpm build` | Pass; Next production bundle and route generation completed |
| `pnpm test:e2e` | 4 tests passed, desktop Chromium and emulated mobile Chromium |
| `pnpm audit --audit-level high` | No known vulnerabilities after deepmerge-ts 8 override |
| UI captures | Light, dark, mobile inspected; no page errors or horizontal overflow |
| `pnpm db:migrate` / `pnpm db:seed` | Three migrations applied and two organizations seeded; repeat startup also passed |
| `pnpm test:integration` | 8 tests passed against real PostgreSQL and Redis |
| `pnpm test:e2e:live` | 2 connected browser tests passed against Docker Compose |
| Docker Compose | Production image built; all six persistent services started, migration service exited successfully |
| Image environment hygiene | Verified `/app/.env` and `/app/apps/web/.env.local` are absent from the container |
| GitHub CI | Configured, including connected browser tests; remote CI has not been run |

Browser tests exercise reply composition, internal notes, resolve/reopen, search,
empty results, article publication, human approval state, ticket creation, theme
switching, and responsive width. They run against `/preview`, not a mocked API
masquerading as a connected backend. Mobile coverage is Chromium emulation, not
an actual iPhone or Safari certification.

Screenshots in `docs/images` are captured from the running app using
`node scripts/capture-ui.mjs`. They depict fictional preview data.

The integration suite requires real services and creates isolated fixture tenants.
It covers membership isolation, guessed record IDs, composite foreign-key mismatch,
concurrent message idempotency, cross-visitor order refusal, pending/cross-tenant
refund rejection, concurrent approvals and duplicate execution. Tests delete only
their generated fixture organizations. Run it against a dedicated local/test DB.

The connected browser suite checks new-account registration, owner onboarding,
tenant isolation, unauthorized socket-room joins, widget-to-inbox updates, verified
visitor-owned order lookup, mandatory human approval, exactly one simulated refund,
duplicate approval rejection, and history recovery through refresh-token rotation.
It also verifies visitor-requested human handoff, staff replies, and that internal
notes remain absent from the visitor transcript after subsequent message delivery.
The refund test provisions an order owned by its test visitor and leaves that
conversation in the local demo workspace so the resulting audit can be inspected.
The separate registration test removes its generated account/workspace.

Run `pnpm test:e2e:live` after migration, seed and a production build, or against
the running Compose stack. Playwright starts missing app/gateway/worker/storefront
processes when needed. Run the connected suite before the preview suite in CI:
the preview development server can replace the local Next build output.

Missing acceptance suites: long-running token renewal, Redis/worker
crash recovery, live provider streaming,
automated WCAG audit, load/chaos and backup restore. CI must pass these additions
before the original product specification can be considered complete.
