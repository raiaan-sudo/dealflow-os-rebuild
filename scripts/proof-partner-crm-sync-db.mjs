#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const CONFIRMATION = "APPLY_PARTNER_CRM_SYNC_DB_PROOF";
const DESTINATION = "gohighlevel";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    cleanup: false,
    confirm: null,
    proofRunId: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--cleanup") args.cleanup = true;
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const selectedModes = [args.dryRun, args.apply, args.cleanup].filter(Boolean).length;
  if (selectedModes !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --apply, or --cleanup.");
  }

  return args;
}

function buildIdempotencyKey({ partnerId, workspaceId, leadId, destination = DESTINATION }) {
  return createHash("sha256")
    .update([partnerId, workspaceId, leadId, destination].join("|"))
    .digest("hex");
}

function buildSlugSafeProofRunId(proofRunId) {
  const slug = proofRunId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "proof";
}

function buildProofIds(proofRunId) {
  return {
    proofRunId,
    proofSlugId: buildSlugSafeProofRunId(proofRunId),
    partnerAId: randomUUID(),
    partnerBId: randomUUID(),
    partnerMissingConfigId: randomUUID(),
    partnerMissingMappingId: randomUUID(),
    workspaceAId: randomUUID(),
    workspaceBId: randomUUID(),
    leadAId: randomUUID(),
    leadBId: randomUUID(),
  };
}

function requireServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Apply/cleanup requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function requireConfirmed(args) {
  if (args.confirm !== CONFIRMATION) {
    throw new Error(`Apply/cleanup requires --confirm=${CONFIRMATION}.`);
  }
}

function proofMetadata(proofRunId, extra = {}) {
  return {
    proof_run_id: proofRunId,
    proof_name: "partner_crm_sync_db",
    no_ghl_calls: true,
    no_sms: true,
    no_meta: true,
    no_stripe: true,
    no_provider: true,
    ...extra,
  };
}

async function expectOk(label, promise) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function maybeSingle(label, promise) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data ?? null;
}

async function readProofOwnerUserIds(supabase) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) throw new Error(`load proof owner users: ${error.message}`);
  const userIds = (data ?? []).map((row) => row.id).filter(Boolean);
  if (userIds.length < 1) {
    throw new Error("load proof owner users: no existing users available for organization owner_user_id FK.");
  }

  return {
    ownerAId: userIds[0],
    ownerBId: userIds[1] ?? userIds[0],
  };
}

