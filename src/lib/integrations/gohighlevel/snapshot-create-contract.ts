import { createHash } from "node:crypto";
import type {
  GhlLocationCreateInput,
  GhlSnapshotManifest,
} from "./types";

type JsonRecord = Record<string, unknown>;

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
