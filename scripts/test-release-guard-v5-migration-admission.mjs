#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyMigrationDatabaseTarget } from "./production/migration-target-authority.mjs";
import { verifyPinnedPsql } from "./production/verify-pinned-psql.mjs";
import { verifyReleaseGuardV5 } from "./production/verify-release-guard-v5.mjs";

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-guard-v5-"));
fs.chmodSync(temp, 0o700);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("nonfinite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
};
const write = (name, value) => {
  const file = path.join(temp, name);
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return file;
};

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeySha256 = sha256(publicKey.export({ format: "der", type: "spki" }));
const authority = {
  authorityId: "external-release",
  keyId: "release-key-1",
  source: "protected-ci",
  publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  publicKeySha256,
  allowedEvidenceTypes: [
    "build", "test", "schema-validation", "visual",
    "old-worker-drain", "deployment-environment",
  ],
  allowedAuthorityPurposes: ["release-guard-v5-envelope"],
};
const policy = {
  schemaVersion: "dealflow.external-release-trust-policy.v1",
  policyId: "production-release-v1",
  status: "configured",
  authorities: [authority],
};
const policyPath = write("policy.json", policy);
const policySha256 = sha256(fs.readFileSync(policyPath));
const guard = {
  schemaVersion: "dealflow.release-guard.v5",
  gate: {
    mode: "release",
    enforced: true,
    decision: "PRE_MUTATION_ADMISSION_PASS",
    admissionStage: "post_deploy_pre_alias_provider",
    mandatoryPostDeployRerunValidated: true,
    decisionAuthority: "PROTECTED_EXTERNAL_TRUST_RELEASE_GUARD",
    allEvidenceValidated: true,
    allEvidenceStructurallyValidated: true,
    requiredEvidence: {
      build: true, test: true, schemaValidation: true,
      visual: true, oldWorkerDrain: true, deploymentEnvironment: true,
    },
  },
  release: { target: "a".repeat(40), targetTree: "b".repeat(40) },
  repositoryArtifacts: {
    releaseTrustPolicy: {
      externalTrustRoot: {
        policyId: policy.policyId,
        source: { sha256: policySha256 },
        authorities: [{
          authorityId: authority.authorityId,
          keyId: authority.keyId,
          publicKeySha256,
        }],
      },
    },
  },
};
const guardPath = write("guard.json", guard);
const makeEnvelope = (overrides = {}) => {
  const unsigned = {
    schema: "dealflow.release-guard-v5-signature.v1",
    algorithm: "ed25519",
    authorityId: authority.authorityId,
    keyId: authority.keyId,
    manifestSha256: sha256(fs.readFileSync(guardPath)),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ...overrides,
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString("base64"),
  };
};
const signaturePath = write("signature.json", makeEnvelope());
const verify = () => verifyReleaseGuardV5({
  root,
  guardPath,
  signaturePath,
  trustPolicyPath: policyPath,
  trustPolicySha256: policySha256,
});
assert.equal(verify().guard.gate.decision, "PRE_MUTATION_ADMISSION_PASS");

fs.appendFileSync(guardPath, " ");
assert.throws(verify, /signature_envelope_invalid|signature_invalid/);
write("guard.json", guard);
write("signature.json", makeEnvelope({ expiresAt: "not-a-date" }));
assert.throws(verify, /expired_or_invalid/);
write("signature.json", { ...makeEnvelope(), signature: Buffer.alloc(64).toString("base64") });
assert.throws(verify, /signature_invalid/);

const ref = "abcdefghijklmnopphxm";
const host = "aws-0-us-east-1.pooler.supabase.com";
const username = `postgres.${ref}`;
const record = {
  safeSuffix: "phxm",
  databaseHostSha256: sha256(host),
  databaseUsernameSha256: sha256(username),
  projectRefSha256: sha256(ref),
};
assert.equal(
  verifyMigrationDatabaseTarget({
    connection: `postgresql://${username}:unused@${host}:5432/postgres`,
    projectRecord: record,
    production: true,
    expectedProjectFingerprint: sha256(ref),
  }).projectRefSha256,
  sha256(ref),
);
assert.throws(
  () => verifyMigrationDatabaseTarget({
    connection: `postgresql://postgres.zzzzzzzzzzzzzzzzphxm:unused@${host}:5432/postgres`,
    projectRecord: record,
    production: true,
    expectedProjectFingerprint: sha256(ref),
  }),
  /target_mismatch/,
);
assert.throws(
  () => verifyMigrationDatabaseTarget({
    connection: `postgresql://postgres:unused@${host}:5432/postgres`,
    projectRecord: record,
    production: true,
    expectedProjectFingerprint: sha256(ref),
  }),
  /target_mismatch/,
);
const fakePsql = write(
  "psql",
  `#!${process.execPath}\nprocess.stdout.write("psql (PostgreSQL) 17.6\\n");\n`,
);
fs.chmodSync(fakePsql, 0o700);
const fakePsqlSha256 = sha256(fs.readFileSync(fakePsql));
assert.equal(
  verifyPinnedPsql({
    psql: fakePsql,
    expectedSha256: fakePsqlSha256,
    expectedVersion: "17.6",
  }),
  fs.realpathSync(fakePsql),
);
const psqlSymlink = path.join(temp, "psql-link");
fs.symlinkSync(fakePsql, psqlSymlink);
assert.throws(
  () => verifyPinnedPsql({
    psql: psqlSymlink,
    expectedSha256: fakePsqlSha256,
    expectedVersion: "17.6",
  }),
  /binary_mismatch/,
);
assert.throws(
  () => verifyPinnedPsql({
    psql: fakePsql,
    expectedSha256: "0".repeat(64),
    expectedVersion: "17.6",
  }),
  /binary_mismatch/,
);
fs.rmSync(temp, { recursive: true, force: true });
console.log("Release Guard v5 and migration target adversarial contract: PASS");
