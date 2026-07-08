# Canonical Public Funnel Regression - 2026-07-08

## Status

Closed with non-blocking follow-ups.

The production blocker is closed: `/f/[slug]` no longer renders arbitrary saved `funnel.sections` as the public funnel. Published funnels render through `CanonicalPublicFunnelPage` using the `dealflow-public-v1` slot model.

## Root Cause

The public funnel route previously allowed flexible saved funnel sections to control the rendered public page. That meant old draft/history data could leak into production and recreate old funnel layouts, including regurgitated copy and multi-section stacks that were not the intended customer-facing conversion page.

## Impact

Published customer funnels could receive old or flexible structures. The immediate user-visible risk was lower conversion from the wrong page structure, buried form placement, and inconsistent lead tracking proof.

## Fix

- Added the `dealflow-public-v1` canonical public funnel model.
- Added a fixed public renderer for `/f/[slug]`.
- Preserved internal draft/history sections while ignoring them for public rendering.
- Stamped saves, funnel generation, staging, and publishing with canonical public output.
- Backfilled published campaigns to include canonical public funnel snapshots.
- Added regression guards for legacy public rendering, funnel persistence paths, mobile conversion layout, and lead tracking health.
- Added read-only operational health checks for canonical funnel routes and lead-capture side effects.

## Production Proof

- Commit: `ab678bda789681a95ef86d1276ec5183050527d6`
- Deployment: `dpl_Fc88APuoo6vUoFBo9h3AbCbvAHod`
- Production domains verified during closure:
  - `clicktoscale.io`
  - `www.clicktoscale.io`
  - `agentdealflow.io`
  - `app.agentdealflow.io`
  - `www.agentdealflow.io`
  - `dealflow-os-rebuild.vercel.app`
- Verified production funnels:
  - `https://clicktoscale.io/f/hamza-juma`
  - `https://clicktoscale.io/f/homelife-hearts-realty-inc`
- Backfill proof: final dry-run returned `needingBackfill: 0`.
- Controlled production QA lead proof:
  - Lead ID: `23b516e0-5375-46fb-b58f-7fa1bf5c2ce3`
  - Campaign: `94c7de41-24ef-4941-a5ea-9715b327ec4f`
  - Organization: `e87c4e1f-149b-42f3-ab5f-399adb1e99d8`
  - Meta CAPI: `eventsReceived=1`
  - Side-effect job: completed
  - Lead notifications: queued/sent through the side-effect path with no notification failure recorded in closure checks
- Monitoring proof: 30-minute post-deploy monitoring showed no route, CAPI, notification, or side-effect failures.

## Rollback

Rollback is deployment-only. Do not delete lead data, campaign snapshots, or internal draft sections. Legacy internal sections are intentionally preserved for editor/history use; the public route ignores them.

## Non-Blocking Follow-Ups

### Add approved production-safe browser form test phone for DealFlow lead-capture QA

No approved internal production test phone was found in repo/config. Do not use real customer numbers or invented numbers. Once an approved internal test number exists, run the browser-form proof from the public funnel with QA attribution parameters and confirm client telemetry, lead capture, CAPI, notification status, and no PII leakage.

### Add test-lead tagging/exclusion for production QA submissions

Production QA lead `23b516e0-5375-46fb-b58f-7fa1bf5c2ce3` should remain auditable and should not be deleted without policy approval. Add an explicit test-lead tag/status or reporting exclusion so production QA submissions do not skew customer-facing reports.
