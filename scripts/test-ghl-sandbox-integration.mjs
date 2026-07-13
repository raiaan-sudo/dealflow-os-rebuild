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
  "src/lib/integrations/gohighlevel/production-gate.ts",
  "src/lib/integrations/gohighlevel/production-adapter.ts",
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
  GHL_PRODUCTION_PROVIDER_ATTESTATION,
  GHL_SANDBOX_PROVIDER_ATTESTATION,
  GhlHttpClient,
  GhlSandboxAdapter,
  buildGhlLocationCreateRequestFingerprint,
  buildGhlProviderLocationName,
  buildGhlSnapshotManifestFingerprint,
  createEnvironmentGhlCredentialResolver,
  createGhlProductionAdapter,
  createProductionEnvironmentGhlCredentialResolver,
  evaluateGhlProductionGate,
  evaluateGhlSandboxGate,
  ghlProductionGateFromEnvironment,
} = integration;

const allowedProductionGate = {
  enabled: true,
  operation: "lead_delivery",
  operationEnabled: true,
  providerEnvironment: "production",
  deploymentTarget: "production",
  vercelEnv: "production",
  exactProductionHost: true,
  actualProjectRef: "pppppppppppppppppppp",
  expectedProjectRef: "pppppppppppppppppppp",
  providerAttestation: GHL_PRODUCTION_PROVIDER_ATTESTATION,
  baseUrl: "https://services.leadconnectorhq.com",
};
assert.equal(evaluateGhlProductionGate(allowedProductionGate).code, "allowed_production");
assert.equal(evaluateGhlProductionGate({ ...allowedProductionGate, enabled: false }).code, "production_gate_closed");
assert.equal(evaluateGhlProductionGate({ ...allowedProductionGate, operationEnabled: false }).code, "operation_kill_switch_closed");
assert.equal(evaluateGhlProductionGate({ ...allowedProductionGate, deploymentTarget: "staging" }).code, "production_deployment_required");
assert.equal(
  evaluateGhlProductionGate({ ...allowedProductionGate, exactProductionHost: false }).code,
  "production_host_attestation_required",
);
assert.equal(evaluateGhlProductionGate({ ...allowedProductionGate, actualProjectRef: "qqqqqqqqqqqqqqqqqqqq" }).code, "production_project_mismatch");
const independentlyClosedReadGate = ghlProductionGateFromEnvironment(
  "form_submissions_read",
  {
    GHL_PRODUCTION_WRITES_ENABLED: "true",
    GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED: "true",
    GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED: "false",
  },
);
assert.equal(independentlyClosedReadGate.operation, "form_submissions_read");
assert.equal(independentlyClosedReadGate.operationEnabled, false,
  "enabling lifecycle webhooks must not silently authorize scheduled form-submission reads");
