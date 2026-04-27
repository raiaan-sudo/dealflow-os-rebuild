import "server-only";

import { createAdminClient } from "@/lib/server/supabase-admin";
import { ApiError } from "@/lib/api/route";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";

const EXPECTED_APP_SCHEMA_VERSION = "20260426";
const REQUIRED_CAMPAIGN_PLAN_COLUMNS = ["launch_status", "lead_loop_verified"] as const;

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

async function checkCampaignPlanColumns() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const missingColumns: string[] = [];

  for (const column of REQUIRED_CAMPAIGN_PLAN_COLUMNS) {
    const { error } = await admin
      .from("campaign_plans")
      .select(`id, ${column}`)
      .limit(1);

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

async function runSchemaValidation(): Promise<SchemaValidationResult> {
  const mode = getSchemaValidationMode();
  const [missingColumns, actualVersion] = await Promise.all([
    checkCampaignPlanColumns(),
    readSchemaVersion(),
  ]);

  const issues: string[] = [];

  if (missingColumns.length > 0) {
    issues.push(`Missing required campaign_plans columns: ${missingColumns.join(", ")}`);
  }

  if (actualVersion !== EXPECTED_APP_SCHEMA_VERSION) {
    issues.push(
      actualVersion
        ? `Schema version mismatch. Expected ${EXPECTED_APP_SCHEMA_VERSION}, got ${actualVersion}.`
        : `Schema version metadata is missing. Expected ${EXPECTED_APP_SCHEMA_VERSION}.`,
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
