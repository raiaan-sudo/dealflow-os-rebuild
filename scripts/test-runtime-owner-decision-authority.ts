import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import template from "../config/authority/dealflow-owner-decisions.v1.json";
import {
  AUTHORIZED_SELECTION,
  canonicalJson,
  evaluateMetaOptimizationAuthority,
  evaluatePlatformAdminAuthority,
  evaluateVercelAnalyticsAuthority,
  EXPECTED_DECISION_INVENTORY_SHA256,
  EXPECTED_REQUIREMENT_INVENTORY_SHA256,
  META_OPTIMIZATION_CAPABILITY,
  OWNER_DECISION_AUTHORITY_PURPOSE,
  OWNER_DECISION_ENVELOPE_SCHEMA_VERSION,
  OWNER_DECISION_TEMPLATE_PATH,
  PLATFORM_ADMIN_SECURITY_CAPABILITY,
  sha256Canonical,
  VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS,
  VERCEL_ANALYTICS_CAPABILITY,
  verifyOwnerDecisionAuthorityEnvelope,
  type RuntimeCandidateIdentity,
} from "../src/lib/authority/owner-decision-authority-contract";

const identity: RuntimeCandidateIdentity = Object.freeze({
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  trackedWorktreeSha256: "3".repeat(64),
  trackedFileCount: 1_200,
  dependencyLockSha256: "4".repeat(64),
  migrationPortfolioSha256: "5".repeat(64),
  migrationCount: 115,
});
const now = new Date();
const issuedAt = new Date(now.getTime() - 60_000).toISOString();
const effectiveAt = new Date(now.getTime() - 30_000).toISOString();
const expiresAt = new Date(now.getTime() + 60 * 60_000).toISOString();

const metaPolicy = {
  contractVersion: "dealflow-realtor-optimization-v2",
  currencies: ["CAD", "USD"],
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1000,
  minimumClicks: 20,
  minimumSpendMinor: 5000,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 1440,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  thresholds: {
    ctrGoodPercent: 2, ctrKillPercent: 0.5, cpcTargetMajor: 1,
    cplMaximumMajor: 50, landingPageConversionTargetPercent: 5,
    frequencyMaximum: 4, noLeadsTimeoutHours: 24, spendMultiplierKill: 2,
  },
};
const adminPolicy = {
  contractVersion: "dealflow-platform-operator-v1",
  roles: ["viewer", "operator", "security_admin", "break_glass"],
  requiredAssuranceLevel: "aal2",
  maximumSessionAgeMinutes: 10,
  breakGlassMaximumMinutes: 60,
  receiptPolicy: "IMMUTABLE_NO_PII_NO_SECRETS",
};

function decision(id: string, selectedValue: unknown) {
  return {
    id,
    selectedValue,
    effectiveAt,
    reviewAt: null,
    approver: {
      role: "AUTHORIZED_OWNER",
      identityRef: `owner:${id.toLowerCase()}`,
      approvedAt: issuedAt,
    },
  };
}

function valuesDigest(decisions: any[], ids: readonly string[]) {
  return sha256Canonical([...ids].sort().map((id) => ({
    id,
    selectedValue: decisions.find((entry) => entry.id === id).selectedValue,
  })));
}

function policyDigest(decisions: any[], ids: readonly string[]) {
  const values = [...ids].sort().flatMap((id) => {
    const value = decisions.find((entry) => entry.id === id)?.selectedValue;
    return value && typeof value === "object" && "policy" in value
      ? [{ id, policy: value.policy }]
      : [];
  });
  return values.length ? sha256Canonical(values) : null;
}

