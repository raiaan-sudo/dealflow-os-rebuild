import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-ghl-sandbox-"));
const tsc = path.join(repoRoot, "node_modules", ".bin", "tsc");
const sourceFiles = [
  "src/lib/integrations/gohighlevel/types.ts",
  "src/lib/integrations/gohighlevel/state-machine.ts",
  "src/lib/integrations/gohighlevel/write-gate.ts",
  "src/lib/integrations/gohighlevel/capabilities.ts",
  "src/lib/integrations/gohighlevel/credential-resolver.ts",
  "src/lib/integrations/gohighlevel/sandbox-gate.ts",
  "src/lib/integrations/gohighlevel/http-client.ts",
  "src/lib/integrations/gohighlevel/sandbox-adapter.ts",
  "src/lib/integrations/gohighlevel/fake-adapter.ts",
  "src/lib/integrations/gohighlevel/memory-repository.ts",
  "src/lib/integrations/gohighlevel/index.ts",
  "src/lib/services/ghl-provisioning-service.ts",
  "src/lib/services/ghl-sandbox-authority-service.ts",
  "src/lib/services/ghl-sandbox-enqueue-service.ts",
  "src/lib/services/ghl-sandbox-outbox-service.ts",
];

const compile = spawnSync(tsc, [
  "--pretty", "false",
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--strict",
  "--esModuleInterop",
  "--skipLibCheck",
  "--rootDir", "src",
  "--outDir", buildDir,
  ...sourceFiles,
], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
if (compile.status !== 0) {
  throw new Error(`GHL sandbox target compilation failed:\n${compile.stdout}${compile.stderr}`);
}

const require = createRequire(import.meta.url);
const integration = require(path.join(buildDir, "lib", "integrations", "gohighlevel", "index.js"));
const enqueueService = require(path.join(buildDir, "lib", "services", "ghl-sandbox-enqueue-service.js"));
const outboxService = require(path.join(buildDir, "lib", "services", "ghl-sandbox-outbox-service.js"));

const {
  GHL_SANDBOX_PROVIDER_ATTESTATION,
  GhlHttpClient,
  GhlSandboxAdapter,
  createEnvironmentGhlCredentialResolver,
  evaluateGhlSandboxGate,
} = integration;

const allowedGate = {
  enabled: true,
  providerEnvironment: "sandbox",
  deploymentTarget: "staging",
  nodeEnv: "test",
  vercelEnv: "preview",
  isolatedDatabase: true,
  actualProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  expectedProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  providerAttestation: GHL_SANDBOX_PROVIDER_ATTESTATION,
  baseUrl: "https://services.leadconnectorhq.com",
};

assert.equal(evaluateGhlSandboxGate(allowedGate).code, "allowed_sandbox");
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, nodeEnv: "production" }).code,
  "allowed_sandbox",
  "a production-optimized Next build is allowed only when deployment authority is explicit staging",
);
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, deploymentTarget: "production" }).code,
  "production_environment_forbidden",
);
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, deploymentTarget: "unknown" }).code,
  "deployment_target_unproven",
);
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, vercelEnv: "production" }).code,
  "production_environment_forbidden",
  "Vercel production authority overrides a conflicting staging label",
);
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, actualProjectRef: "bbbbbbbbbbbbbbbbbbbb" }).code,
  "isolated_project_mismatch",
);
assert.equal(
  evaluateGhlSandboxGate({ ...allowedGate, baseUrl: "https://evil.example" }).code,
  "provider_host_forbidden",
);

const testToken = `pit-${"x".repeat(40)}`;
const resolver = createEnvironmentGhlCredentialResolver({ GHL_SANDBOX_AGENCY_TOKEN: testToken });
const credentialResult = await resolver.withCredential("env:GHL_SANDBOX_AGENCY_TOKEN", async (token) => ({
  length: token.length,
  suffix: token.slice(-2),
}));
assert.equal(credentialResult.length, testToken.length);
assert.equal(JSON.stringify(credentialResult).includes(testToken), false);
await assert.rejects(
  () => resolver.withCredential("env:PRODUCTION_GHL_TOKEN", async () => true),
  (error) => error.code === "ghl_credential_reference_invalid",
);

let readCalls = 0;
const readClient = new GhlHttpClient({
  fetcher: async () => {
    readCalls += 1;
    if (readCalls === 1) {
      return new Response('{"message":"rate limited"}', {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "0" },
      });
    }
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "request-read-1" },
    });
  },
  sleep: async () => {},
});
const readResult = await readClient.request({
  method: "GET",
  path: "/locations/sandbox-location",
  credential: testToken,
});
assert.equal(readCalls, 2, "safe reads retry a bounded 429");
assert.equal(readResult.ok, true);
assert.equal(JSON.stringify(readResult).includes(testToken), false);

