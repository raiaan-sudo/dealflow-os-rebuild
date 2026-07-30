const RELEASE_ID_PATTERN = /^[a-f0-9]{40,64}$/;

let verifiedDurableWorkerGeneration: string | null = null;

/**
 * Installs a process-local attestation only after the durable entrypoint has
 * verified the root-owned image generation file and encrypted OAuth volume.
 * Environment variables alone cannot install this authority.
 */
export function installVerifiedDurableWorkerRuntime(generation: string) {
  const normalized = generation.trim().toLowerCase();
  if (
    !RELEASE_ID_PATTERN.test(normalized) ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.DEALFLOW_WORKER_GENERATION?.trim().toLowerCase() !== normalized
  ) {
    throw new Error("Durable worker runtime attestation is invalid.");
  }
  if (
    verifiedDurableWorkerGeneration &&
    verifiedDurableWorkerGeneration !== normalized
  ) {
    throw new Error("Durable worker runtime generation is immutable.");
  }
  verifiedDurableWorkerGeneration = normalized;
}

export function isVerifiedDurableWorkerProductionRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const generation = env.DEALFLOW_WORKER_GENERATION?.trim().toLowerCase() ?? "";
  const releaseCommit =
    env.DEALFLOW_RELEASE_COMMIT?.trim().toLowerCase() ??
    env.NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT?.trim().toLowerCase() ??
    "";
  return Boolean(
    env === process.env &&
      !env.VERCEL &&
      !env.VERCEL_ENV &&
      env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase() === "production" &&
      verifiedDurableWorkerGeneration &&
      generation === verifiedDurableWorkerGeneration &&
      releaseCommit === verifiedDurableWorkerGeneration,
  );
}