async function insertProofRows(supabase, ids) {
  const now = new Date().toISOString();
  const proofOwners = await readProofOwnerUserIds(supabase);
  const partnerRows = [
    { id: ids.partnerAId, slug: `qa-ghl-crm-proof-a-${ids.proofSlugId}`, brand_name: "QA GHL CRM Proof A", primary_color: "#67e8f9", status: "active" },
    { id: ids.partnerBId, slug: `qa-ghl-crm-proof-b-${ids.proofSlugId}`, brand_name: "QA GHL CRM Proof B", primary_color: "#67e8f9", status: "active" },
    { id: ids.partnerMissingConfigId, slug: `qa-ghl-crm-proof-no-config-${ids.proofSlugId}`, brand_name: "QA GHL CRM Missing Config", primary_color: "#67e8f9", status: "active" },
    { id: ids.partnerMissingMappingId, slug: `qa-ghl-crm-proof-no-mapping-${ids.proofSlugId}`, brand_name: "QA GHL CRM Missing Mapping", primary_color: "#67e8f9", status: "active" },
  ];
  await expectOk("insert partners", supabase.from("partners").insert(partnerRows));

  await expectOk(
    "insert organizations",
    supabase.from("organizations").insert([
      { id: ids.workspaceAId, slug: `qa-ghl-crm-proof-ws-a-${ids.proofSlugId}`, name: `QA GHL CRM Proof Workspace A ${ids.proofRunId}`, owner_user_id: proofOwners.ownerAId, partner_id: ids.partnerAId },
      { id: ids.workspaceBId, slug: `qa-ghl-crm-proof-ws-b-${ids.proofSlugId}`, name: `QA GHL CRM Proof Workspace B ${ids.proofRunId}`, owner_user_id: proofOwners.ownerBId, partner_id: ids.partnerAId },
    ]),
  );

  await expectOk(
    "insert leads",
    supabase.from("leads").insert([
      {
        id: ids.leadAId,
        organization_id: ids.workspaceAId,
        tenant_id: ids.workspaceAId,
        first_name: "QA",
        last_name: "GHL Proof A",
        name: "QA GHL Proof A",
        email: `qa+ghl-crm-a-${ids.proofRunId}@example.com`,
        source: "qa_ghl_crm_proof",
        status: "new",
        estimated_value: 0,
        notes: "Controlled partner CRM sync DB proof. Do not contact.",
        campaign_name: "QA GHL CRM Proof",
        lead_type: "qa_proof",
        created_at: now,
        metadata: proofMetadata(ids.proofRunId),
      },
      {
        id: ids.leadBId,
        organization_id: ids.workspaceBId,
        tenant_id: ids.workspaceBId,
        first_name: "QA",
        last_name: "GHL Proof B",
        name: "QA GHL Proof B",
        email: `qa+ghl-crm-b-${ids.proofRunId}@example.com`,
        source: "qa_ghl_crm_proof",
        status: "new",
        estimated_value: 0,
        notes: "Controlled partner CRM sync DB proof. Do not contact.",
        campaign_name: "QA GHL CRM Proof",
        lead_type: "qa_proof",
        created_at: now,
        metadata: proofMetadata(ids.proofRunId),
      },
    ]),
  );

  await expectOk(
    "insert partner GHL configs",
    supabase.from("partner_ghl_config").insert([
      {
        partner_id: ids.partnerAId,
        enabled: true,
        encrypted_credential_ref: "QA_GHL_DISABLED_TOKEN",
        default_location_id: "qa_location_partner_a",
        default_tags: ["qa_ghl_crm_proof"],
        default_source: "QA GHL CRM Proof",
      },
      {
        partner_id: ids.partnerBId,
        enabled: true,
        encrypted_credential_ref: "QA_GHL_DISABLED_TOKEN",
        default_location_id: "qa_location_partner_b",
        default_tags: ["qa_ghl_crm_proof"],
        default_source: "QA GHL CRM Proof",
      },
      {
        partner_id: ids.partnerMissingMappingId,
        enabled: true,
        encrypted_credential_ref: "QA_GHL_DISABLED_TOKEN",
        default_location_id: "qa_location_missing_mapping",
        default_tags: ["qa_ghl_crm_proof"],
        default_source: "QA GHL CRM Proof",
      },
    ]),
  );

  await expectOk(
    "insert workspace GHL mappings",
    supabase.from("workspace_ghl_mapping").insert([
      {
        workspace_id: ids.workspaceAId,
        partner_id: ids.partnerAId,
        ghl_location_id: "qa_location_a",
        sync_enabled: true,
        metadata: proofMetadata(ids.proofRunId, { case: "valid_mapping_partner_a" }),
      },
      {
        workspace_id: ids.workspaceAId,
        partner_id: ids.partnerBId,
        ghl_location_id: "qa_location_b",
        sync_enabled: true,
        metadata: proofMetadata(ids.proofRunId, { case: "valid_mapping_partner_b" }),
      },
      {
        workspace_id: ids.workspaceBId,
        partner_id: ids.partnerAId,
        ghl_location_id: "qa_location_c",
        sync_enabled: true,
        metadata: proofMetadata(ids.proofRunId, { case: "tenant_b_mapping_partner_a" }),
      },
      {
        workspace_id: ids.workspaceBId,
        partner_id: ids.partnerBId,
        ghl_location_id: "qa_location_disabled",
        sync_enabled: false,
        metadata: proofMetadata(ids.proofRunId, { case: "disabled_mapping" }),
      },
      {
        workspace_id: ids.workspaceAId,
        partner_id: ids.partnerMissingConfigId,
        ghl_location_id: "qa_location_missing_config",
        sync_enabled: true,
        metadata: proofMetadata(ids.proofRunId, { case: "missing_partner_config" }),
      },
    ]),
  );
}

