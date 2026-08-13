import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORWARD_121_TO_122_AUTHORITY } from "./forward-121-to-122-contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Preserve the sealed 122-migration portfolio as immutable prior truth and
// authorize only the demonstrated HighLevel location-token scope correction.
export const FORWARD_122_TO_123_AUTHORITY = Object.freeze({
  schemaVersion: "dealflow.staging-forward-122-to-123-authority.v1",
  projectFingerprint: FORWARD_121_TO_122_AUTHORITY.projectFingerprint,
  projectSafeSuffix: FORWARD_121_TO_122_AUTHORITY.projectSafeSuffix,
  prior: Object.freeze({ ...FORWARD_121_TO_122_AUTHORITY.current }),
  current: Object.freeze({
    migrationCount: 123,
    finalMigration: "20260722020000_persist_ghl_location_token_scope.sql",
    migrationPortfolioSha256:
      "5ad214ab85d9dc3c0410950e2bd7b1a04e706059f5f98f518a84b1207dfc0138",
    sourceReplayMigrationPortfolioSha256:
      "f1b964731c013a18153bad2e199a37fe435a78596689d894d822ef068a38d696",
    managedStructuralCatalogSha256:
      "b41cd90ccb0d5f8629932d0d36fdfaf75110fc4a55c567465194039c0ec0cd6e",
    managedStructuralCatalogRecordCount: 8408,
  }),
  forwardMigration: Object.freeze({
    version: "20260722020000",
    file: "20260722020000_persist_ghl_location_token_scope.sql",
    sha256: "97953981112bbf33f9d2e7c1f4d73cce205aa3adc6141164f30d44c5e7a45839",
    bytes: 6751,
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

export function assertExactForward122To123Portfolio(records, migrationDirectory) {
  const authority = FORWARD_122_TO_123_AUTHORITY;
  if (!Array.isArray(records) || records.length !== authority.current.migrationCount) {
    throw new Error("Successor authority requires the exact 123-migration portfolio");
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
    throw new Error("Successor authority rejects drift in the sealed 122-migration prefix");
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
    throw new Error("Successor authority rejects drift in migration 123 or the current portfolio");
  }
  return Object.freeze({
    priorRecords: Object.freeze([...priorRecords]),
    forwardRecord: Object.freeze({ ...forwardRecord }),
    priorVersions: Object.freeze(priorRecords.map((record) => record.name.slice(0, 14))),
    currentVersions: Object.freeze(records.map((record) => record.name.slice(0, 14))),
  });
}
