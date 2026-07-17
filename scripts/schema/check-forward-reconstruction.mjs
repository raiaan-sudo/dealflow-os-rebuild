#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase", "migrations");
const FOUNDATION_TABLES = [
  "campaign_plans", "creative_assets", "leads", "marketing_accounts",
  "organization_memberships", "organizations", "service_types", "users",
];
const JULY_OWNERS = new Map([
  ["billing_access_keys", "20260705090000"],
  ["billing_access_key_events", "20260705090000"],
  ["campaign_tracking_contracts", "20260706170000"],
  ["lead_tracking_events", "20260706170000"],
]);
const ACTIVE_APP_CONTRACT_TABLES = [
  "campaign_executions", "campaign_execution_ad_sets", "campaign_execution_ads",
  "campaign_execution_logs", "creative_asset_logs", "creative_intelligence",
  "creative_pattern_scores", "creative_performance_snapshots", "creative_render_jobs",
];
const FROZEN_FOUNDATION_LAST_FILE =
  "20260710235994_create_execution_and_creative_app_contracts.sql";
const FROZEN_FOUNDATION_MIGRATION_COUNT = 80;
const EXACT_INTEGRATED_MIGRATION_COUNT = 115;
const REQUIRED_PRODUCT_EXTENSION_MIGRATIONS = [
  "20260712213000_create_ghl_sandbox_provider_path.sql",
  "20260712214000_create_continuous_reporting_and_safe_optimizer.sql",
  "20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql",
  "20260712235991_create_meta_instant_form_provisioning.sql",
  "20260713010000_harden_support_external_delivery.sql",
  "20260713011000_create_customer_authorized_meta_activation.sql",
  "20260713012000_require_meta_activation_preauthorization.sql",
  "20260713012100_harden_meta_activation_delivery_and_recovery.sql",
  "20260713013000_create_customer_authorized_meta_optimizer_executor.sql",
  "20260713014000_scope_ghl_personalization_to_campaign.sql",
  "20260713015000_bind_verified_partner_attribution_atomically.sql",
  "20260713016000_terminalize_ambiguous_ghl_dispatches.sql",
  "20260713017000_make_paid_creative_dispatch_recoverable.sql",
  "20260713018000_harden_meta_reporting_and_leadgen_integrity.sql",
  "20260713019000_capture_public_lead_and_outbox_atomically.sql",
  "20260713020000_add_fair_reporting_worker_claim.sql",
  "20260713021000_require_paid_activation_for_campaign_creation.sql",
  "20260713022000_reconcile_native_ghl_form_submissions.sql",
  "20260713024000_add_durable_ghl_periodic_form_sweeps.sql",
  "20260713025000_add_generated_video_canonical_storage.sql",
  "20260713026000_add_account_deletion_and_provider_offboarding.sql",
  "20260713027000_add_ghl_location_display_name_finalization.sql",
  "20260713028000_harden_account_deletion_retention_authority.sql",
  "20260715010000_move_legacy_org_member_policies_private.sql",
  "20260716010000_require_optimizer_cpl_minimum_lead_sample.sql",
  "20260716180000_harden_credit_top_up_request_idempotency.sql",
  "20260716190000_add_ghl_marketplace_oauth_install_foundation.sql",
  "20260716200000_harden_stripe_payment_lifecycle.sql",
  "20260717010000_harden_onboarding_draft_integrity.sql",
  "20260717013000_complete_ghl_marketplace_runtime_lifecycle.sql",
  "20260717020000_canonicalize_campaign_lifecycle_truth.sql",
  "20260717030000_harden_platform_operator_authority.sql",
  "20260717040000_bind_generated_static_storage_tenancy.sql",
  "20260717050000_create_privacy_consent_dsar_authority.sql",
  "20260717060000_install_owner_decision_authority_grants.sql",
];

function fail(message, details = {}) {
  failures.push({ message, ...details });
}

function stable(input) {
  if (Array.isArray(input)) return input.map(stable);
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])]));
}

