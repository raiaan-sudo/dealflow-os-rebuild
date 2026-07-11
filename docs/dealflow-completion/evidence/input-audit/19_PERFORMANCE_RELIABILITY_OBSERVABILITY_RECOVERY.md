# Performance, reliability, observability, and recovery

## Performance evidence

- One low-volume public sample measured www TTFB 112ms/total 120ms/body 144,525 bytes; app/login/legal samples were similarly sub-second. These are single Toronto-host observations, not an SLA.
- Marketing HTML carried 19 script tags in the source subaudit and a large client component; no LCP, CLS, INP, long tasks, network waterfall, cold-start distribution, database query plan, bundle analyzer or load result was captured.
- No load/stress/spike/soak test ran because those suites can write production-like traffic and data.

## Reliability findings

| id | severity | title | truth_status | current_behavior | impact |
| --- | --- | --- | --- | --- | --- |
| FIND-002 | P1 | Five-minute job lease has no heartbeat | CONFIRMED | A still-running job can outlive its lease and be reclaimed while the original handler continues. | Duplicate creative/provider work, CRM effects, communications, or spend. |
| FIND-003 | P1 | Lead side effects lack durable per-effect completion truth | CONFIRMED | SMS, Meta CAPI, and GHL run together through safe wrappers; individual failures can be represented as values while the parent job completes, and no unified durable per-effect retry contract was proven. | Lost alerts/conversions/CRM sync, misleading completion, or duplicates if manually retried. |
| FIND-010 | P1 | Command center can show false calm and hard-coded readiness | CONFIRMED | Missing data becomes zeros/empty arrays while readiness scores and historical proof are hard-coded. | Owners can make launch/incident decisions on invented or stale confidence. |
| FIND-017 | P2 | GHL client is race-prone and lacks timeout/idempotency | CONFIRMED | Contact upsert is search-then-create, opportunity creation unconditional, and no abort timeout was observed. | Hung jobs and duplicate contacts/opportunities on retries/concurrency. |
| FIND-024 | P2 | Timeout helper does not cancel underlying work | CONFIRMED | Promise.race returns a timeout while the underlying provider/database operation continues. | Caller retries can overlap a still-running side effect. |
| FIND-025 | P1 | Marketing Studio depends on an unproven dedicated worker | NOT_PROVEN | Jobs are deferred away from serverless cron and require an operator CLI worker; no supervised deployment artifact was found. | Jobs can remain pending indefinitely if the external worker is absent. |
| FIND-029 | P2 | Provider registry readiness is incomplete | CONFIRMED | Registry omits GHL/Twilio/Freshdesk/Supabase and can treat Stripe env presence as ready. | False all-ready signal. |
| FIND-031 | P3 | Unavailable data repeatedly collapses to empty data | CONFIRMED | Errors/missing privileged clients can produce zeros or empty collections. | Silent false negatives and slower incident response. |
| FIND-043 | P1 | GHL failed-event retry timestamp has no observed consumer | NOT_PROVEN | Failed sync events receive next_retry_at, the safe wrapper returns a failure value and the parent lead job completes. No consumer was found in 198 hydrated source files; 185 source files were dataless during the follow-up, so repository-wide absence is not proven. | Leads can remain permanently unsynced while the parent workflow appears completed. |

## Observability truth

- System-job logs/results and client errors exist, but central redaction and retention are not proven.
- Command center can collapse unavailable to zero/empty and contains hard-coded readiness/history.
- Provider readiness is incomplete and sometimes environment-presence based.
- Lead side-effect parent completion does not encode successful delivery by every child provider.
- No queue-lag/worker-heartbeat proof was found for Marketing Studio.

## Recovery gaps

- Five-minute job lease has no heartbeat; stale recovery can overlap original work.
- Promise timeout does not abort underlying work, so late success can overlap a retry.
- GHL next_retry_at has no observed due-time consumer and a later invocation ignores/clears due time.
- Data-deletion has no durable recovery state.
- Higgsfield temp files lack cleanup/crash janitor.
- Canonical deployment rollback/source provenance is not proven.

## Operational readiness verdict

NO-GO. Reliability claims require per-effect state/idempotency, renewable ownership, observable retries/dead letters, fail-closed operator data, deployed worker health, live schema parity, and current executed failure/overlap tests.

