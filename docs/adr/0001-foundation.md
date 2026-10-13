# 0001 — Monorepo, runtime boundaries, and materials

Keep Next.js for pages and HTTP boundaries, Socket.IO in a persistent gateway,
and BullMQ in a separate worker. Shared domain code owns authorization and state
transitions. PostgreSQL is canonical; Redis notifications are hints.

Use Prisma 6 with its established client generator and PostgreSQL migrations;
upgrading to Prisma 7 is an independent change requiring adapter validation.
Pin actual resolved dependencies in pnpm-lock.yaml. Node 24 is the local runtime.
TypeScript is pinned to 5.9.3 because the installed ESLint parser rejects TS 7.
The Prisma config transitive dependency deepmerge-ts is overridden to patched
8.0.0; client generation was verified and the dependency audit is clean.

Use scoped repository functions and composite tenant foreign keys. RLS is deferred
until a restricted role and connection-pool transaction context can be verified.
Do not claim DB-level RLS isolation.

The Apple design skill supplied by the user governs typography, layered translucent
navigation, press feedback, and accessible motion/transparency preferences. Large
content areas remain quiet and readable. Light and dark themes share hierarchy.

An explicitly labeled browser-only preview can demonstrate the interface without
infrastructure. It must never be represented as authenticated or production data.
Production service failures must not silently fall back to preview data.
