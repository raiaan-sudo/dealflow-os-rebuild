import "server-only";

import { createAdminClient } from "@/lib/server/supabase-admin";
import { ApiError } from "@/lib/api/route";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";

const EXPECTED_APP_SCHEMA_VERSION = "20260519043000";
const EXPECTED_WHITE_LABEL_SCHEMA_VERSION = "20260531160000";
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
] as const;
const REQUIRED_OPERATOR_SHELL_COLUMNS = {
  partners: [
    "slug",
    "brand_name",
    "logo_url",
    "favicon_url",
    "primary_color",
    "status",
    "powered_by_dealflow",
  ],
  partner_accounts: [
    "partner_id",
    "account_id",
    "user_id",
    "attribution_source",
    "locked",
  ],
  partner_memberships: [
    "partner_id",
    "user_id",
    "role",
    "status",
  ],
  partner_branding: [
    "partner_id",
    "theme_json",
    "copy_json",
    "pricing_json",
    "feature_flags_json",
  ],
  partner_domains: [
    "partner_id",
    "domain",
    "type",
    "verification_status",
    "ssl_status",
  ],
  organizations: ["partner_id"],
  system_jobs: ["partner_id"],
} as const;

type SchemaValidationMode = "block" | "warn" | "off";

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

  if (configured === "off") {
    return "off";
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

function schemaVersionMeetsMinimum(actualVersion: string | null, requiredMinimum: string) {
  return Boolean(actualVersion && actualVersion.localeCompare(requiredMinimum) >= 0);
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

async function readSchemaMetadataValue(key: string) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("app_schema_metadata")
    .select("value")
    .eq("key", key)
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

async function checkRequiredTables() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
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
  if (mode === "off") {
    return {
      ok: true,
      mode,
      expectedVersion: EXPECTED_APP_SCHEMA_VERSION,
      actualVersion: "skipped",
      missingColumns: [],
      issues: [],
    };
  }

  let missingCampaignPlanColumns: string[];
  let missingMarketingAccountColumns: string[];
  let missingStripeWebhookEventColumns: string[];
  let missingOperatorShellColumns: string[][];
  let missingTables: string[];
  let actualVersion: string | null;
  let actualWhiteLabelVersion: string | null;

  try {
    [
      missingCampaignPlanColumns,
      missingMarketingAccountColumns,
      missingStripeWebhookEventColumns,
      missingOperatorShellColumns,
      missingTables,
      actualVersion,
      actualWhiteLabelVersion,
    ] = await Promise.all([
      checkRequiredColumns("campaign_plans", REQUIRED_CAMPAIGN_PLAN_COLUMNS),
      checkRequiredColumns("marketing_accounts", REQUIRED_MARKETING_ACCOUNT_COLUMNS),
      checkRequiredColumns("stripe_webhook_events", REQUIRED_STRIPE_WEBHOOK_EVENT_COLUMNS),
      Promise.all(
        Object.entries(REQUIRED_OPERATOR_SHELL_COLUMNS).map(async ([table, columns]) =>
          (await checkRequiredColumns(table, columns)).map((column) => `${table}.${column}`),
        ),
      ),
      checkRequiredTables(),
      readSchemaVersion(),
      readSchemaMetadataValue("white_label_schema_version"),
    ]);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : null;

    if (mode === "warn") {
      const message =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "Schema validation could not complete.";
      return {
        ok: false,
        mode,
        expectedVersion: EXPECTED_APP_SCHEMA_VERSION,
        actualVersion: null,
        missingColumns: [],
        issues: [
          code === "service_role_missing"
            ? "Schema validation could not run because SUPABASE_SERVICE_ROLE_KEY is not configured."
            : `Schema validation could not complete in warn mode: ${message}`,
        ],
      };
    }

    throw error;
  }

  const missingColumns = [
    ...missingCampaignPlanColumns.map((column) => `campaign_plans.${column}`),
    ...missingMarketingAccountColumns.map((column) => `marketing_accounts.${column}`),
    ...missingStripeWebhookEventColumns.map((column) => `stripe_webhook_events.${column}`),
    ...missingOperatorShellColumns.flat(),
  ];

  const issues: string[] = [];

  if (missingColumns.length > 0) {
    issues.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  if (missingTables.length > 0) {
    issues.push(`Missing required tables: ${missingTables.join(", ")}`);
  }

  if (!schemaVersionMeetsMinimum(actualVersion, EXPECTED_APP_SCHEMA_VERSION)) {
    issues.push(
      actualVersion
        ? `Schema version mismatch. Expected at least ${EXPECTED_APP_SCHEMA_VERSION}, got ${actualVersion}.`
        : `Schema version metadata is missing. Expected at least ${EXPECTED_APP_SCHEMA_VERSION}.`,
    );
  }

  if (!schemaVersionMeetsMinimum(actualWhiteLabelVersion, EXPECTED_WHITE_LABEL_SCHEMA_VERSION)) {
    issues.push(
      actualWhiteLabelVersion
        ? `White-label schema version mismatch. Expected at least ${EXPECTED_WHITE_LABEL_SCHEMA_VERSION}, got ${actualWhiteLabelVersion}.`
        : `White-label schema metadata is missing. Expected at least ${EXPECTED_WHITE_LABEL_SCHEMA_VERSION}.`,
    );
  }

  return {
    ok: issues.length === 0,
    mode,
    expectedVersion: EXPECTED_APP_SCHEMA_VERSION,
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
  return EXPECTED_APP_SCHEMA_VERSION;
}
