# Architecture

Next.js serves pages and versioned JSON endpoints. Staff identities use Auth.js
credentials sessions with Argon2 hashes. Workspace access is derived from a live
membership lookup for every request. The explicit `/preview` route holds only
fictional browser state and has no authentication claim.

PostgreSQL owns conversations, messages, knowledge, tickets, proposals, and audits.
Composite foreign keys prevent a message, ticket, proposal, or visitor session
from linking across tenants. Domain helpers check scope before every operation.
The repository does not yet implement PostgreSQL RLS.

Message writes and outbox events share a database transaction. A persistent worker
claims unpublished rows with FOR UPDATE SKIP LOCKED, adds deterministic BullMQ job
IDs, and then marks rows published. Job retries replay transactions idempotently.
Retain completed jobs to close the enqueue/mark crash window; operators must not
prune them until a durable event-retention policy is implemented.

Socket.IO sends identifiers as invalidation hints. Clients re-fetch through
authorized APIs, so internal notes cannot leak in a shared broadcast payload.
Database history is canonical. The gateway authenticates signed tokens and checks
visitor conversation ownership. A reconnect reloads the current history.

The AI implementation is deterministic mock mode only. It reads approved full-text
knowledge and visitor-owned orders. The refund simulator writes a unique proposal
effect in the same transaction as its executed state. This provides at-most-once
effects within this local database; it is not a claim about an external payment API.

The widget loads history through successive cursor pages and recovers its visitor
identity through a rotating, installation-bound refresh credential. Access tokens
renew every 12 minutes; staff tokens also renew while the workspace is open.

Known limits: the agent aggregate is bounded to 100 conversations and 100 messages
per conversation. No live provider/streaming,
read receipts, invitation delivery, automated retention, or tracing backend yet.
