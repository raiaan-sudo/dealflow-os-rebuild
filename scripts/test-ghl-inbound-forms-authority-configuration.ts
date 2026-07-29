import assert from "node:assert/strict";
import fs from "node:fs";

import { createEnvironmentGhlCredentialResolver } from "../src/lib/integrations/gohighlevel/credential-resolver";
import { GhlHttpClient } from "../src/lib/integrations/gohighlevel/http-client";
import { GhlSandboxAdapter } from "../src/lib/integrations/gohighlevel/sandbox-adapter";
import {
  configureGhlInboundFormsAuthorities,
  GhlInboundFormsAuthorityConfigurationError,
  parseGhlInboundFormsAuthorityBindings,
} from "../src/lib/services/ghl-inbound-forms-authority-configuration-service";

const sandboxGate = {
  enabled: true,
  providerEnvironment: "sandbox",
  deploymentTarget: "staging" as const,
  nodeEnv: "test",
  vercelEnv: "preview",
  isolatedDatabase: true,
  actualProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  expectedProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  providerAttestation: "DEALFLOW_GHL_SANDBOX_ONLY_V1",
  baseUrl: "https://services.leadconnectorhq.com",
};
const ORG_A = "71000000-0000-4000-8000-000000000001";
const MAP_A = "71000000-0000-4000-8000-000000000002";
const INSTALL_A = "71000000-0000-4000-8000-000000000003";
const MANIFEST_A = "71000000-0000-4000-8000-000000000004";
const ORG_B = "72000000-0000-4000-8000-000000000001";
const MAP_B = "72000000-0000-4000-8000-000000000002";
const INSTALL_B = "72000000-0000-4000-8000-000000000003";
const MANIFEST_B = "72000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-07-13T12:00:00.000Z");

type Row = Record<string, unknown>;
type Filter = ["eq" | "not", string, unknown];
function queryBuilder(source: Row[], filters: Filter[] = []): any {
  const apply = () => source.filter((row) => filters.every(([kind, column, value]) =>
    kind === "eq" ? row[column] === value : row[column] !== null && row[column] !== undefined));
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => queryBuilder(source, [...filters, ["eq", column, value]]),
    not: (column: string, operator: string, value: unknown) => operator === "is" && value === null
      ? queryBuilder(source, [...filters, ["not", column, value]])
      : query,
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: apply(), error: null }).then(resolve, reject),
  };
  return query;
}

const tables: Record<string, Row[]> = {
  ghl_workspace_tenants: [
    { organization_id: ORG_A, tenant_kind: "direct_realtor", partner_id: null, status: "active" },
    { organization_id: ORG_B, tenant_kind: "direct_realtor", partner_id: null, status: "active" },
  ],
  ghl_location_mappings: [
    {
      id: MAP_A, organization_id: ORG_A, installation_id: INSTALL_A, environment: "sandbox",
      provider_location_id: "location-a", snapshot_manifest_id: MANIFEST_A, status: "active",
      snapshot_verified_at: NOW.toISOString(), required_objects_verified_at: NOW.toISOString(),
    },
    {
      id: MAP_B, organization_id: ORG_B, installation_id: INSTALL_B, environment: "sandbox",
      provider_location_id: "location-b", snapshot_manifest_id: MANIFEST_B, status: "active",
      snapshot_verified_at: NOW.toISOString(), required_objects_verified_at: NOW.toISOString(),
    },
  ],
  ghl_installations: [
    { id: INSTALL_A, environment: "sandbox", provider_agency_id: "agency-a", encrypted_credential_ref: "env:GHL_SANDBOX_AGENCY_TOKEN", status: "active" },
    { id: INSTALL_B, environment: "sandbox", provider_agency_id: "agency-b", encrypted_credential_ref: "env:GHL_SANDBOX_AGENCY_TOKEN", status: "active" },
  ],
  ghl_snapshot_manifests: [
    {
      id: MANIFEST_A, environment: "sandbox", installation_id: INSTALL_A, provider_snapshot_id: "snapshot-a",
      required_objects: [{ kind: "pipeline", key: "pipeline", providerObjectId: "pipeline-a" }],
      installation_mode: "preinstalled", status: "approved",
    },
    {
      id: MANIFEST_B, environment: "sandbox", installation_id: INSTALL_B, provider_snapshot_id: "snapshot-b",
      required_objects: [{ kind: "pipeline", key: "pipeline", providerObjectId: "pipeline-b" }],
      installation_mode: "preinstalled", status: "approved",
    },
  ],
  workspace_ghl_mapping: [],
};

