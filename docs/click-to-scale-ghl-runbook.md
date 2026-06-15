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
   - `GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN`
3. Map each Click to Scale workspace. The setup script writes both `workspace_partner_attribution` and `workspace_ghl_mapping`:

```bash
npm run setup:click-to-scale-ghl -- \
  --workspace-id=<organization_uuid> \
  --location-id=<ghl_location_id> \
  --pipeline-id=<optional_pipeline_id> \
  --stage-id=<optional_stage_id> \
  --credential-ref=GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN \
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

## Failure Modes

- `crm_not_configured`: no mapping exists; lead remains in DealFlow.
- `missing_location_mapping`: mapping exists but no location ID is configured.
- `ghl_auth_missing`: credential ref exists but server env token is missing.
- `ghl_auth_failed`: GHL rejected the token.
- `ghl_rate_limited`: GHL returned 429; retry later.
- `ghl_contact_upsert_failed`: contact sync failed.
- `ghl_opportunity_failed`: contact synced but opportunity failed.

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
