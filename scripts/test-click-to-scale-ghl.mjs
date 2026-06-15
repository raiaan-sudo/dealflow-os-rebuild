#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const partnerConfig = readFileSync("src/lib/partners/partner-config.ts", "utf8");
const partnerRoute = readFileSync("src/app/p/[partnerSlug]/start/page.tsx", "utf8");
const clickToScaleRoute = readFileSync("src/app/clicktoscale/page.tsx", "utf8");
const proxy = readFileSync("src/proxy.ts", "utf8");
const stripeService = readFileSync("src/lib/integrations/stripe/service.ts", "utf8");
const checkoutRoute = readFileSync("src/app/api/billing/checkout/route.ts", "utf8");
const billingService = readFileSync("src/lib/services/billing-service.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260614193000_click_to_scale_partner_ghl_sync.sql", "utf8");
const whiteLabelSeedMigration = readFileSync("supabase/migrations/20260614203000_seed_click_to_scale_white_label_partner.sql", "utf8");
const ghlClient = readFileSync("src/lib/integrations/gohighlevel/client.ts", "utf8");
const crmSync = readFileSync("src/lib/services/partner-crm-sync-service.ts", "utf8");
const systemJobs = readFileSync("src/lib/services/system-job-service.ts", "utf8");
const notification = readFileSync("src/lib/services/internal-lead-notification-service.ts", "utf8");
const runbook = readFileSync("docs/click-to-scale-ghl-runbook.md", "utf8");
const setupScript = readFileSync("scripts/setup-click-to-scale-ghl.mjs", "utf8");

assert.match(partnerConfig, /id: "click_to_scale"/);
assert.match(partnerConfig, /displayName: "Click to Scale"/);
assert.match(partnerConfig, /productName: "Click to Scale DealFlow"/);
assert.match(partnerConfig, /ghl:\s*{[\s\S]*enabled: true/);
assert.match(partnerConfig, /smsTemplate: "click_to_scale_lead_alert"/);
assert.match(partnerConfig, /getWhiteLabelPartnerBySlug/);

assert.match(partnerRoute, /resolvePartnerContextBySlug/);
assert.match(partnerRoute, /PartnerAuthEntry/);
assert.match(clickToScaleRoute, /\/p\/click-to-scale\/start/);
assert.match(proxy, /rootSlugMatch/);

assert.match(stripeService, /partner_id: params\.partnerId/);
assert.match(stripeService, /partner_slug: params\.partnerSlug/);
assert.match(stripeService, /partner_product_name: params\.partnerProductName/);
assert.match(checkoutRoute, /partnerSlug/);
assert.match(checkoutRoute, /getWhiteLabelPartnerBySlug/);
assert.match(billingService, /partnerId\?: string \| null/);
assert.match(billingService, /partnerAttributionSource: context\.partner\?\.id \? "partner_account" : "native"/);

assert.match(migration, /create table if not exists public\.partner_configs/);
assert.match(migration, /create table if not exists public\.partner_ghl_config/);
assert.match(migration, /create table if not exists public\.workspace_ghl_mapping/);
assert.match(migration, /create table if not exists public\.workspace_partner_attribution/);
assert.match(migration, /create table if not exists public\.lead_crm_sync_events/);
assert.match(migration, /lead_crm_sync_events_idempotency_unique/);
assert.match(migration, /workspace_ghl_mapping_member_select/);
assert.match(migration, /workspace_partner_attribution_member_select/);
assert.match(migration, /lead_crm_sync_events_member_select/);
assert.match(migration, /auth\.role\(\) = 'service_role'/);
assert.match(migration, /private\.is_current_user_org_member\(workspace_id\)/);
assert.match(whiteLabelSeedMigration, /insert into public\.partners/);
assert.match(whiteLabelSeedMigration, /'click-to-scale'/);
assert.match(whiteLabelSeedMigration, /insert into public\.partner_branding/);
assert.match(whiteLabelSeedMigration, /'Click to Scale DealFlow'/);

assert.match(ghlClient, /services\.leadconnectorhq\.com/);
assert.match(ghlClient, /Version: GHL_API_VERSION/);
assert.match(ghlClient, /GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN/);
assert.match(ghlClient, /ghl_rate_limited/);
assert.match(ghlClient, /searchContact/);
assert.match(ghlClient, /upsertContact/);
assert.match(ghlClient, /createOpportunity/);

assert.match(crmSync, /buildPartnerCrmSyncIdempotencyKey/);
assert.match(crmSync, /workspace_ghl_mapping/);
assert.match(crmSync, /partner_ghl_config/);
assert.match(crmSync, /lead_crm_sync_events/);
assert.match(crmSync, /safeSyncLeadToPartnerCrm/);
assert.match(crmSync, /already_synced/);
assert.match(crmSync, /next_retry_at/);
assert.match(crmSync, /5 \* 60 \* 1000/);
assert.match(crmSync, /ghl_auth_missing/);
assert.match(crmSync, /missing_location_mapping/);
assert.match(crmSync, /crm_not_configured/);
assert.match(crmSync, /dealflow_lead_id/);
assert.match(crmSync, /dealflow_workspace_id/);

assert.match(systemJobs, /safeSyncLeadToPartnerCrm/);
assert.match(systemJobs, /crmSyncResult/);
assert.match(systemJobs, /safeNotifyAssignedAgentOfNewLead/);
assert.match(systemJobs, /safeSendMetaLeadConversion/);

assert.match(notification, /buildClickToScaleLeadAlertSms/);
assert.match(notification, /click_to_scale_notification_only/);
assert.match(notification, /workspace_partner_attribution/);
assert.match(notification, /workspace_ghl_mapping/);
assert.match(notification, /partnerId === "click_to_scale"/);
assert.match(notification, /Copy\/paste reply for/);

assert.match(setupScript, /required\("workspace-id"\)/);
assert.match(setupScript, /required\("location-id"\)/);
assert.match(setupScript, /--apply/);
assert.match(setupScript, /GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN/);
assert.match(setupScript, /workspace_partner_attribution/);
assert.match(runbook, /Rollback/);
assert.match(runbook, /lead_side_effects/);
assert.match(runbook, /Click to Scale SMS alerts are notification-only/);

console.log("Click to Scale white-label GHL static integration tests passed.");