assert.equal(
  ghlProductionGateFromEnvironment("lifecycle_webhook", {
    GHL_PRODUCTION_WRITES_ENABLED: "true",
    GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED: "true",
    GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED: "false",
  }).operationEnabled,
  true,
);

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
  evaluateGhlSandboxGate({
    ...allowedGate,
    vercelEnv: "production",
    exactIsolatedStagingHost: true,
  }).code,
  "allowed_sandbox",
  "the exact attested isolated staging project may exercise the sandbox provider",
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
const productionToken = `pit-${"p".repeat(40)}`;
const productionResolver = createProductionEnvironmentGhlCredentialResolver({
  GHL_PRODUCTION_AGENCY_TOKEN: productionToken,
});
assert.equal(
  await productionResolver.withCredential("env:GHL_PRODUCTION_AGENCY_TOKEN", async (token) => token.length),
  productionToken.length,
);
await assert.rejects(
  () => productionResolver.withCredential("env:GHL_SANDBOX_AGENCY_TOKEN", async () => true),
  (error) => error.code === "ghl_production_credential_reference_invalid",
);
const productionAdapter = createGhlProductionAdapter({
  credentialRef: "env:GHL_PRODUCTION_AGENCY_TOKEN",
  credentialResolver: productionResolver,
  gate: allowedProductionGate,
  companyId: "production-company",
  httpClient: new GhlHttpClient({ fetcher: async () => { throw new Error("unexpected network"); } }),
});
assert.equal(productionAdapter.kind, "production");
assert.equal(productionAdapter.networkAccess, "https");

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
      if (String(url).endsWith("/locations/") && init.method === "POST") {
        return new Response('{"location":{"id":"sandbox-location-created"}}', {
          status: 200,
          headers: { "x-request-id": "request-location-create-1" },
        });
      }
      if (String(url).includes("/snapshots/snapshot-status/")) {
        return new Response('{"data":{"id":"snapshot-push-1","locationId":"sandbox-location","status":"completed","completed":["forms"],"pending":[]}}', { status: 200 });
      }
      if (String(url).includes("/customValues") && init.method === "GET") {
        return new Response('{"customValues":[]}', { status: 200 });
      }
      if (String(url).includes("/customValues") && init.method === "POST") {
        return new Response('{"customValue":{"id":"sandbox-custom-value"}}', { status: 200 });
      }
      if (String(url).includes("/forms/?locationId=")) {
        return new Response('{"forms":[{"id":"sandbox-form","locationId":"sandbox-location"}],"total":1}', { status: 200 });
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

const locationSnapshotManifest = {
  id: "manifest-create-1",
  environment: "sandbox",
  snapshotKey: "dealflow-realtor",
  snapshotVersion: "2026.07.13",
  providerSnapshotId: "sandbox-snapshot",
  installationMode: "preinstalled",
  requiredObjects: [{ kind: "tag", key: "dealflow" }],
  status: "approved",
};
const snapshotManifestFingerprint = buildGhlSnapshotManifestFingerprint(locationSnapshotManifest);
const locationCreateBase = {
  idempotencyKey: "ghl-provision-v1:sandbox:org-1:payment-1:dealflow:1:location_create",
  installationId: "installation-sandbox-1",
  environment: "sandbox",
  organizationId: "org-1",
  profile: {
    displayName: "Synthetic Realty",
    country: "CA",
    timezone: "America/Toronto",
  },
  snapshotManifest: locationSnapshotManifest,
  snapshotManifestFingerprint,
};
const locationCreateInput = {
  ...locationCreateBase,
  requestFingerprint: buildGhlLocationCreateRequestFingerprint(locationCreateBase),
};
const locationCreateResult = await adapter.createLocation(locationCreateInput);
assert.equal(locationCreateResult.outcome, "succeeded");
assert.equal(locationCreateResult.providerLocationId, "sandbox-location-created");
const locationCreateRequest = capturedRequests.find(({ url }) => url.endsWith("/locations/"));
const expectedProviderLocationName = buildGhlProviderLocationName(
  locationCreateInput.profile.displayName,
  locationCreateInput.requestFingerprint,
);
assert.equal(locationCreateRequest.init.method, "POST");
assert.equal(locationCreateRequest.init.headers.Version, "v3");
assert.deepEqual(JSON.parse(locationCreateRequest.init.body), {
  companyId: "sandbox-company",
  name: expectedProviderLocationName,
  country: "CA",
  timezone: "America/Toronto",
  snapshotId: "sandbox-snapshot",
});
assert.equal("prospectInfo" in JSON.parse(locationCreateRequest.init.body), false);
assert.equal(locationCreateRequest.init.body.includes('"source"'), false);
assert.equal(locationCreateRequest.init.body.includes('"id"'), false);
const requestsBeforeFingerprintMismatch = capturedRequests.length;
const fingerprintMismatch = await adapter.createLocation({
  ...locationCreateInput,
  requestFingerprint: "0".repeat(64),
});
assert.equal(fingerprintMismatch.outcome, "operator_action_required");
assert.equal(fingerprintMismatch.errorCode, "ghl_location_snapshot_contract_mismatch");
assert.equal(capturedRequests.length, requestsBeforeFingerprintMismatch, "fingerprint mismatch must make zero provider requests");

const reconciliationInput = {
  idempotencyKey: locationCreateInput.idempotencyKey,
  installationId: locationCreateInput.installationId,
  environment: locationCreateInput.environment,
  profile: locationCreateInput.profile,
  requestFingerprint: locationCreateInput.requestFingerprint,
  visibilityStartedAt: "2026-07-13T12:00:00.000Z",
  visibilityDeadlineAt: "2026-07-13T12:15:00.000Z",
  observedAt: "2026-07-13T12:01:00.000Z",
};
const reconciliationRequests = [];
const reconciliationAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async (url, init) => {
      reconciliationRequests.push({ url: String(url), init });
      const parsed = new URL(String(url));
      assert.equal(parsed.pathname, "/locations/search");
      assert.equal(parsed.searchParams.get("companyId"), "sandbox-company");
      assert.equal(parsed.searchParams.get("skip"), "0");
      assert.equal(parsed.searchParams.get("limit"), "100");
      assert.equal(parsed.searchParams.get("order"), "asc");
      return new Response(JSON.stringify({
        locations: [
          {
            id: "wrong-location",
            name: expectedProviderLocationName,
            country: "CA",
            timezone: "America/Vancouver",
          },
          {
            id: "sandbox-location-created",
            name: expectedProviderLocationName,
            country: "CA",
            timezone: "America/Toronto",
          },
        ],
      }), {
        status: 200,
        headers: { "x-request-id": "request-location-search-1" },
      });
    },
    sleep: async () => {},
  }),
});
const reconciledLocation = await reconciliationAdapter.reconcileLocationCreate(reconciliationInput);
assert.equal(reconciledLocation.outcome, "found");
assert.equal(reconciledLocation.providerLocationId, "sandbox-location-created");
assert.equal(reconciledLocation.requestFingerprint, locationCreateInput.requestFingerprint);
assert.match(reconciledLocation.responseFingerprint, /^[a-f0-9]{64}$/);
assert.equal(reconciliationRequests.length, 1);
assert.equal(reconciliationRequests[0].init.method, "GET");
assert.equal(reconciliationRequests[0].init.headers.Version, "v3");

const ambiguousReconciliationAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async () => new Response(JSON.stringify({
      locations: ["ambiguous-location-a", "ambiguous-location-b"].map((id) => ({
        id,
        name: expectedProviderLocationName,
        country: "CA",
        timezone: "America/Toronto",
      })),
    }), { status: 200 }),
    sleep: async () => {},
  }),
});
const ambiguousReconciliation = await ambiguousReconciliationAdapter
  .reconcileLocationCreate(reconciliationInput);
assert.equal(ambiguousReconciliation.outcome, "operator_action_required");
assert.equal(
  ambiguousReconciliation.errorCode,
  "ghl_location_reconciliation_multiple_exact_matches",
  "multiple exact matches must never be selected or authorize a create replay",
);

const absentReconciliationAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async () => new Response('{"locations":[]}', { status: 200 }),
    sleep: async () => {},
  }),
});
const absentReconciliation = await absentReconciliationAdapter
  .reconcileLocationCreate(reconciliationInput);
assert.equal(absentReconciliation.outcome, "not_found");
assert.equal(absentReconciliation.requestFingerprint, locationCreateInput.requestFingerprint);

const displayNameRequests = [];
let displayNameReadCount = 0;
const displayNameAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async (url, init) => {
      displayNameRequests.push({ url: String(url), init });
      if (init.method === "GET") {
        displayNameReadCount += 1;
        return new Response(JSON.stringify({
          location: {
            id: "sandbox-location-created",
            name: displayNameReadCount === 1
              ? expectedProviderLocationName
              : "Synthetic Realty",
            country: "CA",
            timezone: "America/Toronto",
          },
        }), { status: 200 });
      }
      assert.equal(init.method, "PUT");
      assert.deepEqual(JSON.parse(init.body), {
        companyId: "sandbox-company",
        name: "Synthetic Realty",
      });
      return new Response('{"message":"ambiguous"}', { status: 500 });
    },
    maxReadAttempts: 1,
    sleep: async () => {},
  }),
});
const finalizedDisplayName = await displayNameAdapter.finalizeLocationDisplayName({
  idempotencyKey: `${locationCreateInput.idempotencyKey}:location_display_name_finalize`,
  providerLocationId: "sandbox-location-created",
  environment: "sandbox",
  profile: locationCreateInput.profile,
  requestFingerprint: locationCreateInput.requestFingerprint,
});
assert.equal(finalizedDisplayName.outcome, "succeeded");
assert.deepEqual(
  displayNameRequests.map(({ init }) => init.method),
  ["GET", "PUT", "GET"],
  "an ambiguous idempotent cleanup must be resolved by exact readback before provisioning advances",
);
assert.equal(
  displayNameRequests.filter(({ init }) => init.method === "PUT").length,
  1,
  "the official PUT cleanup is never transport-retried blindly",
);