let writeCalls = 0;
const noRetryClient = new GhlHttpClient({
  fetcher: async () => {
    writeCalls += 1;
    return new Response('{"message":"temporary"}', { status: 503 });
  },
  sleep: async () => {},
});
const noRetryResult = await noRetryClient.request({
  method: "POST",
  path: "/contacts/upsert",
  credential: testToken,
  body: { locationId: "sandbox-location" },
});
assert.equal(writeCalls, 1, "provider writes are never transport-retried blindly");
assert.equal(noRetryResult.status, 503);

const capturedRequests = [];
const adapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async (url, init) => {
      capturedRequests.push({ url: String(url), init });
      if (String(url).endsWith("/contacts/upsert")) {
        return new Response('{"contact":{"id":"sandbox-contact"}}', {
          status: 200,
          headers: { "x-request-id": "request-contact-1" },
        });
      }
      if (String(url).includes("/snapshots/snapshot-status/")) {
        return new Response('{"status":"completed"}', { status: 200 });
      }
      throw new Error(`Unexpected adapter URL: ${url}`);
    },
    sleep: async () => {},
  }),
});
const contactResult = await adapter.upsertContact({
  idempotencyKey: "contact-idempotency-1",
  providerLocationId: "sandbox-location",
  lead: {
    id: "lead-1",
    organizationId: "org-1",
    firstName: "Synthetic",
    lastName: "Lead",
    name: "Synthetic Lead",
    email: "synthetic@example.com",
    phone: null,
    source: "DealFlow staging",
  },
});
assert.equal(contactResult.outcome, "succeeded");
assert.equal(contactResult.providerReference, "sandbox-contact");
assert.equal(JSON.stringify(contactResult).includes("synthetic@example.com"), false);
assert.equal(JSON.stringify(contactResult).includes(testToken), false);
assert.equal(capturedRequests[0].init.headers.Authorization, `Bearer ${testToken}`);

const unsupportedSnapshot = await adapter.installSnapshot({
  idempotencyKey: "snapshot-1",
  providerLocationId: "sandbox-location",
  manifest: {
    id: "manifest-1",
    environment: "sandbox",
    snapshotKey: "dealflow",
    snapshotVersion: "1",
    providerSnapshotId: "sandbox-snapshot",
    installationMode: "provider_api",
    requiredObjects: [{ kind: "tag", key: "dealflow" }],
    status: "approved",
  },
});
assert.equal(unsupportedSnapshot.outcome, "operator_action_required");
assert.equal(unsupportedSnapshot.errorCode, "ghl_snapshot_push_api_unavailable");
const preinstalledSnapshot = await adapter.installSnapshot({
  idempotencyKey: "snapshot-2",
  providerLocationId: "sandbox-location",
  manifest: {
    id: "manifest-1",
    environment: "sandbox",
    snapshotKey: "dealflow",
    snapshotVersion: "1",
    providerSnapshotId: "sandbox-snapshot",
    installationMode: "preinstalled",
    requiredObjects: [{ kind: "tag", key: "dealflow" }],
    status: "approved",
  },
});
assert.equal(preinstalledSnapshot.outcome, "succeeded");

function queryBuilder(rows, filters = []) {
  const apply = () => rows.filter((row) => filters.every(([column, operation, value]) => {
    if (operation === "eq") return row[column] === value;
    if (operation === "not-null") return row[column] !== null && row[column] !== undefined;
    return true;
  }));
  const query = {
    select: () => query,
    eq: (column, value) => queryBuilder(rows, [...filters, [column, "eq", value]]),
    not: (column, operator, value) => operator === "is" && value === null
      ? queryBuilder(rows, [...filters, [column, "not-null", value]])
      : query,
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    then: (resolve, reject) => Promise.resolve({ data: apply(), error: null }).then(resolve, reject),
  };
  return query;
}

