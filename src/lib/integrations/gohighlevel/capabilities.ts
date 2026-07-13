export type GhlCapabilityDisposition =
  | "CONTRACT_MODELED"
  | "FAKE_ONLY"
  | "SANDBOX_IMPLEMENTED"
  | "BLOCKED_EXTERNAL";

export const GHL_CAPABILITY_MATRIX = {
  locationProvisioning: {
    disposition: "SANDBOX_IMPLEMENTED" as GhlCapabilityDisposition,
    providerPath: "POST /locations/",
    note: "The v3 request binds the exact approved snapshotId behind an isolated-sandbox gate; Agency Pro capability is still required.",
  },
  snapshotInstallation: {
    disposition: "BLOCKED_EXTERNAL" as GhlCapabilityDisposition,
    providerPath: "GET /snapshots/snapshot-status/:snapshotId/location/:locationId",
    note: "The supported snapshot is copied by snapshotId during v3 sub-account creation and then status-verified. No standalone push into an existing location is claimed.",
  },
  requiredObjectVerification: {
    disposition: "SANDBOX_IMPLEMENTED" as GhlCapabilityDisposition,
    providerPath: "Provider object reads",
    note: "READY requires an approved manifest and exact required-object verification.",
  },
  funnelPublication: {
    disposition: "BLOCKED_EXTERNAL" as GhlCapabilityDisposition,
    providerPath: null,
    note: "No sanctioned direct funnel/page mutation contract was proven. Operator action is mandatory.",
  },
  leadDelivery: {
    disposition: "SANDBOX_IMPLEMENTED" as GhlCapabilityDisposition,
    providerPath: "Contacts, Opportunities, Tags, Workflows, and Calendar APIs",
    note: "Implemented only for an isolated GHL sandbox with durable outbox receipts and production fail-closed gates.",
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
