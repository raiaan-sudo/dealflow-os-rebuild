# Lead Capture Health Runbook

## Purpose

Use this when Ads Manager shows clicks but DealFlow, Meta CAPI, SMS alerts, or CRM routing do not match expectations.

## Read-Only Health Command

```bash
npm run lead-capture:health -- --slug <slug> --days 1
```

This reports PII-safe counts for:

- lead rows
- tracking events
- lead notifications
- client telemetry
- latest client failures
- form-view to form-start dropoff
- form-start to submit dropoff
- submit to client-success dropoff

## Full Canonical Funnel Health

```bash
npm run ops:canonical-funnel-health -- --slugs <slug> --sample-limit 1
```

Use this when the issue might be page rendering, old public funnel structure, or side-effect health.

## Clicks-But-No-Leads Checklist

Check in this order:

1. Link click: Meta campaign/ad URL points at the expected `/f/<slug>`.
2. Page view: route returns `200`.
3. Canonical page: `dealflow-public-v1` is present.
4. Form viewed: `lead_form_viewed`.
5. Form started: `lead_form_started`.
6. Submit attempted: `lead_form_submit_attempted`.
7. API received: `/api/lead-capture` returns success for valid payloads.
8. Lead captured: `leads` row exists.
9. Dashboard visible: lead belongs to the expected campaign and organization.
10. Notification delivered: `lead_notifications.status` is `sent` or `delivered`.
11. CAPI sent: `lead_tracking_events.event_type = capi_sent`.
12. CRM synced: only expected when `workspace_ghl_mapping` exists.

## CRM Skips

`crm_not_configured` is not a lead-capture failure. It means the workspace does not have the GHL location/pipeline/stage mapping needed for CRM delivery.

## Browser-Form QA

Do not submit browser QA with a real customer phone or an invented number. Use only an approved internal test phone supplied through the safe test process. If no approved phone exists, run API-level production proof and track browser-form telemetry as a non-blocking follow-up.
