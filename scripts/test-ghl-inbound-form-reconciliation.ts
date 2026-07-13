import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GhlHttpClient,
  GhlSandboxAdapter,
  createEnvironmentGhlCredentialResolver,
  type GhlInboundFormSubmission,
} from "../src/lib/integrations/gohighlevel";
import { processGhlInboundFormReconciliationBatch } from "../src/lib/services/ghl-inbound-form-reconciliation-service";
import { isolateGhlProviderWorkerComponent } from "../src/lib/services/ghl-provider-worker-isolation";

async function main() {
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
const token = `pit-${"x".repeat(40)}`;
const officialSubmission = {
  id: "submission-001",
  contactId: "contact-001",
  formId: "form-001",
  createdAt: "2026-07-13T12:00:00.000Z",
  name: "Synthetic Lead",
  email: "Lead@Example.Test",
  phone: "(416) 555-1212",
  others: {
    custom_question_1: "Seller",
    custom_sms_consent: "yes",
    unapproved_field: "must-not-leave-provider-boundary",
    eventData: {
      fbc: "fb.1.1.2",
      fbp: "fb.1.2.3",
      page: {
        url: "https://example.test/funnel?utm_source=facebook&utm_medium=paid_social&utm_campaign=sellers&ad_id=12345",
      },
      source: "Facebook",
      medium: "form",
      referrer: "https://facebook.com/",
      adSource: "facebook-ad",
    },
    fieldsOriSequance: ["email", "phone"],
  },
};

const capturedRequests: Array<{ url: string; method: string; version: string }> = [];
const adapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_LOCATION_TOKEN",
  credentialResolver: createEnvironmentGhlCredentialResolver({ GHL_SANDBOX_LOCATION_TOKEN: token }),
  gate: sandboxGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async (url, init) => {
      capturedRequests.push({
        url: String(url),
        method: String(init?.method),
        version: String((init?.headers as Record<string, string>).Version),
      });
      return new Response(JSON.stringify({
        submissions: [
          officialSubmission,
          { ...officialSubmission, id: "submission-fuzzy", contactId: "contact-other" },
          { ...officialSubmission, id: "submission-outside", createdAt: "2026-07-13T12:06:00.000Z" },
        ],
        meta: { nextPage: null },
      }), { status: 200, headers: { "x-request-id": "request-001" } });
    },
    sleep: async () => {},
  }),
});
const providerRead = await adapter.readFormSubmissions({
  providerLocationId: "location-001",
  providerContactId: "contact-001",
  requiredFormIds: ["form-001"],
  allowedFieldIds: ["custom_question_1", "custom_sms_consent"],
  windowStart: "2026-07-13T11:55:00.000Z",
  windowEnd: "2026-07-13T12:05:00.000Z",
});
assert.equal(providerRead.outcome, "succeeded");
if (providerRead.outcome !== "succeeded") throw new Error("Expected a successful provider read.");
assert.equal(providerRead.providerMutationAttempted, false);
assert.equal(providerRead.submissions.length, 1, "fuzzy contact and day-only timestamp spillover must be removed");
assert.match(providerRead.submissions[0].submissionFingerprint, /^[a-f0-9]{64}$/);
assert.deepEqual(providerRead.submissions[0].qualification.fields, [
  { id: "custom_question_1", value: "Seller" },
  { id: "custom_sms_consent", value: "yes" },
]);
assert.deepEqual(providerRead.submissions[0].attribution, {
  fbc: "fb.1.1.2",
  fbp: "fb.1.2.3",
  pageUrl: "https://example.test/funnel?utm_source=facebook&utm_medium=paid_social&utm_campaign=sellers&ad_id=12345",
  referrer: "https://facebook.com/",
  adSource: "facebook-ad",
  source: "Facebook",
  medium: "form",
  utmSource: "facebook",
  utmMedium: "paid_social",
  utmCampaign: "sellers",
  adId: "12345",
});
assert.equal(capturedRequests[0].method, "GET");
assert.equal(capturedRequests[0].version, "v3");
const requestedUrl = new URL(capturedRequests[0].url);
assert.equal(requestedUrl.pathname, "/forms/submissions");
assert.equal(requestedUrl.searchParams.get("formId"), "form-001");
assert.equal(requestedUrl.searchParams.get("q"), "contact-001");
assert.equal(requestedUrl.searchParams.get("startAt"), "2026-07-12", "date-only read must expand one day before");
assert.equal(requestedUrl.searchParams.get("endAt"), "2026-07-14", "date-only read must expand one day after");

const truncatedAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_LOCATION_TOKEN",
  credentialResolver: createEnvironmentGhlCredentialResolver({ GHL_SANDBOX_LOCATION_TOKEN: token }),
  gate: sandboxGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    fetcher: async () => new Response(JSON.stringify({
      submissions: Array.from({ length: 20 }, (_, index) => ({
        ...officialSubmission,
        id: `submission-${String(index).padStart(3, "0")}`,
      })),
    }), { status: 200 }),
    sleep: async () => {},
  }),
});
const truncated = await truncatedAdapter.readFormSubmissions({
  providerLocationId: "location-001",
  providerContactId: "contact-001",
  requiredFormIds: ["form-001"],
  allowedFieldIds: ["custom_question_1", "custom_sms_consent"],
  windowStart: "2026-07-13T11:55:00.000Z",
  windowEnd: "2026-07-13T12:05:00.000Z",
});
assert.equal(truncated.outcome, "operator_action_required");
assert.equal(truncated.errorCode, "ghl_form_submissions_result_truncated");

let transientReadAttempts = 0;
const noInternalRetryAdapter = new GhlSandboxAdapter({
  credentialRef: "env:GHL_SANDBOX_LOCATION_TOKEN",
  credentialResolver: createEnvironmentGhlCredentialResolver({ GHL_SANDBOX_LOCATION_TOKEN: token }),
  gate: sandboxGate,
  companyId: "sandbox-company",
  httpClient: new GhlHttpClient({
    maxReadAttempts: 4,
    fetcher: async () => {
      transientReadAttempts += 1;
      return new Response(JSON.stringify({ message: "synthetic transient provider failure" }), { status: 503 });
    },
    sleep: async () => {},
  }),
});
const transientRead = await noInternalRetryAdapter.readFormSubmissions({
  providerLocationId: "location-001",
  providerContactId: "contact-001",
  requiredFormIds: ["form-001"],
  allowedFieldIds: ["custom_question_1"],
  windowStart: "2026-07-13T11:55:00.000Z",
  windowEnd: "2026-07-13T12:05:00.000Z",
});
assert.notEqual(transientRead.outcome, "succeeded");
assert.equal(transientReadAttempts, 1,
  "inbound reconciliation must settle one provider attempt instead of retrying inside the cron stage");

type QueryFilter = ["eq" | "not" | "in", string, unknown];
function queryBuilder(data: Record<string, unknown>[], filters: QueryFilter[] = []): any {
  const apply = () => data.filter((item) => filters.every(([kind, column, value]) => {
    if (kind === "eq") return item[column] === value;
    if (kind === "not") return item[column] !== null && item[column] !== undefined;
    return Array.isArray(value) && value.includes(item[column]);
  }));
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => queryBuilder(data, [...filters, ["eq", column, value]]),
    not: (column: string, operator: string, value: unknown) => operator === "is" && value === null
      ? queryBuilder(data, [...filters, ["not", column, value]])
      : query,
    in: (column: string, value: unknown[]) => queryBuilder(data, [...filters, ["in", column, value]]),
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: apply(), error: null }).then(resolve, reject),
  };
  return query;
}