let alreadyCleanCalls = 0;
const alreadyCleanAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
  credentialResolver: resolver,
  gate: allowedGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async (_url, init) => {
      alreadyCleanCalls += 1;
      assert.equal(init.method, "GET", "a verified clean display name must not be rewritten");
      return new Response(JSON.stringify({
        location: {
          id: "sandbox-location-created",
          name: "Synthetic Realty",
          country: "CA",
          timezone: "America/Toronto",
        },
      }), { status: 200 });
    },
    sleep: async () => {},
  }),
});
const alreadyClean = await alreadyCleanAdapter.finalizeLocationDisplayName({
  idempotencyKey: `${locationCreateInput.idempotencyKey}:location_display_name_finalize`,
  providerLocationId: "sandbox-location-created",
  environment: "sandbox",
  profile: locationCreateInput.profile,
  requestFingerprint: locationCreateInput.requestFingerprint,
});
assert.equal(alreadyClean.outcome, "succeeded");
assert.equal(alreadyCleanCalls, 1);

for (const ambiguousStatus of [429, 500]) {
  let failedCreateCalls = 0;
  const failedCreateAdapter = new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
    credentialResolver: resolver,
    gate: allowedGate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({
      fetcher: async () => {
        failedCreateCalls += 1;
        return new Response('{"message":"ambiguous"}', { status: ambiguousStatus });
      },
      sleep: async () => {},
    }),
  });
  const failedCreateResult = await failedCreateAdapter.createLocation(locationCreateInput);
  assert.equal(failedCreateResult.outcome, "uncertain");
  assert.equal(failedCreateResult.errorCode, `ghl_location_create_ambiguous_${ambiguousStatus}`);
  assert.equal(failedCreateCalls, 1, "Create Sub-Account POST must never retry an ambiguous provider write");
}

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
assert.equal(preinstalledSnapshot.providerReference, "snapshot-push-1");
const documentedStatusRequest = capturedRequests.find(({ url }) =>
  url.includes("/snapshots/snapshot-status/")
);
assert.equal(documentedStatusRequest.init.headers.Version, "v3");

async function readSnapshotStatusShape(payload) {
  const requests = [];
  const shapeAdapter = new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
    credentialResolver: resolver,
    gate: allowedGate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify(payload), { status: 200 });
      },
      sleep: async () => {},
    }),
  });
  const result = await shapeAdapter.getSnapshotStatus({
    providerLocationId: "sandbox-location",
    manifest: locationSnapshotManifest,
  });
  return { result, requests };
}

const documentedPending = await readSnapshotStatusShape({
  data: {
    id: "snapshot-push-pending",
    locationId: "sandbox-location",
    status: "processing",
    completed: ["forms"],
    pending: ["funnels"],
  },
});
assert.equal(documentedPending.result.outcome, "pending");
assert.equal(documentedPending.result.providerReference, "snapshot-push-pending");
assert.equal(documentedPending.requests[0].init.headers.Version, "v3");
const documentedLocationMismatch = await readSnapshotStatusShape({
  data: {
    id: "snapshot-push-wrong-location",
    locationId: "different-location",
    status: "completed",
    completed: [],
    pending: [],
  },
});
assert.equal(documentedLocationMismatch.result.outcome, "operator_action_required");
assert.equal(documentedLocationMismatch.result.errorCode, "ghl_snapshot_status_location_mismatch");
const documentedMalformed = await readSnapshotStatusShape({
  data: { locationId: "sandbox-location", status: "completed", completed: [], pending: [] },
});
assert.equal(documentedMalformed.result.outcome, "operator_action_required");
assert.equal(documentedMalformed.result.errorCode, "ghl_snapshot_status_receipt_invalid");
const deliberateLegacyStatus = await readSnapshotStatusShape({ status: "completed" });
assert.equal(deliberateLegacyStatus.result.outcome, "ready", "the previously accepted legacy root status remains supported");
const customValueResult = await adapter.applyCustomValues({
  providerLocationId: "sandbox-location",
  values: { "DealFlow Organization Name": "Synthetic Realty" },
});
assert.equal(customValueResult.outcome, "succeeded");
assert.equal(customValueResult.providerMutationAttempted, true);
const formResult = await adapter.verifyPreinstalledForms({
  providerLocationId: "sandbox-location",
  requiredFormIds: ["sandbox-form"],
});
assert.equal(formResult.outcome, "succeeded");
assert.equal(formResult.providerMutationAttempted, false);
const singlePageFormsRequest = capturedRequests.find(({ url }) => url.includes("/forms/?locationId="));
assert.equal(singlePageFormsRequest.init.headers.Version, "v3");
assert.equal(new URL(singlePageFormsRequest.url).searchParams.get("limit"), "50");
assert.equal(new URL(singlePageFormsRequest.url).searchParams.get("skip"), "0");

