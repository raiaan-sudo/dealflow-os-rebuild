# Public Funnel Health Runbook

## Purpose

Use this runbook when a published funnel looks wrong, shows old formatting, has clicks but no leads, or needs release proof.

## Fast Health Check

Run the read-only production check:

```bash
npm run ops:canonical-funnel-health
```

With production Supabase env loaded, the command checks route health, canonical model presence, lead form count, banned legacy markers, recent client failures, CAPI failures, notification failures, side-effect job failures, and published snapshot/version consistency.

## Inspect One Slug

```bash
npm run ops:canonical-funnel-health -- --slugs hamza-juma --sample-limit 1
```

Expected:

- HTTP `200`
- `dealflow-public-v1`
- exactly one `#lead-form`
- CTA targets `#lead-form`
- no Turnstile
- no banned legacy copy/markers
- no recent failure alerts

## Backfill Dry-Run

```bash
npm run backfill:public-funnels
```

Expected after closure: `needingBackfill: 0`.

## Targeted Backfill

Only use this when a dry-run identifies a real missing canonical public funnel:

```bash
ALLOW_PUBLIC_FUNNEL_BACKFILL_APPLY=true npm run backfill:public-funnels -- --slug <slug> --apply
```

Then rerun the dry-run and route health check.

## What Counts As A Failure

- `/f/[slug]` returns `5xx`.
- Published route is missing `dealflow-public-v1`.
- More or fewer than one `#lead-form`.
- CTA does not target `#lead-form`.
- Turnstile appears on a customer funnel.
- Old legacy copy or flexible public markers appear.
- Backfill dry-run shows `needingBackfill > 0`.
- Recent `lead_capture_client_failed`, `lead_capture_db_insert_failed`, `capi_failed`, `notification_failed`, or failed side-effect jobs appear without a known cause.

## Diagnosis Path

1. Confirm the route returns `200`.
2. Confirm canonical model exists.
3. Confirm one form and CTA anchor.
4. Confirm attribution parameters survive the form.
5. Confirm `/api/lead-capture` accepts valid payloads and rejects invalid payloads.
6. Confirm `lead_captured`.
7. Confirm dashboard-visible lead row.
8. Confirm `capi_queued` and `capi_sent` or an explicit tracked skip/failure reason.
9. Confirm SMS notification delivered or an explicit tracked skip/failure reason.
10. Confirm CRM sync is configured before treating CRM skipped as a bug.
