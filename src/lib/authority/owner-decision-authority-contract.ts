import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

export const OWNER_DECISION_ENVELOPE_SCHEMA_VERSION =
  "dealflow.owner-decision-authority-envelope.v1" as const;
export const OWNER_DECISION_AUTHORITY_PURPOSE =
  "owner-decision-authority" as const;
export const OWNER_DECISION_TEMPLATE_PATH =
  "config/authority/dealflow-owner-decisions.v1.json" as const;
export const EXPECTED_DECISION_INVENTORY_SHA256 =
  "12d0d5780a28dd93696f17ed1e7177ed85460428c4c3b02e180cf68db9073b8d" as const;
export const EXPECTED_REQUIREMENT_INVENTORY_SHA256 =
  "8c6bf382bb5f7d0233ecb7edbf591167dad3c18f5f14206735d38f830f3c9bc4" as const;

export const VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS = Object.freeze([
  "OWNER-PRIVACY-001", "OWNER-PRIVACY-002", "OWNER-PRIVACY-003",
  "OWNER-PRIVACY-004", "OWNER-PRIVACY-005", "OWNER-PRIVACY-006",
  "OWNER-PRIVACY-007", "OWNER-PRIVACY-008", "OWNER-PRIVACY-009",
] as const);
export const VERCEL_ANALYTICS_CAPABILITY = "vercel_analytics" as const;
export const META_OPTIMIZATION_AUTHORITY_DECISION_ID = "OWNER-007" as const;
export const META_OPTIMIZATION_CAPABILITY =
  "meta_optimization_provider_writes" as const;
export const PLATFORM_ADMIN_AUTHORITY_DECISION_ID =
  "OWNER-ADMIN-SECURITY-SURFACE" as const;
export const PLATFORM_ADMIN_SECURITY_CAPABILITY =
  "platform_admin_security_surface" as const;
export const PRIVACY_AUTHORITY_DECISION_ID = "OWNER-PRIVACY-005" as const;
export const PRIVACY_CONSENT_DSAR_CAPABILITY =
  "privacy_consent_dsar_authority" as const;
export const AUTHORIZED_SELECTION = "APPROVED_ENABLED" as const;
export const VERCEL_ANALYTICS_SIGNED_SELECTION = AUTHORIZED_SELECTION;
export const META_OPTIMIZATION_SIGNED_SELECTION = AUTHORIZED_SELECTION;
export const PLATFORM_ADMIN_SECURITY_SIGNED_SELECTION = AUTHORIZED_SELECTION;
export const PRIVACY_CONSENT_DSAR_SIGNED_SELECTION = AUTHORIZED_SELECTION;

const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const verifiedInstances = new WeakSet<object>();

type UnknownRecord = Record<string, unknown>;

export type RuntimeCandidateIdentity = Readonly<{
  commit: string;
  tree: string;
  trackedWorktreeSha256: string;
  trackedFileCount: number;
  dependencyLockSha256: string;
  migrationPortfolioSha256: string;
  migrationCount: number;
}>;

export type VerifiedOwnerDecision = Readonly<{
  id: string;
  selectedValue: unknown;
  effectiveAt: string;
  reviewAt: string | null;
  approver: Readonly<{ role: string; identityRef: string; approvedAt: string }>;
}>;

export type VerifiedOwnerDecisionAuthority = Readonly<{
  schemaVersion: typeof OWNER_DECISION_ENVELOPE_SCHEMA_VERSION;
  envelopeId: string;
  envelopeSha256: string;
  payloadSha256: string;
  generation: number;
  revocationGeneration: number;
  mode: "production" | "synthetic_staging";
  authorityId: string;
  keyId: string;
  publicKeySha256: string;
  signatureReference: string;
  candidateIdentity: RuntimeCandidateIdentity;
  decisions: readonly VerifiedOwnerDecision[];
  capabilities: ReadonlyMap<string, Readonly<{
    decisionIds: readonly string[];
    selection: typeof AUTHORIZED_SELECTION;
    selectedValuesSha256: string;
    policySha256: string | null;
  }>>;
}>;

export type OwnerDecisionVerificationFailure = Readonly<{
  verified: false;
  reason:
    | "authority_input_missing"
    | "external_trust_invalid"
    | "external_trust_not_configured"
    | "envelope_schema_invalid"
    | "envelope_not_authorized_by_external_trust"
    | "authority_not_pinned"
    | "authority_scope_mismatch"
    | "authority_key_mismatch"
    | "attestation_invalid"
    | "signature_invalid"
    | "candidate_identity_incomplete"
    | "candidate_identity_mismatch"
    | "template_binding_mismatch"
    | "inventory_binding_mismatch"
    | "authority_not_yet_effective"
    | "authority_expired"
    | "authority_stale"
    | "authority_revoked"
    | "authority_generation_downgrade"
    | "authority_replay_mismatch"
    | "synthetic_staging_not_attested"
    | "synthetic_authority_forbidden_in_production"
    | "decision_contract_invalid"
    | "capability_contract_invalid";
}>;

export type OwnerDecisionVerificationResult =
  | Readonly<{ verified: true; authority: VerifiedOwnerDecisionAuthority }>
  | OwnerDecisionVerificationFailure;

