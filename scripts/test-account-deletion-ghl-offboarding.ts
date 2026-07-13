import assert from "node:assert/strict";
import {
  evaluateGhlAccountDeletionOwnership,
  executeGhlAccountDeletionProviderOffboarding,
  GhlAccountDeletionProviderError,
  type GhlAccountDeletionAuthority,
} from "../src/lib/account-deletion/ghl-account-deletion";

const ownedAuthority: GhlAccountDeletionAuthority = {
  requestedOrganizationId: "organization-a",
  mappingOrganizationId: "organization-a",
  mappingId: "mapping-a",
  mappingPartnerId: null,
  providerLocationId: "location-a",
  provisioningOwner: "platform",
  environment: "production",
  installationId: "installation-a",
  installationOwnerKind: "platform",
  installationPartnerId: null,
  credentialRef: "env:GHL_PRODUCTION_ACCOUNT_DELETION_TOKEN",
  provisioningRunOrganizationId: "organization-a",
  provisioningRunMappingId: "mapping-a",
  provisioningRunInstallationId: "installation-a",
  provisioningRunState: "ready",
  createOutboxOrganizationId: "organization-a",
  createOutboxStatus: "succeeded",
  createReceiptOutcome: "succeeded",
  createReceiptProviderReference: "location-a",
  originAttestationOrganizationId: null,
  originAttestationMappingId: null,
  originAttestationProviderLocationId: null,
  originAttestationOrigin: null,
  originAttestationEvidenceHash: null,
};

const explicitlyNonownedAuthority: GhlAccountDeletionAuthority = {
  ...ownedAuthority,
  provisioningRunOrganizationId: null,
  provisioningRunMappingId: null,
  provisioningRunInstallationId: null,
  provisioningRunState: null,
  createOutboxOrganizationId: null,
  createOutboxStatus: null,
  createReceiptOutcome: null,
  createReceiptProviderReference: null,
  originAttestationOrganizationId: "organization-a",
  originAttestationMappingId: "mapping-a",
  originAttestationProviderLocationId: "location-a",
  originAttestationOrigin: "customer_connected",
  originAttestationEvidenceHash: `sha256:${"a".repeat(64)}`,
};

function response(status: number, data: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    data,
    providerRequestId: `request-${status}`,
    responseFingerprint: `fingerprint-${status}`,
    retryAfterMs: null,
  };
}

function resolver() {
  return {
    async withCredential<T>(credentialRef: string, consume: (credential: string) => Promise<T>) {
      assert.equal(credentialRef, ownedAuthority.credentialRef);
      return consume("synthetic-hidden-credential-with-safe-length");
    },
  };
}

async function main() {

assert.deepEqual(evaluateGhlAccountDeletionOwnership(ownedAuthority), {
  state: "owned",
  code: "ghl_platform_created_location",
});
assert.equal(evaluateGhlAccountDeletionOwnership({
  ...ownedAuthority,
  requestedOrganizationId: "organization-b",
}).state, "unresolved", "cross-tenant evidence was accepted");
assert.equal(evaluateGhlAccountDeletionOwnership({
  ...ownedAuthority,
  createReceiptProviderReference: null,
}).state, "unresolved", "a pre-existing/unreceipted location was classified as DealFlow-owned");
assert.equal(
  evaluateGhlAccountDeletionOwnership(explicitlyNonownedAuthority).state,
  "explicitly_nonowned",
  "durably attested customer-connected location was not classified non-owned",
);

{
  let called = false;
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: { ...ownedAuthority, createReceiptProviderReference: null },
    credentialResolver: resolver(),
    httpClient: { async request() { called = true; return response(500); } },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_deletion_ownership_unresolved");
  assert.equal(result.metadata.providerLocationDeleted, false);
  assert.equal(result.metadata.localDetachRequired, false);
  assert.equal(called, false, "unresolved provider location triggered an API request");
}

{
  let called = false;
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: explicitlyNonownedAuthority,
    credentialResolver: resolver(),
    httpClient: { async request() { called = true; return response(500); } },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_nonowned_location_detached_without_provider_delete");
  assert.equal(result.metadata.providerLocationDeleted, false);
  assert.equal(result.metadata.localDetachRequired, true);
  assert.equal(called, false, "explicitly non-owned provider location triggered an API request");
}

{
  const calls: Array<{ method: string; path: string }> = [];
  const queue = [
    response(200, { location: { id: "location-a" } }),
    response(200, { success: true }),
  ];
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: {
      async request(input) {
        calls.push({ method: input.method, path: input.path });
        return queue.shift()!;
      },
    },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_owned_location_deleted");
  assert.match(result.providerReceiptId ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(calls, [
    { method: "GET", path: "/locations/location-a" },
    { method: "DELETE", path: "/locations/location-a" },
  ]);
  assert.doesNotMatch(JSON.stringify(result.metadata), /location-a|credential/i);
}

{
  let deletes = 0;
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: {
      async request(input) {
        if (input.method === "DELETE") deletes += 1;
        return response(404);
      },
    },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_owned_location_already_absent");
  assert.equal(deletes, 0, "authoritatively absent location was deleted again");
}

{
  let deletes = 0;
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: {
      async request(input) {
        if (input.method === "DELETE") deletes += 1;
        return response(200, { location: { id: "location-a" } });
      },
    },
    providerWriteAllowed: false,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_deletion_provider_writes_disabled");
  assert.equal(deletes, 0, "closed deletion kill switch permitted a provider delete");
}

{
  let called = false;
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: { async request() { called = true; return response(200); } },
    providerWriteAllowed: true,
    providerGateAllowed: false,
    providerGateCode: "production_project_mismatch",
  });
  assert.equal(result.code, "ghl_deletion_provider_gate_closed");
  assert.equal(called, false, "closed exact-environment gate permitted a provider read/write");
}

{
  const result = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: {
      async request() {
        return response(200, { location: { id: "other-location" } });
      },
    },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(result.code, "ghl_deletion_provider_identity_mismatch");
}

{
  let error: unknown;
  try {
    let requestNumber = 0;
    await executeGhlAccountDeletionProviderOffboarding({
      authority: ownedAuthority,
      credentialResolver: resolver(),
      httpClient: {
        async request() {
          requestNumber += 1;
          if (requestNumber === 1) return response(200, { location: { id: "location-a" } });
          throw new Error("synthetic timeout after provider write");
        },
      },
      providerWriteAllowed: true,
      providerGateAllowed: true,
      providerGateCode: "allowed_production",
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof GhlAccountDeletionProviderError);
  assert.equal(error.uncertain, true, "ambiguous DELETE did not require reconciliation");

  const reconciled = await executeGhlAccountDeletionProviderOffboarding({
    authority: ownedAuthority,
    credentialResolver: resolver(),
    httpClient: { async request() { return response(404); } },
    providerWriteAllowed: true,
    providerGateAllowed: true,
    providerGateCode: "allowed_production",
  });
  assert.equal(reconciled.code, "ghl_owned_location_already_absent");
}

console.log("account deletion GHL offboarding: PASS (owned delete, attested non-owned detach, unresolved/cross-tenant denial, read-before-delete, absent idempotency, kill switch, ambiguous crash reconciliation)");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
