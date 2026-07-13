export type GhlProviderWorkerComponent =
  | "provisioning"
  | "personalization"
  | "reconciliation"
  | "delivery";

/**
 * Keeps one failed provider component from aborting the remaining bounded
 * components. Because an exception can occur after a provider dispatch, the
 * fallback result deliberately reports mutation evidence as not proven.
 */
export async function isolateGhlProviderWorkerComponent<T>(
  component: GhlProviderWorkerComponent,
  run: () => Promise<T>,
) {
  try {
    return await run();
  } catch (error) {
    const candidateCode = error && typeof error === "object" && "code" in error
      && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code.trim()
      : "";
    return {
      enabled: true as const,
      status: "failed" as const,
      blockedReason: /^[a-z0-9_:-]{3,180}$/.test(candidateCode)
        ? candidateCode
        : `ghl_${component}_worker_failed`,
      reason: `The GHL ${component} component failed independently; other GHL components continued.`,
      processed: 0,
      providerMutationAttempted: "not_proven" as const,
    };
  }
}
