import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_GUARD_KEYS = [
  "build",
  "deploymentEnvironment",
  "oldWorkerDrain",
  "schemaValidation",
  "test",
  "visual",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("release_guard_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    throw new Error("release_guard_value_invalid");
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function readProtectedFile(file, root) {
  if (!file || !path.isAbsolute(file)) {
    throw new Error("release_guard_protected_path_invalid");
  }
  const normalizedRoot = fs.realpathSync(root);
  const normalizedFile = fs.realpathSync(file);
  const relationship = path.relative(normalizedRoot, normalizedFile);
  if (
    relationship === "" ||
    (!relationship.startsWith(`..${path.sep}`) && relationship !== "..") ||
    path.isAbsolute(relationship)
  ) {
    throw new Error("release_guard_protected_path_invalid");
  }
  const stat = fs.lstatSync(file);
  const resolvedStat = fs.statSync(normalizedFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !resolvedStat.isFile() ||
    (resolvedStat.mode & 0o077) !== 0
  ) {
    throw new Error("release_guard_protected_file_invalid");
  }
  return fs.readFileSync(normalizedFile);
}

export function verifyReleaseGuardV5({
  root,
  guardPath,
  signaturePath,
  trustPolicyPath,
  trustPolicySha256,
  nowMs = Date.now(),
}) {
  const guardBytes = readProtectedFile(guardPath, root);
  const signatureBytes = readProtectedFile(signaturePath, root);
  const policyBytes = readProtectedFile(trustPolicyPath, root);
  if (!/^[0-9a-f]{64}$/.test(trustPolicySha256 ?? "") ||
      sha256(policyBytes) !== trustPolicySha256) {
    throw new Error("release_guard_external_policy_digest_mismatch");
  }
  const guard = JSON.parse(guardBytes.toString("utf8"));
  const envelope = JSON.parse(signatureBytes.toString("utf8"));
  const policy = JSON.parse(policyBytes.toString("utf8"));
  if (
    guard.schemaVersion !== "dealflow.release-guard.v5" ||
    guard.gate?.mode !== "release" ||
    guard.gate?.enforced !== true ||
    guard.gate?.decision !== "PRE_MUTATION_ADMISSION_PASS" ||
    guard.gate?.admissionStage !== "post_deploy_pre_alias_provider" ||
    guard.gate?.mandatoryPostDeployRerunValidated !== true ||
    guard.gate?.decisionAuthority !==
      "PROTECTED_EXTERNAL_TRUST_RELEASE_GUARD" ||
    guard.gate?.allEvidenceValidated !== true ||
    guard.gate?.allEvidenceStructurallyValidated !== true ||
    JSON.stringify(Object.keys(guard.gate?.requiredEvidence ?? {}).sort()) !==
      JSON.stringify(REQUIRED_GUARD_KEYS) ||
    !Object.values(guard.gate.requiredEvidence).every((value) => value === true)
  ) {
    throw new Error("release_guard_v5_decision_invalid");
  }
  if (
    envelope.schema !== "dealflow.release-guard-v5-signature.v1" ||
    envelope.algorithm !== "ed25519" ||
    typeof envelope.authorityId !== "string" ||
    typeof envelope.keyId !== "string" ||
    envelope.manifestSha256 !== sha256(guardBytes) ||
    typeof envelope.expiresAt !== "string"
  ) {
    throw new Error("release_guard_signature_envelope_invalid");
  }
  const expiresAt = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    throw new Error("release_guard_signature_expired_or_invalid");
  }
  const authority = policy.authorities?.find(
    (candidate) =>
      candidate.authorityId === envelope.authorityId &&
      candidate.keyId === envelope.keyId,
  );
  if (
    policy.schemaVersion !== "dealflow.external-release-trust-policy.v1" ||
    policy.status !== "configured" ||
    !authority ||
    !authority.allowedAuthorityPurposes?.includes(
      "release-guard-v5-envelope",
    )
  ) {
    throw new Error("release_guard_signature_authority_not_pinned");
  }
  const publicKey = createPublicKey(authority.publicKeyPem);
  const publicKeyDigest = sha256(
    publicKey.export({ format: "der", type: "spki" }),
  );
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    publicKeyDigest !== authority.publicKeySha256
  ) {
    throw new Error("release_guard_signature_key_invalid");
  }
  const unsignedEnvelope = {
    schema: envelope.schema,
    algorithm: envelope.algorithm,
    authorityId: envelope.authorityId,
    keyId: envelope.keyId,
    manifestSha256: envelope.manifestSha256,
    expiresAt: envelope.expiresAt,
  };
  const signature = Buffer.from(envelope.signature ?? "", "base64");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      Buffer.from(canonicalJson(unsignedEnvelope), "utf8"),
      publicKey,
      signature,
    )
  ) {
    throw new Error("release_guard_signature_invalid");
  }
  const externalRoot = guard.repositoryArtifacts?.releaseTrustPolicy?.externalTrustRoot;
  if (
    externalRoot?.policyId !== policy.policyId ||
    externalRoot?.source?.sha256 !== trustPolicySha256 ||
    !externalRoot?.authorities?.some(
      (candidate) =>
        candidate.authorityId === envelope.authorityId &&
        candidate.keyId === envelope.keyId &&
        candidate.publicKeySha256 === publicKeyDigest,
    )
  ) {
    throw new Error("release_guard_external_root_mismatch");
  }
  return Object.freeze({
    guard,
    expiresAt,
    manifestSha256: envelope.manifestSha256,
    authorityId: envelope.authorityId,
    keyId: envelope.keyId,
  });
}
