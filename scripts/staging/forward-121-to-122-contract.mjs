import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORWARD_120_TO_121_AUTHORITY } from "./forward-120-to-121-contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Preserve the sealed 121-migration portfolio as immutable prior truth and
// authorize only the demonstrated PostgREST claim-compatibility correction.
export const FORWARD_121_TO_122_AUTHORITY = Object.freeze({
  schemaVersion: "dealflow.staging-forward-121-to-122-authority.v1",
  projectFingerprint: FORWARD_120_TO_121_AUTHORITY.projectFingerprint,
  projectSafeSuffix: FORWARD_120_TO_121_AUTHORITY.projectSafeSuffix,
  prior: Object.freeze({ ...FORWARD_120_TO_121_AUTHORITY.current }),
  current: Object.freeze({
    migrationCount: 122,
    finalMigration: "20260722010000_modernize_provider_service_role_claims.sql",
    migrationPortfolioSha256:
      "f5208451c0d3d10b42e2e5f566b91b31bfb8e621c94ae7dc638f406a080295f9",
    sourceReplayMigrationPortfolioSha256:
      "04251349ce86007d9f9da52e247f9016a2a06f0458f4d4b60019edcd268bafcc",
    managedStructuralCatalogSha256:
      "afd3b0d494dc85a2d4862e676e39170dec6fa270f516e4f8213603c86d01c250",
    managedStructuralCatalogRecordCount: 8405,
  }),
  forwardMigration: Object.freeze({
    version: "20260722010000",
    file: "20260722010000_modernize_provider_service_role_claims.sql",
    sha256: "8026fb77bd2d8537831177a8cbb501749bf0a05db323dec182746cd8f22fbe2a",
    bytes: 2001,
  }),
});

function portfolioSha256(records, migrationDirectory) {
  const digest = createHash("sha256");
  for (const record of records) {
    const contents = readFileSync(join(migrationDirectory, record.name));
    digest.update(String(Buffer.byteLength(record.name)));
    digest.update("\0");
    digest.update(record.name);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function assertExactForward121To122Portfolio(records, migrationDirectory) {
  const authority = FORWARD_121_TO_122_AUTHORITY;
  if (!Array.isArray(records) || records.length !== authority.current.migrationCount) {
    throw new Error("Successor authority requires the exact 122-migration portfolio");
  }
  const names = records.map((record) => record.name);
  const versions = names.map((name) => name.slice(0, 14));
  if (
    new Set(names).size !== names.length ||
    new Set(versions).size !== versions.length ||
    [...names].sort().some((name, index) => name !== names[index])
  ) {
    throw new Error("Successor authority rejects unordered or ambiguous migration identities");
  }
  const priorRecords = records.slice(0, authority.prior.migrationCount);
  const forwardRecord = records.at(-1);
  if (
    priorRecords.at(-1)?.name !== authority.prior.finalMigration ||
    portfolioSha256(priorRecords, migrationDirectory) !==
      (authority.prior.sourceReplayMigrationPortfolioSha256 ?? authority.prior.migrationPortfolioSha256)
  ) {
    throw new Error("Successor authority rejects drift in the sealed 121-migration prefix");
  }
  const forwardContents = readFileSync(join(migrationDirectory, forwardRecord.name));
  const actualForward = {
    version: forwardRecord.name.slice(0, 14),
    file: forwardRecord.name,
    sha256: sha256(forwardContents),
    bytes: forwardContents.byteLength,
  };
  if (
    JSON.stringify(actualForward) !== JSON.stringify(authority.forwardMigration) ||
    portfolioSha256(records, migrationDirectory) !==
      authority.current.sourceReplayMigrationPortfolioSha256
  ) {
    throw new Error("Successor authority rejects drift in migration 122 or the current portfolio");
  }
  return Object.freeze({
    priorRecords: Object.freeze([...priorRecords]),
    forwardRecord: Object.freeze({ ...forwardRecord }),
    priorVersions: Object.freeze(priorRecords.map((record) => record.name.slice(0, 14))),
    currentVersions: Object.freeze(records.map((record) => record.name.slice(0, 14))),
  });
}
