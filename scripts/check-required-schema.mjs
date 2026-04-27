import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const repoRoot = "/Users/raiaanreza/Documents/New project/dealflow-os-rebuild";
const expectedSchemaVersion = "20260426";
const requiredMigrationFiles = [
  "20260426_create_stripe_webhook_events.sql",
  "20260426_add_campaign_plan_critical_fields.sql",
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

  await probeQuery("stripe_webhook_events table check", () =>
    supabase.from("stripe_webhook_events").select("id, stripe_event_id, status").limit(1),
  );

  const schemaRow = await probeQuery("app_schema_metadata schema version check", () =>
    supabase.from("app_schema_metadata").select("value").eq("key", "schema_version").maybeSingle(),
  );

  const actualVersion =
    schemaRow && typeof schemaRow === "object" && "value" in schemaRow && typeof schemaRow.value === "string"
      ? schemaRow.value
      : null;

  if (actualVersion !== expectedSchemaVersion) {
    fail(
      `Schema version mismatch. Expected ${expectedSchemaVersion}, got ${actualVersion ?? "missing"}.`,
    );
  }

  console.log("remote schema check passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