function binding(organizationId = ORG_A, mappingId = MAP_A, providerLocationId = "location-a", suffix = "A") {
  return {
    organizationId,
    mappingId,
    providerLocationId,
    credentialRef: `env:GHL_SANDBOX_LOCATION_${suffix}_TOKEN`,
  };
}

function expectConfigError(code: string, operation: () => unknown | Promise<unknown>) {
  return assert.rejects(async () => operation(), (error: unknown) => {
    assert.ok(error instanceof GhlInboundFormsAuthorityConfigurationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function main() {
const probeCredential = "synthetic-sandbox-token-never-sent";
const probeRequests: Array<{ url: URL; method: string; version: string | null; body: BodyInit | null | undefined }> = [];
const probeAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_LOCATION_A_TOKEN",
  credentialResolver: createEnvironmentGhlCredentialResolver({
    GHL_SANDBOX_LOCATION_A_TOKEN: probeCredential,
  }),
  gate: sandboxGate,
  companyId: "agency-a",
  httpClient: new GhlHttpClient({
    maxReadAttempts: 1,
    fetcher: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), `Bearer ${probeCredential}`);
      probeRequests.push({
        url: new URL(url.toString()),
        method: init?.method ?? "GET",
        version: headers.get("version"),
        body: init?.body,
      });
      return new Response(JSON.stringify({ submissions: [], meta: { nextPage: null } }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "synthetic-probe-request" },
      });
    },
    sleep: async () => {},
  }),
});
const probeResult = await probeAdapter.verifyFormSubmissionsReadScope({
  providerLocationId: "location-a",
  requiredFormIds: ["form-a-2", "form-a-1", "form-a-2"],
});
assert.equal(probeResult.outcome, "succeeded");
assert.equal(probeResult.providerMutationAttempted, false);
assert.match(probeResult.responseFingerprint ?? "", /^[a-f0-9]{64}$/);
if (probeResult.outcome === "succeeded") {
  assert.deepEqual(probeResult.verifiedReferences, ["form-a-1", "form-a-2"]);
}
assert.equal(probeRequests.length, 2);
for (const [index, request] of probeRequests.entries()) {
  assert.equal(request.url.origin, "https://services.leadconnectorhq.com");
  assert.equal(request.url.pathname, "/forms/submissions");
  assert.equal(request.method, "GET");
  assert.equal(request.version, "v3");
  assert.equal(request.body, undefined);
  assert.deepEqual(Object.fromEntries(request.url.searchParams), {
    locationId: "location-a",
    page: "1",
    limit: "1",
    formId: `form-a-${index + 1}`,
    q: "dealflow_scope_probe_no_contact_000000000000",
    startAt: "1970-01-01",
    endAt: "1970-01-01",
  });
}
const invalidOversizedProbe = await probeAdapter.verifyFormSubmissionsReadScope({
  providerLocationId: "location-a",
  requiredFormIds: Array.from({ length: 26 }, (_, index) => `form-budget-${index + 1}`),
});
assert.equal(invalidOversizedProbe.outcome, "operator_action_required");
assert.equal(invalidOversizedProbe.errorCode, "ghl_form_submissions_scope_probe_invalid");
assert.equal(probeRequests.length, 2, "oversized form scope reached the provider boundary");

