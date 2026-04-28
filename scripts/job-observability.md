# Background Job And Observability Notes

## Tracked Routes

The following routes now create a `system_jobs` record even though they still return synchronously:

- `POST /api/generate-funnel`
- `POST /api/generate-creatives`
- `POST /api/build-campaign`
- `POST /api/integrations/meta/sync`

Each tracked route writes:

- `job.id`
- `payload.tracking.correlationId`
- `payload.tracking.lifecycleStatus`
- `retry_count`
- `attempt_count`
- `max_attempts`
- `last_error_code`
- `error_message`
- `started_at`
- `completed_at`

## Lifecycle Model

Tracked lifecycle states are stored in `payload.tracking.lifecycleStatus`:

- `queued`
- `running`
- `retrying`
- `succeeded`
- `failed`

Database `system_jobs.status` remains the lower-level persistence status:

- `pending`
- `processing`
- `completed`
- `failed`

## Retry Policy

- `generate-funnel`: no automatic retry
- `generate-creatives`: 1 retry for transient provider/server failures
- `build-campaign`: no automatic retry
- `meta-sync`: 1 retry for transient Meta failures
- `lead_capture_retry`: queued with an idempotency key derived from request/contact context; replay is deduped again by `leads.dedupe_hash`

Validation and access failures are not auto-retried.

## Monitoring

### Operator view

Use:

- Admin UI: `/admin/command-center` and `/admin/issues`
- Protected runner: `GET /api/internal/system-jobs` or `POST /api/internal/system-jobs`
- Runner auth: `Authorization: Bearer <INTERNAL_SYSTEM_JOBS_SECRET>` or `x-internal-system-key`

Inspect:

- `status`
- `retry_count`
- `attempt_count`
- `max_attempts`
- `error_message`
- `last_error_code`
- `dead_lettered_at`
- `dead_letter_reason`
- `payload.tracking.correlationId`
- `payload.tracking.lifecycleStatus`
- `payload.tracking.lastErrorCategory`

### Job recovery rules

- Retry only jobs that are idempotent by design, such as `lead_capture_retry` or generation jobs with stable output state.
- Treat `dead_lettered_at is not null` as an operator-review state, not an automatic retry signal.
- Repeated `last_error_code` values should be grouped before retrying; fix config/access failures first.
- If `attempt_count >= max_attempts`, the claim RPC will dead-letter the job instead of claiming it.

### Server logs

Look for structured log events:

- `system_job.queued`
- `system_job.running`
- `system_job.succeeded`
- `system_job.failed`
- `system_job.retrying`
- `lead_capture.succeeded`

Enable production info logs with:

- `ENABLE_STRUCTURED_INFO_LOGS=true`

Error logs still emit in production even without that flag.

## Remaining Limitations

- Execution still happens inline inside the request lifecycle.
- There is no external worker daemon yet for funnel/creative/build/sync jobs.
- This is a preparation layer for scale and observability, not a full distributed queue.
