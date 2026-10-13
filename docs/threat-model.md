# Trust boundaries and current controls

Untrusted: browser input, widget installation keys, origins, chat messages, article
content, and model output. Trusted identities come from Auth.js or a verified
visitor JWT plus an unexpired, non-revoked session record. Origins alone never
grant conversation access. Public installation IDs only permit session creation.

- Staff requests look up membership; guessed tenant and record identifiers return
  404. Viewer mutations and unauthorized approvals return 403.
- Non-GET staff mutations require an exact APP_URL origin. Auth.js protects its
  own credential/session endpoints. Cookies are managed by the auth library.
- Visitor messages cannot be internal notes. Widget reads explicitly exclude them.
- A visitor order query includes both organizationId and visitorId.
- Server validation bounds message and article sizes. UI renders plain text.
- Redis limits login attempts, widget bootstrap, messages, and typing signals.
- Refund decisions are conditional PENDING transitions. Execution rechecks the
  approver membership/policy and visitor-owned order amount. The simulator has a
  unique proposal ID and transactional execution; no real money moves.
- Secrets are server-side. Log errors contain identifiers/codes, not message text.

Outstanding hardening before public exposure: add per-IP bootstrap limits at a
trusted proxy; tighten CSP nonces (current Next development policy permits inline
and eval scripts); secure proxy/host trust configuration; session refresh and
revocation UX; RLS with restricted database role; append-only audit DB permissions;
data export/deletion and retention jobs; load/chaos tests and independent review.
Demo credentials must never be seeded into public production databases.
