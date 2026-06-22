import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const expectedSchemaVersion = "20260519043000";
const expectedWhiteLabelSchemaVersion = "20260531160000";
const schemaCheckMode = process.env.SUPABASE_SCHEMA_CHECK_MODE?.trim().toLowerCase() ?? "remote";
const requiredMigrationFiles = [
  "20260426110000_add_campaign_plan_critical_fields.sql",
  "20260426110100_create_stripe_webhook_events.sql",
  "20260427110000_create_system_jobs.sql",
  "20260427120000_create_billing_subscriptions.sql",
  "20260427130000_add_meta_and_campaign_operator_columns.sql",
  "20260427140000_harden_stripe_webhook_events.sql",
  "20260428002000_add_meta_tracking_columns.sql",
  "20260428030000_scale_idempotency_and_limits.sql",
  "20260428033000_create_lead_messages.sql",
  "20260428034000_set_schema_version_20260428.sql",
  "20260428120000_harden_scale_primitives.sql",
  "20260428123000_fix_rate_limit_bucket_shape.sql",
  "20260428124500_harden_job_claim_dead_letters.sql",
  "20260428130000_enable_rls_internal_tables.sql",
  "20260428132000_harden_internal_job_runner_access.sql",
  "20260428140000_harden_billing_subscription_webhooks.sql",
  "20260428162000_harden_lead_message_idempotency.sql",
  "20260428163000_harden_billing_event_ordering.sql",
  "20260428170000_harden_rpc_and_tenant_rls.sql",
  "20260428171000_harden_billing_webhook_same_second_ordering.sql",
  "20260429100000_fix_billing_ordering_and_operator_resolution.sql",
  "20260429101000_reset_tenant_rls_policies.sql",
  "20260429190000_harden_provider_usage_idempotency.sql",
  "20260429230000_internal_sms_lead_notifications.sql",
  "20260430010000_public_launch_final_hardening.sql",
  "20260430060000_harden_membership_insert_policy.sql",
  "20260430061000_rate_limit_bucket_cleanup_support.sql",
  "20260430190000_create_user_credits.sql",
  "20260502010000_harden_schema_metadata_access.sql",
  "20260502192332_move_rls_membership_helper_private.sql",
  "20260504183000_create_activation_events.sql",
  "20260504190000_create_campaign_value_reports.sql",
  "20260504203000_create_billing_cancellation_intents.sql",
  "20260504210000_create_customer_success_checklists.sql",
  "20260504213000_harden_launch_ops_tables_advisors.sql",
  "20260504220000_harden_rls_and_fk_advisors.sql",
  "20260504223000_create_client_error_events.sql",
  "20260509020000_create_meta_sync_and_optimization_tables.sql",
  "20260510014500_enable_generation_credit_overdrafts.sql",
  "20260510183000_cap_generation_credit_overdrafts.sql",
  "20260512010000_scope_provider_usage_idempotency.sql",
  "20260519023000_create_scale_monitor_incidents.sql",
  "20260519033000_create_autonomy_execution_tables.sql",
  "20260519043000_harden_autonomy_anon_access.sql",
  "20260531160000_create_white_label_partner_infrastructure.sql",
  "20260617170000_create_partner_ghl_integration.sql",
];

const { loadEnvConfig } = nextEnv;

loadEnvConfig(repoRoot);

function fail(message) {
  throw new Error(message);
}

function validateRequiredMigrationFiles() {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const missingFiles = requiredMigrationFiles.filter(
    (file) => !fs.existsSync(path.join(migrationsDir, file)),
  );

  if (missingFiles.length > 0) {
    fail(
      [
        "Missing required local migration files:",
        ...missingFiles.map((file) => `- supabase/migrations/${file}`),
      ].join("\n"),
    );
  }

  console.log(
    `local migration file check passed (${requiredMigrationFiles.length} required files present)`,
  );
}

function requireFileIncludes(relativePath, marker, context) {
  const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

  if (!text.includes(marker)) {
    fail(`${context}: ${relativePath} missing ${marker}`);
  }
}

function schemaVersionMeetsMinimum(actualVersion, requiredMinimum) {
  return Boolean(actualVersion && actualVersion.localeCompare(requiredMinimum) >= 0);
}