export type OwnerDecisionAuthorityDenialReason =
  | "authority_not_verified"
  | "required_decision_missing"
  | "required_decision_not_effective"
  | "capability_not_explicitly_selected"
  | "policy_contract_invalid";

export type MetaOptimizationAuthorityPolicy = Readonly<{
  contractVersion: "dealflow-realtor-optimization-v2";
  currencies: readonly ["CAD", "USD"];
  maximumObservationAgeMinutes: 60;
  minimumImpressions: 1000;
  minimumClicks: 20;
  minimumSpendMinor: 5000;
  minimumLeadsForCplDecision: 1;
  attributionWindowDays: 7;
  cooldownMinutes: 1440;
  maximumBudgetIncreasePercent: 20;
  maximumBudgetDecreasePercent: 100;
  maximumDailyScalePercent: 20;
  thresholds: Readonly<{
    ctrGoodPercent: 2; ctrKillPercent: 0.5; cpcTargetMajor: 1;
    cplMaximumMajor: 50; landingPageConversionTargetPercent: 5;
    frequencyMaximum: 4; noLeadsTimeoutHours: 24; spendMultiplierKill: 2;
  }>;
}>;

export type PlatformAdminAuthorityPolicy = Readonly<{
  contractVersion: "dealflow-platform-operator-v1";
  roles: readonly ["viewer", "operator", "security_admin", "break_glass"];
  requiredAssuranceLevel: "aal2";
  maximumSessionAgeMinutes: 10;
  breakGlassMaximumMinutes: 60;
  receiptPolicy: "IMMUTABLE_NO_PII_NO_SECRETS";
}>;

export type PrivacyAuthorityPolicy = Readonly<{
  contractVersion: "dealflow-privacy-authority-v1";
  policyVersion: string;
  policyDigest: string;
  allowedPurposes: readonly string[];
  requestTypes: readonly ["access", "correction", "export", "delete"];
  consentMaximumAgeDays: number;
  dsarRequestExpiryHours: number;
  exportArtifactExpiryHours: number;
  requiredAssuranceLevel: "aal2";
  maximumSessionAgeMinutes: 10;
  legalHoldAndRetentionExecution: "EXPLICIT_SIGNED_AUTHORITY_REQUIRED";
  receiptPolicy: "IMMUTABLE_SANITIZED_NO_RAW_LOGS_OR_SECRETS";
}>;

type Denied<C extends string> = Readonly<{
  authorized: false; capability: C; reason: OwnerDecisionAuthorityDenialReason;
}>;
export type OwnerDecisionAuthorityResult = Denied<typeof VERCEL_ANALYTICS_CAPABILITY> |
  Readonly<{ authorized: true; capability: typeof VERCEL_ANALYTICS_CAPABILITY;
    reason: "authorized"; authorityMode: "production" | "synthetic_staging";
    packetDigest: string; decisionIds: readonly string[];
    signatureReferences: readonly string[] }>;
export type MetaOptimizationAuthorityResult = Denied<typeof META_OPTIMIZATION_CAPABILITY> |
  Readonly<{ authorized: true; capability: typeof META_OPTIMIZATION_CAPABILITY;
    reason: "authorized"; authorityMode: "production" | "synthetic_staging";
    packetDigest: string;
    decisionId: typeof META_OPTIMIZATION_AUTHORITY_DECISION_ID;
    signatureReference: string; policy: MetaOptimizationAuthorityPolicy }>;
export type PlatformAdminAuthorityResult = Denied<typeof PLATFORM_ADMIN_SECURITY_CAPABILITY> |
  Readonly<{ authorized: true; capability: typeof PLATFORM_ADMIN_SECURITY_CAPABILITY;
    reason: "authorized"; authorityMode: "production" | "synthetic_staging";
    packetDigest: string;
    decisionId: typeof PLATFORM_ADMIN_AUTHORITY_DECISION_ID;
    signatureReference: string; candidateIdentity: RuntimeCandidateIdentity;
    policy: PlatformAdminAuthorityPolicy }>;
export type PrivacyAuthorityResult = Denied<typeof PRIVACY_CONSENT_DSAR_CAPABILITY> |
  Readonly<{ authorized: true; capability: typeof PRIVACY_CONSENT_DSAR_CAPABILITY;
    reason: "authorized"; authorityMode: "production" | "synthetic_staging";
    packetDigest: string; decisionIds: readonly string[];
    signatureReferences: readonly string[]; primarySignatureReference: string;
    candidateIdentity: RuntimeCandidateIdentity; policy: PrivacyAuthorityPolicy }>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every(nonEmpty) && new Set(value).size === value.length;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new Error("Unsupported canonical JSON value");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Canonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function fail(reason: OwnerDecisionVerificationFailure["reason"]): OwnerDecisionVerificationFailure {
  return Object.freeze({ verified: false, reason });
}

