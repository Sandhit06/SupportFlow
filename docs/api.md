# Implemented API surface

All paths below start with `/api/v1`. Responses are JSON with no-store caching.
Failures include `code`, `message`, `requestId`. Validation errors return 400,
missing authentication 401, denied capability 403, unknown scoped record 404,
stale state 409, throttling 429, unavailable dependencies 503.

| Method | Path | Authorization / behavior |
|---|---|---|
| GET | /health/live | Process liveness |
| GET | /health/ready | Database + Redis readiness |
| POST | /organizations | Staff session, exact Origin; name, slug, origin |
| GET | /organizations/:id/workspace | Membership; bounded aggregate for UI |
| GET | /organizations/:id/realtime-token | Membership; short-lived gateway token |
| GET | /organizations/:id/conversations/:cid | Scoped membership |
| POST | /organizations/:id/conversations/:cid/messages | Agent+; body, clientMessageId UUID, internal |
| POST | /organizations/:id/conversations/:cid/status | Agent+; status, expected version |
| POST | /organizations/:id/conversations/:cid/handoff | Agent+; expected version |
| POST | /organizations/:id/tickets | Agent+; conversationId, subject, priority |
| PATCH | /organizations/:id/tickets/:tid | Agent+; status, priority |
| POST / PATCH | /organizations/:id/knowledge[/:aid] | Admin+; title, body, published |
| POST | /organizations/:id/action-proposals/:pid/approve | Policy-authorized human; conditional transition |
| POST | /organizations/:id/action-proposals/:pid/reject | Policy-authorized human; conditional transition |
| PATCH | /organizations/:id/settings | Admin+; aiEnabled |
| POST | /widget/bootstrap | Exact registered Origin; installationKey, optional refreshToken; returns rotated refreshToken and 15-minute visitorToken |
| POST | /widget/conversations | Visitor bearer; resume or create conversation |
| GET | /widget/conversations/:id/messages | Owning visitor; optional cursor message UUID |
| POST | /widget/conversations/:id/messages | Owning visitor; body, clientMessageId |

Message retries must reuse clientMessageId. Proposal decisions are not blindly
retryable: a second decision returns 409. An approval response does not mean the
worker has executed the refund. Other endpoints in the original specification
are not yet implemented; this document lists the actual surface, not future APIs.

`POST /api/register` accepts name, email, and a password of at least 12 characters.
It requires the exact application Origin and rate limits registration. Auth.js
handles credential sign-in under `/api/auth`. Email verification is not implemented.
Visitor refresh credentials expire after seven days, are stored hashed in the DB,
and rotate on use; replay, revoked sessions, and an unrelated installation origin
are rejected. The embedding origin retains the refresh credential; the iframe
receives only the short-lived access token.