function validateAutopilotLocalSchemaContract() {
  const metaOptimizationMigration =
    "supabase/migrations/20260509020000_create_meta_sync_and_optimization_tables.sql";
  const autonomyExecutionMigration =
    "supabase/migrations/20260519033000_create_autonomy_execution_tables.sql";
  const autonomyAccessHardeningMigration =
    "supabase/migrations/20260519043000_harden_autonomy_anon_access.sql";

  const requiredMarkers = [
    ["create table if not exists public.campaign_action_suggestions", "campaign_action_suggestions table"],
    ["create table if not exists public.campaign_draft_actions", "campaign_draft_actions table"],
    ["alter table public.campaign_action_suggestions enable row level security", "campaign_action_suggestions RLS"],
    ["alter table public.campaign_action_suggestions force row level security", "campaign_action_suggestions forced RLS"],
    ["alter table public.campaign_draft_actions enable row level security", "campaign_draft_actions RLS"],
    ["alter table public.campaign_draft_actions force row level security", "campaign_draft_actions forced RLS"],
    ["campaign_action_suggestions_member_select", "campaign_action_suggestions member select policy"],
    ["campaign_action_suggestions_member_insert", "campaign_action_suggestions member insert policy"],
    ["campaign_action_suggestions_member_update", "campaign_action_suggestions member update policy"],
    ["campaign_action_suggestions_service_role_all", "campaign_action_suggestions service role policy"],
    ["campaign_draft_actions_member_select", "campaign_draft_actions member select policy"],
    ["campaign_draft_actions_member_insert", "campaign_draft_actions member insert policy"],
    ["campaign_draft_actions_member_update", "campaign_draft_actions member update policy"],
    ["campaign_draft_actions_service_role_all", "campaign_draft_actions service role policy"],
    ["auth.uid() = user_id", "autopilot user scoping"],
    ["private.is_current_user_org_member(organization_id)", "autopilot organization scoping"],
    ["suggestions do not execute provider mutations", "campaign_action_suggestions safety comment"],
    ["Prepared in-app draft optimizations", "campaign_draft_actions safety comment"],
  ];

  for (const [marker, context] of requiredMarkers) {
    requireFileIncludes(metaOptimizationMigration, marker, context);
  }

  const requiredAutonomyMarkers = [
    ["create table if not exists public.autonomy_runs", "autonomy_runs table"],
    ["create table if not exists public.autonomy_actions", "autonomy_actions table"],
    ["create table if not exists public.autonomy_action_audit_logs", "autonomy_action_audit_logs table"],
    ["create table if not exists public.autonomy_rollbacks", "autonomy_rollbacks table"],
    ["create table if not exists public.autonomy_experiments", "autonomy_experiments table"],
    ["create table if not exists public.campaign_performance_snapshots", "campaign_performance_snapshots table"],
    ["create table if not exists public.autonomy_learning_memory", "autonomy_learning_memory table"],
    ["create table if not exists public.autonomy_alerts", "autonomy_alerts table"],
    ["create table if not exists public.campaign_autonomy_settings", "campaign_autonomy_settings table"],
    ["create table if not exists public.autonomy_execution_locks", "autonomy_execution_locks table"],
    ["create table if not exists public.autonomy_idempotency_records", "autonomy_idempotency_records table"],
    ["alter table public.autonomy_actions force row level security", "autonomy_actions forced RLS"],
    ["autonomy_actions_member_select", "autonomy_actions member select policy"],
    ["autonomy_actions_service_role_all", "autonomy_actions service role policy"],
    ["private.is_current_user_org_member(organization_id)", "autonomy org scoping"],
    ["payloads must be written before any external mutation", "rollback safety comment"],
    ["autonomy_execution_schema_version", "autonomy schema version marker"],
  ];

  for (const [marker, context] of requiredAutonomyMarkers) {
    requireFileIncludes(autonomyExecutionMigration, marker, context);
  }

  const requiredAccessMarkers = [
    ["revoke all on public.autonomy_actions from anon", "autonomy_actions anon revoke"],
    ["revoke all on public.autonomy_execution_locks from authenticated", "autonomy locks authenticated revoke"],
    ["grant select on public.autonomy_actions to authenticated", "autonomy_actions authenticated owner-scoped grant"],
    ["autonomy_access_hardening_schema_version", "autonomy access hardening schema version marker"],
  ];

  for (const [marker, context] of requiredAccessMarkers) {
    requireFileIncludes(autonomyAccessHardeningMigration, marker, context);
  }

  console.log("local Pro Autopilot schema contract check passed");
}