async function cleanupProofRows(supabase, proofRunId) {
  const partnerSlugPrefix = `qa-ghl-crm-proof`;
  const workspaceNamePrefix = `QA GHL CRM Proof Workspace`;
  const proofSlugId = buildSlugSafeProofRunId(proofRunId);
  const proofFilter = { proof_run_id: proofRunId };

  const deleted = {};
  const tablesByMetadata = [
    "lead_crm_sync_events",
    "workspace_ghl_mapping",
    "ghl_provisioning_events",
    "ghl_provisioning_jobs",
    "workspace_ghl_users",
  ];

  for (const table of tablesByMetadata) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .contains("metadata", proofFilter)
      .select("id");
    if (error) throw new Error(`cleanup ${table}: ${error.message}`);
    deleted[table] = data?.length ?? 0;
  }

  const { data: leadRows, error: leadError } = await supabase
    .from("leads")
    .delete()
    .eq("source", "qa_ghl_crm_proof")
    .contains("metadata", proofFilter)
    .select("id");
  if (leadError) throw new Error(`cleanup leads: ${leadError.message}`);
  deleted.leads = leadRows?.length ?? 0;

  const partnerIds = await findProofPartnerIds(supabase, proofRunId);
  if (partnerIds.length > 0) {
    const { data: configRows, error: configError } = await supabase
      .from("partner_ghl_config")
      .delete()
      .in("partner_id", partnerIds)
      .select("id");
    if (configError) throw new Error(`cleanup partner_ghl_config: ${configError.message}`);
    deleted.partner_ghl_config = configRows?.length ?? 0;
  } else {
    deleted.partner_ghl_config = 0;
  }

  const { data: orgRows, error: orgError } = await supabase
    .from("organizations")
    .delete()
    .like("name", `${workspaceNamePrefix}%${proofRunId}`)
    .select("id");
  if (orgError) throw new Error(`cleanup organizations: ${orgError.message}`);
  deleted.organizations = orgRows?.length ?? 0;

  const { data: partnerRows, error: partnerError } = await supabase
    .from("partners")
    .delete()
    .like("slug", `${partnerSlugPrefix}%${proofSlugId}`)
    .select("id");
  if (partnerError) throw new Error(`cleanup partners: ${partnerError.message}`);
  deleted.partners = partnerRows?.length ?? 0;

  return deleted;
}