function completeIdentity(identity: RuntimeCandidateIdentity) {
  return HEX_40.test(identity.commit) && HEX_40.test(identity.tree) &&
    HEX_64.test(identity.trackedWorktreeSha256) &&
    Number.isSafeInteger(identity.trackedFileCount) && identity.trackedFileCount > 0 &&
    HEX_64.test(identity.dependencyLockSha256) &&
    HEX_64.test(identity.migrationPortfolioSha256) &&
    Number.isSafeInteger(identity.migrationCount) && identity.migrationCount > 0;
}

function publicKeyFingerprint(publicKeyPem: string) {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return null;
    const der = key.export({ format: "der", type: "spki" });
    return {
      key,
      sha256: createHash("sha256").update(der).digest("hex"),
    };
  } catch {
    return null;
  }
}

function parseDecision(value: unknown): VerifiedOwnerDecision | null {
  if (!isRecord(value) || !exactKeys(value, [
    "id", "selectedValue", "effectiveAt", "reviewAt", "approver",
  ]) || !identifier(value.id) || value.selectedValue === null ||
    !timestamp(value.effectiveAt) ||
    !(value.reviewAt === null || timestamp(value.reviewAt)) ||
    !isRecord(value.approver) || !exactKeys(value.approver, [
      "role", "identityRef", "approvedAt",
    ]) || !identifier(value.approver.role) ||
    !identifier(value.approver.identityRef) || !timestamp(value.approver.approvedAt)) {
    return null;
  }
  try { canonicalJson(value.selectedValue); } catch { return null; }
  return Object.freeze({
    id: value.id,
    selectedValue: value.selectedValue,
    effectiveAt: value.effectiveAt,
    reviewAt: value.reviewAt as string | null,
    approver: Object.freeze({
      role: value.approver.role as string,
      identityRef: value.approver.identityRef as string,
      approvedAt: value.approver.approvedAt as string,
    }),
  });
}

function selectedValuesDigest(decisions: readonly VerifiedOwnerDecision[], ids: readonly string[]) {
  const selected = [...ids].sort().map((id) => {
    const decision = decisions.find((candidate) => candidate.id === id);
    return decision ? { id, selectedValue: decision.selectedValue } : null;
  });
  if (selected.some((value) => value === null)) return null;
  return sha256Canonical(selected);
}

function selectedPolicyDigest(decisions: readonly VerifiedOwnerDecision[], ids: readonly string[]) {
  const policies = [...ids].sort().flatMap((id) => {
    const decision = decisions.find((candidate) => candidate.id === id);
    const selected = isRecord(decision?.selectedValue) ? decision.selectedValue : null;
    return selected && Object.hasOwn(selected, "policy") ? [{ id, policy: selected.policy }] : [];
  });
  return policies.length === 0 ? null : sha256Canonical(policies);
}

