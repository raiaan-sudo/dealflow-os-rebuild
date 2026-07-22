#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const RECONCILIATION_DIR = join(ROOT, "supabase", "reconciliation");
const CURRENT_FIXTURE = join(RECONCILIATION_DIR, "authoritative-current-catalog.v1.json");
const PUBLIC_CURRENT_FIXTURE = join(RECONCILIATION_DIR, "authoritative-public-catalog.v1.json");
const PRIVATE_AUTHORITY_FIXTURE = join(RECONCILIATION_DIR, "private-schema-authority.v1.json");
const CATALOG_ASSERTION_QUERIES = join(RECONCILIATION_DIR, "catalog-assertion-queries.v1.json");
const BASELINE_FIXTURE = join(RECONCILIATION_DIR, "may2-baseline-catalog.v1.json");
const LINEAGE_MAP = join(RECONCILIATION_DIR, "forward-equivalent-lineage-map.v1.json");
const STATEMENT_PROVENANCE = join(RECONCILIATION_DIR, "migration-provenance.v1.json");

const currentAuthorityAtLoad = JSON.parse(readFileSync(CURRENT_FIXTURE, "utf8"));
const REMOTE_CAPTURE_DIGEST = currentAuthorityAtLoad.provenance?.combinedCatalogDigestSha256;
if (!/^[a-f0-9]{64}$/.test(REMOTE_CAPTURE_DIGEST ?? "")) {
  throw new Error("authoritative current catalog is missing the combined public/private digest");
}
const FOUNDATION = {
  version: "20260426000000",
  name: "forward_foundation_bootstrap",
};
const GATE = {
  version: "20260710160000",
  name: "validate_and_normalize_pre_candidate_shape",
};
const APP_CONTRACT = {
  version: "20260710235994",
  name: "create_execution_and_creative_app_contracts",
};
const FROZEN_FOUNDATION_MIGRATION_COUNT = 80;
const EXACT_INTEGRATED_MIGRATION_COUNT = 125;
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
  "20260717070000_complete_privacy_runtime_and_dynamic_deletion.sql",
  "20260717080000_harden_support_delivery_lifecycle.sql",
  "20260717081000_expand_campaign_lifecycle_authority.sql",
  "20260717082000_provider_aware_funnel_publication.sql",
  "20260717090000_create_canonical_lead_outcome_ledger.sql",
  "20260720010000_add_ghl_embed_sso_authority.sql",
  "20260722010000_modernize_provider_service_role_claims.sql",
  "20260722020000_persist_ghl_location_token_scope.sql",
  "20260722030000_support_direct_ghl_embed_sso.sql",
  "20260722040000_add_service_only_operator_grant_probe.sql",
];
const PARTNER_FOUNDATION_VERSION = "20260531160000";
const FOUNDATION_TABLES = new Set([
  "campaign_plans",
  "organizations",
  "marketing_accounts",
  "leads",
  "organization_memberships",
  "users",
  "creative_assets",
  "service_types",
]);
const SEALED_EARLY_TABLES = new Set([
  "agent_profiles", "app_schema_metadata", "billing_subscriptions", "lead_assignments",
  "lead_messages", "lead_notifications", "meta_launch_locks", "provider_usage_events",
  "provider_usage_limits", "rate_limit_buckets", "stripe_webhook_events", "system_job_logs",
  "system_jobs", "user_credit_ledger", "user_credits",
]);
const REPLAY_BASELINE_TABLES = new Set([...FOUNDATION_TABLES, ...SEALED_EARLY_TABLES]);
const SEALED_EARLY_ROUTINES = new Set([
  "apply_billing_subscription_webhook", "claim_next_system_job", "cleanup_expired_rate_limit_buckets",
  "consume_rate_limit_bucket", "consume_user_credits", "grant_user_credits",
  "is_current_user_org_member", "reserve_provider_usage",
]);
const JULY_SEALED_TABLES = new Set([
  "billing_access_keys",
  "billing_access_key_events",
  "campaign_tracking_contracts",
  "lead_tracking_events",
]);
const MISSING = [
  ["20260504183000", "create_activation_events"],
  ["20260504190000", "create_campaign_value_reports"],
  ["20260504203000", "create_billing_cancellation_intents"],
  ["20260504210000", "create_customer_success_checklists"],
  ["20260504213000", "harden_launch_ops_tables_advisors"],
  ["20260504220000", "harden_rls_and_fk_advisors"],
  ["20260504223000", "create_client_error_events"],
  ["20260509020000", "create_meta_sync_and_optimization_tables"],
  ["20260510014500", "enable_generation_credit_overdrafts"],
  ["20260510183000", "cap_generation_credit_overdrafts"],
  ["20260512010000", "scope_provider_usage_idempotency"],
  ["20260519023000", "create_scale_monitor_incidents"],
  ["20260519033000", "create_autonomy_execution_tables"],
  ["20260519043000", "harden_autonomy_anon_access"],
  ["20260529230000", "remove_legacy_single_campaign_constraint"],
  ["20260530170000", "create_lead_billing_events"],
  ["20260531160000", "create_white_label_partner_infrastructure"],
  ["20260531193000", "add_partner_branded_billing_metadata"],
  ["20260604120000", "add_immediate_lead_charge_fields"],
  ["20260605210000", "add_lead_capture_strategy"],
  ["20260614193000", "click_to_scale_partner_ghl_sync"],
  ["20260614203000", "seed_click_to_scale_white_label_partner"],
  ["20260615100000", "create_ghl_provisioning_pipeline"],
  ["20260615103000", "seed_click_to_scale_ghl_provisioning_config"],
  ["20260615104000", "update_click_to_scale_ghl_credential_ref"],
  ["20260615220500", "update_click_to_scale_branding"],
].map(([version, name]) => ({ version, name }));

const DATA_ONLY = new Set([
  "20260614203000",
  "20260615103000",
  "20260615104000",
  "20260615220500",
]);

const SECRET_PATTERNS = [
  /\b(?:sbp|sb_secret|sk_live|rk_live)_[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi,
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const mode = has("--check") ? "check" : "write";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(valueToSort) {
  if (Array.isArray(valueToSort)) return valueToSort.map(stable);
  if (!valueToSort || typeof valueToSort !== "object") return valueToSort;
  return Object.fromEntries(Object.keys(valueToSort).sort().map((key) => [key, stable(valueToSort[key])]));
}

function json(valueToSerialize) {
  return `${JSON.stringify(stable(valueToSerialize), null, 2)}\n`;
}

function assertNoSecrets(label, text) {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) throw new Error(`${label} contains a forbidden credential-like value (${pattern})`);
  }
}

function writeOrCheck(path, contents) {
  assertNoSecrets(path, contents);
  if (mode === "check") {
    if (!existsSync(path)) throw new Error(`missing generated file: ${path}`);
    const actual = readFileSync(path, "utf8");
    if (actual !== contents) throw new Error(`generated file is stale: ${path}`);
    return;
  }
  writeFileSync(path, contents, { mode: 0o600 });
}