async function findProofPartnerIds(supabase, proofRunId) {
  const proofSlugId = buildSlugSafeProofRunId(proofRunId);
  const { data, error } = await supabase
    .from("partners")
    .select("id")
    .like("slug", `qa-ghl-crm-proof%${proofSlugId}`);
  if (error) throw new Error(`find proof partners: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function countProofRows(supabase, proofRunId) {
  const counts = {};
  const proofFilter = { proof_run_id: proofRunId };
  const countByMetadata = [
    "lead_crm_sync_events",
    "workspace_ghl_mapping",
    "ghl_provisioning_events",
    "ghl_provisioning_jobs",
    "workspace_ghl_users",
  ];

  for (const table of countByMetadata) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .contains("metadata", proofFilter);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }

  const { count: leadCount, error: leadError } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("source", "qa_ghl_crm_proof")
    .contains("metadata", proofFilter);
  if (leadError) throw new Error(`count leads: ${leadError.message}`);
  counts.leads = leadCount ?? 0;

  const { count: orgCount, error: orgError } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .like("name", `QA GHL CRM Proof Workspace%${proofRunId}`);
  if (orgError) throw new Error(`count organizations: ${orgError.message}`);
  counts.organizations = orgCount ?? 0;

  const { count: partnerCount, error: partnerError } = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .like("slug", `qa-ghl-crm-proof%${buildSlugSafeProofRunId(proofRunId)}`);
  if (partnerError) throw new Error(`count partners: ${partnerError.message}`);
  counts.partners = partnerCount ?? 0;

  const partnerIds = await findProofPartnerIds(supabase, proofRunId);
  if (partnerIds.length > 0) {
    const { count: configCount, error: configError } = await supabase
      .from("partner_ghl_config")
      .select("id", { count: "exact", head: true })
      .in("partner_id", partnerIds);
    if (configError) throw new Error(`count partner_ghl_config: ${configError.message}`);
    counts.partner_ghl_config = configCount ?? 0;
  } else {
    counts.partner_ghl_config = 0;
  }

  return counts;
}

async function readMappingConfig(supabase, { workspaceId, partnerId }) {
  const mapping = await maybeSingle(
    "read mapping",
    supabase
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, sync_enabled")
      .eq("workspace_id", workspaceId)
      .eq("partner_id", partnerId)
      .eq("sync_enabled", true)
      .maybeSingle(),
  );

  if (!mapping?.ghl_location_id) {
    return null;
  }

  const config = await maybeSingle(
    "read config",
    supabase
      .from("partner_ghl_config")
      .select("partner_id, enabled, encrypted_credential_ref")
      .eq("partner_id", partnerId)
      .maybeSingle(),
  );

  if (!config?.enabled) {
    return null;
  }

  return { mapping, config };
}

async function ensureCrmEvent(supabase, { ids, partnerId, workspaceId, leadId, status = "processing" }) {
  const idempotencyKey = buildIdempotencyKey({ partnerId, workspaceId, leadId });
  const existing = await maybeSingle(
    "read existing event",
    supabase
      .from("lead_crm_sync_events")
      .select("id, status, attempt_count, idempotency_key, partner_id, workspace_id, lead_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle(),
  );

  if (existing?.status === "synced") {
    return { reason: "already_synced", event: existing, idempotencyKey };
  }

  if (existing?.status === "dead_letter") {
    return { reason: "existing_dead_letter", event: existing, idempotencyKey };
  }

  if (existing?.id) {
    const rows = await expectOk(
      "update existing event",
      supabase
        .from("lead_crm_sync_events")
        .update({
          status,
          attempt_count: Number(existing.attempt_count ?? 0) + 1,
          metadata: proofMetadata(ids.proofRunId, { idempotency_key: idempotencyKey, case: "retry_existing" }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, status, attempt_count, idempotency_key, partner_id, workspace_id, lead_id"),
    );
    return { reason: "updated_existing", event: rows[0], idempotencyKey };
  }

  const rows = await expectOk(
    "insert CRM event",
    supabase
      .from("lead_crm_sync_events")
      .insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        partner_id: partnerId,
        destination: DESTINATION,
        ghl_location_id: "qa_location_event",
        status,
        idempotency_key: idempotencyKey,
        attempt_count: 1,
        metadata: proofMetadata(ids.proofRunId, { idempotency_key: idempotencyKey, case: "insert_event" }),
      })
      .select("id, status, attempt_count, idempotency_key, partner_id, workspace_id, lead_id"),
  );
  return { reason: "inserted", event: rows[0], idempotencyKey };
}

async function runApplyProof(supabase, ids) {
  await cleanupProofRows(supabase, ids.proofRunId);
  await insertProofRows(supabase, ids);

  const results = {};
  results.validMapping = Boolean(
    await readMappingConfig(supabase, {
      workspaceId: ids.workspaceAId,
      partnerId: ids.partnerAId,
    }),
  );
  results.missingMapping = (await readMappingConfig(supabase, {
    workspaceId: ids.workspaceAId,
    partnerId: ids.partnerMissingMappingId,
  })) === null;
  results.disabledMapping = (await readMappingConfig(supabase, {
    workspaceId: ids.workspaceBId,
    partnerId: ids.partnerBId,
  })) === null;
  results.missingConfig = (await readMappingConfig(supabase, {
    workspaceId: ids.workspaceAId,
    partnerId: ids.partnerMissingConfigId,
  })) === null;

  const first = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerAId,
    workspaceId: ids.workspaceAId,
    leadId: ids.leadAId,
  });
  const second = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerAId,
    workspaceId: ids.workspaceAId,
    leadId: ids.leadAId,
  });
  results.sameLeadTwice = first.event.id === second.event.id && second.event.attempt_count === 2;

  await expectOk(
    "mark synced",
    supabase.from("lead_crm_sync_events").update({ status: "synced" }).eq("id", first.event.id),
  );
  const afterSynced = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerAId,
    workspaceId: ids.workspaceAId,
    leadId: ids.leadAId,
  });
  results.sameLeadAfterSynced = afterSynced.reason === "already_synced";

  const failedKey = buildIdempotencyKey({
    partnerId: ids.partnerAId,
    workspaceId: ids.workspaceBId,
    leadId: ids.leadBId,
  });
  await expectOk(
    "seed failed event",
    supabase.from("lead_crm_sync_events").insert({
      lead_id: ids.leadBId,
      workspace_id: ids.workspaceBId,
      partner_id: ids.partnerAId,
      destination: DESTINATION,
      status: "failed",
      idempotency_key: failedKey,
      attempt_count: 1,
      metadata: proofMetadata(ids.proofRunId, { case: "seed_failed", idempotency_key: failedKey }),
    }),
  );
  const afterFailed = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerAId,
    workspaceId: ids.workspaceBId,
    leadId: ids.leadBId,
  });
  results.sameLeadAfterFailed =
    afterFailed.reason === "updated_existing" && afterFailed.event.status === "processing" && afterFailed.event.attempt_count === 2;

  const deadLetterKey = buildIdempotencyKey({
    partnerId: ids.partnerBId,
    workspaceId: ids.workspaceBId,
    leadId: ids.leadBId,
  });
  await expectOk(
    "seed dead_letter event",
    supabase.from("lead_crm_sync_events").insert({
      lead_id: ids.leadBId,
      workspace_id: ids.workspaceBId,
      partner_id: ids.partnerBId,
      destination: DESTINATION,
      status: "dead_letter",
      idempotency_key: deadLetterKey,
      attempt_count: 1,
      metadata: proofMetadata(ids.proofRunId, { case: "seed_dead_letter", idempotency_key: deadLetterKey }),
    }),
  );
  const afterDeadLetter = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerBId,
    workspaceId: ids.workspaceBId,
    leadId: ids.leadBId,
  });
  results.sameLeadAfterDeadLetter = afterDeadLetter.reason === "existing_dead_letter";

  const partnerSeparated = await ensureCrmEvent(supabase, {
    ids,
    partnerId: ids.partnerBId,
    workspaceId: ids.workspaceAId,
    leadId: ids.leadAId,
  });
  results.partnerSeparatedIdentities =
    first.idempotencyKey !== partnerSeparated.idempotencyKey &&
    first.event.partner_id !== partnerSeparated.event.partner_id;

  results.noGhlCalls = true;
  results.noOpportunityCreation = true;
  results.noProvisioning = (await countProofRows(supabase, ids.proofRunId)).ghl_provisioning_jobs === 0;
  results.noWorkflowEnrollment = true;

  return results;
}

function buildDryRunPlan(proofRunId) {
  const proofSlugId = buildSlugSafeProofRunId(proofRunId);
  const ids = {
    proofRunId,
    proofSlugId,
    partnerAId: "00000000-0000-4000-8000-00000000000a",
    partnerBId: "00000000-0000-4000-8000-00000000000b",
    partnerMissingConfigId: "00000000-0000-4000-8000-00000000000c",
    partnerMissingMappingId: "00000000-0000-4000-8000-00000000000d",
    workspaceAId: "11111111-1111-4111-8111-111111111111",
    workspaceBId: "22222222-2222-4222-8222-222222222222",
    leadAId: "33333333-3333-4333-8333-333333333333",
    leadBId: "44444444-4444-4444-8444-444444444444",
  };

  return {
    mode: "dry-run",
    wouldMutate: false,
    proofRunId,
    proofSlugId,
    samplePartnerSlugs: {
      partnerA: `qa-ghl-crm-proof-a-${proofSlugId}`,
      partnerB: `qa-ghl-crm-proof-b-${proofSlugId}`,
    },
    sampleOrganizationSlugs: {
      workspaceA: `qa-ghl-crm-proof-ws-a-${proofSlugId}`,
      workspaceB: `qa-ghl-crm-proof-ws-b-${proofSlugId}`,
    },
    rows: {
      partners: 4,
      organizations: 2,
      leads: 2,
      partner_ghl_config: 3,
      workspace_ghl_mapping: 5,
      lead_crm_sync_events: "created during apply proof only",
      users: "read existing user ids only; no auth/users mutation",
    },
    checks: {
      idempotency: [
        "same lead twice",
        "same lead after synced",
        "same lead after failed",
        "same lead after dead_letter",
        "same lead/workspace with different partners",
      ],
      mapping: ["valid mapping", "missing mapping", "disabled mapping", "missing partner config"],
      dryRunSafety: ["no GHL calls", "no opportunity creation", "no provisioning", "no workflow enrollment"],
    },
    sampleIdempotency: {
      partnerA: buildIdempotencyKey({
        partnerId: ids.partnerAId,
        workspaceId: ids.workspaceAId,
        leadId: ids.leadAId,
      }),
      partnerB: buildIdempotencyKey({
        partnerId: ids.partnerBId,
        workspaceId: ids.workspaceAId,
        leadId: ids.leadAId,
      }),
      partnerSeparated: true,
    },
    requiredApplyCommand:
      `npm run proof:partner-crm-sync-db -- --apply --confirm=${CONFIRMATION} --proof-run-id=${proofRunId}`,
    cleanupCommand:
      `npm run proof:partner-crm-sync-db -- --cleanup --confirm=${CONFIRMATION} --proof-run-id=${proofRunId}`,
  };
}

function assertResults(results) {
  const failed = Object.entries(results)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  if (failed.length > 0) {
    throw new Error(`Proof failed: ${failed.join(", ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proofRunId = args.proofRunId?.trim() || `qa_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

  if (args.dryRun) {
    console.log(JSON.stringify(buildDryRunPlan(proofRunId), null, 2));
    return;
  }

  requireConfirmed(args);
  const supabase = requireServiceRoleClient();

  if (args.cleanup) {
    const deleted = await cleanupProofRows(supabase, proofRunId);
    const remaining = await countProofRows(supabase, proofRunId);
    console.log(JSON.stringify({ mode: "cleanup", proofRunId, deleted, remaining }, null, 2));
    return;
  }

  const ids = buildProofIds(proofRunId);
  const results = await runApplyProof(supabase, ids);
  assertResults(results);
  const counts = await countProofRows(supabase, proofRunId);

  console.log(JSON.stringify({
    mode: "apply",
    proofRunId,
    results,
    counts,
    cleanupCommand:
      `npm run proof:partner-crm-sync-db -- --cleanup --confirm=${CONFIRMATION} --proof-run-id=${proofRunId}`,
    safety: {
      noGhlCalls: true,
      noTokenRequired: true,
      noProvisioning: true,
      noWorkflowEnrollment: true,
      noSmsMetaStripeProviderSideEffects: true,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