function json(input) {
  return `${JSON.stringify(stable(input), null, 2)}\n`;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function mergedAuthorityCategories(publicCurrent, privateAuthority) {
  const categories = Object.fromEntries(
    Object.entries(publicCurrent.categories ?? {}).map(([id, rows]) => [id, [...rows]]),
  );
  for (const [id, rows] of Object.entries(privateAuthority.categories ?? {})) {
    if (id === "02_extensions") {
      const byName = new Map((categories[id] ?? []).map((row) => [row.extension_name, row]));
      for (const row of rows) byName.set(row.extension_name, row);
      categories[id] = [...byName.values()].sort((left, right) =>
        left.extension_name.localeCompare(right.extension_name));
    } else if (/^14[a-i]_/.test(id) || id === "01b_private_object_class_inventory") {
      categories[id] = [...rows];
    } else if (rows.length > 0) {
      categories[id] = [...(categories[id] ?? []), ...rows];
    }
  }
  return categories;
}

function tableCreates(sql) {
  return [...sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi)]
    .map((match) => {
      const schema = (match[1] ?? "public").toLowerCase();
      const table = match[2].toLowerCase();
      return { schema, table, identity: `${schema}.${table}`, index: match.index };
    });
}

function foreignKeyReferences(sql) {
  return [...sql.matchAll(/\bREFERENCES\s+(?:("?[a-zA-Z0-9_]+"?)\.)?"?([a-zA-Z0-9_]+)"?/gi)]
    .map((match) => ({
      schema: (match[1] ?? "public").replaceAll('"', "").toLowerCase(),
      table: match[2].toLowerCase(),
      index: match.index,
    }));
}

function dependencySurface(sql) {
  const blank = (value) => " ".repeat(value.length);
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, blank)
    .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, blank)
    .replace(/'(?:''|[^'])*'/g, blank)
    .replace(/^\s*--.*$/gm, blank);
}

