import "server-only";

import ownerDecisionTemplate from "../../../config/authority/dealflow-owner-decisions.v1.json";
import type {
  MetaOptimizationAuthorityResult,
  OwnerDecisionAuthorityResult,
  PlatformAdminAuthorityResult,
  PrivacyAuthorityResult,
  RuntimeCandidateIdentity,
} from "@/lib/authority/owner-decision-authority-contract";
import {
  AUTHORIZED_SELECTION,
  META_OPTIMIZATION_CAPABILITY,
  parseMetaOptimizationPolicy,
  parsePlatformAdminPolicy,
  parsePrivacyPolicy,
  PLATFORM_ADMIN_SECURITY_CAPABILITY,
  PRIVACY_CONSENT_DSAR_CAPABILITY,
  PRIVACY_DECISION_IDS,
  selectedValueGrants,
  VERCEL_ANALYTICS_CAPABILITY,
} from "@/lib/authority/owner-decision-authority-policies";
import { isExactIsolatedStagingVercelHost } from "@/lib/deployment-target";
import { createAdminClient } from "@/lib/server/supabase-admin";

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const EXPECTED_DECISION_INVENTORY_SHA256 =
  "12d0d5780a28dd93696f17ed1e7177ed85460428c4c3b02e180cf68db9073b8d";
const EXPECTED_REQUIREMENT_INVENTORY_SHA256 =
  "8c6bf382bb5f7d0233ecb7edbf591167dad3c18f5f14206735d38f830f3c9bc4";
const LOOKUP_TIMEOUT_MS = 750;
const ANALYTICS_CACHE_MS = 5_000;

const BUILT_RUNTIME_IDENTITY: RuntimeCandidateIdentity = Object.freeze({
  commit: process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT ?? "",
  tree: process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_TREE ?? "",
  trackedWorktreeSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256 ?? "",
  trackedFileCount: Number(process.env.NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT ?? ""),
  dependencyLockSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256 ?? "",
  migrationPortfolioSha256:
    process.env.DEALFLOW_RUNTIME_MIGRATION_PORTFOLIO_SHA256 ?? "",
  migrationCount: Number(process.env.DEALFLOW_RUNTIME_MIGRATION_COUNT ?? ""),
});

type AuthorityEnvironment = "production" | "staging";
type AuthorityClient = Readonly<{
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown; error: unknown;
  }>;
}>;
type InstalledDecision = Readonly<{ id: string; selectedValue: unknown }>;
type InstalledGrant = Readonly<{
  environment: AuthorityEnvironment;
  authorityMode: "production" | "synthetic_staging";
  decisionIds: readonly string[];
  selectedValues: readonly InstalledDecision[];
  policy: unknown;
  payloadSha256: string;
  signatureReference: string;
  candidateIdentity: RuntimeCandidateIdentity;
}>;

let analyticsCache: { expiresAt: number; result: OwnerDecisionAuthorityResult } | null = null;

function denied<C extends string>(capability: C) {
  return Object.freeze({
    authorized: false as const,
    capability,
    reason: "authority_not_verified" as const,
  });
}

function runtimeEnvironment(env: Record<string, string | undefined>): AuthorityEnvironment | null {
  if (isExactIsolatedStagingVercelHost(env)) return "staging";
  if (env.VERCEL_ENV === "production" &&
    env.DEALFLOW_DEPLOYMENT_TARGET === "production" &&
    Boolean(env.VERCEL_PROJECT_ID?.trim())) return "production";
  return null;
}

