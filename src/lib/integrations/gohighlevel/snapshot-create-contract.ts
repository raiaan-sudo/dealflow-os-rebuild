import { createHash } from "node:crypto";
import type {
  GhlLocationCreateInput,
  GhlSnapshotManifest,
} from "./types";

type JsonRecord = Record<string, unknown>;

export const GHL_LOCATION_CREATE_VISIBILITY_WINDOW_MS = 15 * 60 * 1_000;
export const GHL_LOCATION_SEARCH_PAGE_LIMIT = 100;
export const GHL_LOCATION_SEARCH_MAX_PAGES = 25;

const GHL_LOCATION_REQUEST_TAG_PREFIX = "DFR1";
const GHL_LOCATION_PROVIDER_NAME_MAX_LENGTH = 180;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function assertRequestFingerprint(requestFingerprint: string) {
  if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) {
    throw new Error("A complete immutable GHL location request fingerprint is required.");
  }
}

/**
 * GHL does not expose an idempotency-key lookup for Create Sub-Account. Embed
 * the non-PII request digest in the provider name so an ambiguous POST can be
 * reconciled through the official agency-scoped GET /locations/search route.
 * The complete digest is retained to avoid prefix collisions.
 */
export function buildGhlProviderLocationName(
  displayName: string,
  requestFingerprint: string,
) {
  assertRequestFingerprint(requestFingerprint);
  const normalizedDisplayName = buildGhlProviderDisplayName(displayName);
  const tag = ` [${GHL_LOCATION_REQUEST_TAG_PREFIX}:${requestFingerprint}]`;
  const maximumDisplayNameLength = GHL_LOCATION_PROVIDER_NAME_MAX_LENGTH - tag.length;
  return `${normalizedDisplayName.slice(0, maximumDisplayNameLength).trimEnd()}${tag}`;
}

export function buildGhlProviderDisplayName(displayName: string) {
  const normalizedDisplayName = displayName.trim().replace(/\s+/g, " ");
  if (
    !normalizedDisplayName
    || normalizedDisplayName.length > GHL_LOCATION_PROVIDER_NAME_MAX_LENGTH
  ) {
    throw new Error("A non-empty GHL provider location name of at most 180 characters is required.");
  }
  return normalizedDisplayName;
}

export function buildGhlLocationReconciliationResponseFingerprint(input: {
  requestFingerprint: string;
  pageFingerprints: string[];
  matchedProviderLocationIds: string[];
}) {
  assertRequestFingerprint(input.requestFingerprint);
  return sha256({
    contractVersion: 1,
    requestFingerprint: input.requestFingerprint,
    pageFingerprints: input.pageFingerprints,
    matchedProviderLocationIds: [...input.matchedProviderLocationIds].sort(),
  });
}

function normalizedManifest(manifest: GhlSnapshotManifest) {
  return {
    id: manifest.id,
    environment: manifest.environment,
    snapshotKey: manifest.snapshotKey,
    snapshotVersion: manifest.snapshotVersion,
    providerSnapshotId: manifest.providerSnapshotId,
    installationMode: manifest.installationMode ?? "provider_api",
    personalizationContract: manifest.personalizationContract ?? null,
    requiredObjects: manifest.requiredObjects,
    status: manifest.status,
  };
}

export function buildGhlSnapshotManifestFingerprint(manifest: GhlSnapshotManifest) {
  return sha256({
    contractVersion: 1,
    manifest: normalizedManifest(manifest),
  });
}

export function buildGhlLocationCreateRequestFingerprint(
  input: Omit<GhlLocationCreateInput, "requestFingerprint">,
) {
  return sha256({
    contractVersion: 1,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    environment: input.environment,
    organizationId: input.organizationId,
    profile: input.profile,
    snapshotManifest: normalizedManifest(input.snapshotManifest),
    snapshotManifestFingerprint: input.snapshotManifestFingerprint,
  });
}

export function isExactGhlLocationCreateContract(input: GhlLocationCreateInput) {
  return /^[a-f0-9]{64}$/.test(input.snapshotManifestFingerprint)
    && /^[a-f0-9]{64}$/.test(input.requestFingerprint)
    && input.snapshotManifestFingerprint
      === buildGhlSnapshotManifestFingerprint(input.snapshotManifest)
    && input.requestFingerprint
      === buildGhlLocationCreateRequestFingerprint(input);
}