export function verifyOwnerDecisionAuthorityEnvelope({
  envelope,
  envelopeSha256,
  externalTrustPolicy,
  externalTrustPolicySha256,
  runtimeIdentity,
  template,
  now = new Date(),
  deploymentTarget = "unknown",
  isolatedStagingAttested = false,
}: {
  envelope: unknown;
  envelopeSha256: string;
  externalTrustPolicy: unknown;
  externalTrustPolicySha256: string;
  runtimeIdentity: RuntimeCandidateIdentity;
  template: unknown;
  now?: Date;
  deploymentTarget?: string;
  isolatedStagingAttested?: boolean;
}): OwnerDecisionVerificationResult {
  if (!envelope || !externalTrustPolicy) return fail("authority_input_missing");
  if (!completeIdentity(runtimeIdentity)) return fail("candidate_identity_incomplete");
  if (!HEX_64.test(envelopeSha256) || !HEX_64.test(externalTrustPolicySha256) ||
    !isRecord(externalTrustPolicy) ||
    externalTrustPolicy.schemaVersion !== "dealflow.external-release-trust-policy.v1") {
    return fail("external_trust_invalid");
  }
  try {
    if (sha256Canonical(envelope) !== envelopeSha256) {
      return fail("envelope_not_authorized_by_external_trust");
    }
    if (sha256Canonical(externalTrustPolicy) !== externalTrustPolicySha256) {
      return fail("external_trust_invalid");
    }
  } catch {
    return fail("external_trust_invalid");
  }
  if (externalTrustPolicy.status !== "configured") {
    return fail("external_trust_not_configured");
  }
  const ownerTrust = externalTrustPolicy.ownerDecisionAuthority;
  if (!isRecord(ownerTrust) || !exactKeys(ownerTrust, [
    "purpose", "templatePath", "templateSha256", "decisionInventorySha256",
    "requirementInventorySha256", "authorizedEnvelopeSha256",
    "minimumEnvelopeGeneration", "minimumRevocationGeneration",
    "previousEnvelopeSha256", "allowSyntheticIsolatedStaging",
  ]) || ownerTrust.purpose !== OWNER_DECISION_AUTHORITY_PURPOSE ||
    ownerTrust.templatePath !== OWNER_DECISION_TEMPLATE_PATH ||
    !HEX_64.test(String(ownerTrust.templateSha256)) ||
    ownerTrust.decisionInventorySha256 !== EXPECTED_DECISION_INVENTORY_SHA256 ||
    ownerTrust.requirementInventorySha256 !== EXPECTED_REQUIREMENT_INVENTORY_SHA256 ||
    !HEX_64.test(String(ownerTrust.authorizedEnvelopeSha256)) ||
    !Number.isSafeInteger(ownerTrust.minimumEnvelopeGeneration) ||
    Number(ownerTrust.minimumEnvelopeGeneration) < 1 ||
    !Number.isSafeInteger(ownerTrust.minimumRevocationGeneration) ||
    Number(ownerTrust.minimumRevocationGeneration) < 0 ||
    !(ownerTrust.previousEnvelopeSha256 === null ||
      HEX_64.test(String(ownerTrust.previousEnvelopeSha256))) ||
    typeof ownerTrust.allowSyntheticIsolatedStaging !== "boolean") {
    return fail("external_trust_invalid");
  }
  if (ownerTrust.authorizedEnvelopeSha256 !== envelopeSha256) {
    return fail("envelope_not_authorized_by_external_trust");
  }
  if (!isRecord(envelope) || !exactKeys(envelope, [
    "schemaVersion", "envelopeId", "mode", "generation",
    "previousEnvelopeSha256", "revocationGeneration", "authority", "candidate",
    "template", "timing", "decisions", "capabilitySelections",
    "productionReleaseAuthorized", "attestation",
  ]) || envelope.schemaVersion !== OWNER_DECISION_ENVELOPE_SCHEMA_VERSION ||
    !identifier(envelope.envelopeId) ||
    !["production", "synthetic_staging"].includes(String(envelope.mode)) ||
    !Number.isSafeInteger(envelope.generation) || Number(envelope.generation) < 1 ||
    !(envelope.previousEnvelopeSha256 === null ||
      HEX_64.test(String(envelope.previousEnvelopeSha256))) ||
    !Number.isSafeInteger(envelope.revocationGeneration) ||
    Number(envelope.revocationGeneration) < 0 ||
    envelope.productionReleaseAuthorized !== false) {
    return fail("envelope_schema_invalid");
  }
  if (Number(envelope.generation) < Number(ownerTrust.minimumEnvelopeGeneration)) {
    return fail("authority_generation_downgrade");
  }
  if (Number(envelope.revocationGeneration) < Number(ownerTrust.minimumRevocationGeneration)) {
    return fail("authority_revoked");
  }
  if (envelope.previousEnvelopeSha256 !== ownerTrust.previousEnvelopeSha256) {
    return fail("authority_replay_mismatch");
  }
  if (envelope.mode === "synthetic_staging") {
    if (deploymentTarget === "production") {
      return fail("synthetic_authority_forbidden_in_production");
    }
    if (deploymentTarget !== "staging" || !isolatedStagingAttested ||
      ownerTrust.allowSyntheticIsolatedStaging !== true) {
      return fail("synthetic_staging_not_attested");
    }
  } else if (deploymentTarget !== "production") {
    return fail("candidate_identity_mismatch");
  }

  if (!isRecord(envelope.authority) || !exactKeys(envelope.authority, [
    "authorityId", "keyId", "source", "publicKeySha256",
    "releaseTrustPolicyId", "releaseTrustGeneration",
  ]) || !identifier(envelope.authority.authorityId) ||
    !identifier(envelope.authority.keyId) || !identifier(envelope.authority.source) ||
    !HEX_64.test(String(envelope.authority.publicKeySha256)) ||
    envelope.authority.releaseTrustPolicyId !== externalTrustPolicy.policyId ||
    !isRecord(externalTrustPolicy.rotation) ||
    envelope.authority.releaseTrustGeneration !== externalTrustPolicy.rotation.generation) {
    return fail("authority_key_mismatch");
  }
  const authorities = externalTrustPolicy.authorities;
  if (!Array.isArray(authorities)) return fail("external_trust_invalid");
  const pinned = authorities.find((entry) => isRecord(entry) &&
    entry.authorityId === (envelope.authority as UnknownRecord).authorityId &&
    entry.keyId === (envelope.authority as UnknownRecord).keyId);
  if (!isRecord(pinned)) return fail("authority_not_pinned");
  if (pinned.source !== envelope.authority.source ||
    !Array.isArray(pinned.allowedAuthorityPurposes) ||
    !pinned.allowedAuthorityPurposes.includes(OWNER_DECISION_AUTHORITY_PURPOSE)) {
    return fail("authority_scope_mismatch");
  }
  if (!nonEmpty(pinned.publicKeyPem) || !HEX_64.test(String(pinned.publicKeySha256)) ||
    pinned.publicKeySha256 !== envelope.authority.publicKeySha256) {
    return fail("authority_key_mismatch");
  }
  const key = publicKeyFingerprint(pinned.publicKeyPem);
  if (!key || key.sha256 !== pinned.publicKeySha256) {
    return fail("authority_key_mismatch");
  }

  if (!isRecord(envelope.candidate) || !exactKeys(envelope.candidate, [
    "commit", "tree", "trackedWorktreeSha256", "trackedFileCount",
    "dependencyLock", "migrationPortfolio",
  ]) || !isRecord(envelope.candidate.dependencyLock) ||
    !isRecord(envelope.candidate.migrationPortfolio)) {
    return fail("envelope_schema_invalid");
  }
  const candidate = envelope.candidate;
  const lock = candidate.dependencyLock as UnknownRecord;
  const migrations = candidate.migrationPortfolio as UnknownRecord;
  if (candidate.commit !== runtimeIdentity.commit || candidate.tree !== runtimeIdentity.tree ||
    candidate.trackedWorktreeSha256 !== runtimeIdentity.trackedWorktreeSha256 ||
    candidate.trackedFileCount !== runtimeIdentity.trackedFileCount ||
    lock.path !== "package-lock.json" || lock.sha256 !== runtimeIdentity.dependencyLockSha256 ||
    migrations.directory !== "supabase/migrations" ||
    migrations.sha256 !== runtimeIdentity.migrationPortfolioSha256 ||
    migrations.count !== runtimeIdentity.migrationCount) {
    return fail("candidate_identity_mismatch");
  }

  const templateSha256 = sha256Canonical(template);
  if (!isRecord(envelope.template) || !exactKeys(envelope.template, [
    "path", "sha256", "decisionInventorySha256", "requirementInventorySha256",
  ]) || envelope.template.path !== OWNER_DECISION_TEMPLATE_PATH ||
    envelope.template.sha256 !== templateSha256 ||
    ownerTrust.templateSha256 !== templateSha256) {
    return fail("template_binding_mismatch");
  }
  if (envelope.template.decisionInventorySha256 !== EXPECTED_DECISION_INVENTORY_SHA256 ||
    envelope.template.requirementInventorySha256 !== EXPECTED_REQUIREMENT_INVENTORY_SHA256) {
    return fail("inventory_binding_mismatch");
  }

  if (!isRecord(envelope.timing) || !exactKeys(envelope.timing, [
    "issuedAt", "effectiveAt", "expiresAt",
  ]) || !timestamp(envelope.timing.issuedAt) ||
    !timestamp(envelope.timing.effectiveAt) || !timestamp(envelope.timing.expiresAt)) {
    return fail("envelope_schema_invalid");
  }
  const nowMs = now.getTime();
  const issuedMs = Date.parse(envelope.timing.issuedAt);
  const effectiveMs = Date.parse(envelope.timing.effectiveAt);
  const expiresMs = Date.parse(envelope.timing.expiresAt);
  const futureSkewMs = Number(externalTrustPolicy.allowedFutureSkewSeconds ?? -1) * 1000;
  const maximumAgeMs = Number(externalTrustPolicy.maxEvidenceAgeSeconds ?? -1) * 1000;
  if (!Number.isSafeInteger(futureSkewMs) || futureSkewMs < 0 || futureSkewMs > 600_000 ||
    !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 60_000 ||
    maximumAgeMs > 7 * 24 * 60 * 60 * 1000) return fail("external_trust_invalid");
  if (issuedMs > nowMs + futureSkewMs || effectiveMs > nowMs + futureSkewMs) {
    return fail("authority_not_yet_effective");
  }
  if (expiresMs <= nowMs || expiresMs <= effectiveMs || expiresMs <= issuedMs) {
    return fail("authority_expired");
  }
  if (nowMs - issuedMs > maximumAgeMs) return fail("authority_stale");

  if (!Array.isArray(envelope.decisions) || envelope.decisions.length === 0 ||
    envelope.decisions.length > 43) return fail("decision_contract_invalid");
  const decisions = envelope.decisions.map(parseDecision);
  if (decisions.some((entry) => entry === null)) return fail("decision_contract_invalid");
  const verifiedDecisions = decisions as VerifiedOwnerDecision[];
  if (new Set(verifiedDecisions.map((entry) => entry.id)).size !== verifiedDecisions.length) {
    return fail("decision_contract_invalid");
  }
  if (!Array.isArray(envelope.capabilitySelections) ||
    envelope.capabilitySelections.length === 0) return fail("capability_contract_invalid");
  const capabilities = new Map<string, Readonly<{
    decisionIds: readonly string[]; selection: typeof AUTHORIZED_SELECTION;
    selectedValuesSha256: string; policySha256: string | null;
  }>>();
  for (const raw of envelope.capabilitySelections) {
    if (!isRecord(raw) || !exactKeys(raw, [
      "capability", "decisionIds", "selection", "selectedValuesSha256", "policySha256",
    ]) || !identifier(raw.capability) || capabilities.has(raw.capability) ||
      !stringArray(raw.decisionIds) || raw.selection !== AUTHORIZED_SELECTION ||
      !HEX_64.test(String(raw.selectedValuesSha256)) ||
      !(raw.policySha256 === null || HEX_64.test(String(raw.policySha256)))) {
      return fail("capability_contract_invalid");
    }
    const decisionIds = [...raw.decisionIds].sort();
    if (selectedValuesDigest(verifiedDecisions, decisionIds) !== raw.selectedValuesSha256 ||
      selectedPolicyDigest(verifiedDecisions, decisionIds) !== raw.policySha256) {
      return fail("capability_contract_invalid");
    }
    capabilities.set(raw.capability, Object.freeze({
      decisionIds: Object.freeze(decisionIds),
      selection: AUTHORIZED_SELECTION,
      selectedValuesSha256: String(raw.selectedValuesSha256),
      policySha256: raw.policySha256 as string | null,
    }));
  }

  if (!isRecord(envelope.attestation) || !exactKeys(envelope.attestation, [
    "algorithm", "payloadSha256", "signature",
  ]) || envelope.attestation.algorithm !== "ed25519" ||
    !HEX_64.test(String(envelope.attestation.payloadSha256)) ||
    typeof envelope.attestation.signature !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.attestation.signature)) {
    return fail("attestation_invalid");
  }
  const payload = { ...envelope };
  delete payload.attestation;
  const payloadBytes = Buffer.from(canonicalJson(payload), "utf8");
  const payloadSha256 = createHash("sha256").update(payloadBytes).digest("hex");
  if (payloadSha256 !== envelope.attestation.payloadSha256) {
    return fail("attestation_invalid");
  }
  const signature = Buffer.from(envelope.attestation.signature, "base64");
  if (signature.length !== 64 || !verifySignature(null, payloadBytes, key.key, signature)) {
    return fail("signature_invalid");
  }

  const authority = Object.freeze({
    schemaVersion: OWNER_DECISION_ENVELOPE_SCHEMA_VERSION,
    envelopeId: envelope.envelopeId as string,
    envelopeSha256,
    payloadSha256,
    generation: envelope.generation as number,
    revocationGeneration: envelope.revocationGeneration as number,
    mode: envelope.mode as "production" | "synthetic_staging",
    authorityId: envelope.authority.authorityId as string,
    keyId: envelope.authority.keyId as string,
    publicKeySha256: envelope.authority.publicKeySha256 as string,
    signatureReference:
      `ed25519:${String(envelope.authority.authorityId)}:${String(envelope.authority.keyId)}:${payloadSha256}`,
    candidateIdentity: Object.freeze({ ...runtimeIdentity }),
    decisions: Object.freeze(verifiedDecisions),
    capabilities,
  }) as VerifiedOwnerDecisionAuthority;
  verifiedInstances.add(authority);
  return Object.freeze({ verified: true, authority });
}