function q(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function fq(schema, name) {
  return `${q(schema)}.${q(name)}`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowMap(rows, key) {
  return new Map((rows ?? []).map((row) => [key(row), row]));
}

function groupBy(values, key) {
  const grouped = new Map();
  for (const valueToGroup of values) {
    const identity = key(valueToGroup);
    const group = grouped.get(identity);
    if (group) group.push(valueToGroup);
    else grouped.set(identity, [valueToGroup]);
  }
  return grouped;
}

function category(catalog, name) {
  return catalog.categories[name] ?? [];
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

function assertAuthorityIntegrity({ current, publicCurrent, privateAuthority, privateAuthorityText }) {
  const actualCombinedDigest = sha256(json(current.categories ?? {}));
  if (current.provenance?.combinedCatalogDigestSha256 !== actualCombinedDigest) {
    throw new Error("authoritative current catalog combined digest does not match its categories");
  }

  const actualPrivateAuthorityDigest = sha256(privateAuthorityText);
  if (current.provenance?.privateAuthoritySha256 !== actualPrivateAuthorityDigest) {
    throw new Error("authoritative current catalog does not bind the exact private-authority fixture");
  }
  if (
    current.provenance?.privatePassSha256 !== privateAuthority.provenance?.passSha256
    || current.provenance?.privatePassesByteIdentical !== true
    || privateAuthority.provenance?.passesByteIdentical !== true
  ) {
    throw new Error("authoritative current/private capture-pass provenance is inconsistent");
  }
  if (
    !/^[a-f0-9]{64}$/.test(publicCurrent.provenance?.remoteCaptureDigestSha256 ?? "")
    || current.provenance?.remoteCaptureDigestSha256
      !== publicCurrent.provenance.remoteCaptureDigestSha256
  ) {
    throw new Error("authoritative current/public capture provenance is inconsistent");
  }

  const expectedCombinedCategories = mergedAuthorityCategories(publicCurrent, privateAuthority);
  if (json(current.categories ?? {}) !== json(expectedCombinedCategories)) {
    throw new Error("authoritative current catalog is not the exact public/private fixture composition");
  }
}

function columnSql(column) {
  let output = `${q(column.column_name)} ${column.formatted_type}`;
  if (column.collation_schema && column.collation_name && column.collation_schema !== "pg_catalog") {
    output += ` COLLATE ${fq(column.collation_schema, column.collation_name)}`;
  }
  if (column.generated_kind === "s") {
    output += ` GENERATED ALWAYS AS (${column.default_or_generation_expression}) STORED`;
  } else if (column.identity_kind === "a") {
    output += " GENERATED ALWAYS AS IDENTITY";
  } else if (column.identity_kind === "d") {
    output += " GENERATED BY DEFAULT AS IDENTITY";
  } else if (column.has_default_or_generation && column.default_or_generation_expression != null) {
    output += ` DEFAULT ${column.default_or_generation_expression}`;
  }
  if (column.not_null) output += " NOT NULL";
  return output;
}

function policySql(policy, roles) {
  const commands = { "*": "ALL", r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
  const roleSql = roles.length ? roles.map((role) => role === "PUBLIC" ? "PUBLIC" : q(role)).join(", ") : "PUBLIC";
  const parts = [
    `CREATE POLICY ${q(policy.policy_name)} ON ${fq(policy.table_schema, policy.table_name)}`,
    policy.permissive ? "AS PERMISSIVE" : "AS RESTRICTIVE",
    `FOR ${commands[policy.command_code]}`,
    `TO ${roleSql}`,
  ];
  if (policy.using_expression != null) parts.push(`USING (${policy.using_expression})`);
  if (policy.with_check_expression != null) parts.push(`WITH CHECK (${policy.with_check_expression})`);
  return `${parts.join("\n  ")};`;
}

function migrationBucket(objectName, subobjectName = "") {
  const valueToMatch = `${objectName}.${subobjectName}`;
  if (objectName === "partners" || objectName.startsWith("partner_")) {
    return PARTNER_FOUNDATION_VERSION;
  }
  if (subobjectName === "partner_id" || /partner_id/.test(subobjectName)) {
    return PARTNER_FOUNDATION_VERSION;
  }
  const rules = [
    [/activation_event/, "20260504183000"],
    [/campaign_value_report/, "20260504190000"],
    [/billing_cancellation_intent/, "20260504203000"],
    [/customer_success_checklist/, "20260504210000"],
    [/client_error_event/, "20260504223000"],
    [/(meta_sync|optimization|campaign_sync|campaign_performance|recommendation|insight)/, "20260509020000"],
    [/(generation_credit|user_credit).*(overdraft|balance)|overdraft/, "20260510014500"],
    [/(provider_usage|idempotency)/, "20260512010000"],
    [/scale_monitor_incident/, "20260519023000"],
    [/autonomy_/, "20260519033000"],
    [/single_campaign/, "20260529230000"],
    [/lead_billing_event/, "20260530170000"],
    [/(partner_|white_label|branding)/, "20260531160000"],
    [/(immediate_charge|charge_status|lead_charge)/, "20260604120000"],
    [/(lead_capture_strategy|lead_capture_goal|capture_method|capture_strategy)/, "20260605210000"],
    [/(workspace_ghl_mapping|partner_ghl_config|ghl_sync)/, "20260614193000"],
    [/(ghl_provision|provisioning)/, "20260615100000"],
  ];
  return rules.find(([pattern]) => pattern.test(valueToMatch))?.[1] ?? "20260615100000";
}

function laterVersion(...versions) {
  return versions.filter(Boolean).sort().at(-1);
}

function referencedObjectVersions(text, tableVersions) {
  const versions = [];
  for (const [table, version] of tableVersions) {
    if (new RegExp(`(?:public\\.)?"?${table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?`, "i").test(text ?? "")) {
      versions.push(version);
    }
  }
  return versions;
}

function referencesSealedJulyObject(text) {
  const source = String(text ?? "");
  return [...JULY_SEALED_TABLES].some((table) =>
    new RegExp(`(?:public\\.)?"?${table}"?`, "i").test(source));
}

function addStatement(buckets, version, phase, sql) {
  buckets.get(version)[phase].push(sql);
}

function addFreshReplayCatalogConvergence(buckets, currentColumns, currentConstraints, current) {
  const version = "20260504183000";
  const corrections = [
    ["rate_limit_buckets", "request_count", null, true],
    ["rate_limit_buckets", "updated_at", "timezone('utc'::text, now())", true],
    ["stripe_webhook_events", "stripe_event_type", null, false],
    ["stripe_webhook_events", "status", null, false],
    ["stripe_webhook_events", "created_at", "now()", false],
  ];
  for (const [table, column, expectedDefault, expectedNotNull] of corrections) {
    const authority = currentColumns.get(`public.${table}.${column}`);
    if (!authority) throw new Error(`fresh replay convergence authority is missing public.${table}.${column}`);
    if (
      authority.default_or_generation_expression !== expectedDefault
      || authority.not_null !== expectedNotNull
    ) {
      throw new Error(`fresh replay convergence authority drift: public.${table}.${column}`);
    }
    addStatement(
      buckets,
      version,
      "columns",
      expectedDefault == null
        ? `ALTER TABLE ${fq("public", table)} ALTER COLUMN ${q(column)} DROP DEFAULT;`
        : `ALTER TABLE ${fq("public", table)} ALTER COLUMN ${q(column)} SET DEFAULT ${expectedDefault};`,
    );
    addStatement(
      buckets,
      version,
      "columns",
      `ALTER TABLE ${fq("public", table)} ALTER COLUMN ${q(column)} ${expectedNotNull ? "SET" : "DROP"} NOT NULL;`,
    );
  }
  for (const constraint of [
    "stripe_webhook_events_status_check",
    "stripe_webhook_events_organization_id_fkey",
  ]) {
    const identity = `public.stripe_webhook_events.${constraint}`;
    if (currentConstraints.has(identity)) {
      throw new Error(`fresh replay convergence expected authority to omit ${identity}`);
    }
    addStatement(
      buckets,
      version,
      "constraints",
      `ALTER TABLE ${fq("public", "stripe_webhook_events")} DROP CONSTRAINT IF EXISTS ${q(constraint)};`,
    );
  }
  const policyRoles = groupBy(category(current, "12b_policy_roles"), (row) =>
    `${row.table_schema}.${row.table_name}.${row.policy_name}`);
  const policies = rowMap(category(current, "12a_policies"), (row) =>
    `${row.table_schema}.${row.table_name}.${row.policy_name}`);
  for (const identity of [
    "public.rate_limit_buckets.rate_limit_buckets_deny_all",
    "public.service_types.service_types_member_access",
  ]) {
    const policy = policies.get(identity);
    if (!policy) throw new Error(`fresh replay convergence authority is missing ${identity}`);
    const roles = (policyRoles.get(identity) ?? []).map((row) => row.role_name);
    if (roles.length !== 1 || roles[0] !== "PUBLIC") {
      throw new Error(`fresh replay convergence policy-role drift: ${identity}`);
    }
    addStatement(
      buckets,
      version,
      "controls",
      `DROP POLICY IF EXISTS ${q(policy.policy_name)} ON ${fq(policy.table_schema, policy.table_name)};`,
    );
    addStatement(buckets, version, "controls", policySql(policy, roles));
  }
  const postgresPublicUsage = category(current, "13a_schema_grants").filter((row) =>
    row.schema_name === "public"
    && row.grantee_name === "postgres"
    && row.grantor_name === "pg_database_owner"
    && row.privilege_type === "USAGE");
  if (postgresPublicUsage.length !== 1) {
    throw new Error(`fresh replay convergence schema-grant authority drift: ${postgresPublicUsage.length}`);
  }
  addStatement(
    buckets,
    version,
    "grants",
    "SET ROLE pg_database_owner; GRANT USAGE ON SCHEMA public TO postgres; SET ROLE postgres;",
  );
  const unexpectedRateLimitApiGrants = category(current, "13b_relation_grants").filter((row) =>
    row.schema_name === "public"
    && row.object_name === "rate_limit_buckets"
    && ["anon", "authenticated"].includes(row.grantee_name));
  if (unexpectedRateLimitApiGrants.length !== 0) {
    throw new Error("fresh replay convergence expected rate_limit_buckets to deny API-role relation grants");
  }
  addStatement(
    buckets,
    version,
    "grants",
    "REVOKE ALL PRIVILEGES ON TABLE public.rate_limit_buckets FROM anon, authenticated;",
  );
  const unexpectedPartnerMemberRoutineGrants = category(current, "13d_routine_grants").filter((row) =>
    row.schema_name === "public"
    && row.object_name === "is_current_user_partner_member"
    && row.routine_identity_arguments === "p_partner_id uuid"
    && ["PUBLIC", "anon"].includes(row.grantee_name));
  if (unexpectedPartnerMemberRoutineGrants.length !== 0) {
    throw new Error("fresh replay convergence expected partner membership helper to deny PUBLIC/anon execution");
  }
  addStatement(
    buckets,
    PARTNER_FOUNDATION_VERSION,
    "grants",
    "REVOKE EXECUTE ON FUNCTION public.is_current_user_partner_member(uuid) FROM PUBLIC, anon;",
  );
}

function constraintCreationPriority(constraint) {
  // PostgreSQL requires the referenced PRIMARY KEY/UNIQUE constraint to exist
  // before a FOREIGN KEY can be added.  The catalog authority is sorted for
  // deterministic capture, not executable dependency order, so impose the
  // latter explicitly when rendering a fresh foundation.
  if (constraint.constraint_kind === "p" || constraint.constraint_kind === "u") return 0;
  if (constraint.constraint_kind === "x") return 1;
  if (constraint.constraint_kind === "c") return 2;
  if (constraint.constraint_kind === "f") return 3;
  return 4;
}

function renderedConstraintStatementPriority(statement) {
  if (/\bDROP\s+CONSTRAINT\b/i.test(statement)) return 0;
  if (/\bADD\s+CONSTRAINT\b[\s\S]*\b(?:PRIMARY\s+KEY|UNIQUE)\b/i.test(statement)) return 1;
  if (/\bADD\s+CONSTRAINT\b[\s\S]*\bEXCLUDE\b/i.test(statement)) return 2;
  if (/\bADD\s+CONSTRAINT\b[\s\S]*\bCHECK\b/i.test(statement)) return 3;
  if (/\bADD\s+CONSTRAINT\b[\s\S]*\bFOREIGN\s+KEY\b/i.test(statement)) return 4;
  return 5;
}

const FIRST_STRUCTURAL_RECONSTRUCTION_VERSION = MISSING.find(
  (record) => !DATA_ONLY.has(record.version),
).version;

function addAdoptionPrecondition(buckets, targetVersion, sql) {
  addStatement(buckets, FIRST_STRUCTURAL_RECONSTRUCTION_VERSION, "preconditions", sql);
  if (targetVersion !== FIRST_STRUCTURAL_RECONSTRUCTION_VERSION) {
    addStatement(buckets, targetVersion, "preconditions", sql);
  }
}

function columnSemanticFingerprint(column, ordinalPosition) {
  return {
    array_dimensions: column.array_dimensions,
    collation_name: column.collation_name,
    collation_schema: column.collation_schema,
    column_acl_present: column.column_acl_present,
    column_options: column.column_options,
    compression_method: column.compression_method,
    default_or_generation_expression: column.default_or_generation_expression,
    formatted_type: column.formatted_type,
    generated_kind: column.generated_kind,
    has_default_or_generation: column.has_default_or_generation,
    identity_kind: column.identity_kind,
    inheritance_count: column.inheritance_count,
    locally_defined: column.locally_defined,
    not_null: column.not_null,
    ordinal_position: ordinalPosition,
    relation_kind: column.relation_kind,
    storage_strategy: column.storage_strategy,
  };
}

function actualColumnFingerprintSql(alias) {
  return `jsonb_build_object(
        'array_dimensions', ${alias}.attndims,
        'collation_name', collation_record.collname,
        'collation_schema', collation_namespace.nspname,
        'column_acl_present', ${alias}.attacl IS NOT NULL,
        'column_options', to_jsonb(${alias}.attoptions),
        'compression_method', ${alias}.attcompression,
        'default_or_generation_expression', pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false),
        'formatted_type', pg_catalog.format_type(${alias}.atttypid, ${alias}.atttypmod),
        'generated_kind', ${alias}.attgenerated,
        'has_default_or_generation', ${alias}.atthasdef,
        'identity_kind', ${alias}.attidentity,
        'inheritance_count', ${alias}.attinhcount,
        'locally_defined', ${alias}.attislocal,
        'not_null', ${alias}.attnotnull,
        'ordinal_position', ${alias}.dense_ordinal_position,
        'relation_kind', relation_record.relkind,
        'storage_strategy', ${alias}.attstorage
      )`;
}

function tableSemanticFingerprint(table) {
  return {
    default_partition_name: table.default_partition_name,
    default_partition_schema: table.default_partition_schema,
    has_rules: table.has_rules,
    is_partition: table.is_partition,
    owner_name: table.owner_name,
    parent_schema: table.parent_schema,
    parent_table: table.parent_table,
    partition_bound: table.partition_bound,
    partition_key: table.partition_key,
    partition_strategy: table.partition_strategy,
    persistence: table.persistence,
    relation_kind: table.relation_kind,
    relation_options: Array.isArray(table.relation_options)
      ? [...table.relation_options].sort()
      : table.relation_options,
    replica_identity: table.replica_identity,
  };
}

function actualTableFingerprintSql(alias) {
  return `jsonb_build_object(
        'default_partition_name', (
          SELECT default_relation.relname
          FROM pg_catalog.pg_partitioned_table partitioned_record
          JOIN pg_catalog.pg_class default_relation ON default_relation.oid=partitioned_record.partdefid
          WHERE partitioned_record.partrelid=${alias}.oid
        ),
        'default_partition_schema', (
          SELECT default_namespace.nspname
          FROM pg_catalog.pg_partitioned_table partitioned_record
          JOIN pg_catalog.pg_class default_relation ON default_relation.oid=partitioned_record.partdefid
          JOIN pg_catalog.pg_namespace default_namespace ON default_namespace.oid=default_relation.relnamespace
          WHERE partitioned_record.partrelid=${alias}.oid
        ),
        'has_rules', ${alias}.relhasrules,
        'is_partition', ${alias}.relispartition,
        'owner_name', pg_catalog.pg_get_userbyid(${alias}.relowner),
        'parent_schema', (
          SELECT parent_namespace.nspname
          FROM pg_catalog.pg_inherits inheritance_record
          JOIN pg_catalog.pg_class parent_relation ON parent_relation.oid=inheritance_record.inhparent
          JOIN pg_catalog.pg_namespace parent_namespace ON parent_namespace.oid=parent_relation.relnamespace
          WHERE inheritance_record.inhrelid=${alias}.oid
          ORDER BY inheritance_record.inhseqno
          LIMIT 1
        ),
        'parent_table', (
          SELECT parent_relation.relname
          FROM pg_catalog.pg_inherits inheritance_record
          JOIN pg_catalog.pg_class parent_relation ON parent_relation.oid=inheritance_record.inhparent
          WHERE inheritance_record.inhrelid=${alias}.oid
          ORDER BY inheritance_record.inhseqno
          LIMIT 1
        ),
        'partition_bound', pg_catalog.pg_get_expr(${alias}.relpartbound, ${alias}.oid, false),
        'partition_key', pg_catalog.pg_get_partkeydef(${alias}.oid),
        'partition_strategy', (
          SELECT partitioned_record.partstrat::text
          FROM pg_catalog.pg_partitioned_table partitioned_record
          WHERE partitioned_record.partrelid=${alias}.oid
        ),
        'persistence', ${alias}.relpersistence,
        'relation_kind', ${alias}.relkind,
        'relation_options', (
          SELECT jsonb_agg(option_value ORDER BY option_value)
          FROM unnest(${alias}.reloptions) option_value
        ),
        'replica_identity', ${alias}.relreplident
      )`;
}

function tableAdoptionPrecondition(table, allColumns, requiredColumns) {
  const ordered = [...allColumns].sort((left, right) => left.ordinal_position - right.ordinal_position);
  const expectedColumns = Object.fromEntries(ordered.map((column, index) => [
    column.column_name,
    columnSemanticFingerprint(column, index + 1),
  ]));
  const tag = `dealflow_table_guard_${table.table_name}`;
  return `DO $${tag}$
DECLARE
  expected_table jsonb := ${dollarJson(tableSemanticFingerprint(table), `${tag}_table`)}::jsonb;
  expected_columns jsonb := ${dollarJson(expectedColumns, `${tag}_columns`)}::jsonb;
  required_columns jsonb := ${dollarJson(requiredColumns.map((column) => column.column_name), `${tag}_required`)}::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass(${sqlLiteral(`${table.table_schema}.${table.table_name}`)}) IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname=${sqlLiteral(table.table_schema)}
      AND relation_record.relname=${sqlLiteral(table.table_name)}
      AND ${actualTableFingerprintSql("relation_record")} IS NOT DISTINCT FROM expected_table
  ) THEN
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', ${sqlLiteral(table.table_schema)}, ${sqlLiteral(table.table_name)} USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid=${sqlLiteral(`${table.table_schema}.${table.table_name}`)}::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid=${sqlLiteral(`${table.table_schema}.${table.table_name}`)}::regclass
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    ) column_record
    JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
    LEFT JOIN pg_catalog.pg_attrdef default_record
      ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
    LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
    LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
    WHERE NOT (expected_columns ? column_record.attname)
       OR (expected_columns -> column_record.attname) - 'ordinal_position'
          IS DISTINCT FROM (${actualColumnFingerprintSql("column_record")}) - 'ordinal_position'
       OR (
         live_column_count=(SELECT count(*) FROM jsonb_object_keys(expected_columns))
         AND expected_columns -> column_record.attname -> 'ordinal_position'
             IS DISTINCT FROM to_jsonb(column_record.dense_ordinal_position)
       )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(required_columns) AS required_column(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid=${sqlLiteral(`${table.table_schema}.${table.table_name}`)}::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', ${sqlLiteral(table.table_schema)}, ${sqlLiteral(table.table_name)} USING ERRCODE='55000';
  END IF;
END
$${tag}$;`;
}

function columnAdoptionPrecondition(column, denseOrdinalPosition) {
  const tag = `dealflow_column_guard_${column.relation_name}_${column.column_name}`;
  const expected = columnSemanticFingerprint(column, denseOrdinalPosition);
  return `DO $${tag}$
DECLARE
  expected_column jsonb := ${dollarJson(expected, `${tag}_expected`)}::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass(${sqlLiteral(`${column.relation_schema}.${column.relation_name}`)}) IS NULL THEN
    RETURN;
  END IF;
  SELECT ${actualColumnFingerprintSql("column_record")} INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid=${sqlLiteral(`${column.relation_schema}.${column.relation_name}`)}::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname=${sqlLiteral(column.column_name)};
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', ${sqlLiteral(column.relation_name)}, ${sqlLiteral(column.column_name)} USING ERRCODE='55000';
  END IF;
END
$${tag}$;`;
}

function indexAdoptionPrecondition(index) {
  const tag = `dealflow_index_guard_${index.index_name}`;
  return `DO $${tag}$
BEGIN
  IF to_regclass(${sqlLiteral(`${index.index_schema}.${index.index_name}`)}) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname=${sqlLiteral(index.index_schema)}
      AND index_record.relname=${sqlLiteral(index.index_name)}
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)=${sqlLiteral(index.index_definition)}
      AND index_state.indisvalid IS ${index.valid ? "TRUE" : "FALSE"}
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', ${sqlLiteral(index.index_schema)}, ${sqlLiteral(index.index_name)} USING ERRCODE='55000';
  END IF;
END
$${tag}$;`;
}

function buildDeltaMigrations(baseline, current) {
  const buckets = new Map(MISSING.map(({ version }) => [version, {
    preconditions: [], types: [], tables: [], columns: [], routines: [], constraints: [], indexes: [], controls: [], grants: [], postconditions: [],
  }]));
  const baselineTables = rowMap(
    category(baseline, "04_tables").filter((row) => REPLAY_BASELINE_TABLES.has(row.table_name)),
    (row) => `${row.table_schema}.${row.table_name}`,
  );
  const currentTables = rowMap(category(current, "04_tables").filter((row) => !JULY_SEALED_TABLES.has(row.table_name)), (row) => `${row.table_schema}.${row.table_name}`);
  const baselineColumns = rowMap(
    category(baseline, "05_columns").filter((row) => REPLAY_BASELINE_TABLES.has(row.relation_name)),
    (row) => `${row.relation_schema}.${row.relation_name}.${row.column_name}`,
  );
  const currentColumns = rowMap(category(current, "05_columns").filter((row) => !JULY_SEALED_TABLES.has(row.relation_name)), (row) => `${row.relation_schema}.${row.relation_name}.${row.column_name}`);
  const baselineConstraints = rowMap(
    category(baseline, "06a_constraints").filter((row) => REPLAY_BASELINE_TABLES.has(row.table_name)),
    (row) => `${row.table_schema}.${row.table_name}.${row.constraint_name}`,
  );
  const currentConstraints = rowMap(category(current, "06a_constraints").filter((row) => !JULY_SEALED_TABLES.has(row.table_name)), (row) => `${row.table_schema}.${row.table_name}.${row.constraint_name}`);
  const baselineIndexes = rowMap(
    category(baseline, "07_indexes").filter((row) => REPLAY_BASELINE_TABLES.has(row.table_name)),
    (row) => `${row.index_schema}.${row.index_name}`,
  );
  const currentIndexes = rowMap(category(current, "07_indexes").filter((row) => !JULY_SEALED_TABLES.has(row.table_name)), (row) => `${row.index_schema}.${row.index_name}`);
  const currentColumnsByTable = groupBy(currentColumns.values(), (row) => `${row.relation_schema}.${row.relation_name}`);
  const denseColumnOrdinals = new Map();
  for (const rows of currentColumnsByTable.values()) {
    [...rows]
      .sort((left, right) => left.ordinal_position - right.ordinal_position)
      .forEach((column, index) => {
        denseColumnOrdinals.set(
          `${column.relation_schema}.${column.relation_name}.${column.column_name}`,
          index + 1,
        );
      });
  }
  const tableVersions = new Map([...currentTables.values()].map((table) => [
    table.table_name,
    baselineTables.has(`${table.table_schema}.${table.table_name}`) ? null : migrationBucket(table.table_name),
  ]));

  const currentEnums = groupBy(category(current, "03b_enum_labels"), (row) => `${row.type_schema}.${row.type_name}`);
  const baselineEnums = new Set(category(baseline, "03b_enum_labels").map((row) => `${row.type_schema}.${row.type_name}`));
  for (const [identity, labels] of currentEnums) {
    if (baselineEnums.has(identity)) continue;
    const [schema, name] = identity.split(".");
    const version = migrationBucket(name);
    const enumLabels = labels.map((row) => `'${row.enum_label.replaceAll("'", "''")}'`).join(", ");
    const enumGuard = `DO $dealflow_enum_precondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_type type_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=type_record.typnamespace
    WHERE namespace_record.nspname=${sqlLiteral(schema)} AND type_record.typname=${sqlLiteral(name)}
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_type type_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=type_record.typnamespace
    WHERE namespace_record.nspname=${sqlLiteral(schema)} AND type_record.typname=${sqlLiteral(name)}
      AND type_record.typtype='e'
      AND (
        SELECT array_agg(enum_record.enumlabel ORDER BY enum_record.enumsortorder)
        FROM pg_catalog.pg_enum enum_record
        WHERE enum_record.enumtypid=type_record.oid
      ) = ARRAY[${enumLabels}]::text[]
  ) THEN
    RAISE EXCEPTION 'forward enum adoption mismatch: %.%', ${sqlLiteral(schema)}, ${sqlLiteral(name)} USING ERRCODE='55000';
  END IF;
END
$dealflow_enum_precondition$;`;
    addAdoptionPrecondition(buckets, version, enumGuard);
    addStatement(buckets, version, "types", `DO $dealflow_enum_adoption$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_type type_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=type_record.typnamespace
    WHERE namespace_record.nspname=${sqlLiteral(schema)} AND type_record.typname=${sqlLiteral(name)}
  ) THEN
    CREATE TYPE ${fq(schema, name)} AS ENUM (${enumLabels});
  END IF;
END
$dealflow_enum_adoption$;`);
  }

  for (const [identity, table] of currentTables) {
    if (baselineTables.has(identity)) continue;
    const version = migrationBucket(table.table_name);
    const columns = [...(currentColumnsByTable.get(identity) ?? [])]
      .filter((column) => !(
        column.column_name === "partner_id"
        && version < PARTNER_FOUNDATION_VERSION
        && table.table_name !== "lead_billing_events"
      ))
      .sort((a, b) => a.ordinal_position - b.ordinal_position);
    addAdoptionPrecondition(
      buckets,
      version,
      tableAdoptionPrecondition(table, currentColumnsByTable.get(identity) ?? [], columns),
    );
    addStatement(buckets, version, "tables", `CREATE TABLE IF NOT EXISTS ${fq(table.table_schema, table.table_name)} (\n  ${columns.map(columnSql).join(",\n  ")}\n);`);
  }

  // The sealed tracked chain predates a small set of authority-proven catalog
  // corrections that were present by the captured May-2/current shapes.  Emit
  // idempotent forward convergence instead of pretending those historical SQL
  // bodies were recovered.
  addFreshReplayCatalogConvergence(buckets, currentColumns, currentConstraints, current);

  for (const [identity, column] of currentColumns) {
    const baselineColumn = baselineColumns.get(identity);
    const tableIdentity = `${column.relation_schema}.${column.relation_name}`;
    const version = migrationBucket(column.relation_name, column.column_name);
    if (!baselineTables.has(tableIdentity)) {
      const tableVersion = tableVersions.get(column.relation_name);
      const columnVersion = migrationBucket(column.relation_name, column.column_name);
      if (tableVersion && columnVersion > tableVersion) {
        addAdoptionPrecondition(
          buckets,
          columnVersion,
          columnAdoptionPrecondition(column, denseColumnOrdinals.get(identity)),
        );
        addStatement(buckets, columnVersion, "columns", `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ADD COLUMN IF NOT EXISTS ${columnSql(column)};`);
      }
      continue;
    }
    if (!baselineColumn) {
      addAdoptionPrecondition(
        buckets,
        version,
        columnAdoptionPrecondition(column, denseColumnOrdinals.get(identity)),
      );
      addStatement(buckets, version, "columns", `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ADD COLUMN IF NOT EXISTS ${columnSql(column)};`);
      continue;
    }
    if (baselineColumn.formatted_type !== column.formatted_type) {
      addStatement(buckets, version, "columns", `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ALTER COLUMN ${q(column.column_name)} TYPE ${column.formatted_type} USING ${q(column.column_name)}::${column.formatted_type};`);
    }
    if (baselineColumn.default_or_generation_expression !== column.default_or_generation_expression && !column.generated_kind && !column.identity_kind) {
      addStatement(buckets, version, "columns", column.default_or_generation_expression == null
        ? `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ALTER COLUMN ${q(column.column_name)} DROP DEFAULT;`
        : `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ALTER COLUMN ${q(column.column_name)} SET DEFAULT ${column.default_or_generation_expression};`);
    }
    if (baselineColumn.not_null !== column.not_null) {
      addStatement(buckets, version, "columns", `ALTER TABLE ${fq(column.relation_schema, column.relation_name)} ALTER COLUMN ${q(column.column_name)} ${column.not_null ? "SET" : "DROP"} NOT NULL;`);
    }
  }

  for (const [identity, constraint] of baselineConstraints) {
    if (currentConstraints.has(identity)) continue;
    const version = laterVersion(migrationBucket(constraint.table_name, constraint.constraint_name), tableVersions.get(constraint.table_name));
    addStatement(buckets, version, "constraints", `ALTER TABLE ${fq(constraint.table_schema, constraint.table_name)} DROP CONSTRAINT IF EXISTS ${q(constraint.constraint_name)};`);
  }
  for (const [identity, constraint] of currentConstraints) {
    const before = baselineConstraints.get(identity);
    if (before?.constraint_definition === constraint.constraint_definition && before.validated === constraint.validated) continue;
    const version = laterVersion(
      migrationBucket(constraint.table_name, constraint.constraint_name),
      tableVersions.get(constraint.table_name),
      constraint.referenced_table_name ? tableVersions.get(constraint.referenced_table_name) : null,
    );
    if (before) addStatement(buckets, version, "constraints", `ALTER TABLE ${fq(constraint.table_schema, constraint.table_name)} DROP CONSTRAINT IF EXISTS ${q(constraint.constraint_name)};`);
    const validation = constraint.validated ? "" : " NOT VALID";
    addStatement(buckets, version, "constraints", `DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid=${sqlLiteral(`${constraint.table_schema}.${constraint.table_name}`)}::regclass
    AND constraint_record.conname=${sqlLiteral(constraint.constraint_name)};
  IF existing_definition IS NULL THEN
    ALTER TABLE ${fq(constraint.table_schema, constraint.table_name)} ADD CONSTRAINT ${q(constraint.constraint_name)} ${constraint.constraint_definition}${validation};
  ELSIF existing_definition IS DISTINCT FROM ${sqlLiteral(constraint.constraint_definition)}
     OR existing_validated IS DISTINCT FROM ${constraint.validated ? "true" : "false"} THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', ${sqlLiteral(constraint.table_name)}, ${sqlLiteral(constraint.constraint_name)} USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;`);
  }

  const constraintIndexNames = new Set([...currentConstraints.values()].map((row) => `${row.constraint_schema}.${row.constraint_name}`));
  for (const [identity, index] of baselineIndexes) {
    if (currentIndexes.has(identity) || constraintIndexNames.has(identity)) continue;
    addStatement(buckets, laterVersion(migrationBucket(index.table_name, index.index_name), tableVersions.get(index.table_name)), "indexes", `DROP INDEX IF EXISTS ${fq(index.index_schema, index.index_name)};`);
  }
  for (const [identity, index] of currentIndexes) {
    if (constraintIndexNames.has(identity)) continue;
    const before = baselineIndexes.get(identity);
    if (before?.index_definition === index.index_definition) continue;
    const version = laterVersion(migrationBucket(index.table_name, index.index_name), tableVersions.get(index.table_name));
    if (before) addStatement(buckets, version, "indexes", `DROP INDEX IF EXISTS ${fq(index.index_schema, index.index_name)};`);
    if (!before) {
      addAdoptionPrecondition(buckets, version, indexAdoptionPrecondition(index));
    }
    addStatement(buckets, version, "indexes", `${index.index_definition.replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS ").replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ")};`);
  }

  const baselineRoutines = rowMap(
    category(baseline, "10a_routines").filter((row) => SEALED_EARLY_ROUTINES.has(row.routine_name)),
    (row) => `${row.routine_schema}.${row.routine_name}(${row.identity_arguments})`,
  );
  const currentRoutines = rowMap(
    category(current, "10a_routines").filter((row) =>
      row.routine_schema !== "private" && !referencesSealedJulyObject(row.routine_definition)),
    (row) => `${row.routine_schema}.${row.routine_name}(${row.identity_arguments})`,
  );
  for (const [identity, routine] of currentRoutines) {
    if (baselineRoutines.get(identity)?.routine_definition === routine.routine_definition) continue;
    const version = laterVersion(migrationBucket(routine.routine_name), ...referencedObjectVersions(routine.routine_definition, tableVersions));
    addStatement(buckets, version, "routines", `${routine.routine_definition.trim()};`);
  }

  const policyRoles = (catalog) => groupBy(category(catalog, "12b_policy_roles"), (row) => `${row.table_schema}.${row.table_name}.${row.policy_name}`);
  const baselinePolicyRoles = groupBy(
    category(baseline, "12b_policy_roles").filter((row) => REPLAY_BASELINE_TABLES.has(row.table_name)),
    (row) => `${row.table_schema}.${row.table_name}.${row.policy_name}`,
  );
  const currentPolicyRoles = policyRoles(current);
  const baselinePolicies = rowMap(
    category(baseline, "12a_policies").filter((row) => REPLAY_BASELINE_TABLES.has(row.table_name)),
    (row) => `${row.table_schema}.${row.table_name}.${row.policy_name}`,
  );
  const currentPolicies = rowMap(
    category(current, "12a_policies").filter((row) =>
      !JULY_SEALED_TABLES.has(row.table_name)
      && !referencesSealedJulyObject(`${row.using_expression ?? ""} ${row.with_check_expression ?? ""}`)),
    (row) => `${row.table_schema}.${row.table_name}.${row.policy_name}`,
  );
  const policyFingerprint = (policy, roles) => json({ policy, roles: (roles ?? []).map((row) => row.role_name) });
  for (const [identity, policy] of baselinePolicies) {
    if (currentPolicies.has(identity)) continue;
    addStatement(buckets, laterVersion(migrationBucket(policy.table_name, policy.policy_name), tableVersions.get(policy.table_name)), "controls", `DROP POLICY ${q(policy.policy_name)} ON ${fq(policy.table_schema, policy.table_name)};`);
  }
  for (const [identity, policy] of currentPolicies) {
    const before = baselinePolicies.get(identity);
    const roles = (currentPolicyRoles.get(identity) ?? []).map((row) => row.role_name);
    if (before && policyFingerprint(before, baselinePolicyRoles.get(identity)) === policyFingerprint(policy, currentPolicyRoles.get(identity))) continue;
    const version = laterVersion(
      migrationBucket(policy.table_name, policy.policy_name),
      tableVersions.get(policy.table_name),
      ...referencedObjectVersions(`${policy.using_expression ?? ""} ${policy.with_check_expression ?? ""}`, tableVersions),
    );
    addStatement(buckets, version, "controls", `DROP POLICY IF EXISTS ${q(policy.policy_name)} ON ${fq(policy.table_schema, policy.table_name)};`);
    addStatement(buckets, version, "controls", policySql(policy, roles));
  }

  const baselineTriggers = rowMap(
    category(baseline, "11_triggers").filter((row) => REPLAY_BASELINE_TABLES.has(row.relation_name)),
    (row) => `${row.relation_schema}.${row.relation_name}.${row.trigger_name}`,
  );
  const currentTriggers = rowMap(
    category(current, "11_triggers").filter((row) =>
      !JULY_SEALED_TABLES.has(row.relation_name) && !referencesSealedJulyObject(row.trigger_definition)),
    (row) => `${row.relation_schema}.${row.relation_name}.${row.trigger_name}`,
  );
  for (const [identity, trigger] of currentTriggers) {
    const before = baselineTriggers.get(identity);
    if (before?.trigger_definition === trigger.trigger_definition) continue;
    const version = laterVersion(migrationBucket(trigger.relation_name, trigger.trigger_name), tableVersions.get(trigger.relation_name));
    addStatement(buckets, version, "controls", `DROP TRIGGER IF EXISTS ${q(trigger.trigger_name)} ON ${fq(trigger.relation_schema, trigger.relation_name)};`);
    addStatement(buckets, version, "controls", `${trigger.trigger_definition};`);
  }

  for (const [identity, table] of currentTables) {
    const before = baselineTables.get(identity);
    if (!before || before.rls_enabled !== table.rls_enabled) {
      addStatement(buckets, laterVersion(migrationBucket(table.table_name), tableVersions.get(table.table_name)), "controls", `ALTER TABLE ${fq(table.table_schema, table.table_name)} ${table.rls_enabled ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY;`);
    }
    if (!before || before.force_rls !== table.force_rls) {
      addStatement(buckets, laterVersion(migrationBucket(table.table_name), tableVersions.get(table.table_name)), "controls", `ALTER TABLE ${fq(table.table_schema, table.table_name)} ${table.force_rls ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY;`);
    }
  }

  const grantsByTable = groupBy(category(current, "13b_relation_grants")
    .filter((row) => ["anon", "authenticated", "service_role"].includes(row.grantee_name)),
  (row) => `${row.schema_name}.${row.object_name}`);
  for (const [identity, table] of currentTables) {
    // Normalize every app-owned table in the final reconstructed tranche.  A
    // historical checkout can contain an otherwise compatible table whose ACL
    // was materialized under different default privileges.  Restricting this
    // step to newly-created tables left that upgrade path structurally correct
    // but permission-inexact.  Revoke only the API/public principals and then
    // restore the sealed authority grants; owner privileges remain untouched.
    const version = [...MISSING].reverse().find((record) => !DATA_ONLY.has(record.version)).version;
    addStatement(buckets, version, "grants", `REVOKE ALL PRIVILEGES ON TABLE ${fq(table.table_schema, table.table_name)} FROM PUBLIC, anon, authenticated, service_role;`);
    const byRole = groupBy(grantsByTable.get(identity) ?? [], (row) => row.grantee_name);
    for (const [role, rows] of byRole) {
      addStatement(buckets, version, "grants", `GRANT ${rows.map((row) => row.privilege_type).sort().join(", ")} ON TABLE ${fq(table.table_schema, table.table_name)} TO ${q(role)};`);
    }
  }

  const routineGrantRows = category(current, "13d_routine_grants")
    .filter((row) => row.schema_name === "public");
  if (routineGrantRows.some((row) => row.privilege_type !== "EXECUTE")) {
    throw new Error("routine-grant authority contains an unsupported privilege");
  }
  const routineGrants = groupBy(routineGrantRows, (row) =>
    `${row.schema_name}.${row.object_name}(${row.routine_identity_arguments})`);
  const finalStructuralVersion = [...MISSING].reverse()
    .find((record) => !DATA_ONLY.has(record.version)).version;
  for (const rows of routineGrants.values()) {
    const [routine] = rows;
    const routineIdentity = `${fq(routine.schema_name, routine.object_name)}(${routine.routine_identity_arguments})`;
    addStatement(
      buckets,
      finalStructuralVersion,
      "grants",
      `REVOKE ALL PRIVILEGES ON FUNCTION ${routineIdentity} FROM PUBLIC, anon, authenticated, service_role;`,
    );
    for (const role of [...new Set(rows.map((row) => row.grantee_name))]
      .filter((role) => role !== "postgres")
      .sort()) {
      addStatement(
        buckets,
        finalStructuralVersion,
        "grants",
        `GRANT EXECUTE ON FUNCTION ${routineIdentity} TO ${role === "PUBLIC" ? "PUBLIC" : q(role)};`,
      );
    }
  }

  return buckets;
}

function reconstructionHeader(record, classification = "FORWARD-EQUIVALENT RECONSTRUCTION") {
  return [
    `-- dealflow:migration classification=${classification.replaceAll(" ", "_")} remote_version=${record.version} remote_name=${record.name} original_body_status=NOT_RECOVERED authority_sha256=${REMOTE_CAPTURE_DIGEST}`,
    `-- ${classification}; ORIGINAL BODY NOT RECOVERED.`,
    `-- Remote lineage identity: ${record.version}_${record.name}.`,
    `-- Authoritative current-catalog capture: sha256:${REMOTE_CAPTURE_DIGEST}.`,
    "-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.",
    "-- It must never be represented as the historical SQL that originally ran.",
    "",
  ].join("\n");
}

function provenanceStatement(id, statement) {
  return `-- dealflow:statement id=${id} sha256=${sha256(statement)}\n${statement}`;
}

function statementPostcondition(statement) {
  const table = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?/i.exec(statement);
  if (table) return `to_regclass('public.${table[1]}') IS NOT NULL`;
  const column = /ALTER TABLE\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?([a-zA-Z0-9_]+)"?/i.exec(statement);
  if (column) return `EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.${column[1]}'::regclass AND attname='${column[2]}' AND attnum>0 AND NOT attisdropped)`;
  const constraint = /ALTER TABLE\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?.*?ADD CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?/is.exec(statement);
  if (constraint) return `EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.${constraint[1]}'::regclass AND conname='${constraint[2]}')`;
  const index = /CREATE(?: UNIQUE)? INDEX(?:\s+IF NOT EXISTS)?\s+"?([a-zA-Z0-9_]+)"?/i.exec(statement);
  if (index) return `to_regclass('public.${index[1]}') IS NOT NULL`;
  const policy = /CREATE POLICY\s+"?([^"\s]+)"?\s+ON\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?/i.exec(statement);
  if (policy) return `EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.${policy[2]}'::regclass AND polname='${policy[1].replaceAll("'", "''")}')`;
  const trigger = /CREATE(?: OR REPLACE)? TRIGGER\s+"?([a-zA-Z0-9_]+)"?\s+.*?ON\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?/is.exec(statement);
  if (trigger) return `EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.${trigger[2]}'::regclass AND tgname='${trigger[1]}' AND NOT tgisinternal)`;
  const routine = /CREATE OR REPLACE FUNCTION\s+(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?\s*\(/i.exec(statement);
  if (routine) return `EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='${routine[1]}')`;
  return null;
}

function renderExecutablePostconditions(record, statements) {
  const checks = statements.map(statementPostcondition).filter(Boolean);
  if (checks.length === 0) {
    return `DO $dealflow_postcondition_${record.version}$ BEGIN PERFORM 1; END $dealflow_postcondition_${record.version}$;`;
  }
  return `DO $dealflow_postcondition_${record.version}$\nBEGIN\n` + checks.map((check, index) =>
    `  IF NOT (${check}) THEN RAISE EXCEPTION '${record.version} postcondition ${index + 1} failed' USING ERRCODE='55000'; END IF;`,
  ).join("\n") + `\nEND\n$dealflow_postcondition_${record.version}$;`;
}

function renderDeltaMigration(record, phases) {
  if (DATA_ONLY.has(record.version)) {
    return `${reconstructionHeader(record, "TENANT-NEUTRAL FORWARD-EQUIVALENT DATA MIGRATION")}-- Intentional no-op: the unavailable original was data-only and tenant-specific.\n-- No customer, partner, credential, branding, or provider row is invented by reconstruction.\n-- dealflow:statement id=${record.version}.data_noop.001 sha256=${sha256("SELECT true AS tenant_neutral_noop;")}\nSELECT true AS tenant_neutral_noop;\n\n${renderExecutablePostconditions(record, [])}\n`;
  }
  const sections = Object.entries(phases)
    .map(([phase, statements]) => [
      phase,
      phase === "constraints"
        ? [...statements].sort((left, right) =>
          renderedConstraintStatementPriority(left) - renderedConstraintStatementPriority(right))
        : statements,
    ])
    .filter(([, statements]) => statements.length > 0);
  const flatStatements = sections
    .filter(([phase]) => phase !== "preconditions")
    .flatMap(([, statements]) => statements);
  const body = sections.length
    ? sections.map(([phase, statements]) => `-- ${phase}\n${statements.map((statement, index) =>
      `-- dealflow:statement id=${record.version}.${phase}.${String(index + 1).padStart(3, "0")} sha256=${sha256(statement)}\n${statement}`,
    ).join("\n\n")}`).join("\n\n")
    : `-- No unique DDL can be attributed to this unavailable body. Its forward-equivalent postconditions are emitted by the cumulative reconciliation files in this portfolio.\n-- dealflow:statement id=${record.version}.forward_noop.001 sha256=${sha256("SELECT true AS forward_equivalent_noop;")}\nSELECT true AS forward_equivalent_noop;`;
  return `${reconstructionHeader(record)}${body}\n\n${renderExecutablePostconditions(record, flatStatements)}\n`;
}

function renderFoundation(baseline) {
  const tables = category(baseline, "04_tables")
    .filter((row) => row.table_schema === "public" && FOUNDATION_TABLES.has(row.table_name))
    .sort((left, right) => left.table_name.localeCompare(right.table_name));
  if (tables.length !== FOUNDATION_TABLES.size) {
    throw new Error(`foundation authority mismatch: expected ${FOUNDATION_TABLES.size} tables, found ${tables.length}`);
  }
  const columnsByTable = groupBy(
    category(baseline, "05_columns").filter((row) =>
      row.relation_schema === "public" && FOUNDATION_TABLES.has(row.relation_name)),
    (row) => row.relation_name,
  );
  const constraints = category(baseline, "06a_constraints")
    .filter((row) => row.table_schema === "public" && FOUNDATION_TABLES.has(row.table_name))
    .filter((row) => !row.referenced_table_name
      || FOUNDATION_TABLES.has(row.referenced_table_name)
      || row.referenced_table_schema === "auth")
    .sort((left, right) =>
      constraintCreationPriority(left) - constraintCreationPriority(right)
      || `${left.table_name}.${left.constraint_name}`.localeCompare(`${right.table_name}.${right.constraint_name}`));
  const constraintIndexes = new Set(constraints.map((row) => `${row.constraint_schema}.${row.constraint_name}`));
  const indexes = category(baseline, "07_indexes")
    .filter((row) => row.table_schema === "public" && FOUNDATION_TABLES.has(row.table_name))
    .filter((row) => !constraintIndexes.has(`${row.index_schema}.${row.index_name}`))
    .sort((left, right) => left.index_name.localeCompare(right.index_name));
  const requiredFoundationRoutineIdentities = new Set([
    "public.is_org_member(org_id uuid)",
    "public.set_updated_at()",
  ]);
  const requiredFoundationRoutines = category(baseline, "10a_routines").filter((row) =>
    requiredFoundationRoutineIdentities.has(
      `${row.routine_schema}.${row.routine_name}(${row.identity_arguments})`,
    ));
  if (requiredFoundationRoutines.length !== requiredFoundationRoutineIdentities.size) {
    throw new Error(
      `foundation authority mismatch: expected ${requiredFoundationRoutineIdentities.size} required routines, found ${requiredFoundationRoutines.length}`,
    );
  }
  const requiredFoundationTriggers = category(baseline, "11_triggers")
    .filter((row) =>
      row.relation_schema === "public"
      && FOUNDATION_TABLES.has(row.relation_name)
      && row.function_schema === "public"
      && row.function_name === "set_updated_at")
    .sort((left, right) => left.trigger_name.localeCompare(right.trigger_name));
  if (requiredFoundationTriggers.length !== 6) {
    throw new Error(`foundation authority mismatch: expected 6 updated-at triggers, found ${requiredFoundationTriggers.length}`);
  }
  const tableArray = [...FOUNDATION_TABLES].sort().map((name) => `'${name}'`).join(", ");
  const createTables = tables.map((table) => {
    const columns = [...(columnsByTable.get(table.table_name) ?? [])]
      .sort((left, right) => left.ordinal_position - right.ordinal_position);
    if (columns.length === 0) throw new Error(`foundation table has no columns: ${table.table_name}`);
    const statement = `CREATE TABLE ${fq("public", table.table_name)} (\n  ${columns.map(columnSql).join(",\n  ")}\n);`;
    return provenanceStatement(`${FOUNDATION.version}.foundation.table.${table.table_name}`, statement);
  }).join("\n\n");
  const createConstraints = constraints.map((constraint) => {
    const statement = `ALTER TABLE ${fq(constraint.table_schema, constraint.table_name)} ADD CONSTRAINT ${q(constraint.constraint_name)} ${constraint.constraint_definition}${constraint.validated ? "" : " NOT VALID"};`;
    return provenanceStatement(`${FOUNDATION.version}.foundation.constraint.${constraint.table_name}.${constraint.constraint_name}`, statement);
  }).join("\n\n");
  const createIndexes = indexes.map((index) =>
    provenanceStatement(`${FOUNDATION.version}.foundation.index.${index.index_name}`, `${index.index_definition};`),
  ).join("\n\n");
  const createRequiredFoundationRoutines = [
    ...requiredFoundationRoutines
      .sort((left, right) => left.routine_name.localeCompare(right.routine_name))
      .map((routine) => provenanceStatement(
        `${FOUNDATION.version}.foundation.routine.public.${routine.routine_name}`,
        `${routine.routine_definition.trim()};`,
      )),
    provenanceStatement(
      `${FOUNDATION.version}.foundation.routine_grant.public.is_org_member.revoke`,
      "REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon, authenticated;",
    ),
    provenanceStatement(
      `${FOUNDATION.version}.foundation.routine_grant.public.is_org_member.service_role`,
      "GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO service_role;",
    ),
  ].join("\n\n");
  const createRequiredFoundationTriggers = requiredFoundationTriggers.map((trigger) =>
    provenanceStatement(
      `${FOUNDATION.version}.foundation.trigger.${trigger.trigger_name}`,
      `${trigger.trigger_definition};`,
    )).join("\n\n");
  const rls = tables.flatMap((table) => [
    table.rls_enabled ? provenanceStatement(`${FOUNDATION.version}.foundation.rls.${table.table_name}.enable`, `ALTER TABLE ${fq("public", table.table_name)} ENABLE ROW LEVEL SECURITY;`) : "",
    table.force_rls ? provenanceStatement(`${FOUNDATION.version}.foundation.rls.${table.table_name}.force`, `ALTER TABLE ${fq("public", table.table_name)} FORCE ROW LEVEL SECURITY;`) : "",
  ].filter(Boolean)).join("\n");
  const guard =
`DO $dealflow_foundation_guard$
DECLARE collisions text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO collisions
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    AND c.relname = ANY (ARRAY[${tableArray}]::text[]);
  IF cardinality(collisions) > 0 THEN
    RAISE EXCEPTION 'DealFlow fresh foundation refused nonblank/partial application schema: %', collisions USING ERRCODE='55000';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'DealFlow fresh foundation requires Supabase auth.users' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('private.is_current_user_org_member(uuid)') IS NOT NULL OR to_regclass('public.partners') IS NOT NULL THEN
    RAISE EXCEPTION 'DealFlow fresh foundation chronology collision' USING ERRCODE='55000';
  END IF;
END
$dealflow_foundation_guard$;`;
  const postcondition =
`DO $dealflow_foundation_postcondition$
DECLARE actual_count integer;
BEGIN
  SELECT count(*) INTO actual_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY (ARRAY[${tableArray}]::text[]);
  IF actual_count <> 8 THEN RAISE EXCEPTION 'DealFlow foundation postcondition expected 8 tables, found %', actual_count USING ERRCODE='55000'; END IF;
  IF to_regprocedure('private.is_current_user_org_member(uuid)') IS NOT NULL OR to_regclass('public.partners') IS NOT NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition chronology failure' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.is_org_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing public membership helper' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing updated-at trigger helper' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger trigger_record
      JOIN pg_catalog.pg_class relation_record ON relation_record.oid=trigger_record.tgrelid
      JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
      WHERE namespace_record.nspname='public' AND NOT trigger_record.tgisinternal
        AND trigger_record.tgname = ANY (ARRAY[
          'set_leads_updated_at', 'set_marketing_accounts_updated_at', 'set_memberships_updated_at',
          'set_organizations_updated_at', 'set_service_types_updated_at', 'set_users_updated_at'
        ]::text[])) <> 6 THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing updated-at triggers' USING ERRCODE='55000';
  END IF;
END
$dealflow_foundation_postcondition$;`;
  return `${reconstructionHeader(FOUNDATION, "FRESH-ONLY MINIMAL FORWARD FOUNDATION")}` +
`-- Exactly eight pre-boundary dependency tables. This is not the rejected 41-table May-2 dump.\n` +
`-- Authority-proven public legacy membership and updated-at helpers are included because later policies/triggers depend on them.\n` +
`-- private.is_current_user_org_member and public.partners are intentionally absent here.\n` +
`-- Existing/current databases require the separate read-only adoption gate and must not execute this fresh-only DDL.\n` +
`${provenanceStatement(`${FOUNDATION.version}.foundation.guard`, guard)}\n\n` +
`${createTables}\n\n${createConstraints}\n\n${createIndexes}\n\n${createRequiredFoundationRoutines}\n\n${createRequiredFoundationTriggers}\n\n${rls}\n\n` +
`${provenanceStatement(`${FOUNDATION.version}.foundation.postcondition`, postcondition)}\n`;
}

function dollarJson(valueToEmbed, tag) {
  const contents = JSON.stringify(valueToEmbed);
  if (contents.includes(`$${tag}$`)) throw new Error(`unsafe dollar tag ${tag}`);
  return `$${tag}$${contents}$${tag}$`;
}

function sortedRows(rows) {
  return [...rows].map(stable).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function withDenseLiveColumnOrdinals(rows) {
  const normalized = [];
  for (const [relation, relationRows] of groupBy(
    rows,
    (row) => `${row.relation_schema}.${row.relation_name}`,
  )) {
    const ordered = [...relationRows].sort((left, right) =>
      Number(left.ordinal_position) - Number(right.ordinal_position));
    if (
      ordered.some((row) => !Number.isInteger(row.ordinal_position) || row.ordinal_position <= 0)
      || new Set(ordered.map((row) => row.ordinal_position)).size !== ordered.length
    ) {
      throw new Error(`invalid captured live-column ordinals for ${relation}`);
    }
    ordered.forEach((row, index) => normalized.push({ ...row, ordinal_position: index + 1 }));
  }
  return normalized;
}

function renderCatalogAssertion(assertion, expectedRows, index) {
  let projection = assertion.projection;
  if (assertion.id === "02_extensions") {
    // Supabase owns extension installation and may use supabase_admin instead
    // of postgres on a fresh project. Ownership and optional platform
    // extensions are not application-schema authority, so compare the exact
    // required portable extension contract without binding the replay to one
    // managed-environment bootstrap image.
    projection = projection.filter((field) => field !== "owner_name");
  }
  if (assertion.id === "14d_dependency_schema_routines_for_body_closure") {
    projection = projection.filter((field) => ![
      "configuration", "owner_name", "definition_bytes", "routine_definition",
    ].includes(field));
  }
  if (!Array.isArray(projection) || projection.length === 0 || projection.some((field) => !/^[a-z][a-z0-9_]*$/.test(field))) {
    throw new Error(`invalid catalog assertion projection: ${assertion.source}.${assertion.id}`);
  }
  let sourceSql = assertion.sql.trim().replace(/;$/, "");
  if (assertion.id === "05_columns") {
    // Raw attnums may contain gaps after DROP COLUMN. Compare the dense rank of
    // every surviving column instead: gaps are physical history, while relative
    // live-column order remains part of PostgreSQL's composite-row contract.
    const ordinalPattern = /a\.attnum\s+AS\s+ordinal_position/gi;
    if ([...sourceSql.matchAll(ordinalPattern)].length !== 1) {
      throw new Error(`column assertion cannot be normalized safely: ${assertion.source}.${assertion.id}`);
    }
    sourceSql = sourceSql.replace(
      ordinalPattern,
      "row_number() OVER (PARTITION BY n.nspname, c.relname ORDER BY a.attnum)::integer AS ordinal_position",
    );
  }
  const conditions = [];
  if (assertion.scopeField && assertion.scopeValue) {
    conditions.push(`source_row.${q(assertion.scopeField)} = '${assertion.scopeValue}'`);
  }
  // supabase_vault is a managed Supabase platform extension unavailable in
  // the required native PostgreSQL 17.6 proof runtime. Its exact remote
  // presence remains sealed in the two-pass authority; the local app-schema
  // gate proves every portable extension without inventing a fake control
  // file or vault implementation.
  if (assertion.id === "02_extensions") {
    conditions.push(
      "source_row.extension_name NOT IN ('supabase_vault','pg_graphql','pg_net')",
    );
  }
  if (assertion.id === "14d_dependency_schema_routines_for_body_closure") {
    conditions.push(
      "source_row.routine_schema = 'auth' AND source_row.routine_name IN ('uid','role','email','jwt')",
    );
  }
  const scope = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const tag = `dealflow_expected_${index}`;
  let locallyProvableExpectedRows = expectedRows;
  if (assertion.id === "05_columns") {
    locallyProvableExpectedRows = withDenseLiveColumnOrdinals(locallyProvableExpectedRows);
  }
  if (assertion.id === "02_extensions") {
    locallyProvableExpectedRows = locallyProvableExpectedRows.filter((row) =>
      !["supabase_vault", "pg_graphql", "pg_net"].includes(row.extension_name));
  }
  if (assertion.id === "14d_dependency_schema_routines_for_body_closure") {
    locallyProvableExpectedRows = locallyProvableExpectedRows.filter((row) =>
      row.routine_schema === "auth" && ["uid", "role", "email", "jwt"].includes(row.routine_name));
  }
  const expected = dollarJson(sortedRows(locallyProvableExpectedRows.map((row) =>
    Object.fromEntries(projection.map((field) => [field, row[field]])))), tag);
  const selectKeyword = assertion.id === "14a_private_direct_dependencies"
    ? "SELECT DISTINCT"
    : "SELECT";
  const mismatchRaise = assertion.id === "05_columns"
    ? `    RAISE EXCEPTION 'pre-candidate structural mismatch: ${assertion.source}.${assertion.id}; expected-only=%; actual-only=%',
      (SELECT COALESCE(jsonb_agg(jsonb_build_array(value->>'relation_name', value->>'column_name', value->'ordinal_position')), '[]'::jsonb) FROM (
        SELECT value FROM jsonb_array_elements(expected)
        EXCEPT ALL SELECT value FROM jsonb_array_elements(actual)
        LIMIT 100
      ) difference),
      (SELECT COALESCE(jsonb_agg(jsonb_build_array(value->>'relation_name', value->>'column_name', value->'ordinal_position')), '[]'::jsonb) FROM (
        SELECT value FROM jsonb_array_elements(actual)
        EXCEPT ALL SELECT value FROM jsonb_array_elements(expected)
        LIMIT 100
      ) difference)
      USING ERRCODE='55000';\n`
    : `    RAISE EXCEPTION 'pre-candidate structural mismatch: ${assertion.source}.${assertion.id}' USING ERRCODE='55000';\n`;
  return `-- dealflow:gate-group ${assertion.source}.${assertion.id}.${assertion.category}\n` +
`DO $dealflow_catalog_gate_${index}$\n` +
`DECLARE\n  expected jsonb := ${expected}::jsonb;\n  actual jsonb;\nBEGIN\n` +
`  SELECT COALESCE(jsonb_agg(to_jsonb(actual_row) ORDER BY to_jsonb(actual_row)::text), '[]'::jsonb) INTO actual\n` +
`  FROM (${selectKeyword} ${projection.map(q).join(", ")} FROM (${sourceSql}) AS source_row${scope}) AS actual_row;\n` +
`  IF EXISTS (\n` +
`    (SELECT value FROM jsonb_array_elements(expected) EXCEPT ALL SELECT value FROM jsonb_array_elements(actual))\n` +
`    UNION ALL\n` +
`    (SELECT value FROM jsonb_array_elements(actual) EXCEPT ALL SELECT value FROM jsonb_array_elements(expected))\n` +
`  ) THEN\n` +
`${mismatchRaise}` +
`  END IF;\nEND\n$dealflow_catalog_gate_${index}$;`;
}

function replaceUserIdTextCast(expression) {
  return String(expression ?? "").replace(
    /((?:campaign_record\.)?user_id\s*=\s*)\(\(\s*SELECT auth\.uid\(\) AS uid\s*\)\)::text/gi,
    "$1( SELECT auth.uid() AS uid)",
  );
}

function renderGate(current, publicCurrent, privateAuthority, assertionCatalog) {
  const assertionSql = assertionCatalog.assertions.map((assertion, index) => {
    const source = assertion.source === "public" ? publicCurrent : privateAuthority;
    const expectedRows = source.categories?.[assertion.id] ?? [];
    if (expectedRows.length !== assertion.expectedRowCount) {
      throw new Error(`catalog assertion row-count drift: ${assertion.source}.${assertion.id}`);
    }
    return renderCatalogAssertion(assertion, expectedRows, index + 1);
  }).join("\n\n");
  const policyRoles = groupBy(category(publicCurrent, "12b_policy_roles"), (row) =>
    `${row.table_schema}.${row.table_name}.${row.policy_name}`);
  const dependentPolicies = category(publicCurrent, "12a_policies").filter((policy) =>
    policy.table_name === "campaign_plans"
    || /campaign_record\.user_id/.test(`${policy.using_expression ?? ""} ${policy.with_check_expression ?? ""}`));
  if (dependentPolicies.length !== 3) {
    throw new Error(`expected exactly 3 campaign_plans.user_id dependent policies, found ${dependentPolicies.length}`);
  }
  const dropPolicies = dependentPolicies.map((policy) =>
    `DROP POLICY ${q(policy.policy_name)} ON ${fq(policy.table_schema, policy.table_name)};`,
  ).join("\n");
  const recreatePolicies = dependentPolicies.map((policy) => policySql({
    ...policy,
    using_expression: policy.using_expression == null ? null : replaceUserIdTextCast(policy.using_expression),
    with_check_expression: policy.with_check_expression == null ? null : replaceUserIdTextCast(policy.with_check_expression),
  }, (policyRoles.get(`${policy.table_schema}.${policy.table_name}.${policy.policy_name}`) ?? [])
    .map((row) => row.role_name))).join("\n\n");
  const tables = category(current, "04_tables").filter((row) => row.table_schema === "public")
    .map((row) => ({ table_name: row.table_name, rls_enabled: row.rls_enabled, force_rls: row.force_rls }));
  const columns = category(current, "05_columns").filter((row) => row.relation_schema === "public")
    .map((row) => ({ relation_name: row.relation_name, column_name: row.column_name, formatted_type: row.formatted_type, not_null: row.not_null }));
  const constraints = category(current, "06a_constraints").filter((row) => row.table_schema === "public")
    .map((row) => ({ table_name: row.table_name, constraint_name: row.constraint_name, constraint_definition: row.constraint_definition, validated: row.validated }));
  const indexes = category(current, "07_indexes").filter((row) => row.table_schema === "public")
    .map((row) => ({ table_name: row.table_name, index_name: row.index_name, index_definition: row.index_definition, valid: row.valid }));
  const record = GATE;
  return `${reconstructionHeader(record, "AUTHORITATIVE FULL-CATALOG PRE-CANDIDATE SHAPE GATE")}` +
`-- Every assertion below is a structural pg_catalog query with a frozen expected rowset.\n` +
`-- It covers public, complete private, extensions, ownership, grants, default privileges, and dependency closure before mutation.\n\n` +
`-- Catalog deparsers such as pg_get_expr are search_path-sensitive. Pin the\n` +
`-- migration transaction so the same object produces the same canonical text\n` +
`-- under native PostgreSQL, Supabase CLI, and hosted Supabase migration runners.\n` +
`BEGIN;\n` +
`SET LOCAL search_path = "$user", public;\n\n` +
`${assertionSql}\n\n` +
`-- This migration takes ACCESS EXCLUSIVE lock on campaign_plans and may rewrite that table and its indexes.\n` +
`-- It first proves the exact authoritative table/column/constraint/index shape, then performs the single authorized text-to-uuid normalization.\n` +
`-- dealflow:statement id=${record.version}.catalog_gate_and_uuid_normalization.001 sha256=${sha256(assertionSql)}\n` +
`LOCK TABLE public.campaign_plans IN ACCESS EXCLUSIVE MODE;\n\n` +
`DO $dealflow_pre_candidate_gate$\n` +
`DECLARE mismatch text;\n` +
`BEGIN\n` +
`  IF to_regclass('public.campaign_launch_records') IS NOT NULL THEN\n` +
`    RAISE EXCEPTION 'pre-candidate gate: campaign_launch_records must be absent' USING ERRCODE = '55000';\n` +
`  END IF;\n` +
`  WITH expected AS (SELECT * FROM jsonb_to_recordset(${dollarJson(tables, "dealflow_tables") }::jsonb) AS x(table_name text, rls_enabled boolean, force_rls boolean)),\n` +
`  actual AS (SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r')\n` +
`  SELECT detail INTO mismatch FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d, LATERAL (SELECT row_to_json(d)::text AS detail) j LIMIT 1;\n` +
`  IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'pre-candidate table/RLS mismatch: %', mismatch USING ERRCODE='55000'; END IF;\n` +
`  WITH expected AS (SELECT * FROM jsonb_to_recordset(${dollarJson(columns, "dealflow_columns") }::jsonb) AS x(relation_name text, column_name text, formatted_type text, not_null boolean)),\n` +
`  actual AS (SELECT c.relname, a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attnotnull FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped)\n` +
`  SELECT detail INTO mismatch FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d, LATERAL (SELECT row_to_json(d)::text AS detail) j LIMIT 1;\n` +
`  IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'pre-candidate column mismatch: %', mismatch USING ERRCODE='55000'; END IF;\n` +
`  WITH expected AS (SELECT * FROM jsonb_to_recordset(${dollarJson(constraints, "dealflow_constraints") }::jsonb) AS x(table_name text, constraint_name text, constraint_definition text, validated boolean)),\n` +
`  actual AS (SELECT c.relname, con.conname, pg_catalog.pg_get_constraintdef(con.oid,false), con.convalidated FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype IN ('p','u','c','x','f'))\n` +
`  SELECT detail INTO mismatch FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d, LATERAL (SELECT row_to_json(d)::text AS detail) j LIMIT 1;\n` +
`  IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'pre-candidate constraint mismatch: %', mismatch USING ERRCODE='55000'; END IF;\n` +
`  WITH expected AS (SELECT * FROM jsonb_to_recordset(${dollarJson(indexes, "dealflow_indexes") }::jsonb) AS x(table_name text, index_name text, index_definition text, valid boolean)),\n` +
`  actual AS (SELECT tc.relname, ic.relname, pg_catalog.pg_get_indexdef(i.indexrelid,0,false), i.indisvalid FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid JOIN pg_catalog.pg_class tc ON tc.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=tc.relnamespace WHERE n.nspname='public')\n` +
`  SELECT detail INTO mismatch FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d, LATERAL (SELECT row_to_json(d)::text AS detail) j LIMIT 1;\n` +
`  IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'pre-candidate index mismatch: %', mismatch USING ERRCODE='55000'; END IF;\n` +
`  IF EXISTS (SELECT 1 FROM public.campaign_plans WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN\n` +
`    RAISE EXCEPTION 'pre-candidate gate: campaign_plans.user_id contains non-canonical UUID text' USING ERRCODE='22023';\n` +
`  END IF;\n` +
`  IF EXISTS (SELECT 1 FROM public.campaign_plans WHERE user_id IS NOT NULL AND user_id <> (user_id::uuid)::text) THEN\n` +
`    RAISE EXCEPTION 'pre-candidate gate: campaign_plans.user_id is not canonical lowercase UUID text' USING ERRCODE='22023';\n` +
`  END IF;\n` +
`  IF EXISTS (\n` +
`    SELECT 1 FROM public.leads lead_record\n` +
`    WHERE lead_record.campaign_id IS NOT NULL AND lead_record.organization_id IS NOT NULL AND lead_record.user_id IS NOT NULL\n` +
`      AND NOT EXISTS (SELECT 1 FROM public.campaign_plans campaign_record WHERE campaign_record.id=lead_record.campaign_id\n` +
`        AND campaign_record.organization_id=lead_record.organization_id AND campaign_record.user_id=lead_record.user_id::text)\n` +
`  ) THEN RAISE EXCEPTION 'pre-candidate gate: lead campaign tenant relationship mismatch' USING ERRCODE='23503'; END IF;\n` +
`  IF EXISTS (\n` +
`    SELECT 1 FROM public.creative_assets asset_record\n` +
`    WHERE asset_record.campaign_id IS NOT NULL AND asset_record.user_id IS NOT NULL\n` +
`      AND NOT EXISTS (SELECT 1 FROM public.campaign_plans campaign_record WHERE campaign_record.id=asset_record.campaign_id\n` +
`        AND campaign_record.user_id=asset_record.user_id::text)\n` +
`  ) THEN RAISE EXCEPTION 'pre-candidate gate: creative asset campaign tenant relationship mismatch' USING ERRCODE='23503'; END IF;\n` +
`END\n` +
`$dealflow_pre_candidate_gate$;\n\n` +
`${dropPolicies}\n\n` +
`ALTER TABLE public.campaign_plans ALTER COLUMN user_id TYPE uuid USING user_id::uuid;\n\n` +
`${recreatePolicies}\n\n` +
`DO $dealflow_pre_candidate_postcondition$\n` +
`BEGIN\n` +
`  IF (SELECT pg_catalog.format_type(a.atttypid,a.atttypmod) FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.campaign_plans'::regclass AND a.attname='user_id' AND NOT a.attisdropped) <> 'uuid' THEN\n` +
`    RAISE EXCEPTION 'pre-candidate postcondition: campaign_plans.user_id is not uuid' USING ERRCODE='55000';\n` +
`  END IF;\n` +
`  IF (SELECT pg_catalog.format_type(a.atttypid,a.atttypmod) FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.campaign_plans'::regclass AND a.attname='owner_id' AND NOT a.attisdropped) <> 'text' THEN\n` +
`    RAISE EXCEPTION 'pre-candidate postcondition: campaign_plans.owner_id drifted' USING ERRCODE='55000';\n` +
`  END IF;\n` +
`  IF (SELECT count(*) FROM pg_catalog.pg_policy policy_record JOIN pg_catalog.pg_class relation_record ON relation_record.oid=policy_record.polrelid\n` +
`      JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace\n` +
`      WHERE namespace_record.nspname='public' AND (relation_record.relname, policy_record.polname) IN (\n` +
`        ('campaign_plans','campaign_plans_member_access'),('creative_assets','creative_assets_member_access'),('meta_launch_locks','meta_launch_locks_member_select'))) <> 3 THEN\n` +
`    RAISE EXCEPTION 'pre-candidate postcondition: dependent policies were not restored' USING ERRCODE='55000';\n` +
`  END IF;\n` +
`END\n` +
`$dealflow_pre_candidate_postcondition$;\n\n` +
`COMMIT;\n`;
}

function renderAppContractMigration() {
  const body = String.raw`
-- These nine relations are derived from active application read/write contracts. They were absent
-- from both the authoritative pre-candidate public capture and the sealed migration chain.
-- availability_slots and booked_slots are intentionally excluded: GHL is the locked calendar and
-- appointment source of truth, and the legacy local booking path fails closed in application code.

DO $dealflow_app_contract_guard$
DECLARE collisions text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO collisions
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY[
      'campaign_executions', 'campaign_execution_ad_sets', 'campaign_execution_ads',
      'campaign_execution_logs', 'creative_asset_logs', 'creative_intelligence',
      'creative_pattern_scores', 'creative_performance_snapshots', 'creative_render_jobs'
    ]::text[]);
  IF cardinality(collisions) > 0 THEN
    RAISE EXCEPTION 'app-contract migration refused partial/colliding relations: %', collisions USING ERRCODE = '55000';
  END IF;
END
$dealflow_app_contract_guard$;

CREATE TABLE public.campaign_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  meta_connection_id uuid,
  meta_ad_account_id uuid,
  execution_status text NOT NULL DEFAULT 'pending',
  launch_mode text NOT NULL DEFAULT 'autopilot',
  objective text,
  destination_url text,
  budget_type text,
  daily_budget numeric,
  lifetime_budget numeric,
  meta_campaign_external_id text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT campaign_executions_campaign_tenant_fk
    FOREIGN KEY (campaign_id, organization_id, user_id)
    REFERENCES public.campaign_plans (id, organization_id, user_id) ON DELETE CASCADE,
  CONSTRAINT campaign_executions_status_check
    CHECK (execution_status IN ('pending','validating','launching','launched','partially_failed','failed','unknown_terminal')),
  CONSTRAINT campaign_executions_budget_check
    CHECK (coalesce(daily_budget, 0) >= 0 AND coalesce(lifetime_budget, 0) >= 0)
);

CREATE TABLE public.campaign_execution_ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_ad_set_external_id text,
  status text NOT NULL DEFAULT 'creating',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.campaign_execution_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  ad_set_execution_id uuid NOT NULL REFERENCES public.campaign_execution_ad_sets(id) ON DELETE CASCADE,
  creative_name text,
  headline text,
  primary_text text,
  cta text,
  destination_url text,
  format text,
  meta_ad_external_id text,
  status text NOT NULL DEFAULT 'creating',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.campaign_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_status text NOT NULL,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.creative_assets
  ADD CONSTRAINT creative_assets_tenant_identity_unique
  UNIQUE (id, campaign_id, user_id);

CREATE TABLE public.creative_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  creative_asset_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  render_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_name text,
  provider_job_id text,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_render_jobs_asset_tenant_fk
    FOREIGN KEY (creative_asset_id, campaign_id, user_id)
    REFERENCES public.creative_assets (id, campaign_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.creative_asset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_status text NOT NULL,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.creative_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  hook text NOT NULL,
  angle text NOT NULL,
  audience text NOT NULL,
  offer text,
  industry text NOT NULL,
  format text NOT NULL,
  notes text,
  performance_tag text NOT NULL DEFAULT 'test',
  result_tag text,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_intelligence_scope_check CHECK (
    (organization_id IS NULL AND user_id IS NULL) OR (organization_id IS NOT NULL AND user_id IS NOT NULL)
  ),
  CONSTRAINT creative_intelligence_performance_tag_check CHECK (performance_tag IN ('high','medium','test')),
  CONSTRAINT creative_intelligence_result_tag_check CHECK (result_tag IS NULL OR result_tag IN ('winner','average','loser'))
);

CREATE TABLE public.creative_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creative_id text NOT NULL,
  campaign_id text NOT NULL,
  angle text NOT NULL,
  hook text NOT NULL,
  headline text NOT NULL,
  cta text NOT NULL,
  spend numeric NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  ctr numeric NOT NULL DEFAULT 0 CHECK (ctr >= 0),
  leads bigint NOT NULL DEFAULT 0 CHECK (leads >= 0),
  cpl numeric CHECK (cpl IS NULL OR cpl >= 0),
  status text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('winner','average','loser','inconclusive')),
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.creative_pattern_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hook text NOT NULL,
  angle text NOT NULL,
  offer text NOT NULL,
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  inconclusive_count integer NOT NULL DEFAULT 0 CHECK (inconclusive_count >= 0),
  last_seen timestamptz,
  confidence_score numeric NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_pattern_scores_identity_unique UNIQUE (organization_id, user_id, hook, angle, offer)
);

CREATE INDEX campaign_executions_campaign_created_idx ON public.campaign_executions(campaign_id, created_at DESC);
CREATE INDEX campaign_executions_user_created_idx ON public.campaign_executions(user_id, created_at DESC);
CREATE INDEX campaign_execution_ad_sets_execution_idx ON public.campaign_execution_ad_sets(execution_id, created_at);
CREATE INDEX campaign_execution_ads_execution_idx ON public.campaign_execution_ads(execution_id, created_at);
CREATE INDEX campaign_execution_logs_execution_idx ON public.campaign_execution_logs(execution_id, created_at);
CREATE INDEX creative_render_jobs_asset_created_idx ON public.creative_render_jobs(creative_asset_id, created_at DESC);
CREATE INDEX creative_asset_logs_asset_created_idx ON public.creative_asset_logs(creative_asset_id, created_at);
CREATE INDEX creative_intelligence_tenant_updated_idx ON public.creative_intelligence(organization_id, user_id, updated_at DESC);
CREATE INDEX creative_performance_tenant_campaign_sync_idx ON public.creative_performance_snapshots(organization_id, user_id, campaign_id, synced_at DESC);
CREATE INDEX creative_pattern_scores_tenant_confidence_idx ON public.creative_pattern_scores(organization_id, user_id, confidence_score DESC);

ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ad_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_render_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_asset_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_intelligence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_performance_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_pattern_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_pattern_scores FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_executions_member_access ON public.campaign_executions FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY campaign_execution_ad_sets_member_access ON public.campaign_execution_ad_sets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY campaign_execution_ads_member_access ON public.campaign_execution_ads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY campaign_execution_logs_member_access ON public.campaign_execution_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY creative_render_jobs_member_access ON public.creative_render_jobs FOR ALL TO authenticated
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY creative_asset_logs_member_access ON public.creative_asset_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.creative_assets a WHERE a.id=creative_asset_id AND a.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.creative_assets a WHERE a.id=creative_asset_id AND a.user_id=auth.uid()));
CREATE POLICY creative_intelligence_member_access ON public.creative_intelligence FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND user_id=auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY creative_intelligence_shared_select ON public.creative_intelligence FOR SELECT TO authenticated
  USING (organization_id IS NULL AND user_id IS NULL);
CREATE POLICY creative_performance_snapshots_member_access ON public.creative_performance_snapshots FOR ALL TO authenticated
  USING (user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id=auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY creative_pattern_scores_member_access ON public.creative_pattern_scores FOR ALL TO authenticated
  USING (user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id=auth.uid() AND private.is_current_user_org_member(organization_id));

CREATE POLICY campaign_executions_service_role_all ON public.campaign_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_ad_sets_service_role_all ON public.campaign_execution_ad_sets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_ads_service_role_all ON public.campaign_execution_ads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_logs_service_role_all ON public.campaign_execution_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_render_jobs_service_role_all ON public.creative_render_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_asset_logs_service_role_all ON public.creative_asset_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_intelligence_service_role_all ON public.creative_intelligence FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_performance_snapshots_service_role_all ON public.creative_performance_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_pattern_scores_service_role_all ON public.creative_pattern_scores FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.campaign_executions, public.campaign_execution_ad_sets, public.campaign_execution_ads,
  public.campaign_execution_logs, public.creative_render_jobs, public.creative_asset_logs,
  public.creative_intelligence, public.creative_performance_snapshots, public.creative_pattern_scores FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_executions, public.campaign_execution_ad_sets,
  public.campaign_execution_ads, public.campaign_execution_logs, public.creative_render_jobs,
  public.creative_asset_logs, public.creative_intelligence, public.creative_performance_snapshots,
  public.creative_pattern_scores TO authenticated, service_role;

DO $dealflow_app_contract_postcondition$
DECLARE relation_count integer;
BEGIN
  SELECT count(*) INTO relation_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY (ARRAY[
    'campaign_executions', 'campaign_execution_ad_sets', 'campaign_execution_ads',
    'campaign_execution_logs', 'creative_asset_logs', 'creative_intelligence',
    'creative_pattern_scores', 'creative_performance_snapshots', 'creative_render_jobs'
  ]::text[]);
  IF relation_count <> 9 THEN
    RAISE EXCEPTION 'app-contract postcondition failed: expected 9 relations, found %', relation_count USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.creative_assets'::regclass
      AND conname='creative_assets_tenant_identity_unique'
      AND contype='u'
  ) THEN
    RAISE EXCEPTION 'app-contract postcondition failed: creative asset tenant identity is not unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_app_contract_postcondition$;
`;
  return `${reconstructionHeader(APP_CONTRACT, "FORWARD APP-CONTRACT MIGRATION; NO HISTORICAL BODY CLAIMED")}` +
    `-- dealflow:statement id=${APP_CONTRACT.version}.app_contract.001 sha256=${sha256(body)}\n${body}`;
}

async function main() {
  if (has("--refresh")) {
    throw new Error("--refresh is retired; use scripts/schema/bootstrap-authority-fixtures.mjs so public and R2 private authority cannot be separated");
  }

  const current = JSON.parse(readFileSync(CURRENT_FIXTURE, "utf8"));
  const publicCurrent = JSON.parse(readFileSync(PUBLIC_CURRENT_FIXTURE, "utf8"));
  const privateAuthorityText = readFileSync(PRIVATE_AUTHORITY_FIXTURE, "utf8");
  const privateAuthority = JSON.parse(privateAuthorityText);
  const assertionCatalog = JSON.parse(readFileSync(CATALOG_ASSERTION_QUERIES, "utf8"));
  const baseline = JSON.parse(readFileSync(BASELINE_FIXTURE, "utf8"));
  assertAuthorityIntegrity({ current, publicCurrent, privateAuthority, privateAuthorityText });
  const buckets = buildDeltaMigrations(baseline, current);
  const generated = [];

  const foundationBody = renderFoundation(baseline);
  const foundationPath = join(MIGRATIONS_DIR, `${FOUNDATION.version}_${FOUNDATION.name}.sql`);
  writeOrCheck(foundationPath, foundationBody);
  generated.push({ ...FOUNDATION, classification: "FRESH_ONLY_FORWARD_FOUNDATION", sha256: sha256(foundationBody) });

  for (const record of MISSING) {
    const body = renderDeltaMigration(record, buckets.get(record.version));
    const path = join(MIGRATIONS_DIR, `${record.version}_${record.name}.sql`);
    writeOrCheck(path, body);
    generated.push({ ...record, classification: DATA_ONLY.has(record.version) ? "TENANT_NEUTRAL_DATA_NOOP" : "FORWARD_EQUIVALENT_RECONSTRUCTION", sha256: sha256(body) });
  }

  const gateBody = renderGate(current, publicCurrent, privateAuthority, assertionCatalog);
  const gatePath = join(MIGRATIONS_DIR, `${GATE.version}_${GATE.name}.sql`);
  writeOrCheck(gatePath, gateBody);
  generated.push({ ...GATE, classification: "AUTHORITATIVE_SHAPE_GATE_AND_GUARDED_NORMALIZATION", sha256: sha256(gateBody) });

  const appContractBody = renderAppContractMigration();
  const appContractPath = join(MIGRATIONS_DIR, `${APP_CONTRACT.version}_${APP_CONTRACT.name}.sql`);
  writeOrCheck(appContractPath, appContractBody);
  generated.push({ ...APP_CONTRACT, classification: "FORWARD_APP_CONTRACT_NO_HISTORICAL_BODY_CLAIMED", sha256: sha256(appContractBody) });

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  const foundationBoundaryIndex = migrationFiles.indexOf(
    `${APP_CONTRACT.version}_${APP_CONTRACT.name}.sql`,
  );
  if (foundationBoundaryIndex + 1 !== FROZEN_FOUNDATION_MIGRATION_COUNT) {
    throw new Error(
      `expected the frozen foundation boundary at migration ${FROZEN_FOUNDATION_MIGRATION_COUNT}, found ${foundationBoundaryIndex + 1}`,
    );
  }
  if (
    new Set(migrationFiles.map((name) => name.slice(0, 14))).size !==
    migrationFiles.length
  ) {
    throw new Error("migration versions must remain globally unique");
  }
  for (const requiredMigration of REQUIRED_PRODUCT_EXTENSION_MIGRATIONS) {
    if (!migrationFiles.includes(requiredMigration)) {
      throw new Error(`required product extension migration is missing: ${requiredMigration}`);
    }
  }
  if (
    migrationFiles.length !== EXACT_INTEGRATED_MIGRATION_COUNT ||
    EXACT_INTEGRATED_MIGRATION_COUNT !==
      FROZEN_FOUNDATION_MIGRATION_COUNT +
        REQUIRED_PRODUCT_EXTENSION_MIGRATIONS.length
  ) {
    throw new Error(
      `expected exactly ${EXACT_INTEGRATED_MIGRATION_COUNT} migrations after generation, found ${migrationFiles.length}`,
    );
  }
  const lineage = {
    schemaVersion: "dealflow.forward-equivalent-lineage.v1",
    classification: "NEW_FORWARD_RECONSTRUCTION_NOT_RECOVERED_HISTORY",
    authoritativeCurrentCatalogDigestSha256: REMOTE_CAPTURE_DIGEST,
    sealedSourceCommit: "577c348ce853f0edb3ed0e99b21cc9625b948e2b",
    migrationCount: migrationFiles.length,
    generatedCount: generated.length,
    exactHistoricalBodyMissingCount: MISSING.length,
    tenantNeutralDataNoopCount: DATA_ONLY.size,
    publicCatalogAuthority: "AUTHORITATIVE_TWO_PASS_CAPTURE",
    privateCatalogAuthority: "AUTHORITATIVE_TWO_PASS_COMPLETE_PRIVATE_CAPTURE",
    privateHelperAuthority: "R2_CAPTURE_MATCHES_SEALED_20260502192332_BODY_AND_ATTRIBUTES",
    records: generated,
  };
  writeOrCheck(LINEAGE_MAP, json(lineage));

  const statementRecords = [];
  const statementIds = new Set();
  for (const file of migrationFiles) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (!source.includes("-- dealflow:migration ")) continue;
    const markerLines = source.split("\n").filter((line) => line.startsWith("-- dealflow:statement"));
    const matches = [...source.matchAll(/^-- dealflow:statement id=(\S+) sha256=([a-f0-9]{64})$/gm)];
    if (matches.length !== markerLines.length) {
      throw new Error(`${file} contains a malformed statement-provenance marker`);
    }
    for (const match of matches) {
      const [, id, statementSha256] = match;
      if (statementIds.has(id)) throw new Error(`duplicate statement-provenance id: ${id}`);
      statementIds.add(id);
      statementRecords.push({
        id,
        migrationFile: file,
        migrationVersion: file.slice(0, 14),
        sha256: statementSha256,
      });
    }
  }
  if (statementRecords.length === 0) throw new Error("generated portfolio contains no statement-level provenance");
  const provenance = {
    schemaVersion: "dealflow.migration-statement-provenance.v1",
    classification: "NEW_FORWARD_RECONSTRUCTION_NOT_RECOVERED_HISTORY",
    authoritativeCurrentCatalogDigestSha256: REMOTE_CAPTURE_DIGEST,
    generatedMigrationCount: generated.length,
    statementCount: statementRecords.length,
    records: statementRecords,
  };
  writeOrCheck(STATEMENT_PROVENANCE, json(provenance));

  process.stdout.write(`${mode === "check" ? "verified" : "generated"}: ${generated.length} files; migration portfolio=${migrationFiles.length}; statements=${statementRecords.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
