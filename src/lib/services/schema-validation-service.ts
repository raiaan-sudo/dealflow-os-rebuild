import "server-only";

import { createAdminClient } from "@/lib/server/supabase-admin";
import { ApiError } from "@/lib/api/route";
import { isAccessKeyCheckoutEnabled } from "@/lib/env";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";

const MINIMUM_APP_SCHEMA_VERSION = "20260710235991";
const REQUIRED_CAMPAIGN_PLAN_COLUMNS = ["organization_id", "launch_status", "lead_loop_verified"] as const;
const REQUIRED_MARKETING_ACCOUNT_COLUMNS = [
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
] as const;
const REQUIRED_STRIPE_WEBHOOK_EVENT_COLUMNS = [
  "payload",
  "updated_at",
] as const;
const REQUIRED_TABLES = [
  "stripe_webhook_events",
  "billing_subscriptions",
  "system_jobs",
  "system_job_logs",
  "campaign_tracking_contracts",
  "lead_tracking_events",
  "meta_leadgen_routes",
  "meta_leadgen_events",
  "meta_leadgen_effect_receipts",
] as const;
const REQUIRED_ACCESS_KEY_TABLES = [
  "billing_access_keys",
  "billing_access_key_events",
] as const;
const REQUIRED_ACCESS_KEY_COLUMNS = [
  "key_hash",
  "key_prefix",
  "status",
  "stripe_checkout_session_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "claim_token_hash",
  "claimed_by_user_id",
  "claimed_organization_id",
  "metadata",
] as const;

type SchemaValidationMode = "block" | "warn";

type SchemaValidationResult = {
  ok: boolean;
  mode: SchemaValidationMode;
  expectedVersion: string;
  actualVersion: string | null;
  missingColumns: string[];
  issues: string[];
};

let schemaValidationPromise: Promise<SchemaValidationResult> | null = null;

function getSchemaValidationMode(): SchemaValidationMode {
  const configured = (process.env.SCHEMA_VALIDATION_MODE ?? "").trim().toLowerCase();

  if (configured === "warn") {
    return "warn";
  }

  return "block";
}

function isMissingColumnError(error: unknown, column: string) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return message.includes(column);
}

function isSchemaVersionAtLeast(actualVersion: string | null, minimumVersion: string) {
  if (!actualVersion || !/^\d+$/.test(actualVersion) || !/^\d+$/.test(minimumVersion)) {
    return false;
  }

  if (actualVersion.length !== minimumVersion.length) {
    return actualVersion.length > minimumVersion.length;
  }

  return actualVersion >= minimumVersion;
}

async function checkRequiredColumns(table: string, columns: readonly string[]) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const missingColumns: string[] = [];

  for (const column of columns) {
    const { error } = await admin.from(table).select(`id, ${column}`).limit(1);

    if (!error) {
      continue;
    }

    if (isMissingColumnError(error, column)) {
      missingColumns.push(column);
      continue;
    }

    throw new ApiError(500, error.message, "schema_column_check_failed");
  }

  return missingColumns;
}

async function readSchemaVersion() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("app_schema_metadata")
    .select("value")
    .eq("key", "schema_version")
    .maybeSingle();

  if (error) {
    const message = typeof error.message === "string" ? error.message : "Schema metadata lookup failed.";
    if (/app_schema_metadata/i.test(message)) {
      return null;
    }

    throw new ApiError(500, message, "schema_metadata_lookup_failed");
  }

  const metadataRow = data as { value?: unknown } | null;

  return metadataRow && typeof metadataRow.value === "string"
    ? metadataRow.value
    : null;
}

async function checkRequiredTables(tables: readonly string[]) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const missingTables: string[] = [];

  for (const table of tables) {
    const { error } = await admin.from(table).select("*").limit(1);

    if (!error) {
      continue;
    }

    const message = typeof error.message === "string" ? error.message : "";

    if (/relation .* does not exist|schema cache/i.test(message)) {
      missingTables.push(table);
      continue;
    }

    throw new ApiError(500, error.message, "schema_table_check_failed");
  }

  return missingTables;
}