function isVerifiedAuthority(value: unknown): value is VerifiedOwnerDecisionAuthority {
  return isRecord(value) && verifiedInstances.has(value);
}

function decisionEffective(decision: VerifiedOwnerDecision) {
  const now = Date.now();
  return Date.parse(decision.effectiveAt) <= now &&
    (decision.reviewAt === null || Date.parse(decision.reviewAt) > now);
}

function capabilityDecisions(
  authority: VerifiedOwnerDecisionAuthority,
  capability: string,
  requiredIds: readonly string[],
) {
  const selection = authority.capabilities.get(capability);
  if (!selection || selection.selection !== AUTHORIZED_SELECTION ||
    requiredIds.some((id) => !selection.decisionIds.includes(id))) return null;
  const decisions = requiredIds.map((id) => authority.decisions.find((entry) => entry.id === id));
  return decisions.some((entry) => !entry) ? null : decisions as VerifiedOwnerDecision[];
}

function denied<C extends string>(capability: C, reason: OwnerDecisionAuthorityDenialReason) {
  return Object.freeze({ authorized: false as const, capability, reason });
}

function selectedGrant(decision: VerifiedOwnerDecision, capability: string) {
  return isRecord(decision.selectedValue) && isRecord(decision.selectedValue.capabilityGrants) &&
    decision.selectedValue.capabilityGrants[capability] === AUTHORIZED_SELECTION;
}