const organizationId = "00000000-0000-4000-8000-000000000101";
const leadId = "00000000-0000-4000-8000-000000000102";
const tables = {
  ghl_workspace_tenants: [{ organization_id: organizationId, tenant_kind: "direct_realtor", partner_id: null, status: "active" }],
  ghl_location_mappings: [{
    id: "00000000-0000-4000-8000-000000000103",
    organization_id: organizationId,
    installation_id: "00000000-0000-4000-8000-000000000104",
    environment: "sandbox",
    provider_location_id: "sandbox-location",
    snapshot_manifest_id: "00000000-0000-4000-8000-000000000105",
    status: "active",
    snapshot_verified_at: "2026-07-12T00:00:00.000Z",
    required_objects_verified_at: "2026-07-12T00:00:00.000Z",
  }],
  ghl_installations: [{
    id: "00000000-0000-4000-8000-000000000104",
    environment: "sandbox",
    provider_agency_id: "sandbox-company",
    encrypted_credential_ref: "env:GHL_SANDBOX_AGENCY_TOKEN",
    status: "active",
  }],
  ghl_snapshot_manifests: [{
    id: "00000000-0000-4000-8000-000000000105",
    environment: "sandbox",
    provider_snapshot_id: "sandbox-snapshot",
    installation_mode: "preinstalled",
    status: "approved",
    required_objects: [
      { kind: "pipeline", key: "new-lead", providerObjectId: "sandbox-pipeline" },
      { kind: "stage", key: "incoming", providerObjectId: "sandbox-stage" },
      { kind: "tag", key: "dealflow-lead" },
      { kind: "workflow", key: "follow-up", providerObjectId: "sandbox-workflow" },
    ],
  }],
  workspace_ghl_mapping: [],
  partner_ghl_config: [],
  leads: [{
    id: leadId,
    organization_id: organizationId,
    first_name: "Synthetic",
    last_name: "Lead",
    name: "Synthetic Lead",
    email: "synthetic@example.com",
    phone: null,
    source: "DealFlow staging",
  }],
  ghl_lead_effect_events: [],
};
const fixedEffects = ["contact", "opportunity", "tag", "workflow"].map((kind, index) => ({
  id: `00000000-0000-4000-8000-0000000002${index}0`,
  effect_kind: `${kind}_effect`,
}));
let claimReturned = false;
const claimed = {
  id: "00000000-0000-4000-8000-000000000301",
  organization_id: organizationId,
  operation: "lead_contact_upsert",
  idempotency_key: "ghl-sandbox-contact-1",
  status: "dispatching",
  attempt_count: 1,
  locked_by: "sandbox-worker",
  lease_token: "00000000-0000-4000-8000-000000000302",
  lease_generation: 1,
  request_payload: {
    provider_mode: "sandbox",
    organization_id: organizationId,
    lead_id: leadId,
    location_mapping_id: "00000000-0000-4000-8000-000000000103",
    effect_kind: "contact_upsert",
  },
};
const fakeDb = {
  from: (table) => queryBuilder(tables[table] ?? []),
  rpc: async (name) => {
    if (name === "enqueue_ghl_sandbox_lead_effects") return { data: fixedEffects, error: null };
    if (name === "claim_next_ghl_sandbox_lead_outbox") {
      if (claimReturned) return { data: [], error: null };
      claimReturned = true;
      return { data: [claimed], error: null };
    }
    if (name === "settle_ghl_provider_outbox") return { data: [{ id: claimed.id }], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  },
};
const firstEnqueue = await enqueueService.enqueueGhlSandboxLeadDelivery({
  client: fakeDb,
  gate: allowedGate,
  organizationId,
  leadId,
  now: "2026-07-12T00:00:00.000Z",
});
const secondEnqueue = await enqueueService.enqueueGhlSandboxLeadDelivery({
  client: fakeDb,
  gate: allowedGate,
  organizationId,
  leadId,
  now: "2026-07-12T00:00:01.000Z",
});
assert.deepEqual(firstEnqueue.effectIds, secondEnqueue.effectIds, "same lead reuses exact effect identities");
assert.equal(firstEnqueue.queued, true);
assert.equal(firstEnqueue.providerMutationAttempted, false);

let providerContactCalls = 0;
const processed = await outboxService.processNextGhlSandboxOutbox({
  client: fakeDb,
  gate: allowedGate,
  workerId: "sandbox-worker",
  now: () => "2026-07-12T00:00:02.000Z",
  providerFactory: () => ({
    kind: "sandbox",
    networkAccess: "https",
    upsertContact: async () => {
      providerContactCalls += 1;
      return {
        outcome: "succeeded",
        providerRequestId: "sandbox-request",
        providerReference: "sandbox-contact",
        httpStatus: 200,
        responseFingerprint: "a".repeat(64),
      };
    },
    upsertOpportunity: async () => { throw new Error("not expected"); },
    applyTag: async () => { throw new Error("not expected"); },
    enrollWorkflow: async () => { throw new Error("not expected"); },
    syncAppointment: async () => { throw new Error("not expected"); },
  }),
});
assert.equal(processed.status, "succeeded");
assert.equal(providerContactCalls, 1);
assert.equal(processed.providerReference, "sandbox-contact");

const migration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260712213000_create_ghl_sandbox_provider_path.sql"),
  "utf8",
);
assert.match(migration, /enqueue_ghl_sandbox_lead_effects/);
assert.match(migration, /claim_next_ghl_sandbox_lead_outbox/);
assert.match(migration, /provider_mode.*sandbox/s);
assert.match(migration, /when 'contact_upsert' then 0/);
assert.match(migration, /ghl_delivery/);
assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9_-]{20,}/);

console.log("GHL isolated sandbox integration regression passed (gates, no secret leakage, bounded HTTP, idempotent enqueue, fenced worker).\n");