const organizationId = "00000000-0000-4000-8000-000000000001";
const mappingId = "00000000-0000-4000-8000-000000000002";
const installationId = "00000000-0000-4000-8000-000000000003";
const manifestId = "00000000-0000-4000-8000-000000000004";
const boundSubmission: GhlInboundFormSubmission = {
  ...providerRead.submissions[0],
  providerSubmissionId: "submission-bound",
  submissionFingerprint: "b".repeat(64),
};
const unseenFirst: GhlInboundFormSubmission = {
  ...providerRead.submissions[0],
  providerSubmissionId: "submission-unseen-1",
  submittedAt: "2026-07-13T12:01:00.000Z",
  submissionFingerprint: "c".repeat(64),
};
const unseenSecond: GhlInboundFormSubmission = {
  ...providerRead.submissions[0],
  providerSubmissionId: "submission-unseen-2",
  submittedAt: "2026-07-13T12:02:00.000Z",
  submissionFingerprint: "d".repeat(64),
};
const tables: Record<string, Record<string, unknown>[]> = {
  ghl_runtime_controls: [{ environment: "sandbox", inbound_form_reconciliation_enabled: true }],
  ghl_workspace_tenants: [{ organization_id: organizationId, tenant_kind: "direct_realtor", partner_id: null, status: "active" }],
  ghl_location_mappings: [{
    id: mappingId,
    organization_id: organizationId,
    installation_id: installationId,
    environment: "sandbox",
    provider_location_id: "location-001",
    snapshot_manifest_id: manifestId,
    status: "active",
    snapshot_verified_at: "2026-07-13T00:00:00.000Z",
    required_objects_verified_at: "2026-07-13T00:00:00.000Z",
    forms_readonly_credential_ref: "env:GHL_SANDBOX_LOCATION_TOKEN",
    forms_readonly_capabilities: ["forms.readonly"],
    forms_readonly_scope_attested_at: "2026-07-13T00:00:00.000Z",
  }],
  ghl_installations: [{
    id: installationId,
    environment: "sandbox",
    provider_agency_id: "agency-001",
    encrypted_credential_ref: "env:GHL_SANDBOX_AGENCY_TOKEN",
    status: "active",
  }],
  ghl_snapshot_manifests: [{
    id: manifestId,
    environment: "sandbox",
    installation_id: installationId,
    provider_snapshot_id: "snapshot-001",
    required_objects: [{ kind: "custom_field", key: "consent", providerObjectId: "field-001" }],
    installation_mode: "preinstalled",
    status: "approved",
  }],
  workspace_ghl_mapping: [],
  // A stale row deliberately looks ready. The worker must never read this table directly;
  // only the database eligibility RPC may authorize provider form routes.
  ghl_location_personalizations: [{
    id: "00000000-0000-4000-8000-000000000005",
    organization_id: organizationId,
    campaign_id: "00000000-0000-4000-8000-000000000006",
    location_mapping_id: mappingId,
    environment: "sandbox",
    status: "ready",
    current_step: "ready",
    verified_at: "2026-07-13T00:00:00.000Z",
    required_form_ids: ["form-stale-must-not-be-queried"],
    inbound_sms_consent_field_id: "stale_consent_field",
    inbound_advertising_consent_field_id: null,
    inbound_question_contract: [{ fieldId: "stale_question_field", question: "Stale question" }],
  }],
  ghl_inbound_form_submission_bindings: [{
    id: "00000000-0000-4000-8000-000000000007",
    organization_id: organizationId,
    location_mapping_id: mappingId,
    provider_submission_id: boundSubmission.providerSubmissionId,
    submission_fingerprint: boundSubmission.submissionFingerprint,
  }],
};
let claimCount = 0;
const applyCalls: Record<string, unknown>[] = [];
const readTables: string[] = [];
const client = {
  from: (table: string) => {
    readTables.push(table);
    return queryBuilder(tables[table] ?? []);
  },
  rpc: async (name: string, params: Record<string, unknown>) => {
    if (name === "claim_next_ghl_inbound_form_reconciliation_v1") {
      assert.equal(params.p_lease_ms, 600_000, "application lease clamp must match the SQL upper bound");
      claimCount += 1;
      return {
        data: claimCount === 1 ? [{
          id: "00000000-0000-4000-8000-000000000010",
          organization_id: organizationId,
          location_mapping_id: mappingId,
          provider_location_id: "location-001",
          provider_contact_id: "contact-001",
          reconciliation_window_start: "2026-07-13T11:55:00.000Z",
          reconciliation_window_end: "2026-07-13T12:05:00.000Z",
          attempt_count: 1,
          lease_token: "00000000-0000-4000-8000-000000000011",
          lease_generation: 1,
        }] : [],
        error: null,
      };
    }
    if (name === "list_ghl_inbound_eligible_form_routes_v1") {
      assert.deepEqual(params, {
        p_organization_id: organizationId,
        p_location_mapping_id: mappingId,
        p_environment: "sandbox",
      });
      return {
        data: [{
          provider_form_id: "form-001",
          allowed_field_ids: ["custom_sms_consent", "custom_question_1"],
        }],
        error: null,
      };
    }
    if (name === "apply_ghl_inbound_form_submission_v1") {
      applyCalls.push(params);
      return {
        data: [{ status: params.p_has_more_unseen ? "processing" : "completed" }],
        error: null,
      };
    }
    throw new Error(`Unexpected GHL inbound test RPC: ${name}`);
  },
};
let providerCalls = 0;
const batch = await processGhlInboundFormReconciliationBatch({
  client,
  environment: "sandbox",
  sandboxGate,
  leaseMs: 900_000,
  now: () => "2026-07-13T12:06:00.000Z",
  providerFactory: (authority) => {
    assert.equal(authority.credentialRef, "env:GHL_SANDBOX_LOCATION_TOKEN", "agency credential fallback is forbidden");
    return {
      kind: "sandbox",
      networkAccess: "https",
      readFormSubmissions: async (input) => {
        providerCalls += 1;
        assert.deepEqual(input.requiredFormIds, ["form-001"]);
        assert.deepEqual(input.allowedFieldIds, ["custom_question_1", "custom_sms_consent"]);
        return {
          outcome: "succeeded",
          submissions: [boundSubmission, unseenSecond, unseenFirst],
          providerRequestIds: ["request-001"],
          responseFingerprint: "e".repeat(64),
          requestCount: 1,
          providerMutationAttempted: false,
        };
      },
    };
  },
});
assert.equal(batch.processed, 1);
assert.equal(batch.providerMutationAttempted, false);
assert.equal(providerCalls, 1);
assert.ok(!readTables.includes("ghl_location_personalizations"), "stale ready rows must not be trusted outside the eligibility RPC");
assert.deepEqual(applyCalls.map((call) => call.p_provider_submission_id), [
  "submission-unseen-1",
  "submission-unseen-2",
], "bound replays must be excluded and every unseen repeat processed deterministically");
assert.deepEqual(applyCalls.map((call) => call.p_has_more_unseen), [true, false]);
assert.equal(applyCalls[0].p_email, "lead@example.test");
assert.equal(applyCalls[0].p_phone, "+14165551212");
assert.equal(applyCalls[0].p_phone_raw, "(416) 555-1212");
assert.equal(applyCalls[0].p_submission_fingerprint, "c".repeat(64));
assert.equal(applyCalls[1].p_submission_fingerprint, "d".repeat(64));

