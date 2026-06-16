# Click to Scale GHL Integration Runbook

## Purpose

Click to Scale is a white-label DealFlow partner. DealFlow remains the source of truth for leads, billing, launch safety, and reporting. Click to Scale workspace attribution is stored separately from CRM routing so branding and SMS behavior stay correct even if GHL sync is paused. When a Click to Scale workspace has GHL sync enabled, each DealFlow lead is also synced to Christian's configured GoHighLevel location.

## Safety Rules

- DealFlow lead capture must keep working even if GHL is down.
- GHL credentials are server-only and referenced by env var name, not stored in browser code.
- No customer can edit partner GHL settings.
- Regular DealFlow SMS behavior remains unchanged.
- Click to Scale SMS alerts are notification-only and do not include copy/paste nurture scripts.

## Setup

1. Apply migration `20260614193000_click_to_scale_partner_ghl_sync.sql`.
2. Add the private integration token to server env:
   - `CLICKTOSCALE_GHL_PRIVATE_INTEGRATION`
3. Map each Click to Scale workspace. The setup script writes both `workspace_partner_attribution` and `workspace_ghl_mapping`:

```bash
npm run setup:click-to-scale-ghl -- \
  --workspace-id=<organization_uuid> \
  --location-id=<ghl_location_id> \
  --pipeline-id=<optional_pipeline_id> \
  --stage-id=<optional_stage_id> \
  --credential-ref=CLICKTOSCALE_GHL_PRIVATE_INTEGRATION \
  --apply
```

Omit `--apply` for a dry run.

## Lead Sync Behavior

For every lead captured in DealFlow:

1. DealFlow saves the lead.
2. `lead_side_effects` runs.
3. Regular internal lead alert and Meta conversion continue as before.
4. If `workspace_ghl_mapping.sync_enabled=true`, DealFlow upserts a GHL contact.
5. If pipeline and stage are configured, DealFlow creates a GHL opportunity.
6. `lead_crm_sync_events` records status, IDs, errors, and idempotency key.

Click to Scale SMS alerts are keyed from `workspace_partner_attribution`, not from the GHL mapping. That means a Click to Scale workspace stays notification-only even when CRM sync is temporarily disabled.

## Automatic Workspace Provisioning

DealFlow can provision a Click to Scale GoHighLevel sub-account after a Stripe subscription becomes active. This is intentionally separated from lead sync:

1. Stripe webhook applies the active subscription to the DealFlow workspace.
2. DealFlow queues a `ghl_workspace_provisioning` system job.
3. The worker creates or reuses a `ghl_provisioning_jobs` row with an idempotency key.
4. If a `workspace_ghl_mapping` already exists, the job reuses it and exits successfully.
5. If no mapping exists, the job resolves the workspace/user from server-side IDs.
6. If `GHL_AUTO_PROVISIONING_ENABLED=true` and `GHL_PROVISIONING_WRITES_ENABLED=true`, the worker can create a GHL location and user invite.
7. The worker writes `workspace_partner_attribution`, `workspace_ghl_mapping`, and `workspace_ghl_users`.
8. Lead capture continues to work even if the provisioning job fails.

Required environment:

- `CLICKTOSCALE_GHL_PRIVATE_INTEGRATION`
- `GHL_AUTO_PROVISIONING_ENABLED=true`
- `GHL_PROVISIONING_WRITES_ENABLED=true` only after token scopes and a dry run are confirmed.

Required database configuration:

- `partner_ghl_config.company_id` for `partner_id='click_to_scale'`
  - This must be the GoHighLevel agency/company ID that owns the created sub-accounts.
  - Live provisioning fails closed with `ghl_company_id_missing` when this is blank.
- Optional after the lead workflow is selected:
  - `partner_ghl_config.default_pipeline_id`
  - `partner_ghl_config.default_stage_id`
  - `partner_ghl_template_config.snapshot_id`

Required private integration scopes:

- Lead sync only:
  - `contacts.write`
  - `locations.readonly`
  - Do not select contact read/list scopes for the current lead-sync path. DealFlow uses GHL's native contact upsert endpoint so it does not need to search/list contacts first.
- Automatic sub-account provisioning:
  - all lead sync scopes above
  - `locations.write`
  - `users.readonly`
  - `users.write`
- Future pipeline/workflow phase after Christian supplies IDs:
  - `opportunities.write` only if DealFlow creates opportunities in a selected pipeline/stage
  - workflow-specific scopes only after workflow enrollment is implemented and tested
- Do not select broad admin scopes such as SaaS billing, snapshots, documents, phone numbers, Twilio, companies, or custom menu links unless a later implementation explicitly uses them and adds tests for that surface.

Safe validation:

```bash
npm run ghl:validate-provisioning
npm run ghl:check-production-readiness
npm run ghl:reconcile-workspaces
npm run ghl:proof-lead-sync
```