function completeIdentity(identity: RuntimeCandidateIdentity) {
  return HEX_40.test(identity.commit) && HEX_40.test(identity.tree) &&
    HEX_64.test(identity.trackedWorktreeSha256) &&
    Number.isSafeInteger(identity.trackedFileCount) && identity.trackedFileCount > 0 &&
    HEX_64.test(identity.dependencyLockSha256) &&
    HEX_64.test(identity.migrationPortfolioSha256) &&
    Number.isSafeInteger(identity.migrationCount) && identity.migrationCount > 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!record(value)) throw new Error("unsupported_canonical_json");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function sha256Canonical(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Text(value: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function firstRecord(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return record(candidate) ? candidate : null;
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 ||
    value.some((entry) => typeof entry !== "string") ||
    new Set(value).size !== value.length) return null;
  return [...value] as string[];
}

async function readInstalledGrant({
  capability,
  requiredDecisionIds,
  client,
  env,
  identity,
  timeoutMs,
}: {
  capability: string;
  requiredDecisionIds: readonly string[];
  client?: AuthorityClient | null;
  env: Record<string, string | undefined>;
  identity: RuntimeCandidateIdentity;
  timeoutMs: number;
}): Promise<InstalledGrant | null> {
  const environment = runtimeEnvironment(env);
  if (!environment || !completeIdentity(identity)) return null;
  const hostedProjectId = env.VERCEL_PROJECT_ID?.trim() ?? "";
  if (!hostedProjectId) return null;
  const hostProjectIdSha256 = await sha256Text(hostedProjectId);
  const authorityClient = client === undefined
    ? createAdminClient() as unknown as AuthorityClient | null
    : client;
  if (!authorityClient) return null;
  const response = await bounded(authorityClient.rpc(
    "resolve_owner_decision_authority_v1",
    {
      p_environment: environment,
      p_capability: capability,
      p_host_project_id_sha256: hostProjectIdSha256,
      p_candidate_commit: identity.commit,
      p_candidate_tree: identity.tree,
      p_candidate_digest: identity.trackedWorktreeSha256,
      p_tracked_file_count: identity.trackedFileCount,
      p_dependency_lock_sha256: identity.dependencyLockSha256,
      p_migration_portfolio_sha256: identity.migrationPortfolioSha256,
      p_migration_count: identity.migrationCount,
    },
  ), timeoutMs);
  if (!response || response.error) return null;
  const row = firstRecord(response.data);
  if (!row) return null;
  const decisionIds = stringArray(row.decision_ids);
  if (!decisionIds || decisionIds.length !== requiredDecisionIds.length ||
    requiredDecisionIds.some((id) => !decisionIds.includes(id)) ||
    !Array.isArray(row.selected_values) || row.selected_values.length !== decisionIds.length ||
    row.authority_mode !== (environment === "production" ? "externally_signed" : "synthetic_staging") ||
    row.host_project_id_sha256 !== hostProjectIdSha256 ||
    !HEX_64.test(String(row.payload_sha256)) ||
    row.signature_reference !==
      `ed25519:${String(row.authority_id)}:${String(row.key_id)}:${String(row.payload_sha256)}` ||
    row.candidate_commit !== identity.commit || row.candidate_tree !== identity.tree ||
    row.candidate_digest !== identity.trackedWorktreeSha256 ||
    Number(row.tracked_file_count) !== identity.trackedFileCount ||
    row.dependency_lock_sha256 !== identity.dependencyLockSha256 ||
    row.migration_portfolio_sha256 !== identity.migrationPortfolioSha256 ||
    Number(row.migration_count) !== identity.migrationCount ||
    row.decision_inventory_sha256 !== EXPECTED_DECISION_INVENTORY_SHA256 ||
    row.requirement_inventory_sha256 !== EXPECTED_REQUIREMENT_INVENTORY_SHA256 ||
    !HEX_64.test(String(row.template_sha256)) || !HEX_64.test(String(row.grant_digest)) ||
    !HEX_64.test(String(row.selected_values_sha256))) return null;

  let templateSha256: string;
  let selectedValuesSha256: string;
  try {
    [templateSha256, selectedValuesSha256] = await Promise.all([
      sha256Canonical(ownerDecisionTemplate),
      sha256Canonical(row.selected_values),
    ]);
  } catch {
    return null;
  }
  if (row.template_sha256 !== templateSha256 ||
    row.selected_values_sha256 !== selectedValuesSha256) return null;
  if (row.policy === null ? row.policy_sha256 !== null :
    row.policy_sha256 !== await sha256Canonical(row.policy)) return null;

  const selectedValues: InstalledDecision[] = [];
  for (const value of row.selected_values) {
    if (!record(value) || typeof value.id !== "string" ||
      !decisionIds.includes(value.id) || value.selectedValue === null) return null;
    selectedValues.push(Object.freeze({ id: value.id, selectedValue: value.selectedValue }));
  }
  if (new Set(selectedValues.map((value) => value.id)).size !== decisionIds.length) return null;
  return Object.freeze({
    environment,
    authorityMode: environment === "production" ? "production" : "synthetic_staging",
    decisionIds: Object.freeze(decisionIds),
    selectedValues: Object.freeze(selectedValues),
    policy: row.policy,
    payloadSha256: String(row.payload_sha256),
    signatureReference: String(row.signature_reference),
    candidateIdentity: Object.freeze({ ...identity }),
  });
}

type ReaderOptions = Readonly<{
  client?: AuthorityClient | null;
  env?: Record<string, string | undefined>;
  identity?: RuntimeCandidateIdentity;
  timeoutMs?: number;
}>;

export async function readVercelAnalyticsAuthority(
  options: ReaderOptions = {},
): Promise<OwnerDecisionAuthorityResult> {
  const useCache = options.client === undefined && options.env === undefined &&
    options.identity === undefined && options.timeoutMs === undefined;
  if (useCache && analyticsCache && analyticsCache.expiresAt > Date.now()) {
    return analyticsCache.result;
  }
  const grant = await readInstalledGrant({
    capability: VERCEL_ANALYTICS_CAPABILITY,
    requiredDecisionIds: PRIVACY_DECISION_IDS,
    client: options.client,
    env: options.env ?? process.env,
    identity: options.identity ?? BUILT_RUNTIME_IDENTITY,
    timeoutMs: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
  });
  const lawfulBasis = grant?.selectedValues.find((entry) => entry.id === "OWNER-PRIVACY-002");
  const result: OwnerDecisionAuthorityResult = !grant || !lawfulBasis ||
    !selectedValueGrants(lawfulBasis.selectedValue, VERCEL_ANALYTICS_CAPABILITY)
    ? denied(VERCEL_ANALYTICS_CAPABILITY)
    : Object.freeze({ authorized: true, capability: VERCEL_ANALYTICS_CAPABILITY,
      reason: "authorized", authorityMode: grant.authorityMode,
      packetDigest: grant.payloadSha256, decisionIds: grant.decisionIds,
      signatureReferences: Object.freeze(grant.decisionIds.map(() => grant.signatureReference)) });
  if (useCache) analyticsCache = { expiresAt: Date.now() + ANALYTICS_CACHE_MS, result };
  return result;
}

export async function readMetaOptimizationAuthority(
  options: ReaderOptions = {},
): Promise<MetaOptimizationAuthorityResult> {
  const grant = await readInstalledGrant({
    capability: META_OPTIMIZATION_CAPABILITY,
    requiredDecisionIds: ["OWNER-007"], client: options.client,
    env: options.env ?? process.env, identity: options.identity ?? BUILT_RUNTIME_IDENTITY,
    timeoutMs: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
  });
  const selected = grant?.selectedValues[0];
  const policy = grant ? parseMetaOptimizationPolicy(grant.policy) : null;
  if (!grant || !selected || !policy ||
    !selectedValueGrants(selected.selectedValue, META_OPTIMIZATION_CAPABILITY)) {
    return denied(META_OPTIMIZATION_CAPABILITY);
  }
  return Object.freeze({ authorized: true, capability: META_OPTIMIZATION_CAPABILITY,
    reason: "authorized", authorityMode: grant.authorityMode,
    packetDigest: grant.payloadSha256, decisionId: "OWNER-007",
    signatureReference: grant.signatureReference, policy });
}

export async function readPlatformAdminAuthority(
  options: ReaderOptions = {},
): Promise<PlatformAdminAuthorityResult> {
  const grant = await readInstalledGrant({
    capability: PLATFORM_ADMIN_SECURITY_CAPABILITY,
    requiredDecisionIds: ["OWNER-ADMIN-SECURITY-SURFACE"], client: options.client,
    env: options.env ?? process.env, identity: options.identity ?? BUILT_RUNTIME_IDENTITY,
    timeoutMs: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
  });
  const selected = grant?.selectedValues[0];
  const policy = grant ? parsePlatformAdminPolicy(grant.policy) : null;
  if (!grant || !selected || !policy ||
    !selectedValueGrants(selected.selectedValue, PLATFORM_ADMIN_SECURITY_CAPABILITY)) {
    return denied(PLATFORM_ADMIN_SECURITY_CAPABILITY);
  }
  return Object.freeze({ authorized: true, capability: PLATFORM_ADMIN_SECURITY_CAPABILITY,
    reason: "authorized", authorityMode: grant.authorityMode,
    packetDigest: grant.payloadSha256, decisionId: "OWNER-ADMIN-SECURITY-SURFACE",
    signatureReference: grant.signatureReference,
    candidateIdentity: grant.candidateIdentity, policy });
}

export async function readPrivacyAuthority(
  options: ReaderOptions = {},
): Promise<PrivacyAuthorityResult> {
  const grant = await readInstalledGrant({
    capability: PRIVACY_CONSENT_DSAR_CAPABILITY,
    requiredDecisionIds: PRIVACY_DECISION_IDS, client: options.client,
    env: options.env ?? process.env, identity: options.identity ?? BUILT_RUNTIME_IDENTITY,
    timeoutMs: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
  });
  const primary = grant?.selectedValues.find((entry) => entry.id === "OWNER-PRIVACY-005");
  const policy = grant ? parsePrivacyPolicy(grant.policy) : null;
  if (!grant || !primary || !policy ||
    !selectedValueGrants(primary.selectedValue, PRIVACY_CONSENT_DSAR_CAPABILITY)) {
    return denied(PRIVACY_CONSENT_DSAR_CAPABILITY);
  }
  return Object.freeze({ authorized: true, capability: PRIVACY_CONSENT_DSAR_CAPABILITY,
    reason: "authorized", authorityMode: grant.authorityMode,
    packetDigest: grant.payloadSha256, decisionIds: grant.decisionIds,
    signatureReferences: Object.freeze(grant.decisionIds.map(() => grant.signatureReference)),
    primarySignatureReference: grant.signatureReference,
    candidateIdentity: grant.candidateIdentity, policy });
}