function routineBody(sql) {
  const match = /AS\s+\$function\$([\s\S]*?)\$function\$/i.exec(sql)
    ?? /AS\s+\$\$([\s\S]*?)\$\$/i.exec(sql);
  return (match?.[1] ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function requireTokenOrder(record, tokens, label) {
  if (!record) {
    fail(`${label} migration is missing`);
    return;
  }
  const positions = tokens.map((token) => record.sql.indexOf(token));
  if (
    positions.some((position) => position < 0)
    || positions.some((position, index) => index > 0 && position <= positions[index - 1])
  ) {
    fail(`${label} does not preserve authoritative live-column order`, {
      file: record.file,
      tokens,
      positions,
    });
  }
}

function addedColumnEvents(recordsToInspect, table) {
  const pattern = /\bALTER\s+TABLE\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"?([a-zA-Z0-9_]+)"?/gi;
  return recordsToInspect.flatMap((record) => [...record.sql.matchAll(pattern)]
    .filter((match) => match[1].toLowerCase() === table)
    .map((match) => ({ column: match[2].toLowerCase(), file: record.file, version: record.version, index: match.index })));
}

const failures = [];
const files = readdirSync(MIGRATIONS).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
const foundationBoundaryIndex = files.indexOf(FROZEN_FOUNDATION_LAST_FILE);
if (foundationBoundaryIndex + 1 !== FROZEN_FOUNDATION_MIGRATION_COUNT) {
  fail("frozen foundation boundary moved", {
    expected: FROZEN_FOUNDATION_MIGRATION_COUNT,
    actual: foundationBoundaryIndex + 1,
  });
}
if (new Set(files.map((name) => name.slice(0, 14))).size !== files.length) {
  fail("migration versions must remain globally unique");
}
for (const requiredMigration of REQUIRED_PRODUCT_EXTENSION_MIGRATIONS) {
  if (!files.includes(requiredMigration)) {
    fail("required product extension migration is missing", {
      migration: requiredMigration,
    });
  }
}
if (
  files.length !== EXACT_INTEGRATED_MIGRATION_COUNT ||
  EXACT_INTEGRATED_MIGRATION_COUNT !==
    FROZEN_FOUNDATION_MIGRATION_COUNT + REQUIRED_PRODUCT_EXTENSION_MIGRATIONS.length
) {
  fail("migration chain does not have the exact reviewed product extensions", {
    expected: EXACT_INTEGRATED_MIGRATION_COUNT,
    actual: files.length,
  });
}

const records = files.map((file) => ({ file, version: file.slice(0, 14), sql: readFileSync(join(MIGRATIONS, file), "utf8") }));
const activationMigration = records.find(({ version }) => version === "20260713011000");
if (!activationMigration) {
  fail("customer-authorized Meta activation migration is missing");
} else {
  const normalizedActivationSql = activationMigration.sql
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const activationTables = [
    "meta_campaign_activation_runtime_controls",
    "meta_campaign_activation_intents",
    "meta_campaign_activation_objects",
  ];
  for (const table of activationTables) {
    for (const requiredToken of [
      `create table if not exists public.${table}`,
      `alter table public.${table} enable row level security;`,
      `alter table public.${table} force row level security;`,
      `revoke all on table public.${table} from public, anon, authenticated, service_role;`,
      `grant select on table public.${table} to service_role;`,
    ]) {
      if (!normalizedActivationSql.includes(requiredToken)) {
        fail("Meta activation table security contract is incomplete", {
          table,
          requiredToken,
        });
      }
    }
  }
  if (
    !normalizedActivationSql.includes(
      "activation_writes_enabled boolean not null default false",
    )
    || !/\('staging', false, 1, 'seeded_closed'\),\s*\('production', false, 1, 'seeded_closed'\)/i.test(
      activationMigration.sql,
    )
  ) {
    fail("Meta activation runtime controls are not deterministically seeded closed");
  }

  const customerRpcs = [
    "authorize_meta_campaign_activation(uuid, uuid, uuid, timestamptz, bigint, text, text, text)",
    "cancel_meta_campaign_activation(uuid)",
  ];
  const workerRpcs = [
    "claim_due_meta_campaign_activation(text, text, integer)",
    "renew_meta_campaign_activation_claim(uuid, text, uuid, bigint, integer)",
    "arm_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint)",
    "record_meta_campaign_activation_receipt(uuid, uuid, text, uuid, bigint, text, text, jsonb)",
    "settle_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint)",
    "settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text)",
    "reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text)",
  ];
  for (const [signature, grantee] of [
    ...customerRpcs.map((signature) => [signature, "authenticated"]),
    ...workerRpcs.map((signature) => [signature, "service_role"]),
  ]) {
    for (const requiredToken of [
      `create or replace function public.${signature.split("(")[0]}(`,
      `revoke all on function public.${signature} from public, anon, authenticated, service_role;`,
      `grant execute on function public.${signature} to ${grantee};`,
    ]) {
      if (!normalizedActivationSql.includes(requiredToken)) {
        fail("Meta activation RPC privilege contract is incomplete", {
          signature,
          grantee,
          requiredToken,
        });
      }
    }
  }
}
const generated = records.filter(({ sql }) => sql.includes("-- dealflow:migration "));
if (generated.length !== 29) fail("generated migration count must equal 29", { actual: generated.length });
for (const record of generated) {
  if (!record.sql.includes("dealflow:statement")) fail("generated migration lacks statement-level provenance", { file: record.file });
  if (!/postcondition/i.test(record.sql)) fail("generated migration lacks executable postcondition", { file: record.file });
  if (!record.sql.includes("original_body_status=NOT_RECOVERED")) fail("generated migration misstates historical authority", { file: record.file });
}

const allCreates = new Map();
for (const record of records) {
  for (const create of tableCreates(record.sql)) {
    const occurrences = allCreates.get(create.identity) ?? [];
    occurrences.push({
      file: record.file,
      generated: record.sql.includes("-- dealflow:migration "),
      guarded: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(record.sql.slice(create.index, create.index + 80)),
    });
    allCreates.set(create.identity, occurrences);
  }
}
for (const [table, occurrences] of allCreates) {
  const toleratedSealedGuard = table === "public.app_schema_metadata"
    && occurrences.length === 2
    && occurrences.every((item) => !item.generated && item.guarded);
  if (occurrences.length !== 1 && !toleratedSealedGuard) {
    fail("duplicate CREATE TABLE identity", { table, occurrences: occurrences.map(({ file }) => file) });
  }
}

const foundation = records.find(({ version }) => version === "20260426000000");
if (!foundation) {
  fail("foundation migration is missing");
} else {
  const actual = tableCreates(foundation.sql).map(({ table }) => table).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...FOUNDATION_TABLES].sort())) {
    fail("foundation must create exactly the eight dependency tables", { actual });
  }
  if (/CREATE(?: OR REPLACE)? FUNCTION\s+private\.is_current_user_org_member/i.test(foundation.sql)) fail("private helper is chronologically forbidden in foundation");
  if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?partners\b/i.test(foundation.sql)) fail("partners is chronologically forbidden in foundation");
  if (/check_function_bodies\s*=\s*false/i.test(foundation.sql)) fail("foundation may not hide routine dependency errors");
}