const unsafeProbeMarker = "synthetic-customer-body-must-not-escape";
let unsafeProbeMethod = "";
let unsafeProbeBody: BodyInit | null | undefined;
const unsafeProbeAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_LOCATION_A_TOKEN",
  credentialResolver: createEnvironmentGhlCredentialResolver({
    GHL_SANDBOX_LOCATION_A_TOKEN: probeCredential,
  }),
  gate: sandboxGate,
  companyId: "agency-a",
  httpClient: new GhlHttpClient({
    maxReadAttempts: 1,
    fetcher: async (_url, init) => {
      unsafeProbeMethod = init?.method ?? "GET";
      unsafeProbeBody = init?.body;
      return new Response(JSON.stringify({
        submissions: [{ id: "unexpected-submission", contactId: unsafeProbeMarker }],
        meta: { nextPage: null },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    sleep: async () => {},
  }),
});
const unsafeProbeResult = await unsafeProbeAdapter.verifyFormSubmissionsReadScope({
  providerLocationId: "location-a",
  requiredFormIds: ["form-a-1"],
});
assert.equal(unsafeProbeResult.outcome, "operator_action_required");
assert.equal(unsafeProbeResult.errorCode, "ghl_form_submissions_scope_probe_unbounded");
assert.equal(unsafeProbeResult.providerMutationAttempted, false);
assert.equal(unsafeProbeMethod, "GET");
assert.equal(unsafeProbeBody, undefined);
assert.ok(!JSON.stringify(unsafeProbeResult).includes(unsafeProbeMarker), "probe response body escaped the adapter boundary");

const parsed = parseGhlInboundFormsAuthorityBindings({
  environment: "sandbox",
  serialized: JSON.stringify([
    binding(ORG_B, MAP_B, "location-b", "B"),
    binding(),
  ]),
});
assert.deepEqual(parsed.map((item) => item.mappingId), [MAP_A, MAP_B], "binding registry must sort deterministically");
assert.deepEqual(parseGhlInboundFormsAuthorityBindings({ environment: "sandbox", serialized: undefined }), []);
for (const serialized of [
  "not-json",
  JSON.stringify([binding(ORG_A, MAP_A, "location-a", "AGENCY")]),
  JSON.stringify([{ ...binding(), credentialRef: "pit-plaintext-token" }]),
  JSON.stringify([binding(), binding(ORG_B, MAP_A, "location-b", "B")]),
  JSON.stringify([binding(), binding(ORG_B, MAP_B, "location-a", "B")]),
]) {
  assert.throws(
    () => parseGhlInboundFormsAuthorityBindings({ environment: "sandbox", serialized }),
    GhlInboundFormsAuthorityConfigurationError,
  );
}

let unauthorizedRpcCount = 0;
await expectConfigError("ghl_sandbox_inbound_forms_authorization_missing", () =>
  configureGhlInboundFormsAuthorities({
    client: { from: (table: string) => queryBuilder(tables[table] ?? []), rpc: async () => { unauthorizedRpcCount += 1; return { data: null, error: null }; } },
    environment: "sandbox",
    bindings: [binding()],
    enableRuntime: true,
    authorization: "almost-right",
    sandboxGate,
    providerFactory: () => { throw new Error("provider must not be constructed"); },
  }));
assert.equal(unauthorizedRpcCount, 0, "wrong owner authorization reached the database");

const disableCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
let disableProviderCount = 0;
const disabled = await configureGhlInboundFormsAuthorities({
  client: {
    from: (table: string) => queryBuilder(tables[table] ?? []),
    rpc: async (name: string, params: Record<string, unknown>) => {
      disableCalls.push({ name, params });
      return { data: { inbound_form_reconciliation_enabled: false }, error: null };
    },
  },
  environment: "sandbox",
  bindings: [],
  enableRuntime: false,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  providerFactory: () => { disableProviderCount += 1; throw new Error("emergency disable constructed a provider"); },
});
assert.equal(disableProviderCount, 0);
assert.deepEqual(disableCalls, [
  {
    name: "set_ghl_inbound_form_sweep_runtime_v1",
    params: { p_environment: "sandbox", p_enabled: false, p_now: NOW.toISOString() },
  },
  {
    name: "set_ghl_inbound_form_reconciliation_runtime_v1",
    params: { p_environment: "sandbox", p_enabled: false, p_now: NOW.toISOString() },
  },
]);
assert.deepEqual(disabled, {
  environment: "sandbox",
  runtimeEnabled: false,
  sweepRuntimeEnabled: false,
  configured: [],
  providerMutationAttempted: false,
});

await expectConfigError("ghl_sandbox_inbound_forms_sweep_requires_reconciliation", () =>
  configureGhlInboundFormsAuthorities({
    client: { from: (table: string) => queryBuilder(tables[table] ?? []), rpc: async () => ({ data: null, error: null }) },
    environment: "sandbox",
    bindings: [],
    enableRuntime: false,
    enablePeriodicSweep: true,
    authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
    sandboxGate,
    providerFactory: () => { throw new Error("invalid enable combination constructed a provider"); },
  }));

function makeClient(options: {
  routeFailure?: boolean;
  canonicalMappingOverride?: string;
  sweepDrainCounts?: number[];
  reconciliationDrainCounts?: number[];
} = {}) {
  const calls: Array<{ kind: string; detail: string }> = [];
  let configureCalls = 0;
  let sweepDrainIndex = 0;
  let reconciliationDrainIndex = 0;
  const localTables = options.canonicalMappingOverride
    ? { ...tables, ghl_location_mappings: tables.ghl_location_mappings.map((row) => row.organization_id === ORG_A ? { ...row, id: options.canonicalMappingOverride } : row) }
    : tables;
  const client = {
    from: (table: string) => queryBuilder(localTables[table] ?? []),
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ kind: "rpc", detail: name });
      if (name === "set_ghl_inbound_form_sweep_runtime_v1") return { data: Boolean(params.p_enabled), error: null };
      if (name === "set_ghl_inbound_form_reconciliation_runtime_v1") return { data: false, error: null };
      if (name === "drain_ghl_inbound_form_sweep_claims_v1") {
        const counts = options.sweepDrainCounts ?? [0];
        return { data: counts[Math.min(sweepDrainIndex++, counts.length - 1)], error: null };
      }
      if (name === "drain_ghl_inbound_form_reconciliation_claims_v1") {
        const counts = options.reconciliationDrainCounts ?? [0];
        return { data: counts[Math.min(reconciliationDrainIndex++, counts.length - 1)], error: null };
      }
      if (name === "list_ghl_inbound_eligible_form_routes_v1") {
        if (options.routeFailure) return { data: null, error: { message: "synthetic route lookup failure" } };
        return {
          data: params.p_location_mapping_id === MAP_A
            ? [{ provider_form_id: "form-a-2" }, { provider_form_id: "form-a-1" }]
            : [{ provider_form_id: "form-b-1" }],
          error: null,
        };
      }
      if (name === "configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v") {
        configureCalls += 1;
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { calls, client, configureCalls: () => configureCalls };
}

const mismatch = makeClient({ canonicalMappingOverride: "73000000-0000-4000-8000-000000000002" });
let mismatchProviderCount = 0;
await expectConfigError("ghl_sandbox_inbound_forms_mapping_mismatch", () => configureGhlInboundFormsAuthorities({
  client: mismatch.client,
  environment: "sandbox",
  bindings: [binding()],
  enableRuntime: true,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  providerFactory: () => { mismatchProviderCount += 1; throw new Error("mismatch reached provider"); },
}));
assert.equal(mismatchProviderCount, 0);
assert.equal(mismatch.configureCalls(), 0);

const failedProvider = makeClient();
let failedProviderCalls = 0;
await expectConfigError("synthetic_forms_get_failed", () => configureGhlInboundFormsAuthorities({
  client: failedProvider.client,
  environment: "sandbox",
  bindings: [binding()],
  enableRuntime: true,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  providerFactory: () => ({
    verifyPreinstalledForms: async () => {
      failedProviderCalls += 1;
      return { outcome: "retryable_failure", errorCode: "synthetic_forms_get_failed", providerMutationAttempted: false };
    },
    verifyFormSubmissionsReadScope: async () => { throw new Error("submission scope should not run"); },
  }),
}));
assert.equal(failedProviderCalls, 1);
assert.equal(failedProvider.configureCalls(), 0, "provider GET failure persisted a binding");

const missingEvidence = makeClient();
await expectConfigError("ghl_sandbox_inbound_form_submissions_scope_evidence_invalid", () =>
  configureGhlInboundFormsAuthorities({
    client: missingEvidence.client,
    environment: "sandbox",
    bindings: [binding()],
    enableRuntime: true,
    enablePeriodicSweep: true,
    authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
    sandboxGate,
    now: () => NOW,
    providerFactory: () => ({
      verifyPreinstalledForms: async () => ({ outcome: "succeeded", providerMutationAttempted: false }),
      verifyFormSubmissionsReadScope: async () => ({
        outcome: "succeeded",
        responseFingerprint: null,
        providerMutationAttempted: false,
      }),
    }),
  }));
assert.equal(missingEvidence.configureCalls(), 0, "missing provider proof reopened a runtime gate");

const requestIdAtLimit = makeClient();
await configureGhlInboundFormsAuthorities({
  client: requestIdAtLimit.client,
  environment: "sandbox",
  bindings: [binding()],
  enableRuntime: true,
  enablePeriodicSweep: true,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  providerFactory: () => ({
    verifyPreinstalledForms: async () => ({ outcome: "succeeded", providerMutationAttempted: false }),
    verifyFormSubmissionsReadScope: async () => ({
      outcome: "succeeded",
      providerRequestId: "r".repeat(240),
      responseFingerprint: "d".repeat(64),
      providerMutationAttempted: false,
    }),
  }),
});
assert.equal(requestIdAtLimit.configureCalls(), 1, "240-character provider request id must reach the atomic proof RPC");

const requestIdOverLimit = makeClient();
await expectConfigError("ghl_sandbox_inbound_form_submissions_scope_evidence_invalid", () =>
  configureGhlInboundFormsAuthorities({
    client: requestIdOverLimit.client,
    environment: "sandbox",
    bindings: [binding()],
    enableRuntime: true,
    enablePeriodicSweep: true,
    authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
    sandboxGate,
    now: () => NOW,
    providerFactory: () => ({
      verifyPreinstalledForms: async () => ({ outcome: "succeeded", providerMutationAttempted: false }),
      verifyFormSubmissionsReadScope: async () => ({
        outcome: "succeeded",
        providerRequestId: "r".repeat(241),
        responseFingerprint: "e".repeat(64),
        providerMutationAttempted: false,
      }),
    }),
  }));
assert.equal(requestIdOverLimit.configureCalls(), 0, "241-character provider request id must fail before the atomic proof RPC");

const success = makeClient();
const order: string[] = [];
const successResult = await configureGhlInboundFormsAuthorities({
  client: {
    ...success.client,
    rpc: async (name: string, params: Record<string, unknown>) => {
      if (name === "configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v") {
        order.push("batch-bind-and-open");
        assert.deepEqual(params.p_bindings, [
          {
            ...binding(),
            verifiedFormIds: ["form-a-1", "form-a-2"],
            submissionScopeProviderRequestId: "scope-location-a",
            submissionScopeResponseFingerprint: "a".repeat(64),
          },
          {
            ...binding(ORG_B, MAP_B, "location-b", "B"),
            verifiedFormIds: ["form-b-1"],
            submissionScopeProviderRequestId: "scope-location-b",
            submissionScopeResponseFingerprint: "b".repeat(64),
          },
        ]);
        assert.equal(params.p_enable_periodic_sweep, true);
        assert.equal(params.p_actor, "owner:dealflow-inbound-forms-authority-command");
      }
      return success.client.rpc(name, params);
    },
  },
  environment: "sandbox",
  bindings: parsed,
  enableRuntime: true,
  enablePeriodicSweep: true,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  providerFactory: ({ authority, credentialRef }) => {
    assert.match(credentialRef, /^env:GHL_SANDBOX_LOCATION_/);
    return {
      verifyPreinstalledForms: async ({ providerLocationId, requiredFormIds }) => {
        order.push(`forms:${providerLocationId}`);
        assert.equal(providerLocationId, authority.providerLocationId);
        assert.deepEqual(requiredFormIds, providerLocationId === "location-a" ? ["form-a-1", "form-a-2"] : ["form-b-1"]);
        return { outcome: "succeeded", providerMutationAttempted: false };
      },
      verifyFormSubmissionsReadScope: async ({ providerLocationId }) => {
        order.push(`submissions:${providerLocationId}`);
        return {
          outcome: "succeeded",
          providerRequestId: `scope-${providerLocationId}`,
          responseFingerprint: (providerLocationId === "location-a" ? "a" : "b").repeat(64),
          providerMutationAttempted: false,
        };
      },
    };
  },
});
assert.deepEqual(order, [
  "forms:location-a", "submissions:location-a",
  "forms:location-b", "submissions:location-b",
  "batch-bind-and-open",
]);
assert.equal(success.configureCalls(), 1, "configuration must use one atomic batch RPC");
const successRpcNames = success.calls.filter((call) => call.kind === "rpc").map((call) => call.detail);
assert.deepEqual(successRpcNames.slice(0, 4), [
  "set_ghl_inbound_form_sweep_runtime_v1",
  "set_ghl_inbound_form_reconciliation_runtime_v1",
  "drain_ghl_inbound_form_sweep_claims_v1",
  "drain_ghl_inbound_form_reconciliation_claims_v1",
]);
assert.equal(successRpcNames.at(-1), "configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v");
assert.equal(successResult.runtimeEnabled, true);
assert.equal(successResult.sweepRuntimeEnabled, true);
assert.equal(successResult.providerMutationAttempted, false);
assert.deepEqual(successResult.configured.map((item) => item.verifiedFormCount), [2, 1]);
const rendered = JSON.stringify(successResult);
assert.ok(!rendered.includes('"credentialRef":'));
assert.ok(!rendered.includes("GHL_SANDBOX_LOCATION"));
assert.ok(!rendered.includes("TOKEN"));
assert.ok(
  successResult.configured.every((item) => /^[a-f0-9]{64}$/.test(item.credentialReferenceFingerprint)),
  JSON.stringify(successResult.configured),
);

const delayedDrain = makeClient({
  sweepDrainCounts: [2, 0],
  reconciliationDrainCounts: [1, 0],
});
let drainSleeps = 0;
await configureGhlInboundFormsAuthorities({
  client: delayedDrain.client,
  environment: "sandbox",
  bindings: [binding()],
  enableRuntime: true,
  enablePeriodicSweep: false,
  authorization: "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1",
  sandboxGate,
  now: () => NOW,
  sleep: async () => { drainSleeps += 1; },
  drainTimeoutMs: 1_000,
  providerFactory: () => ({
    verifyPreinstalledForms: async () => ({ outcome: "succeeded", providerMutationAttempted: false }),
    verifyFormSubmissionsReadScope: async () => ({
      outcome: "succeeded",
      providerRequestId: null,
      responseFingerprint: "c".repeat(64),
      providerMutationAttempted: false,
    }),
  }),
});
assert.equal(drainSleeps, 1, "configuration must wait until both worker families report zero live leases");
const delayedRpcNames = delayedDrain.calls.filter((call) => call.kind === "rpc").map((call) => call.detail);
assert.equal(delayedRpcNames.filter((name) => name === "drain_ghl_inbound_form_sweep_claims_v1").length, 2);
assert.equal(delayedRpcNames.filter((name) => name === "drain_ghl_inbound_form_reconciliation_claims_v1").length, 2);
assert.equal(delayedRpcNames.includes("set_ghl_inbound_form_sweep_runtime_v1"), true);

const cliSource = fs.readFileSync("scripts/configure-ghl-inbound-forms-authority.ts", "utf8");
assert.match(cliSource, /const bindings = enableRuntime\s*\? parseGhlInboundFormsAuthorityBindings\([\s\S]*?\)\s*:\s*\[\];/,
  "emergency disable must bypass even a malformed binding registry");
assert.match(cliSource, /INBOUND_FORM_SWEEP_ENABLED/);
assert.match(cliSource, /enablePeriodicSweep,/);
assert.match(cliSource, /ghlProductionGateFromEnvironment\("form_submissions_read", process\.env\)/);
assert.doesNotMatch(cliSource, /ghlProductionGateFromEnvironment\("lifecycle_webhook", process\.env\)/);
assert.match(cliSource, /process\.stdout\.write\(`\$\{JSON\.stringify\(result, null, 2\)\}\\n`\)/);
assert.doesNotMatch(cliSource, /process\.stdout\.write\([^\n]*(credentialRef|process\.env)/);

console.log("PASS GHL inbound forms authority configuration: exact owner auth, parser rejection, emergency disable, canonical mapping, GET-only verification, single atomic batch, sanitized output");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