function fixture() {
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const publicKeySha256 = createHash("sha256")
    .update(keys.publicKey.export({ format: "der", type: "spki" }))
    .digest("hex");
  const decisions = VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS.map((id) => decision(
    id,
    id === "OWNER-PRIVACY-002"
      ? { capabilityGrants: { [VERCEL_ANALYTICS_CAPABILITY]: AUTHORIZED_SELECTION } }
      : { decisionReference: id },
  ));
  decisions.push(decision("OWNER-007", {
    capabilityGrants: { [META_OPTIMIZATION_CAPABILITY]: AUTHORIZED_SELECTION },
    policy: metaPolicy,
  }));
  decisions.push(decision("OWNER-ADMIN-SECURITY-SURFACE", {
    capabilityGrants: { [PLATFORM_ADMIN_SECURITY_CAPABILITY]: AUTHORIZED_SELECTION },
    policy: adminPolicy,
  }));
  const envelope: any = {
    schemaVersion: OWNER_DECISION_ENVELOPE_SCHEMA_VERSION,
    envelopeId: "owner-authority-test-v1",
    mode: "production",
    generation: 1,
    previousEnvelopeSha256: null,
    revocationGeneration: 0,
    authority: {
      authorityId: "owner-release-authority",
      keyId: "owner-ed25519-v1",
      source: "protected-owner-broker",
      publicKeySha256,
      releaseTrustPolicyId: "protected-release-trust",
      releaseTrustGeneration: 1,
    },
    candidate: {
      commit: identity.commit,
      tree: identity.tree,
      trackedWorktreeSha256: identity.trackedWorktreeSha256,
      trackedFileCount: identity.trackedFileCount,
      dependencyLock: { path: "package-lock.json", sha256: identity.dependencyLockSha256 },
      migrationPortfolio: {
        directory: "supabase/migrations",
        count: identity.migrationCount,
        sha256: identity.migrationPortfolioSha256,
      },
    },
    template: {
      path: OWNER_DECISION_TEMPLATE_PATH,
      sha256: sha256Canonical(template),
      decisionInventorySha256: EXPECTED_DECISION_INVENTORY_SHA256,
      requirementInventorySha256: EXPECTED_REQUIREMENT_INVENTORY_SHA256,
    },
    timing: { issuedAt, effectiveAt, expiresAt },
    decisions,
    capabilitySelections: [
      {
        capability: VERCEL_ANALYTICS_CAPABILITY,
        decisionIds: [...VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS],
        selection: AUTHORIZED_SELECTION,
        selectedValuesSha256: valuesDigest(decisions, VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS),
        policySha256: policyDigest(decisions, VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS),
      },
      {
        capability: META_OPTIMIZATION_CAPABILITY,
        decisionIds: ["OWNER-007"],
        selection: AUTHORIZED_SELECTION,
        selectedValuesSha256: valuesDigest(decisions, ["OWNER-007"]),
        policySha256: policyDigest(decisions, ["OWNER-007"]),
      },
      {
        capability: PLATFORM_ADMIN_SECURITY_CAPABILITY,
        decisionIds: ["OWNER-ADMIN-SECURITY-SURFACE"],
        selection: AUTHORIZED_SELECTION,
        selectedValuesSha256: valuesDigest(decisions, ["OWNER-ADMIN-SECURITY-SURFACE"]),
        policySha256: policyDigest(decisions, ["OWNER-ADMIN-SECURITY-SURFACE"]),
      },
    ],
    productionReleaseAuthorized: false,
    attestation: null,
  };
  function signEnvelope(target = envelope, privateKey = keys.privateKey) {
    const payload = structuredClone(target);
    delete payload.attestation;
    const payloadBytes = Buffer.from(canonicalJson(payload));
    target.attestation = {
      algorithm: "ed25519",
      payloadSha256: createHash("sha256").update(payloadBytes).digest("hex"),
      signature: sign(null, payloadBytes, privateKey).toString("base64"),
    };
  }
  signEnvelope();
  const trust: any = {
    schemaVersion: "dealflow.external-release-trust-policy.v1",
    policyId: "protected-release-trust",
    status: "configured",
    maxEvidenceAgeSeconds: 3600,
    allowedFutureSkewSeconds: 300,
    expectedProject: { provider: "vercel", projectId: "fixture-production" },
    requiredEnvironment: { stripeLiveMode: true },
    authorizedCandidatePolicy: { path: "docs/dealflow-completion/release-trust-policy.json", sha256: "6".repeat(64) },
    rotation: { generation: 1, previousPolicySha256: null },
    authorities: [{
      authorityId: envelope.authority.authorityId,
      keyId: envelope.authority.keyId,
      source: envelope.authority.source,
      publicKeyPem,
      publicKeySha256,
      allowedEvidenceTypes: ["build"],
      allowedAuthorityPurposes: [OWNER_DECISION_AUTHORITY_PURPOSE],
    }],
    ownerDecisionAuthority: {
      purpose: OWNER_DECISION_AUTHORITY_PURPOSE,
      templatePath: OWNER_DECISION_TEMPLATE_PATH,
      templateSha256: sha256Canonical(template),
      decisionInventorySha256: EXPECTED_DECISION_INVENTORY_SHA256,
      requirementInventorySha256: EXPECTED_REQUIREMENT_INVENTORY_SHA256,
      authorizedEnvelopeSha256: sha256Canonical(envelope),
      minimumEnvelopeGeneration: 1,
      minimumRevocationGeneration: 0,
      previousEnvelopeSha256: null,
      allowSyntheticIsolatedStaging: false,
    },
  };
  function resign(target: any, policy = trust, privateKey = keys.privateKey) {
    signEnvelope(target, privateKey);
    policy.ownerDecisionAuthority.authorizedEnvelopeSha256 = sha256Canonical(target);
  }
  return { envelope, trust, keys, resign, publicKeySha256 };
}