function exactMetaPolicy(value: unknown): MetaOptimizationAuthorityPolicy | null {
  if (!isRecord(value) || !isRecord(value.capabilityGrants) ||
    value.capabilityGrants[META_OPTIMIZATION_CAPABILITY] !== AUTHORIZED_SELECTION ||
    !isRecord(value.policy)) return null;
  const policy = value.policy;
  if (!exactKeys(policy, ["contractVersion", "currencies", "maximumObservationAgeMinutes",
    "minimumImpressions", "minimumClicks", "minimumSpendMinor",
    "minimumLeadsForCplDecision", "attributionWindowDays", "cooldownMinutes",
    "maximumBudgetIncreasePercent", "maximumBudgetDecreasePercent",
    "maximumDailyScalePercent", "thresholds"]) ||
    policy.contractVersion !== "dealflow-realtor-optimization-v2" ||
    !Array.isArray(policy.currencies) || policy.currencies[0] !== "CAD" ||
    policy.currencies[1] !== "USD" || policy.currencies.length !== 2 ||
    policy.maximumObservationAgeMinutes !== 60 || policy.minimumImpressions !== 1000 ||
    policy.minimumClicks !== 20 || policy.minimumSpendMinor !== 5000 ||
    policy.minimumLeadsForCplDecision !== 1 || policy.attributionWindowDays !== 7 ||
    policy.cooldownMinutes !== 1440 || policy.maximumBudgetIncreasePercent !== 20 ||
    policy.maximumBudgetDecreasePercent !== 100 || policy.maximumDailyScalePercent !== 20 ||
    !isRecord(policy.thresholds) || !exactKeys(policy.thresholds, ["ctrGoodPercent",
      "ctrKillPercent", "cpcTargetMajor", "cplMaximumMajor",
      "landingPageConversionTargetPercent", "frequencyMaximum", "noLeadsTimeoutHours",
      "spendMultiplierKill"]) || policy.thresholds.ctrGoodPercent !== 2 ||
    policy.thresholds.ctrKillPercent !== 0.5 || policy.thresholds.cpcTargetMajor !== 1 ||
    policy.thresholds.cplMaximumMajor !== 50 ||
    policy.thresholds.landingPageConversionTargetPercent !== 5 ||
    policy.thresholds.frequencyMaximum !== 4 || policy.thresholds.noLeadsTimeoutHours !== 24 ||
    policy.thresholds.spendMultiplierKill !== 2) return null;
  return Object.freeze({ ...policy, currencies: Object.freeze(["CAD", "USD"]),
    thresholds: Object.freeze({ ...policy.thresholds }) }) as MetaOptimizationAuthorityPolicy;
}

