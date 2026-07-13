import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import type { Json } from "@/lib/supabase/types";

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string | null } | null }>;
};

export type PaidCreativeDispatchOutcome = "accepted" | "rejected" | "uncertain";

export type PaidCreativeDispatchHandle = {
  dispatchId: string;
  decision: "dispatch" | "recover" | "terminal" | "operator_action_required";
  state: "dispatching" | "accepted" | "rejected" | "uncertain" | "projected";
  dispatchToken: string;
  dispatchGeneration: number;
  providerRequestId: string | null;
  providerOutput: Record<string, unknown> | null;
  projectionReceipt: Record<string, unknown> | null;
};

export type PaidCreativeDispatchExecution<T extends Record<string, unknown>> = {
  dispatchId: string;
  dispatchState: PaidCreativeDispatchHandle["state"];
  outcome: PaidCreativeDispatchOutcome;
  output: T | null;
  providerRequestId: string | null;
  recovered: boolean;
  error: unknown | null;
};

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(500, `${label} was missing from the paid creative dispatch receipt.`, "paid_creative_dispatch_receipt_invalid");
  }
  return value.trim();
}

function optionalObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function fingerprintPaidCreativeRequest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export async function beginPaidCreativeDispatch(params: {
  supabase: RpcClient;
  providerUsageEventId: string;
  organizationId: string;
  userId: string;
  campaignId: string | null;
  provider: string;
  operation: string;
  attemptKey: string;
  requestFingerprint: string;
  requestPayload: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase.rpc("begin_paid_creative_dispatch_v1", {
    p_provider_usage_event_id: params.providerUsageEventId,
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_campaign_id: params.campaignId,
    p_provider: params.provider,
    p_operation: params.operation,
    p_attempt_key: params.attemptKey,
    p_request_fingerprint: params.requestFingerprint,
    p_request_payload: params.requestPayload,
  });

  if (error) {
    throw new ApiError(
      500,
      error.message ?? "Paid creative dispatch intent could not be persisted.",
      "paid_creative_dispatch_begin_failed",
    );
  }

  const row = firstRow(data) as Record<string, unknown> | null;
  const decision = row?.decision;
  const state = row?.dispatch_state;
  const generation = Number(row?.dispatch_generation ?? 0);

  if (
    !row ||
    !["dispatch", "recover", "terminal", "operator_action_required"].includes(String(decision)) ||
    !["dispatching", "accepted", "rejected", "uncertain", "projected"].includes(String(state)) ||
    !Number.isInteger(generation) ||
    generation < 1
  ) {
    throw new ApiError(
      500,
      "Paid creative dispatch intent returned an invalid receipt.",
      "paid_creative_dispatch_receipt_invalid",
    );
  }

  return {
    dispatchId: requiredString(row.dispatch_id, "Dispatch identity"),
    decision: decision as PaidCreativeDispatchHandle["decision"],
    state: state as PaidCreativeDispatchHandle["state"],
    dispatchToken: requiredString(row.dispatch_token, "Dispatch fence"),
    dispatchGeneration: generation,
    providerRequestId:
      typeof row.provider_request_id === "string" && row.provider_request_id.trim()
        ? row.provider_request_id.trim()
        : null,
    providerOutput: optionalObject(row.provider_output),
    projectionReceipt: optionalObject(row.projection_receipt),
  } satisfies PaidCreativeDispatchHandle;
}

export async function recordPaidCreativeProviderOutcome(params: {
  supabase: RpcClient;
  handle: PaidCreativeDispatchHandle;
  organizationId: string;
  userId: string;
  outcome: PaidCreativeDispatchOutcome;
  providerRequestId?: string | null;
  providerOutput?: Record<string, unknown> | null;
  errorCode?: string | null;
}) {
  const { data, error } = await params.supabase.rpc(
    "record_paid_creative_provider_outcome_v1",
    {
      p_dispatch_id: params.handle.dispatchId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_dispatch_token: params.handle.dispatchToken,
      p_dispatch_generation: params.handle.dispatchGeneration,
      p_outcome: params.outcome,
      p_provider_request_id: params.providerRequestId ?? null,
      p_provider_output: params.providerOutput ?? null,
      p_error_code: params.errorCode ?? null,
    },
  );

  if (error) {
    // The provider may already have accepted the request. Never translate this
    // database failure into permission to POST again.
    throw new ApiError(
      500,
      error.message ?? "Paid creative provider output could not be persisted.",
      "paid_creative_dispatch_outcome_persist_failed",
    );
  }

  return firstRow(data) as Record<string, unknown> | null;
}

export async function finalizePaidCreativeProjection(params: {
  supabase: RpcClient;
  dispatchId: string;
  organizationId: string;
  userId: string;
  projectionReceipt: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase.rpc(
    "finalize_paid_creative_projection_v1",
    {
      p_dispatch_id: params.dispatchId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_projection_receipt: params.projectionReceipt,
    },
  );

  if (error) {
    throw new ApiError(
      500,
      error.message ?? "Paid creative projection could not be finalized.",
      "paid_creative_projection_finalize_failed",
    );
  }

  const row = firstRow(data) as Record<string, unknown> | null;
  if (!row || row.dispatch_state !== "projected" || row.usage_status !== "consumed") {
    throw new ApiError(
      500,
      "Paid creative projection returned an invalid receipt.",
      "paid_creative_projection_receipt_invalid",
    );
  }
  return row;
}

export async function executePaidCreativeDispatch<T extends Record<string, unknown>>(params: {
  begin: () => Promise<PaidCreativeDispatchHandle>;
  dispatch: (handle: PaidCreativeDispatchHandle) => Promise<T>;
  classifyResult: (output: T) => {
    outcome: PaidCreativeDispatchOutcome;
    providerRequestId?: string | null;
    errorCode?: string | null;
  };
  classifyError: (error: unknown) => {
    outcome: Exclude<PaidCreativeDispatchOutcome, "accepted">;
    errorCode?: string | null;
  };
  record: (input: {
    handle: PaidCreativeDispatchHandle;
    outcome: PaidCreativeDispatchOutcome;
    providerRequestId: string | null;
    providerOutput: Record<string, unknown> | null;
    errorCode: string | null;
  }) => Promise<unknown>;
}): Promise<PaidCreativeDispatchExecution<T>> {
  const handle = await params.begin();

  if (handle.decision === "recover") {
    if (!handle.providerOutput) {
      throw new ApiError(
        500,
        "Accepted paid creative dispatch is missing its durable provider output.",
        "paid_creative_dispatch_output_missing",
      );
    }
    return {
      dispatchId: handle.dispatchId,
      dispatchState: handle.state,
      outcome: "accepted",
      output: handle.providerOutput as T,
      providerRequestId: handle.providerRequestId,
      recovered: true,
      error: null,
    };
  }

  if (handle.decision !== "dispatch") {
    return {
      dispatchId: handle.dispatchId,
      dispatchState: handle.state,
      outcome: handle.state === "rejected" ? "rejected" : "uncertain",
      output: handle.providerOutput as T | null,
      providerRequestId: handle.providerRequestId,
      recovered: true,
      error: new ApiError(
        409,
        "This paid creative request was already dispatched and cannot be posted again without provider reconciliation.",
        "paid_creative_dispatch_operator_action_required",
      ),
    };
  }

  let output: T;
  try {
    output = await params.dispatch(handle);
  } catch (error) {
    const classification = params.classifyError(error);
    const failureOutput = {
      error: error instanceof Error ? error.message : "Paid creative provider dispatch failed.",
    };
    await params.record({
      handle,
      outcome: classification.outcome,
      providerRequestId: null,
      providerOutput: failureOutput,
      errorCode: classification.errorCode ?? null,
    });
    return {
      dispatchId: handle.dispatchId,
      dispatchState: classification.outcome,
      outcome: classification.outcome,
      output: failureOutput as unknown as T,
      providerRequestId: null,
      recovered: false,
      error,
    };
  }

  const classification = params.classifyResult(output);
  const providerRequestId = classification.providerRequestId?.trim() || null;
  await params.record({
    handle,
    outcome: classification.outcome,
    providerRequestId,
    providerOutput: output,
    errorCode: classification.errorCode ?? null,
  });

  return {
    dispatchId: handle.dispatchId,
    dispatchState: classification.outcome,
    outcome: classification.outcome,
    output,
    providerRequestId,
    recovered: false,
    error: null,
  };
}

export function toJsonRecord(value: Record<string, unknown>) {
  return value as Json;
}
