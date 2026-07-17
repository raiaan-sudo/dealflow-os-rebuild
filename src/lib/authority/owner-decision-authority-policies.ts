import type {
  MetaOptimizationAuthorityPolicy,
  PlatformAdminAuthorityPolicy,
  PrivacyAuthorityPolicy,
} from "@/lib/authority/owner-decision-authority-contract";

export const VERCEL_ANALYTICS_CAPABILITY = "vercel_analytics" as const;
export const META_OPTIMIZATION_CAPABILITY = "meta_optimization_provider_writes" as const;
export const PLATFORM_ADMIN_SECURITY_CAPABILITY = "platform_admin_security_surface" as const;
export const PRIVACY_CONSENT_DSAR_CAPABILITY = "privacy_consent_dsar_authority" as const;
export const AUTHORIZED_SELECTION = "APPROVED_ENABLED" as const;
export const PRIVACY_DECISION_IDS = Object.freeze([
  "OWNER-PRIVACY-001", "OWNER-PRIVACY-002", "OWNER-PRIVACY-003",
  "OWNER-PRIVACY-004", "OWNER-PRIVACY-005", "OWNER-PRIVACY-006",
  "OWNER-PRIVACY-007", "OWNER-PRIVACY-008", "OWNER-PRIVACY-009",
]);

type RecordValue = Record<string, unknown>;
const HEX_64 = /^[0-9a-f]{64}$/;

function record(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: RecordValue, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function selectedValueGrants(value: unknown, capability: string) {
  return record(value) && record(value.capabilityGrants) &&
    value.capabilityGrants[capability] === AUTHORIZED_SELECTION;
}

export function parseMetaOptimizationPolicy(value: unknown): MetaOptimizationAuthorityPolicy | null {
  if (!record(value) || !exactKeys(value, ["contractVersion", "currencies",
    "maximumObservationAgeMinutes", "minimumImpressions", "minimumClicks",
    "minimumSpendMinor", "minimumLeadsForCplDecision", "attributionWindowDays",
    "cooldownMinutes", "maximumBudgetIncreasePercent", "maximumBudgetDecreasePercent",
    "maximumDailyScalePercent", "thresholds"]) ||
    value.contractVersion !== "dealflow-realtor-optimization-v2" ||
    !Array.isArray(value.currencies) || value.currencies.join("|") !== "CAD|USD" ||
    value.maximumObservationAgeMinutes !== 60 || value.minimumImpressions !== 1000 ||
    value.minimumClicks !== 20 || value.minimumSpendMinor !== 5000 ||
    value.minimumLeadsForCplDecision !== 1 || value.attributionWindowDays !== 7 ||
    value.cooldownMinutes !== 1440 || value.maximumBudgetIncreasePercent !== 20 ||
    value.maximumBudgetDecreasePercent !== 100 || value.maximumDailyScalePercent !== 20 ||
    !record(value.thresholds) || !exactKeys(value.thresholds, ["ctrGoodPercent",
      "ctrKillPercent", "cpcTargetMajor", "cplMaximumMajor",
      "landingPageConversionTargetPercent", "frequencyMaximum", "noLeadsTimeoutHours",
      "spendMultiplierKill"]) || value.thresholds.ctrGoodPercent !== 2 ||
    value.thresholds.ctrKillPercent !== 0.5 || value.thresholds.cpcTargetMajor !== 1 ||
    value.thresholds.cplMaximumMajor !== 50 ||
    value.thresholds.landingPageConversionTargetPercent !== 5 ||
    value.thresholds.frequencyMaximum !== 4 || value.thresholds.noLeadsTimeoutHours !== 24 ||
    value.thresholds.spendMultiplierKill !== 2) return null;
  return Object.freeze({ ...value, currencies: Object.freeze(["CAD", "USD"]),
    thresholds: Object.freeze({ ...value.thresholds }) }) as MetaOptimizationAuthorityPolicy;
}

export function parsePlatformAdminPolicy(value: unknown): PlatformAdminAuthorityPolicy | null {
  if (!record(value) || !exactKeys(value, ["contractVersion", "roles",
    "requiredAssuranceLevel", "maximumSessionAgeMinutes", "breakGlassMaximumMinutes",
    "receiptPolicy"]) || value.contractVersion !== "dealflow-platform-operator-v1" ||
    !Array.isArray(value.roles) || value.roles.join("|") !==
      "viewer|operator|security_admin|break_glass" ||
    value.requiredAssuranceLevel !== "aal2" || value.maximumSessionAgeMinutes !== 10 ||
    value.breakGlassMaximumMinutes !== 60 ||
    value.receiptPolicy !== "IMMUTABLE_NO_PII_NO_SECRETS") return null;
  return Object.freeze({ ...value, roles: Object.freeze([...value.roles]) }) as PlatformAdminAuthorityPolicy;
}

export function parsePrivacyPolicy(value: unknown): PrivacyAuthorityPolicy | null {
  if (!record(value) || !exactKeys(value, ["contractVersion", "policyVersion",
    "policyDigest", "allowedPurposes", "requestTypes", "consentMaximumAgeDays",
    "dsarRequestExpiryHours", "exportArtifactExpiryHours", "requiredAssuranceLevel",
    "maximumSessionAgeMinutes", "legalHoldAndRetentionExecution", "receiptPolicy"]) ||
    value.contractVersion !== "dealflow-privacy-authority-v1" ||
    typeof value.policyVersion !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.policyVersion) ||
    !HEX_64.test(String(value.policyDigest)) || !Array.isArray(value.allowedPurposes) ||
    value.allowedPurposes.length === 0 ||
    value.allowedPurposes.some((purpose) => typeof purpose !== "string" ||
      !/^[a-z][a-z0-9_.:-]{1,99}$/.test(purpose)) ||
    !Array.isArray(value.requestTypes) ||
    value.requestTypes.join("|") !== "access|correction|export|delete" ||
    !Number.isSafeInteger(value.consentMaximumAgeDays) ||
    Number(value.consentMaximumAgeDays) < 1 || Number(value.consentMaximumAgeDays) > 3650 ||
    !Number.isSafeInteger(value.dsarRequestExpiryHours) ||
    Number(value.dsarRequestExpiryHours) < 1 || Number(value.dsarRequestExpiryHours) > 2160 ||
    !Number.isSafeInteger(value.exportArtifactExpiryHours) ||
    Number(value.exportArtifactExpiryHours) < 1 || Number(value.exportArtifactExpiryHours) > 168 ||
    value.requiredAssuranceLevel !== "aal2" || value.maximumSessionAgeMinutes !== 10 ||
    value.legalHoldAndRetentionExecution !== "EXPLICIT_SIGNED_AUTHORITY_REQUIRED" ||
    value.receiptPolicy !== "IMMUTABLE_SANITIZED_NO_RAW_LOGS_OR_SECRETS") return null;
  return Object.freeze({ ...value,
    allowedPurposes: Object.freeze([...value.allowedPurposes]),
    requestTypes: Object.freeze([...value.requestTypes]),
  }) as PrivacyAuthorityPolicy;
}