const workerSource = fs.readFileSync("src/lib/services/ghl-provider-worker-service.ts", "utf8");
const adapterSource = fs.readFileSync("src/lib/integrations/gohighlevel/sandbox-adapter.ts", "utf8");
const periodicWorkerStart = workerSource.indexOf(
  "export async function processGhlPeriodicFormSweepFromEnvironment",
);
const providerWorkerStart = workerSource.indexOf(
  "export async function processGhlProviderWorkerFromEnvironment",
);
assert.ok(periodicWorkerStart >= 0 && providerWorkerStart > periodicWorkerStart,
  "the dedicated periodic sweep and mixed provider worker entrypoints must both exist");
const periodicWorkerSource = workerSource.slice(periodicWorkerStart, providerWorkerStart);
const providerWorkerSource = workerSource.slice(providerWorkerStart);
assert.match(
  adapterSource,
  /async readFormSubmissions\([\s\S]*?retryMode: "no-retry"/,
  "inbound form reads must not retry inside the sequential system-job stage",
);
assert.match(workerSource, /const GHL_INBOUND_HTTP_TIMEOUT_MS = 3_000;/,
  "inbound provider reads must have a three-second per-request ceiling");
assert.match(workerSource, /timeoutMs: GHL_INBOUND_HTTP_TIMEOUT_MS,[\s\S]*?maxReadAttempts: 1/,
  "inbound worker factory must construct a single-attempt bounded HTTP client");
assert.equal((providerWorkerSource.match(/httpClient: createGhlInboundReadHttpClient\(/g) ?? []).length, 2,
  "sandbox and production webhook reconciliation must both use the bounded inbound HTTP client");
assert.equal((periodicWorkerSource.match(/httpClient: createGhlInboundReadHttpClient\(/g) ?? []).length, 2,
  "sandbox and production periodic sweeps must both use the bounded inbound HTTP client");
assert.equal((providerWorkerSource.match(/maxItems: Math\.min\(input\.maxReconciliationItems \?\? 1, 1\)/g) ?? []).length, 2,
  "sandbox and production reconciliation must both clamp the stage to one receipt");
for (const component of ["reconciliation", "delivery", "provisioning", "personalization"]) {
  assert.match(workerSource, new RegExp(`isolateGhlProviderWorkerComponent\\(\\"${component}\\"`));
}
assert.ok(
  workerSource.indexOf('isolateGhlProviderWorkerComponent("reconciliation"') < workerSource.indexOf('isolateGhlProviderWorkerComponent("delivery"'),
  "inbound reconciliation must run before other provider components",
);
const isolatedFailure = await isolateGhlProviderWorkerComponent("delivery", async () => {
  const error = new Error("synthetic isolated failure") as Error & { code: string };
  error.code = "ghl_synthetic_delivery_failure";
  throw error;
});
let laterComponentRan = false;
const isolatedSuccess = await isolateGhlProviderWorkerComponent("reconciliation", async () => {
  laterComponentRan = true;
  return { status: "complete" as const, processed: 1 };
});
assert.equal(isolatedFailure.status, "failed");
assert.equal(isolatedFailure.providerMutationAttempted, "not_proven");
assert.equal(isolatedSuccess.status, "complete");
assert.equal(laterComponentRan, true, "a failed component must not block a later isolated component");

console.log("PASS GHL inbound reconciliation: scoped GET v3, expanded date query with exact filtering, attribution, replay filtering, multi-submit no-loss, normalized contacts, and worker isolation");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