function validateOperatorShellLocalSchemaContract() {
  const whiteLabelMigration =
    "supabase/migrations/20260531160000_create_white_label_partner_infrastructure.sql";

  const requiredMarkers = [
    ["create table if not exists public.partners", "partners table"],
    ["create table if not exists public.partner_accounts", "partner_accounts table"],
    ["create table if not exists public.partner_memberships", "partner_memberships table"],
    ["create table if not exists public.partner_branding", "partner_branding table"],
    ["create table if not exists public.partner_domains", "partner_domains table"],
    ["alter table if exists public.organizations add column if not exists partner_id", "organizations partner_id column"],
    ["alter table if exists public.system_jobs add column if not exists partner_id", "system_jobs partner_id column"],
    ["white_label_schema_version", "white-label schema version marker"],
  ];

  for (const [marker, context] of requiredMarkers) {
    requireFileIncludes(whiteLabelMigration, marker, context);
  }

  console.log("local operator shell schema contract check passed");
}

function validatePartnerGhlLocalSchemaContract() {
  const ghlMigration =
    "supabase/migrations/20260617170000_create_partner_ghl_integration.sql";

  const requiredMarkers = [
    ["create table if not exists public.partner_ghl_config", "partner_ghl_config table"],
    ["create table if not exists public.workspace_ghl_mapping", "workspace_ghl_mapping table"],
    ["create table if not exists public.lead_crm_sync_events", "lead_crm_sync_events table"],
    ["create table if not exists public.ghl_provisioning_jobs", "ghl_provisioning_jobs table"],
    ["create table if not exists public.ghl_provisioning_events", "ghl_provisioning_events table"],
    ["create table if not exists public.workspace_ghl_users", "workspace_ghl_users table"],
    ["create table if not exists public.partner_ghl_template_config", "partner_ghl_template_config table"],
    ["create table if not exists public.partner_ghl_workflow_config", "partner_ghl_workflow_config table"],
    ["partner_id uuid not null references public.partners (id)", "GHL partner foreign keys use current partners table"],
    ["workspace_id uuid not null references public.organizations (id)", "workspace mappings reference organizations"],
    ["alter table public.partner_ghl_config force row level security", "partner_ghl_config forced RLS"],
    ["alter table public.workspace_ghl_mapping force row level security", "workspace_ghl_mapping forced RLS"],
    ["alter table public.lead_crm_sync_events force row level security", "lead_crm_sync_events forced RLS"],
    ["auth.role() = 'service_role'", "service-role-only GHL table policies"],
    ["ghl_integration_schema_version", "GHL integration schema version marker"],
  ];

  for (const [marker, context] of requiredMarkers) {
    requireFileIncludes(ghlMigration, marker, context);
  }

  console.log("local partner GHL schema contract check passed");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    fail(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validateSupabaseUrl(rawUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    fail(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${rawUrl}`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    fail(`Invalid NEXT_PUBLIC_SUPABASE_URL protocol: ${parsedUrl.protocol}`);
  }

  return parsedUrl.toString().replace(/\/$/, "");
}

function classifySupabaseError(errorMessage, context) {
  const message = errorMessage || "Unknown Supabase error";
  const normalized = message.toLowerCase();

  if (normalized.includes("relation") && normalized.includes("does not exist")) {
    return `${context}: required table is missing (${message})`;
  }

  if (normalized.includes("column") && normalized.includes("does not exist")) {
    return `${context}: required column is missing (${message})`;
  }

  if (normalized.includes("permission denied")) {
    return `${context}: service role lacks required access (${message})`;
  }

  if (normalized.includes("invalid api key") || normalized.includes("jwt")) {
    return `${context}: SUPABASE_SERVICE_ROLE_KEY is invalid (${message})`;
  }

  return `${context}: ${message}`;
}

function classifyNetworkError(error, context, supabaseUrl) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("fetch failed")) {
    return `${context}: network failure reaching Supabase at ${supabaseUrl} (${message})`;
  }

  if (error instanceof TypeError) {
    return `${context}: request could not be completed (${message})`;
  }

  return `${context}: ${message}`;
}

async function probeQuery(context, action) {
  try {
    const result = await action();

    if (result.error) {
      fail(classifySupabaseError(result.error.message, context));
    }

    return result.data;
  } catch (error) {
    fail(classifyNetworkError(error, context, process.env.NEXT_PUBLIC_SUPABASE_URL));
  }
}

async function main() {
  validateRequiredMigrationFiles();
  validateAutopilotLocalSchemaContract();
  validateOperatorShellLocalSchemaContract();
  validatePartnerGhlLocalSchemaContract();

  if (schemaCheckMode === "local") {
    console.log("remote schema check skipped (SUPABASE_SCHEMA_CHECK_MODE=local)");
    return;
  }

  const supabaseUrl = validateSupabaseUrl(requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await probeQuery("campaign_plans.launch_status check", () =>
    supabase.from("campaign_plans").select("id, launch_status").limit(1),
  );

  await probeQuery("campaign_plans.lead_loop_verified check", () =>
    supabase.from("campaign_plans").select("id, lead_loop_verified").limit(1),
  );

  await probeQuery("campaign_plans.organization_id check", () =>
    supabase.from("campaign_plans").select("id, organization_id").limit(1),
  );

  await probeQuery("campaign_plans public publishing columns check", () =>
    supabase
      .from("campaign_plans")
      .select("id, publish_state, staged_snapshot, published_snapshot, staged_at, published_at")
      .limit(1),
  );

  await probeQuery("marketing_accounts Meta columns check", () =>
    supabase
      .from("marketing_accounts")
      .select(
        [
          "id",
          "account_name",
          "external_account_id",
          "pixel_id",
          "access_token_encrypted",
          "last_sync_at",
          "connection_metadata",
          "launch_domain",
          "verification_token",
          "domain_verified",
          "tracking_status",
          "tracking_metadata",
          "tracking_last_checked_at",
        ].join(", "),
      )
      .limit(1),
  );

  await probeQuery("stripe_webhook_events table check", () =>
    supabase
      .from("stripe_webhook_events")
      .select("id, stripe_event_id, status, payload, updated_at, reviewed_at, reviewed_by, resolution_note")
      .limit(1),
  );

  await probeQuery("billing_subscriptions table check", () =>
    supabase
      .from("billing_subscriptions")
      .select("id, organization_id, status, plan_tier, stripe_customer_id, stripe_latest_event_id, stripe_latest_event_created")
      .limit(1),
  );

  await probeQuery("system_jobs table check", () =>
    supabase
      .from("system_jobs")
      .select(
        [
          "id",
          "user_id",
          "kind",
          "status",
          "retry_count",
          "attempt_count",
          "max_attempts",
          "idempotency_key",
          "locked_by",
          "locked_until",
          "next_run_at",
          "last_error_code",
          "dead_lettered_at",
          "dead_letter_reason",
          "reviewed_at",
          "reviewed_by",
          "resolution_note",
          "partner_id",
          "created_at",
        ].join(", "),
      )
      .limit(1),
  );

  await probeQuery("operator shell partners table check", () =>
    supabase
      .from("partners")
      .select("id, slug, brand_name, logo_url, favicon_url, primary_color, status, powered_by_dealflow")
      .limit(1),
  );

  await probeQuery("operator shell partner_accounts table check", () =>
    supabase
      .from("partner_accounts")
      .select("id, partner_id, account_id, user_id, attribution_source, locked")
      .limit(1),
  );

  await probeQuery("operator shell partner_memberships table check", () =>
    supabase
      .from("partner_memberships")
      .select("id, partner_id, user_id, role, status")
      .limit(1),
  );

  await probeQuery("operator shell partner_branding table check", () =>
    supabase
      .from("partner_branding")
      .select("id, partner_id, theme_json, copy_json, pricing_json, feature_flags_json")
      .limit(1),
  );

  await probeQuery("operator shell partner_domains table check", () =>
    supabase
      .from("partner_domains")
      .select("id, partner_id, domain, type, verification_status, ssl_status")
      .limit(1),
  );

  await probeQuery("operator shell organizations.partner_id check", () =>
    supabase
      .from("organizations")
      .select("id, partner_id")
      .limit(1),
  );

  await probeQuery("system_job_logs table check", () =>
    supabase
      .from("system_job_logs")
      .select("id, job_id, level, message, created_at")
      .limit(1),
  );

  await probeQuery("provider_usage_limits table check", () =>
    supabase
      .from("provider_usage_limits")
      .select("id, organization_id, user_id, campaign_id, provider, operation, usage_date, usage_count, limit_count")
      .limit(1),
  );

  await probeQuery("provider_usage_events table check", () =>
    supabase
      .from("provider_usage_events")
      .select("id, organization_id, user_id, campaign_id, provider, operation, idempotency_key, status, created_at")
      .limit(1),
  );

  await probeQuery("user_credits table check", () =>
    supabase
      .from("user_credits")
      .select("user_id, balance, updated_at")
      .limit(1),
  );

  await probeQuery("user_credit_ledger table check", () =>
    supabase
      .from("user_credit_ledger")
      .select("id, user_id, organization_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key, created_at")
      .limit(1),
  );

  await probeQuery("rate_limit_buckets table check", () =>
    supabase
      .from("rate_limit_buckets")
      .select("bucket_key, request_count, reset_at, updated_at")
      .limit(1),
  );

  await probeQuery("meta_launch_locks table check", () =>
    supabase
      .from("meta_launch_locks")
      .select("campaign_id, lock_token, locked_by, locked_until, updated_at")
      .limit(1),
  );

  await probeQuery("lead_messages table check", () =>
    supabase
      .from("lead_messages")
      .select("id, lead_id, direction, message, provider_message_id, delivery_status, error_message, created_at")
      .limit(1),
  );

  await probeQuery("agent_profiles table check", () =>
    supabase
      .from("agent_profiles")
      .select("id, tenant_id, user_id, first_name, last_name, email, phone_raw, phone_e164, company_name, brokerage_name, sms_notifications_enabled, active, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("lead_assignments table check", () =>
    supabase
      .from("lead_assignments")
      .select("id, tenant_id, lead_id, agent_id, assigned_at, contacted_at, status, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("lead_notifications table check", () =>
    supabase
      .from("lead_notifications")
      .select("id, tenant_id, lead_id, agent_id, channel, provider, purpose, provider_message_id, status, error_message, sent_at, delivered_at, failed_at, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("activation_events table check", () =>
    supabase
      .from("activation_events")
      .select("id, organization_id, user_id, campaign_id, event_name, event_key, source, metadata, occurred_at, created_at")
      .limit(1),
  );

  await probeQuery("campaign_value_reports table check", () =>
    supabase
      .from("campaign_value_reports")
      .select("id, organization_id, user_id, campaign_id, report_type, report_key, period_start, period_end, status, summary, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("billing_cancellation_intents table check", () =>
    supabase
      .from("billing_cancellation_intents")
      .select("id, organization_id, user_id, stripe_customer_id, stripe_subscription_id, plan_tier, subscription_status, billing_state, reason_code, reason_detail, source, created_at")
      .limit(1),
  );

  await probeQuery("customer_success_checklists table check", () =>
    supabase
      .from("customer_success_checklists")
      .select("id, organization_id, user_id, campaign_id, onboarding_reviewed_at, creative_qa_completed_at, preview_reviewed_at, billing_verified_at, meta_connected_verified_at, assets_selected_verified_at, launch_readiness_verified_at, lead_loop_verified_at, day_7_check_in_completed_at, day_14_value_proof_completed_at, day_25_renewal_risk_review_completed_at, risk_level, owner_note, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("client_error_events table check", () =>
    supabase
      .from("client_error_events")
      .select("id, event_key, route_path, source, severity, error_name, message, occurrence_count, first_seen_at, last_seen_at, reviewed_at")
      .limit(1),
  );

  await probeQuery("campaign_sync_snapshots table check", () =>
    supabase
      .from("campaign_sync_snapshots")
      .select("id, organization_id, user_id, campaign_name, account_name, launch_mode, sync_result, meta_campaign_id, meta_ad_set_ids, meta_ad_ids, campaign_status, ad_set_statuses, ad_statuses, delivery_metrics, sync_metadata, sync_errors, synced_at, created_at")
      .limit(1),
  );

  await probeQuery("performance_tracking table check", () =>
    supabase
      .from("performance_tracking")
      .select("id, organization_id, user_id, source_snapshot_id, campaign_id, spend, impressions, clicks, ctr, leads, cpl, synced_at, created_at")
      .limit(1),
  );

  await probeQuery("targeting_intelligence_patterns table check", () =>
    supabase
      .from("targeting_intelligence_patterns")
      .select("id, organization_id, user_id, audience, location, targeting_pattern, spend, impressions, clicks, ctr, leads, cpl, performance_tag, success_count, failure_count, confidence_score, last_seen, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("campaign_action_suggestions table check", () =>
    supabase
      .from("campaign_action_suggestions")
      .select("id, organization_id, user_id, sync_snapshot_id, meta_campaign_id, action_type, title, reason, expected_impact, status, context, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("campaign_draft_actions table check", () =>
    supabase
      .from("campaign_draft_actions")
      .select("id, organization_id, user_id, campaign_id, action_type, source_reason, proposed_change, expected_impact, status, created_at, updated_at")
      .limit(1),
  );

  await probeQuery("scale_monitor_incidents table check", () =>
    supabase
      .from("scale_monitor_incidents")
      .select("id, incident_key, subsystem, severity, status, title, evidence, first_seen_at, last_seen_at, resolved_at, recurrence_count, clean_check_count, recommended_action, alert_channels, synthetic")
      .limit(1),
  );

  await probeQuery("scale_monitor_runs table check", () =>
    supabase
      .from("scale_monitor_runs")
      .select("id, started_at, completed_at, status, verdict, summary, smoke_summary, incidents_opened, incidents_resolved, error_code")
      .limit(1),
  );

  await probeQuery("leads reliability columns check", () =>
    supabase
      .from("leads")
      .select("id, organization_id, tenant_id, campaign_id, first_name, last_name, email, phone, phone_raw, phone_e164, campaign_name, lead_type, source, utm_source, utm_medium, utm_campaign, ad_id, landing_page_url, dedupe_hash, consent_metadata, sms_opted_out_at")
      .limit(1),
  );

  const schemaRow = await probeQuery("app_schema_metadata schema version check", () =>
    supabase.from("app_schema_metadata").select("value").eq("key", "schema_version").maybeSingle(),
  );

  const actualVersion =
    schemaRow && typeof schemaRow === "object" && "value" in schemaRow && typeof schemaRow.value === "string"
      ? schemaRow.value
      : null;

  if (!schemaVersionMeetsMinimum(actualVersion, expectedSchemaVersion)) {
    fail(
      `Schema version mismatch. Expected at least ${expectedSchemaVersion}, got ${actualVersion ?? "missing"}.`,
    );
  }

  const expectedMetadataVersions = new Map([
    ["activation_events_schema_version", "20260504183000"],
    ["campaign_value_reports_schema_version", "20260504190000"],
    ["billing_cancellation_intents_schema_version", "20260504203000"],
    ["customer_success_checklists_schema_version", "20260504210000"],
    ["launch_ops_table_advisor_hardening_schema_version", "20260504213000"],
    ["rls_and_fk_advisor_hardening_schema_version", "20260504220000"],
    ["client_error_events_schema_version", "20260504223000"],
    ["meta_sync_optimization_tables_schema_version", "20260509020000"],
    ["scale_monitor_incidents_schema_version", "20260519023000"],
    ["white_label_schema_version", expectedWhiteLabelSchemaVersion],
  ]);

  for (const [key, expectedVersion] of expectedMetadataVersions) {
    const metadataRow = await probeQuery(`app_schema_metadata ${key} check`, () =>
      supabase.from("app_schema_metadata").select("value").eq("key", key).maybeSingle(),
    );
    const actualMetadataVersion =
      metadataRow &&
      typeof metadataRow === "object" &&
      "value" in metadataRow &&
      typeof metadataRow.value === "string"
        ? metadataRow.value
        : null;

    if (!schemaVersionMeetsMinimum(actualMetadataVersion, expectedVersion)) {
      fail(
        `Schema metadata mismatch for ${key}. Expected at least ${expectedVersion}, got ${actualMetadataVersion ?? "missing"}.`,
      );
    }
  }

  console.log("remote schema check passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
