import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDurableWorkerCanClaim,
  higgsfieldDeferredJobReason,
  readDurableWorkerAuthority,
  verifyEncryptedOauthVolume,
  verifyImmutableWorkerGeneration,
} from "../src/lib/services/durable-worker-authority";

async function main() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "dealflow-worker-authority-")),
  );
  const generation = "a".repeat(40);
  const generationFile = join(root, "generation");
  const mount = join(root, "oauth");
  const configHome = join(mount, "config");
  const attestation = join(mount, ".dealflow-encrypted-volume-attestation.json");
  await mkdir(configHome, { recursive: true, mode: 0o700 });
  await chmod(mount, 0o700);
  await writeFile(generationFile, `${generation}\n`, { mode: 0o400 });
  const attestationBytes = Buffer.from(
    `${JSON.stringify({
      schema: "dealflow.encrypted-worker-volume-attestation.v1",
      encryptedAtRest: true,
      mountIdSha256: "b".repeat(64),
    })}\n`,
  );
  await writeFile(attestation, attestationBytes, { mode: 0o600 });
  const env = {
    DEALFLOW_WORKER_EXECUTION_STATE: "active",
    DEALFLOW_PROVIDER_EXECUTION_STATE: "active",
    DEALFLOW_WORKER_GENERATION: generation,
    DEALFLOW_RELEASE_COMMIT: generation,
    DEALFLOW_WORKER_INSTANCE_ID: "synthetic-1",
    DEALFLOW_WORKER_GENERATION_FILE: generationFile,
    DEALFLOW_HIGGSFIELD_OAUTH_MOUNT: mount,
    HIGGSFIELD_CONFIG_HOME: configHome,
    DEALFLOW_HIGGSFIELD_VOLUME_ATTESTATION_SHA256: createHash("sha256")
      .update(attestationBytes)
      .digest("hex"),
  };
  const authority = readDurableWorkerAuthority(env);
  assertDurableWorkerCanClaim(authority);
  await verifyImmutableWorkerGeneration(authority);
  await verifyEncryptedOauthVolume(authority, env);
  assert.throws(
    () => assertDurableWorkerCanClaim({ ...authority, executionState: "quiesced" }),
    /quiesced/,
  );
  assert.equal(
    higgsfieldDeferredJobReason("video_generation", false),
    "higgsfield_oauth_operator_action_required",
  );
  assert.equal(
    higgsfieldDeferredJobReason("video_generation_status", false),
    "higgsfield_oauth_operator_action_required",
  );
  for (const unrelated of [
    "static_creative_generation",
    "lead_capture_retry",
    "meta_reporting_sync",
    "support_outbox",
    "account_deletion",
    "ghl_provider",
  ]) {
    assert.equal(higgsfieldDeferredJobReason(unrelated, false), null);
  }
  assert.throws(
    () =>
      readDurableWorkerAuthority({
        ...env,
        DEALFLOW_RELEASE_COMMIT: "c".repeat(40),
      }),
    /exactly match/,
  );
  console.log("durable worker authority runtime: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