async function verifyFormsWithResponder(requiredFormIds, responder) {
  const requests = [];
  const formsAdapter = new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_AGENCY_TOKEN",
    credentialResolver: resolver,
    gate: allowedGate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify(responder(new URL(url), requests.length)), { status: 200 });
      },
      sleep: async () => {},
    }),
  });
  const result = await formsAdapter.verifyPreinstalledForms({
    providerLocationId: "sandbox-location",
    requiredFormIds,
  });
  return { result, requests };
}

const firstFiftyForms = Array.from({ length: 50 }, (_, index) => ({
  id: `form-${String(index).padStart(3, "0")}`,
  locationId: "sandbox-location",
}));
const multiPageForms = await verifyFormsWithResponder(["form-target"], (url) => {
  const skip = Number(url.searchParams.get("skip"));
  return skip === 0
    ? { forms: firstFiftyForms, total: 51 }
    : { forms: [{ id: "form-target", locationId: "sandbox-location" }], total: 51 };
});
assert.equal(multiPageForms.result.outcome, "succeeded");
assert.deepEqual(multiPageForms.result.verifiedReferences, ["form-target"]);
assert.equal(multiPageForms.requests.length, 2);
assert.deepEqual(
  multiPageForms.requests.map(({ url }) => new URL(url).searchParams.get("skip")),
  ["0", "50"],
);
assert.ok(multiPageForms.requests.every(({ init }) => init.headers.Version === "v3"));