function exactAdminPolicy(value: unknown): PlatformAdminAuthorityPolicy | null {
  if (!isRecord(value) || !isRecord(value.capabilityGrants) ||
    value.capabilityGrants[PLATFORM_ADMIN_SECURITY_CAPABILITY] !== AUTHORIZED_SELECTION ||
    !isRecord(value.policy)) return null;
  const p = value.policy;
  if (!exactKeys(p, ["contractVersion", "roles", "requiredAssuranceLevel",
    "maximumSessionAgeMinutes", "breakGlassMaximumMinutes", "receiptPolicy"]) ||
    p.contractVersion !== "dealflow-platform-operator-v1" || !Array.isArray(p.roles) ||
    p.roles.length !== 4 || p.roles.join("|") !== "viewer|operator|security_admin|break_glass" ||
    p.requiredAssuranceLevel !== "aal2" || p.maximumSessionAgeMinutes !== 10 ||
    p.breakGlassMaximumMinutes !== 60 || p.receiptPolicy !== "IMMUTABLE_NO_PII_NO_SECRETS") return null;
  return Object.freeze({ ...p, roles: Object.freeze([...p.roles]) }) as PlatformAdminAuthorityPolicy;
}

function exactPrivacyPolicy(value: unknown): PrivacyAuthorityPolicy | null {
  if (!isRecord(value) || !isRecord(value.capabilityGrants) ||
    value.capabilityGrants[PRIVACY_CONSENT_DSAR_CAPABILITY] !== AUTHORIZED_SELECTION ||
    !isRecord(value.policy)) return null;
  const p = value.policy;
  if (!exactKeys(p, ["contractVersion", "policyVersion", "policyDigest", "allowedPurposes",
    "requestTypes", "consentMaximumAgeDays", "dsarRequestExpiryHours",
    "exportArtifactExpiryHours", "requiredAssuranceLevel", "maximumSessionAgeMinutes",
    "legalHoldAndRetentionExecution", "receiptPolicy"]) ||
    p.contractVersion !== "dealflow-privacy-authority-v1" || !identifier(p.policyVersion) ||
    !HEX_64.test(String(p.policyDigest)) || !stringArray(p.allowedPurposes) ||
    !Array.isArray(p.requestTypes) || p.requestTypes.join("|") !== "access|correction|export|delete" ||
    !Number.isSafeInteger(p.consentMaximumAgeDays) || Number(p.consentMaximumAgeDays) < 1 ||
    Number(p.consentMaximumAgeDays) > 3650 || !Number.isSafeInteger(p.dsarRequestExpiryHours) ||
    Number(p.dsarRequestExpiryHours) < 1 || Number(p.dsarRequestExpiryHours) > 2160 ||
    !Number.isSafeInteger(p.exportArtifactExpiryHours) || Number(p.exportArtifactExpiryHours) < 1 ||
    Number(p.exportArtifactExpiryHours) > 168 || p.requiredAssuranceLevel !== "aal2" ||
    p.maximumSessionAgeMinutes !== 10 ||
    p.legalHoldAndRetentionExecution !== "EXPLICIT_SIGNED_AUTHORITY_REQUIRED" ||
    p.receiptPolicy !== "IMMUTABLE_SANITIZED_NO_RAW_LOGS_OR_SECRETS") return null;
  return Object.freeze({ ...p, allowedPurposes: Object.freeze([...p.allowedPurposes]),
    requestTypes: Object.freeze([...p.requestTypes]) }) as PrivacyAuthorityPolicy;
}

export function evaluateVercelAnalyticsAuthority({ authority }: { authority: unknown }): OwnerDecisionAuthorityResult {
  if (!isVerifiedAuthority(authority)) return denied(VERCEL_ANALYTICS_CAPABILITY, "authority_not_verified");
  const decisions = capabilityDecisions(authority, VERCEL_ANALYTICS_CAPABILITY,
    VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS);
  if (!decisions) return denied(VERCEL_ANALYTICS_CAPABILITY, "required_decision_missing");
  if (decisions.some((entry) => !decisionEffective(entry))) {
    return denied(VERCEL_ANALYTICS_CAPABILITY, "required_decision_not_effective");
  }
  const grant = decisions.find((entry) => entry.id === "OWNER-PRIVACY-002");
  if (!grant || !selectedGrant(grant, VERCEL_ANALYTICS_CAPABILITY)) {
    return denied(VERCEL_ANALYTICS_CAPABILITY, "capability_not_explicitly_selected");
  }
  return Object.freeze({ authorized: true, capability: VERCEL_ANALYTICS_CAPABILITY,
    reason: "authorized", authorityMode: authority.mode, packetDigest: authority.payloadSha256,
    decisionIds: Object.freeze(decisions.map((entry) => entry.id)),
    signatureReferences: Object.freeze(decisions.map(() => authority.signatureReference)) });
}

