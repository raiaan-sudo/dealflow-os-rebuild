import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const RELEASE_ID_PATTERN = /^[a-f0-9]{40,64}$/;
const INSTANCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const VOLUME_ATTESTATION_SCHEMA =
  "dealflow.encrypted-worker-volume-attestation.v1";

export type DurableWorkerAuthority = {
  executionState: "active" | "quiesced";
  providerState: "active" | "quiesced";
  generation: string;
  instanceId: string;
  workerIdentityPrefix: string;
  pollIntervalMs: number;
  healthPort: number;
  generationFile: string;
  oauthMountRoot: string;
  volumeAttestationPath: string;
};

export type DurableWorkerVolumeProof = {
  schema: typeof VOLUME_ATTESTATION_SCHEMA;
  encryptedAtRest: true;
  mountIdSha256: string;
  attestationSha256: string;
};

export class DurableWorkerAuthorityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DurableWorkerAuthorityError";
    this.code = code;
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function executionState(value: string | undefined) {
  return value?.trim().toLowerCase() === "active"
    ? ("active" as const)
    : ("quiesced" as const);
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function assertAbsolutePath(value: string | undefined, name: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized || !isAbsolute(normalized)) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_path_invalid",
      `${name} must be an absolute path.`,
    );
  }
  return resolve(normalized);
}

function pathIsInside(parent: string, child: string) {
  const relationship = relative(parent, child);
  return (
    relationship !== "" &&
    relationship !== ".." &&
    !relationship.startsWith(`..${sep}`) &&
    !isAbsolute(relationship)
  );
}

export function readDurableWorkerAuthority(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DurableWorkerAuthority {
  const generation = env.DEALFLOW_WORKER_GENERATION?.trim().toLowerCase() ?? "";
  const releaseCommit =
    env.DEALFLOW_RELEASE_COMMIT?.trim().toLowerCase() ??
    env.NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT?.trim().toLowerCase() ??
    "";
  const instanceId = env.DEALFLOW_WORKER_INSTANCE_ID?.trim().toLowerCase() ?? "";

  if (
    env.VERCEL === "1" ||
    Boolean(env.VERCEL_ENV) ||
    Boolean(env.VERCEL_PROJECT_ID)
  ) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_vercel_runtime_forbidden",
      "The durable system worker cannot run inside a Vercel function runtime.",
    );
  }
  if (
    !RELEASE_ID_PATTERN.test(generation) ||
    !RELEASE_ID_PATTERN.test(releaseCommit) ||
    generation !== releaseCommit
  ) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_generation_mismatch",
      "The runtime worker generation must exactly match the sealed release commit.",
    );
  }
  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_instance_invalid",
      "The durable worker instance identity is missing or malformed.",
    );
  }

  const generationFile = assertAbsolutePath(
    env.DEALFLOW_WORKER_GENERATION_FILE ?? "/app/.dealflow-worker-generation",
    "DEALFLOW_WORKER_GENERATION_FILE",
  );
  const oauthMountRoot = assertAbsolutePath(
    env.DEALFLOW_HIGGSFIELD_OAUTH_MOUNT ??
      "/var/lib/dealflow/higgsfield",
    "DEALFLOW_HIGGSFIELD_OAUTH_MOUNT",
  );
  const configHome = assertAbsolutePath(
    env.HIGGSFIELD_CONFIG_HOME,
    "HIGGSFIELD_CONFIG_HOME",
  );
  if (!pathIsInside(oauthMountRoot, configHome)) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_oauth_mount_mismatch",
      "HIGGSFIELD_CONFIG_HOME must be inside the dedicated persistent OAuth mount.",
    );
  }

  return Object.freeze({
    executionState: executionState(env.DEALFLOW_WORKER_EXECUTION_STATE),
    providerState: executionState(env.DEALFLOW_PROVIDER_EXECUTION_STATE),
    generation,
    instanceId,
    workerIdentityPrefix: `durable:${generation.slice(0, 16)}:${instanceId}`,
    pollIntervalMs: boundedInteger(
      env.DEALFLOW_WORKER_POLL_INTERVAL_MS,
      5_000,
      1_000,
      60_000,
    ),
    healthPort: boundedInteger(
      env.DEALFLOW_WORKER_HEALTH_PORT ?? env.PORT,
      8080,
      1_024,
      65_535,
    ),
    generationFile,
    oauthMountRoot,
    volumeAttestationPath: resolve(
      oauthMountRoot,
      ".dealflow-encrypted-volume-attestation.json",
    ),
  });
}