requireTokenOrder(
  records.find(({ version }) => version === "20260428120000"),
  [
    "reset_at timestamptz not null",
    "updated_at timestamptz not null",
    "created_at timestamptz not null",
  ],
  "rate_limit_buckets fresh replay",
);
requireTokenOrder(
  records.find(({ version }) => version === "20260426110100"),
  [
    "error_message text null",
    "created_at timestamptz not null",
    "payload jsonb null",
    "updated_at timestamptz not null",
  ],
  "stripe_webhook_events fresh replay",
);

const campaignColumnAdds = addedColumnEvents(records, "campaign_plans");
const leadCaptureGoalAdds = campaignColumnAdds.filter(({ column }) => column === "lead_capture_goal");
const captureMethodAdds = campaignColumnAdds.filter(({ column }) => column === "capture_method");
if (
  leadCaptureGoalAdds.length !== 1
  || captureMethodAdds.length !== 1
  || leadCaptureGoalAdds[0].version > captureMethodAdds[0].version
  || (
    leadCaptureGoalAdds[0].version === captureMethodAdds[0].version
    && leadCaptureGoalAdds[0].index >= captureMethodAdds[0].index
  )
) {
  fail("campaign_plans fresh replay does not preserve lead_capture_goal before capture_method", {
    leadCaptureGoalAdds,
    captureMethodAdds,
  });
}

const catalogGate = records.find(({ version }) => version === "20260710160000");
const denseColumnOrderPattern = /row_number\(\)\s+OVER\s*\(PARTITION BY n\.nspname, c\.relname ORDER BY a\.attnum\)::integer AS ordinal_position/gi;
const denseColumnOrderGateCount = catalogGate
  ? [...catalogGate.sql.matchAll(denseColumnOrderPattern)].length
  : 0;
if (denseColumnOrderGateCount !== 2 || /a\.attnum\s+AS\s+ordinal_position/i.test(catalogGate?.sql ?? "")) {
  fail("catalog gate must compare dense live-column rank for both public and private assertions", {
    denseColumnOrderGateCount,
  });
}

const created = new Set();
for (const record of records) {
  if (record.version === "20260710160000") continue;
  const dependencySql = dependencySurface(record.sql);
  const events = [
    ...tableCreates(dependencySql).map((event) => ({ ...event, kind: "create" })),
    ...foreignKeyReferences(dependencySql).map((event) => ({ ...event, kind: "reference" })),
  ].sort((left, right) => left.index - right.index || (left.kind === "create" ? -1 : 1));
  for (const event of events) {
    if (event.kind === "create") {
      created.add(event.identity);
    } else if (event.schema === "public" && !created.has(`public.${event.table}`)) {
      fail("foreign-key reference occurs before CREATE TABLE", { file: record.file, table: event.table });
    }
  }
}

const partnerCreate = records.find(({ sql }) =>
  tableCreates(sql).some(({ schema, table }) => schema === "public" && table === "partners"));
if (partnerCreate?.version !== "20260531160000") {
  fail("public.partners must be created in the May-31 white-label foundation", { actual: partnerCreate?.file ?? null });
}
for (const record of records) {
  for (const [table, ownerVersion] of JULY_OWNERS) {
    if (record.version < ownerVersion && new RegExp(`\\b${table}\\b`, "i").test(record.sql)) {
      fail("sealed July object leaked into earlier reconstruction", { file: record.file, table, ownerVersion });
    }
  }
}