export function evaluateMetaOptimizationAuthority({ authority }: { authority: unknown }): MetaOptimizationAuthorityResult {
  if (!isVerifiedAuthority(authority)) return denied(META_OPTIMIZATION_CAPABILITY, "authority_not_verified");
  const decisions = capabilityDecisions(authority, META_OPTIMIZATION_CAPABILITY,
    [META_OPTIMIZATION_AUTHORITY_DECISION_ID]);
  if (!decisions) return denied(META_OPTIMIZATION_CAPABILITY, "required_decision_missing");
  if (!decisionEffective(decisions[0])) return denied(META_OPTIMIZATION_CAPABILITY, "required_decision_not_effective");
  const policy = exactMetaPolicy(decisions[0].selectedValue);
  if (!policy) return denied(META_OPTIMIZATION_CAPABILITY,
    selectedGrant(decisions[0], META_OPTIMIZATION_CAPABILITY) ? "policy_contract_invalid" :
      "capability_not_explicitly_selected");
  return Object.freeze({ authorized: true, capability: META_OPTIMIZATION_CAPABILITY,
    reason: "authorized", authorityMode: authority.mode, packetDigest: authority.payloadSha256,
    decisionId: META_OPTIMIZATION_AUTHORITY_DECISION_ID,
    signatureReference: authority.signatureReference, policy });
}

export function evaluatePlatformAdminAuthority({ authority }: { authority: unknown }): PlatformAdminAuthorityResult {
  if (!isVerifiedAuthority(authority)) return denied(PLATFORM_ADMIN_SECURITY_CAPABILITY, "authority_not_verified");
  const decisions = capabilityDecisions(authority, PLATFORM_ADMIN_SECURITY_CAPABILITY,
    [PLATFORM_ADMIN_AUTHORITY_DECISION_ID]);
  if (!decisions) return denied(PLATFORM_ADMIN_SECURITY_CAPABILITY, "required_decision_missing");
  if (!decisionEffective(decisions[0])) return denied(PLATFORM_ADMIN_SECURITY_CAPABILITY, "required_decision_not_effective");
  const policy = exactAdminPolicy(decisions[0].selectedValue);
  if (!policy) return denied(PLATFORM_ADMIN_SECURITY_CAPABILITY,
    selectedGrant(decisions[0], PLATFORM_ADMIN_SECURITY_CAPABILITY) ? "policy_contract_invalid" :
      "capability_not_explicitly_selected");
  return Object.freeze({ authorized: true, capability: PLATFORM_ADMIN_SECURITY_CAPABILITY,
    reason: "authorized", authorityMode: authority.mode, packetDigest: authority.payloadSha256,
    decisionId: PLATFORM_ADMIN_AUTHORITY_DECISION_ID,
    signatureReference: authority.signatureReference,
    candidateIdentity: authority.candidateIdentity, policy });
}

export function evaluatePrivacyAuthority({ authority }: { authority: unknown }): PrivacyAuthorityResult {
  if (!isVerifiedAuthority(authority)) return denied(PRIVACY_CONSENT_DSAR_CAPABILITY, "authority_not_verified");
  const decisions = capabilityDecisions(authority, PRIVACY_CONSENT_DSAR_CAPABILITY,
    VERCEL_ANALYTICS_AUTHORITY_DECISION_IDS);
  if (!decisions) return denied(PRIVACY_CONSENT_DSAR_CAPABILITY, "required_decision_missing");
  if (decisions.some((entry) => !decisionEffective(entry))) {
    return denied(PRIVACY_CONSENT_DSAR_CAPABILITY, "required_decision_not_effective");
  }
  const primary = decisions.find((entry) => entry.id === PRIVACY_AUTHORITY_DECISION_ID);
  const policy = exactPrivacyPolicy(primary?.selectedValue);
  if (!primary || !policy) return denied(PRIVACY_CONSENT_DSAR_CAPABILITY,
    primary && selectedGrant(primary, PRIVACY_CONSENT_DSAR_CAPABILITY) ?
      "policy_contract_invalid" : "capability_not_explicitly_selected");
  return Object.freeze({ authorized: true, capability: PRIVACY_CONSENT_DSAR_CAPABILITY,
    reason: "authorized", authorityMode: authority.mode, packetDigest: authority.payloadSha256,
    decisionIds: Object.freeze(decisions.map((entry) => entry.id)),
    signatureReferences: Object.freeze(decisions.map(() => authority.signatureReference)),
    primarySignatureReference: authority.signatureReference,
    candidateIdentity: authority.candidateIdentity, policy });
}