async function runSchemaValidation(): Promise<SchemaValidationResult> {
  const mode = getSchemaValidationMode();
  const accessKeyCheckoutEnabled = isAccessKeyCheckoutEnabled();

  if (!createAdminClient()) {
    if (mode === "warn") {
      return {
        ok: false,
        mode,
        expectedVersion: MINIMUM_APP_SCHEMA_VERSION,
        actualVersion: null,
        missingColumns: [],
        issues: ["Supabase service role is not configured; remote schema validation was skipped."],
      };
    }

    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const requiredTables = accessKeyCheckoutEnabled
    ? [...REQUIRED_TABLES, ...REQUIRED_ACCESS_KEY_TABLES]
    : REQUIRED_TABLES;

  const [
    missingCampaignPlanColumns,
    missingMarketingAccountColumns,
    missingStripeWebhookEventColumns,
    missingAccessKeyColumns,
    missingTables,
    actualVersion,
  ] = await Promise.all([
    checkRequiredColumns("campaign_plans", REQUIRED_CAMPAIGN_PLAN_COLUMNS),
    checkRequiredColumns("marketing_accounts", REQUIRED_MARKETING_ACCOUNT_COLUMNS),
    checkRequiredColumns("stripe_webhook_events", REQUIRED_STRIPE_WEBHOOK_EVENT_COLUMNS),
    accessKeyCheckoutEnabled
      ? checkRequiredColumns("billing_access_keys", REQUIRED_ACCESS_KEY_COLUMNS)
      : Promise.resolve([]),
    checkRequiredTables(requiredTables),
    readSchemaVersion(),
  ]);
  const missingColumns = [
    ...missingCampaignPlanColumns.map((column) => `campaign_plans.${column}`),
    ...missingMarketingAccountColumns.map((column) => `marketing_accounts.${column}`),
    ...missingStripeWebhookEventColumns.map((column) => `stripe_webhook_events.${column}`),
    ...missingAccessKeyColumns.map((column) => `billing_access_keys.${column}`),
  ];

  const issues: string[] = [];

  if (missingColumns.length > 0) {
    issues.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  if (missingTables.length > 0) {
    issues.push(`Missing required tables: ${missingTables.join(", ")}`);
  }

  if (!isSchemaVersionAtLeast(actualVersion, MINIMUM_APP_SCHEMA_VERSION)) {
    issues.push(
      actualVersion
        ? `Schema version is behind. Expected at least ${MINIMUM_APP_SCHEMA_VERSION}, got ${actualVersion}.`
        : `Schema version metadata is missing. Expected at least ${MINIMUM_APP_SCHEMA_VERSION}.`,
    );
  }

  return {
    ok: issues.length === 0,
    mode,
    expectedVersion: MINIMUM_APP_SCHEMA_VERSION,
    actualVersion,
    missingColumns,
    issues,
  };
}

export async function validateRequiredSchema() {
  if (!schemaValidationPromise) {
    schemaValidationPromise = runSchemaValidation();
  }

  return schemaValidationPromise;
}

export async function assertRequiredSchemaReady(options?: { context?: string }) {
  const context = options?.context ?? "runtime";
  const result = await validateRequiredSchema();

  if (result.ok) {
    logOperationalEvent("schema_validation_passed", {
      context,
      expectedVersion: result.expectedVersion,
      actualVersion: result.actualVersion,
    });
    return result;
  }

  const payload = {
    context,
    mode: result.mode,
    expectedVersion: result.expectedVersion,
    actualVersion: result.actualVersion,
    missingColumns: result.missingColumns,
    issues: result.issues,
    migrationRequirement:
      "Apply all pending Supabase migrations before deploying this release. Schema-first deploy is required.",
  };

  logError("critical_schema_validation_failed", payload);

  if (result.mode === "warn") {
    logWarn("schema_validation_warn_mode_active", payload);
    return result;
  }

  throw new Error(
    `Required database migrations are missing: ${result.issues.join(" ")}`,
  );
}

export function queueSchemaValidationOnce(options?: { context?: string }) {
  const context = options?.context ?? "background";

  void assertRequiredSchemaReady({ context }).catch(() => {
    // The failure has already been logged with full context.
  });
}

export function getExpectedAppSchemaVersion() {
  return MINIMUM_APP_SCHEMA_VERSION;
}
