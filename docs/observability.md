# Observability status

Implemented: structured service startup and failure records, request IDs on API
errors, event IDs through outbox and jobs, PostgreSQL audit records for conversation
state and refund decisions/execution, dependency readiness probes.

The UI derives conversation counts, latest-activity charts, resolution ratio and
proposal totals from workspace records (or explicitly labeled preview fixtures).
Resolution ratio = resolved conversations / all loaded conversations. Charts group
by lastMessageAt, not creation date. The workspace is bounded to 100 conversations.

Not implemented: OpenTelemetry instrumentation/collector, latency histograms,
first-response percentiles, token/cost telemetry, queue lag alerts, operational
dashboard, provider traces. No performance or uptime claims are made.