function verify(f: ReturnType<typeof fixture>, overrides: Record<string, unknown> = {}) {
  return verifyOwnerDecisionAuthorityEnvelope({
    envelope: f.envelope,
    envelopeSha256: sha256Canonical(f.envelope),
    externalTrustPolicy: f.trust,
    externalTrustPolicySha256: sha256Canonical(f.trust),
    runtimeIdentity: identity,
    template,
    now,
    deploymentTarget: "production",
    isolatedStagingAttested: false,
    ...overrides,
  });
}

function failureReason(result: ReturnType<typeof verify>) {
  assert.equal(result.verified, false, "expected authority verification to fail");
  return result.verified ? "unexpected_success" : result.reason;
}

const valid = fixture();
const verified = verify(valid);
assert.equal(verified.verified, true);
if (!verified.verified) throw new Error("valid authority fixture failed");
assert.equal(evaluateVercelAnalyticsAuthority({ authority: verified.authority }).authorized, true);
assert.equal(evaluateMetaOptimizationAuthority({ authority: verified.authority }).authorized, true);
assert.equal(evaluatePlatformAdminAuthority({ authority: verified.authority }).authorized, true);
assert.equal(evaluateVercelAnalyticsAuthority({ authority: { ...verified.authority } }).reason,
  "authority_not_verified", "a cloned JSON-shaped result must lose the in-memory verification brand");
assert.equal(evaluateVercelAnalyticsAuthority({ authority: template }).reason,
  "authority_not_verified", "tracked template shape must never grant runtime authority");