for (const table of ACTIVE_APP_CONTRACT_TABLES) {
  const occurrences = allCreates.get(`public.${table}`) ?? [];
  if (occurrences.length !== 1 || !occurrences[0].file.startsWith("20260710235994_")) {
    fail("active app-contract table is not owned exactly once by 20260710235994", { table, occurrences: occurrences.map(({ file }) => file) });
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}
const runtimeSources = sourceFiles(resolve(ROOT, "src"));
for (const retired of ["availability_slots", "booked_slots"]) {
  for (const path of runtimeSources) {
    const source = readFileSync(path, "utf8");
    if (new RegExp(`\\.from\\(\\s*[\"']${retired}[\"']\\s*\\)`).test(source)) {
      fail("retired local calendar table remains in runtime source", { table: retired, path });
    }
  }
}

const helperMigration = records.find(({ version }) => version === "20260502192332");
const reconciliationDir = resolve(ROOT, "supabase", "reconciliation");
const privateAuthorityText = readFileSync(join(reconciliationDir, "private-schema-authority.v1.json"), "utf8");
const privateAuthority = JSON.parse(privateAuthorityText);
const publicCurrent = JSON.parse(readFileSync(join(reconciliationDir, "authoritative-public-catalog.v1.json"), "utf8"));
const current = JSON.parse(readFileSync(join(reconciliationDir, "authoritative-current-catalog.v1.json"), "utf8"));
const capturedHelper = privateAuthority.categories?.["10a_routines"]?.[0]?.routine_definition ?? "";
if (!helperMigration || routineBody(helperMigration.sql) !== routineBody(capturedHelper)) {
  fail("sealed private helper body does not match R2 authority");
}

const actualCombinedCatalogDigest = sha256(json(current.categories ?? {}));
if (current.provenance?.combinedCatalogDigestSha256 !== actualCombinedCatalogDigest) {
  fail("combined authority digest does not match authoritative current categories");
}
if (current.provenance?.privateAuthoritySha256 !== sha256(privateAuthorityText)) {
  fail("combined authority does not bind the exact private-authority fixture");
}
if (
  current.provenance?.privatePassSha256 !== privateAuthority.provenance?.passSha256
  || current.provenance?.privatePassesByteIdentical !== true
  || privateAuthority.provenance?.passesByteIdentical !== true
) {
  fail("combined/private authority pass provenance is inconsistent");
}
if (
  current.provenance?.remoteCaptureDigestSha256
    !== publicCurrent.provenance?.remoteCaptureDigestSha256
  || !/^[a-f0-9]{64}$/.test(publicCurrent.provenance?.remoteCaptureDigestSha256 ?? "")
) {
  fail("combined/public authority capture provenance is inconsistent");
}
if (json(current.categories ?? {}) !== json(mergedAuthorityCategories(publicCurrent, privateAuthority))) {
  fail("combined authority is not the exact public/private fixture composition");
}

const generatorSource = readFileSync(resolve(ROOT, "scripts", "generate-forward-migration-portfolio.mjs"), "utf8");
if (/Map\.groupBy/.test(generatorSource)) fail("generator uses Map.groupBy and is not Node-20 compatible");

const summary = {
  schemaVersion: "dealflow.forward-reconstruction-static-proof.v1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  runtime: process.version,
  migrationCount: files.length,
  generatedMigrationCount: generated.length,
  denseColumnOrderGateCount,
  authorityIntegrity: failures.some(({ message }) => /authority|provenance/.test(message)) ? "FAIL" : "PASS",
  uniqueCreateTableCount: allCreates.size,
  duplicateCreateTableCount: failures.filter(({ message }) => message === "duplicate CREATE TABLE identity").length,
  toleratedSealedGuardedDuplicateCount: [...allCreates.entries()].filter(([table, items]) => table === "public.app_schema_metadata" && items.length === 2 && items.every((item) => !item.generated && item.guarded)).length,
  referencesBeforeCreateCount: failures.filter(({ message }) => message.includes("before CREATE TABLE")).length,
  failureCount: failures.length,
  failures,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