`ghl:check-production-readiness` is read-only. It verifies production env names,
partner GHL database config, and unreviewed provisioning failures without
printing tokens, calling GHL, changing Vercel, or writing database rows.

Queue a workspace provisioning job without calling GHL:

```bash
npm run ghl:provision-workspace -- \
  --workspace-id=<organization_uuid> \
  --user-id=<auth_user_uuid> \
  --partner=click_to_scale
```

Add `--apply` only to queue the internal DealFlow system job. External GHL writes still require the server-side write flag.

## Lead Sync Proof

Use the admin-only production proof route when local secrets are not available.
It creates a controlled QA lead, syncs only that lead to the mapped Click to
Scale GHL location, then repeats the same sync to prove idempotency. It does
not queue `lead_side_effects`, does not send SMS/email, does not send Meta
conversions, does not charge Stripe, does not create Freshdesk tickets, does
not generate provider assets, and does not launch anything.

Local preflight:

```bash
npm run ghl:proof-lead-sync -- --workspace-id=<organization_uuid>
```

Production admin route:

```text
GET  /api/admin/click-to-scale/ghl-lead-sync-proof
POST /api/admin/click-to-scale/ghl-lead-sync-proof
```

POST body:

```json
{
  "workspaceId": "<organization_uuid>",
  "campaignId": null,
  "apply": true
}
```

Acceptance:

- response `success=true`
- response `idempotencyProven=true`
- first sync creates or updates one GHL contact in the mapped location
- second sync returns `already_synced`
- one `lead_crm_sync_events` row is attached to the proof lead
- no opportunity is created until pipeline and stage IDs are configured

## Backfill / Reconciliation

Run reconciliation before and after enabling Click to Scale for existing paid
workspaces:

```bash
npm run ghl:reconcile-workspaces
```

Dry-run mode reports:

- active Click to Scale workspaces
- existing enabled mappings
- missing mappings
- disabled mappings

Apply mode queues internal provisioning jobs only:

```bash
npm run ghl:reconcile-workspaces -- --apply
```

The worker and GHL write flags still control whether external GHL writes happen.
Do not use apply mode to create GHL locations until the token, company ID, and
scopes have passed readiness checks.

## Review accepted provisioning failures

Old QA proof failures should not stay as unexplained operator debt after the
root cause is fixed or accepted as deferred. Use the review script only for
known Click to Scale proof failures such as:

- old invalid token
- old missing company ID
- old rejected location payload shape
- GHL account plan does not have user invite API access yet

Dry-run:

```bash
npm run ghl:review-provisioning-failures
```

Apply:

```bash
npm run ghl:review-provisioning-failures -- --apply --reason=ghl_user_invite_api_upgrade_pending
```

This writes review metadata only. It does not call GHL and does not change
mapping, lead sync, billing, Meta, SMS/email, Freshdesk, providers, or launch.

## Workflow Enrollment

Workflow enrollment is deliberately disabled until Christian supplies the exact workflow ID and location mapping. The schema stores `partner_ghl_workflow_config`, but `enabled=false` and `enrollment_trigger='disabled'` by default.

Do not enable workflow enrollment until:

- the correct Click to Scale workflow ID is confirmed,
- a test lead has synced to the correct GHL location,
- the workflow is verified to send the intended follow-up only once,
- opt-out/compliance behavior is verified in GHL.

## Failure Modes

- `crm_not_configured`: no mapping exists; lead remains in DealFlow.
- `missing_location_mapping`: mapping exists but no location ID is configured.
- `ghl_auth_missing`: credential ref exists but server env token is missing.
- `ghl_auth_failed`: GHL rejected the token.
- `ghl_rate_limited`: GHL returned 429; retry later.
- `ghl_contact_upsert_failed`: contact sync failed.
- `ghl_opportunity_failed`: contact synced but opportunity failed.
- `partner_ghl_disabled`: partner-level GHL config is disabled.
- `workspace_not_found`: provisioning was requested for a DealFlow workspace that does not exist.
- `ghl_location_create_failed`: GHL location/sub-account creation returned no ID.
- `ghl_user_create_failed`: GHL user invite creation returned no ID.

## Rollback

Disable sync without losing leads:

```sql
update public.workspace_ghl_mapping
set sync_enabled = false, updated_at = now()
where partner_id = 'click_to_scale';
```

To disable globally:

```sql
update public.partner_ghl_config
set enabled = false, updated_at = now()
where partner_id = 'click_to_scale';
```

This preserves DealFlow lead capture, billing, Meta, and SMS.

To remove Click to Scale partner behavior for a workspace:

```sql
update public.workspace_partner_attribution
set active = false, updated_at = now()
where partner_id = 'click_to_scale'
  and workspace_id = '<organization_uuid>';
```