export async function verifyImmutableWorkerGeneration(
  authority: DurableWorkerAuthority,
) {
  let handle;
  try {
    handle = await open(
      authority.generationFile,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const [fileStat, resolvedPath, contents] = await Promise.all([
      handle.stat(),
      realpath(authority.generationFile),
      handle.readFile("utf8"),
    ]);
    if (
      !fileStat.isFile() ||
      (fileStat.mode & 0o222) !== 0 ||
      resolvedPath !== authority.generationFile ||
      contents.trim().toLowerCase() !== authority.generation
    ) {
      throw new DurableWorkerAuthorityError(
        "durable_worker_generation_file_mismatch",
        "The immutable image generation does not match the runtime generation.",
      );
    }
    return {
      generation: authority.generation,
      generationFileSha256: sha256(contents),
    };
  } catch (error) {
    if (error instanceof DurableWorkerAuthorityError) throw error;
    throw new DurableWorkerAuthorityError(
      "durable_worker_generation_file_unavailable",
      "The immutable image generation file is unavailable.",
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function verifyEncryptedOauthVolume(
  authority: DurableWorkerAuthority,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DurableWorkerVolumeProof> {
  const expectedDigest =
    env.DEALFLOW_HIGGSFIELD_VOLUME_ATTESTATION_SHA256?.trim().toLowerCase() ??
    "";
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_volume_attestation_missing",
      "The externally pinned encrypted-volume attestation digest is missing.",
    );
  }
  let attestationHandle;
  let mountStat;
  let attestationStat;
  let mountRealPath;
  let attestationRealPath;
  let bytes;
  try {
    attestationHandle = await open(
      authority.volumeAttestationPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    [mountStat, attestationStat, mountRealPath, attestationRealPath, bytes] =
      await Promise.all([
        lstat(authority.oauthMountRoot),
        attestationHandle.stat(),
        realpath(authority.oauthMountRoot),
        realpath(authority.volumeAttestationPath),
        attestationHandle.readFile(),
      ]);
  } catch {
    throw new DurableWorkerAuthorityError(
      "durable_worker_volume_attestation_unavailable",
      "The encrypted OAuth volume attestation is unavailable.",
    );
  } finally {
    await attestationHandle?.close().catch(() => undefined);
  }
  if (
    !mountStat ||
    !attestationStat ||
    !mountRealPath ||
    !attestationRealPath ||
    !bytes
  ) {
      throw new DurableWorkerAuthorityError(
        "durable_worker_volume_attestation_unavailable",
        "The encrypted OAuth volume attestation is unavailable.",
      );
  }
  if (
    !mountStat.isDirectory() ||
    mountStat.isSymbolicLink() ||
    (mountStat.mode & 0o077) !== 0 ||
    !attestationStat.isFile() ||
    (attestationStat.mode & 0o077) !== 0 ||
    mountRealPath !== authority.oauthMountRoot ||
    attestationRealPath !== authority.volumeAttestationPath ||
    sha256(bytes) !== expectedDigest
  ) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_volume_attestation_invalid",
      "The persistent OAuth mount or its external encryption attestation is invalid.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new DurableWorkerAuthorityError(
      "durable_worker_volume_attestation_invalid",
      "The encrypted OAuth volume attestation is malformed.",
    );
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  if (
    record.schema !== VOLUME_ATTESTATION_SCHEMA ||
    record.encryptedAtRest !== true ||
    typeof record.mountIdSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.mountIdSha256)
  ) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_volume_attestation_invalid",
      "The encrypted OAuth volume attestation is incomplete.",
    );
  }
  return {
    schema: VOLUME_ATTESTATION_SCHEMA,
    encryptedAtRest: true,
    mountIdSha256: record.mountIdSha256,
    attestationSha256: expectedDigest,
  };
}

export function assertDurableWorkerCanClaim(
  authority: DurableWorkerAuthority,
) {
  if (authority.executionState !== "active") {
    throw new DurableWorkerAuthorityError(
      "durable_worker_quiesced",
      "Global worker execution is quiesced.",
    );
  }
  if (authority.providerState !== "active") {
    throw new DurableWorkerAuthorityError(
      "durable_provider_execution_quiesced",
      "Global provider execution is quiesced.",
    );
  }
}

export function higgsfieldDeferredJobReason(
  kind: string,
  higgsfieldReady: boolean,
) {
  return !higgsfieldReady &&
    (kind === "video_generation" || kind === "video_generation_status")
    ? "higgsfield_oauth_operator_action_required"
    : null;
}
