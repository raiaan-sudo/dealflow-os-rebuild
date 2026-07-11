export type GhlCapabilityDisposition =
  | "CONTRACT_MODELED"
  | "FAKE_ONLY"
  | "BLOCKED_EXTERNAL";

export const GHL_CAPABILITY_MATRIX = {
  locationProvisioning: {
    disposition: "FAKE_ONLY" as GhlCapabilityDisposition,
    providerPath: "POST /locations/",
    note: "Official contract identified; no live adapter or provider authorization is included.",
  },
  snapshotInstallation: {
    disposition: "FAKE_ONLY" as GhlCapabilityDisposition,
    providerPath: "Snapshots API",
    note: "Snapshot push and status contracts are modeled behind a fake adapter only.",
  },
  requiredObjectVerification: {
    disposition: "CONTRACT_MODELED" as GhlCapabilityDisposition,
    providerPath: "Provider object reads",
    note: "READY requires an approved manifest and exact required-object verification.",
  },
  funnelPublication: {
    disposition: "BLOCKED_EXTERNAL" as GhlCapabilityDisposition,
    providerPath: null,
    note: "No sanctioned direct funnel/page mutation contract was proven. Operator action is mandatory.",
  },
} as const;

export class GhlCapabilityBlockedError extends Error {
  readonly code = "BLOCKED_EXTERNAL";
  readonly capability: keyof typeof GHL_CAPABILITY_MATRIX;

  constructor(capability: keyof typeof GHL_CAPABILITY_MATRIX) {
    super(`${capability} is BLOCKED_EXTERNAL and requires an explicit operator request.`);
    this.name = "GhlCapabilityBlockedError";
    this.capability = capability;
  }
}

export function assertFunnelPublicationSupported(): never {
  throw new GhlCapabilityBlockedError("funnelPublication");
}
