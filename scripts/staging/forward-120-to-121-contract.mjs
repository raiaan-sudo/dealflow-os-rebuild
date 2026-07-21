import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORWARD_104_TO_120_AUTHORITY } from "./forward-104-to-120-contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// This successor authority is deliberately separate from the sealed 104→120
// authority. It treats that exact 120 portfolio as immutable prior truth and
// authorizes only the single additive 121 migration.
export const FORWARD_120_TO_121_AUTHORITY = Object.freeze({
  schemaVersion: "dealflow.staging-forward-120-to-121-authority.v1",
  projectFingerprint: FORWARD_104_TO_120_AUTHORITY.projectFingerprint,
  projectSafeSuffix: FORWARD_104_TO_120_AUTHORITY.projectSafeSuffix,
  prior: Object.freeze({ ...FORWARD_104_TO_120_AUTHORITY.current }),
  current: Object.freeze({
    migrationCount: 121,
    finalMigration: "20260720010000_add_ghl_embed_sso_authority.sql",
    migrationPortfolioSha256:
      "4d243c7f89da224f92f7a7916413b7f27a73d7dfd2eebd80e525f5d0f1f1f3d4",
    managedStructuralCatalogSha256:
      "afd3b0d494dc85a2d4862e676e39170dec6fa270f516e4f8213603c86d01c250",
    managedStructuralCatalogRecordCount: 8405,
  }),
  forwardMigration: Object.freeze({
    version: "20260720010000",
    file: "20260720010000_add_ghl_embed_sso_authority.sql",
    sha256: "eaec4929b110bf25094e5816e26a5cdb17786a2864ef06ed3b52af6198316542",
    bytes: 16966,
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

export function assertExactForward120To121Portfolio(records, migrationDirectory) {
  const authority = FORWARD_120_TO_121_AUTHORITY;
  if (!Array.isArray(records) || records.length !== authority.current.migrationCount) {
    throw new Error("Successor authority requires the exact 121-migration portfolio");
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
    portfolioSha256(priorRecords, migrationDirectory) !== authority.prior.migrationPortfolioSha256
  ) {
    throw new Error("Successor authority rejects drift in the sealed 120-migration prefix");
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
    portfolioSha256(records, migrationDirectory) !== authority.current.migrationPortfolioSha256
  ) {
    throw new Error("Successor authority rejects drift in migration 121 or the current portfolio");
  }
  return Object.freeze({
    priorRecords: Object.freeze([...priorRecords]),
    forwardRecord: Object.freeze({ ...forwardRecord }),
    priorVersions: Object.freeze(priorRecords.map((record) => record.name.slice(0, 14))),
    currentVersions: Object.freeze(records.map((record) => record.name.slice(0, 14))),
  });
}