{
  const f = fixture();
  f.envelope.attestation = null;
  f.trust.ownerDecisionAuthority.authorizedEnvelopeSha256 = sha256Canonical(f.envelope);
  assert.equal(failureReason(verify(f)), "attestation_invalid");
}
{
  const f = fixture();
  const originalDigest = sha256Canonical(f.envelope);
  f.envelope.envelopeId = "tampered-envelope-id";
  assert.equal(failureReason(verify(f, { envelopeSha256: originalDigest })),
    "envelope_not_authorized_by_external_trust",
    "parsed envelope bytes cannot change while retaining the supplied digest");
}
{
  const f = fixture();
  const originalDigest = sha256Canonical(f.trust);
  f.trust.maxEvidenceAgeSeconds = 3599;
  assert.equal(failureReason(verify(f, { externalTrustPolicySha256: originalDigest })),
    "external_trust_invalid",
    "parsed protected trust policy cannot change while retaining the supplied digest");
}
{
  const f = fixture();
  f.envelope.attestation.signature = Buffer.alloc(64, 1).toString("base64");
  f.trust.ownerDecisionAuthority.authorizedEnvelopeSha256 = sha256Canonical(f.envelope);
  assert.equal(failureReason(verify(f)), "signature_invalid");
}
{
  const f = fixture();
  const self = generateKeyPairSync("ed25519");
  f.envelope.authority.keyId = "self-signed-target-key";
  f.resign(f.envelope, f.trust, self.privateKey);
  assert.equal(failureReason(verify(f)), "authority_not_pinned");
}
{
  const f = fixture();
  f.envelope.authority.publicKeySha256 = "8".repeat(64);
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "authority_key_mismatch");
}
{
  const f = fixture();
  assert.equal(failureReason(verify(f, {
    runtimeIdentity: { ...identity, tree: "9".repeat(40) },
  })),
    "candidate_identity_mismatch");
}
{
  const f = fixture();
  f.envelope.template.decisionInventorySha256 = "a".repeat(64);
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "inventory_binding_mismatch");
}
{
  const f = fixture();
  f.envelope.capabilitySelections[1].policySha256 = "b".repeat(64);
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "capability_contract_invalid");
}
{
  const f = fixture();
  f.envelope.timing.issuedAt = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "authority_stale");
}
{
  const f = fixture();
  f.envelope.timing.effectiveAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  f.envelope.timing.expiresAt = new Date(now.getTime() + 70 * 60_000).toISOString();
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "authority_not_yet_effective");
}
{
  const f = fixture();
  f.envelope.timing.expiresAt = new Date(now.getTime() - 1).toISOString();
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "authority_expired");
}
{
  const f = fixture();
  f.trust.ownerDecisionAuthority.minimumRevocationGeneration = 2;
  assert.equal(failureReason(verify(f)), "authority_revoked");
}
{
  const f = fixture();
  f.trust.ownerDecisionAuthority.minimumEnvelopeGeneration = 2;
  assert.equal(failureReason(verify(f)), "authority_generation_downgrade");
}
{
  const f = fixture();
  f.trust.ownerDecisionAuthority.previousEnvelopeSha256 = "c".repeat(64);
  assert.equal(failureReason(verify(f)), "authority_replay_mismatch");
}
{
  const f = fixture();
  f.envelope.candidate.commit = "d".repeat(40);
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "candidate_identity_mismatch",
    "a tracked successor requires a newly signed exact-candidate envelope");
}
{
  const f = fixture();
  f.envelope.decisions[0].selectedValue = { tampered: true };
  f.trust.ownerDecisionAuthority.authorizedEnvelopeSha256 = sha256Canonical(f.envelope);
  assert.equal(failureReason(verify(f)), "capability_contract_invalid");
}
{
  const f = fixture();
  assert.equal(failureReason(verify(f, { externalTrustPolicy: null })), "authority_input_missing",
    "environment/candidate values without protected release trust never grant authority");
}
{
  const f = fixture();
  f.envelope.mode = "synthetic_staging";
  f.trust.ownerDecisionAuthority.allowSyntheticIsolatedStaging = true;
  f.resign(f.envelope);
  assert.equal(failureReason(verify(f)), "synthetic_authority_forbidden_in_production");
  const staged = verify(f, { deploymentTarget: "staging", isolatedStagingAttested: true });
  assert.equal(staged.verified, true);
  assert.equal(failureReason(verify(f, {
    deploymentTarget: "staging", isolatedStagingAttested: false,
  })),
    "synthetic_staging_not_attested");
}

process.stdout.write(
  "owner-decision detached Ed25519 authority: PASS (protected release key, exact candidate/template/inventory/policy/time/generation/revocation, tamper/replay, and isolated synthetic staging negatives)\n",
);
