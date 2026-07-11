export type GhlWriteGateInput = {
  enabled?: boolean;
  adapterKind?: string;
  networkAccess?: string;
};

export type GhlWriteGateDecision = {
  allowed: boolean;
  code: "allowed_fake" | "provider_write_gate_closed" | "real_adapter_forbidden";
  reason: string;
};

export const DEFAULT_GHL_WRITE_GATE = Object.freeze({
  enabled: false,
  adapterKind: "fake",
  networkAccess: "none",
});

export function evaluateGhlWriteGate(
  input: GhlWriteGateInput = DEFAULT_GHL_WRITE_GATE,
): GhlWriteGateDecision {
  if (input.adapterKind !== "fake" || (input.networkAccess ?? "none") !== "none") {
    return {
      allowed: false,
      code: "real_adapter_forbidden",
      reason: "This release candidate contains no authorized real GHL adapter.",
    };
  }

  if (input.enabled !== true) {
    return {
      allowed: false,
      code: "provider_write_gate_closed",
      reason: "GHL provider writes default to disabled.",
    };
  }

  return {
    allowed: true,
    code: "allowed_fake",
    reason: "Only the deterministic no-network fake adapter is enabled.",
  };
}

export class GhlWriteGateError extends Error {
  readonly code: Exclude<GhlWriteGateDecision["code"], "allowed_fake">;

  constructor(decision: GhlWriteGateDecision) {
    super(decision.reason);
    this.name = "GhlWriteGateError";
    this.code = decision.code === "allowed_fake" ? "provider_write_gate_closed" : decision.code;
  }
}

export function assertGhlFakeWritesAllowed(input?: GhlWriteGateInput) {
  const decision = evaluateGhlWriteGate(input);
  if (!decision.allowed) {
    throw new GhlWriteGateError(decision);
  }
  return decision;
}