const duplicateForms = await verifyFormsWithResponder(["form-a"], () => ({
  forms: [
    { id: "form-a", locationId: "sandbox-location" },
    { id: "form-a", locationId: "sandbox-location" },
  ],
  total: 2,
}));
assert.equal(duplicateForms.result.errorCode, "ghl_form_identity_duplicate");
const wrongLocationForm = await verifyFormsWithResponder(["form-a"], () => ({
  forms: [{ id: "form-a", locationId: "different-location" }],
  total: 1,
}));
assert.equal(wrongLocationForm.result.errorCode, "ghl_form_location_mismatch");
const nonprogressForms = await verifyFormsWithResponder(["form-a"], () => ({ forms: [], total: 1 }));
assert.equal(nonprogressForms.result.errorCode, "ghl_forms_pagination_nonprogress");
const inconsistentTotalForms = await verifyFormsWithResponder(["form-target"], (url) => {
  const skip = Number(url.searchParams.get("skip"));
  return skip === 0
    ? { forms: firstFiftyForms, total: 51 }
    : { forms: [{ id: "form-target", locationId: "sandbox-location" }], total: 52 };
});
assert.equal(inconsistentTotalForms.result.errorCode, "ghl_forms_page_contract_invalid");
const overLimitForms = await verifyFormsWithResponder(["form-a"], () => ({ forms: [], total: 1_001 }));
assert.equal(overLimitForms.result.errorCode, "ghl_forms_page_contract_invalid");

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
const campaignId = "00000000-0000-4000-8000-000000000107";
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
    installation_id: "00000000-0000-4000-8000-000000000104",
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
  ghl_runtime_controls: [{
    environment: "sandbox",
    provisioning_writes_enabled: true,
    lead_writes_enabled: true,
    lifecycle_webhook_enabled: false,
  }],
  ghl_location_personalizations: [{
    id: "00000000-0000-4000-8000-000000000106",
    organization_id: organizationId,
    campaign_id: campaignId,
    location_mapping_id: "00000000-0000-4000-8000-000000000103",
    environment: "sandbox",
    status: "ready",
    current_step: "ready",
    verified_at: "2026-07-12T00:00:00.000Z",
    destination_url: "https://sandbox.example.test/funnel",
  }],
  leads: [{
    id: leadId,
    organization_id: organizationId,
    campaign_id: campaignId,
    first_name: "Synthetic",
    last_name: "Lead",
    name: "Synthetic Lead",
    email: "synthetic@example.com",
    phone: null,
    source: "DealFlow staging",
  }],
  campaign_plans: [{
    id: campaignId,
    organization_id: organizationId,
    plan: {
      onboarding_contract: { adDestination: "website" },
      campaign_payload: { ad_destination: "website" },
    },
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
  rpc: async (name, params) => {
    if (name === "enqueue_ghl_sandbox_lead_effects") return { data: fixedEffects, error: null };
    if (name === "claim_next_ghl_sandbox_lead_outbox") {
      if (claimReturned) return { data: [], error: null };
      claimReturned = true;
      return { data: [claimed], error: null };
    }
    if (name === "resolve_ghl_ready_campaign_destination_v2") {
      assert.equal(params.p_organization_id, organizationId);
      assert.equal(params.p_campaign_id, campaignId);
      assert.equal(params.p_environment, "sandbox");
      return {
        data: [{
          personalization_id: "00000000-0000-4000-8000-000000000106",
          campaign_id: campaignId,
          location_mapping_id: "00000000-0000-4000-8000-000000000103",
          slot_key: "slot-a",
          destination_url: "https://sandbox.example.test/funnel",
          destination_contract_fingerprint: "a".repeat(64),
        }],
        error: null,
      };
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

const dependentContactReceipt = {
  id: "00000000-0000-4000-8000-000000000501",
  organization_id: organizationId,
  lead_id: leadId,
  location_mapping_id: "00000000-0000-4000-8000-000000000103",
  effect_kind: "contact_upsert",
  status: "succeeded",
  provider_contact_id: "sandbox-contact-after-write",
};
const ambiguousDispatchCases = [
  { effectKind: "contact_upsert", operation: "lead_contact_upsert", method: "upsertContact" },
  { effectKind: "opportunity_upsert", operation: "lead_opportunity_upsert", method: "upsertOpportunity" },
  { effectKind: "tag_apply", operation: "lead_tag_apply", method: "applyTag" },
  { effectKind: "workflow_enroll", operation: "lead_workflow_enroll", method: "enrollWorkflow" },
];

for (const [caseIndex, dispatchCase] of ambiguousDispatchCases.entries()) {
  const ambiguousClaim = {
    ...claimed,
    id: `00000000-0000-4000-8000-0000000006${caseIndex}1`,
    operation: dispatchCase.operation,
    idempotency_key: `ghl-sandbox-${dispatchCase.effectKind}-timeout-after-write`,
    lease_token: `00000000-0000-4000-8000-0000000006${caseIndex}2`,
    request_payload: {
      ...claimed.request_payload,
      effect_kind: dispatchCase.effectKind,
    },
  };
  let ambiguousClaimReturned = false;
  let ambiguousSettlement = null;
  let providerDispatchCalls = 0;
  const ambiguousTables = {
    ...tables,
    ghl_lead_effect_events: dispatchCase.effectKind === "contact_upsert"
      ? []
      : [dependentContactReceipt],
  };
  const ambiguousDb = {
    from: (table) => queryBuilder(ambiguousTables[table] ?? []),
    rpc: async (name, params) => {
      if (name === "claim_next_ghl_sandbox_lead_outbox") {
        if (ambiguousClaimReturned) return { data: [], error: null };
        ambiguousClaimReturned = true;
        return { data: [ambiguousClaim], error: null };
      }
      if (name === "resolve_ghl_ready_campaign_destination_v2") {
        return {
          data: [{
            personalization_id: "00000000-0000-4000-8000-000000000106",
            campaign_id: campaignId,
            location_mapping_id: "00000000-0000-4000-8000-000000000103",
            slot_key: "slot-a",
            destination_url: "https://sandbox.example.test/funnel",
            destination_contract_fingerprint: "a".repeat(64),
          }],
          error: null,
        };
      }
      if (name === "settle_ghl_provider_outbox") {
        ambiguousSettlement = params;
        return { data: [{ id: ambiguousClaim.id }], error: null };
      }
      throw new Error(`Unexpected ambiguous-dispatch RPC ${name}`);
    },
  };
  const throwAfterProviderDispatch = async () => {
    providerDispatchCalls += 1;
    throw new Error(`synthetic timeout after ${dispatchCase.effectKind} provider write`);
  };
  const unexpectedProviderMethod = async () => {
    throw new Error(`Unexpected provider method for ${dispatchCase.effectKind}`);
  };
  const ambiguousResult = await outboxService.processNextGhlSandboxOutbox({
    client: ambiguousDb,
    gate: allowedGate,
    workerId: "sandbox-worker",
    now: () => "2026-07-12T00:00:03.000Z",
    providerFactory: () => ({
      kind: "sandbox",
      networkAccess: "https",
      upsertContact: dispatchCase.method === "upsertContact" ? throwAfterProviderDispatch : unexpectedProviderMethod,
      upsertOpportunity: dispatchCase.method === "upsertOpportunity" ? throwAfterProviderDispatch : unexpectedProviderMethod,
      applyTag: dispatchCase.method === "applyTag" ? throwAfterProviderDispatch : unexpectedProviderMethod,
      enrollWorkflow: dispatchCase.method === "enrollWorkflow" ? throwAfterProviderDispatch : unexpectedProviderMethod,
      syncAppointment: unexpectedProviderMethod,
    }),
  });
  assert.equal(providerDispatchCalls, 1, `${dispatchCase.effectKind} must dispatch exactly once`);
  assert.equal(ambiguousResult.status, "uncertain");
  assert.equal(ambiguousResult.providerMutationAttempted, true);
  assert.equal(ambiguousSettlement.p_receipt_outcome, "uncertain");
  assert.equal(ambiguousSettlement.p_outbox_status, "uncertain");
  assert.equal(ambiguousSettlement.p_last_error_code, "ghl_sandbox_provider_dispatch_ambiguous");
  assert.equal(ambiguousSettlement.p_receipt_metadata.provider_mutation_attempted, true);
}

let blockedProviderCalls = 0;
let blockedSettlement = null;
const blockedTables = {
  ...tables,
  ghl_runtime_controls: [{
    environment: "sandbox",
    provisioning_writes_enabled: true,
    lead_writes_enabled: false,
    lifecycle_webhook_enabled: false,
  }],
};
const blockedClaim = {
  ...claimed,
  id: "00000000-0000-4000-8000-000000000401",
  lease_token: "00000000-0000-4000-8000-000000000402",
};
let blockedClaimReturned = false;
const blockedDb = {
  from: (table) => queryBuilder(blockedTables[table] ?? []),
  rpc: async (name, params) => {
    if (name === "claim_next_ghl_sandbox_lead_outbox") {
      if (blockedClaimReturned) return { data: [], error: null };
      blockedClaimReturned = true;
      return { data: [blockedClaim], error: null };
    }
    if (name === "resolve_ghl_ready_campaign_destination_v2") {
      assert.equal(params.p_organization_id, organizationId);
      assert.equal(params.p_campaign_id, campaignId);
      assert.equal(params.p_environment, "sandbox");
      return {
        data: [{
          personalization_id: "00000000-0000-4000-8000-000000000106",
          campaign_id: campaignId,
          location_mapping_id: "00000000-0000-4000-8000-000000000103",
          slot_key: "slot-a",
          destination_url: "https://sandbox.example.test/funnel",
          destination_contract_fingerprint: "a".repeat(64),
        }],
        error: null,
      };
    }
    if (name === "settle_ghl_provider_outbox") {
      blockedSettlement = params;
      return { data: [{ id: blockedClaim.id }], error: null };
    }
    throw new Error(`Unexpected blocked-control RPC ${name}`);
  },
};
const blockedResult = await outboxService.processNextGhlSandboxOutbox({
  client: blockedDb,
  gate: allowedGate,
  workerId: "sandbox-worker",
  now: () => "2026-07-12T00:00:03.000Z",
  providerFactory: () => {
    blockedProviderCalls += 1;
    throw new Error("provider factory must be fenced");
  },
});
assert.equal(blockedProviderCalls, 0, "database control flip after claim must fence provider construction");
assert.equal(blockedResult.providerMutationAttempted, false);
assert.equal(blockedSettlement.p_receipt_outcome, "retryable_failure");
assert.equal(blockedSettlement.p_last_error_code, "ghl_sandbox_database_runtime_control_closed");

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
