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

Validation and access failures are not auto-retried.

## Monitoring

### Operator view

Use:

- `GET /api/system-jobs`
- `GET /api/system-jobs?campaignId=<campaign-id>`

Inspect:

- `status`
- `retry_count`
- `error_message`
- `payload.tracking.correlationId`
- `payload.tracking.lifecycleStatus`
- `payload.tracking.lastErrorCategory`

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
