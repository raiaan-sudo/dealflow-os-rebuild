import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

type UntypedAdminClient = {
  from: (table: string) => any;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type JsonRecord = Record<string, unknown>;

function db() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function assertReplayConfirmation(leadId: string, confirmation: string) {
  const expected = `REQUEST GHL REPLAY ${leadId}`;
  if (confirmation.trim() !== expected) {
    throw new ApiError(
      409,
      `Confirmation must exactly match: ${expected}`,
      "ghl_replay_confirmation_required",
    );
  }
}

export async function requestGhlLeadEffectReplay(params: {
  leadId: string;
  allowOperatorReview?: boolean;
  confirmation: string;
}) {
  assertReplayConfirmation(params.leadId, params.confirmation);
  const admin = db();
  const { data, error } = await admin
    .from("ghl_lead_effect_events")
    .select("id,organization_id,lead_id,effect_kind,status,attempt_count,max_attempts,idempotency_key")
    .eq("lead_id", params.leadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, error.message, "ghl_lead_effect_lookup_failed");
  }

  const events = Array.isArray(data) ? data.map(asRecord) : [];
  if (events.length === 0) {
    throw new ApiError(404, "No GHL lead effect exists for this lead.", "ghl_lead_effect_missing");
  }

  const now = new Date().toISOString();
  const replayable = events.filter((event) =>
    asString(event.status) === "retryable_failure"
    && Number(event.attempt_count ?? 0) < Number(event.max_attempts ?? 0),
  );
  const uncertainOrOperator = events.filter((event) =>
    ["uncertain", "operator_action_required"].includes(asString(event.status)),
  );
  const exhausted = events.filter((event) =>
    asString(event.status) === "retryable_failure"
    && Number(event.attempt_count ?? 0) >= Number(event.max_attempts ?? 0),
  );
  const operatorReview = [...uncertainOrOperator, ...exhausted];

  let replayRequested = 0;
  for (const event of replayable) {
    const { data: updated, error: updateError } = await admin.rpc(
      "request_ghl_lead_effect_replay",
      {
        p_effect_id: asString(event.id),
        p_organization_id: asString(event.organization_id),
        p_lead_id: params.leadId,
        p_now: now,
      },
    );
    if (updateError) {
      throw new ApiError(500, updateError.message, "ghl_lead_effect_replay_request_failed");
    }
    if (updated === true) {
      replayRequested += 1;
    }
  }

  let operatorReviewRequestsEnsured = 0;
  if (operatorReview.length > 0 && params.allowOperatorReview) {
    for (const event of operatorReview) {
      const eventId = asString(event.id);
      const idempotencyKey = `${asString(event.idempotency_key)}:operator:lead_effect_reconciliation`;
      const { error: operatorError } = await admin
        .from("ghl_operator_requests")
        .upsert({
          organization_id: asString(event.organization_id),
          lead_effect_event_id: eventId,
          request_kind: "lead_effect_reconciliation",
          blocker_code: asString(event.status) === "uncertain"
            ? "ghl_effect_result_uncertain"
            : asString(event.status) === "retryable_failure"
              ? "ghl_effect_attempt_limit_reached"
              : "ghl_effect_operator_action_required",
          idempotency_key: idempotencyKey,
          status: "open",
          details: {
            effectKind: asString(event.effect_kind),
            providerMutationAttempted: false,
          },
        }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      if (operatorError) {
        throw new ApiError(500, operatorError.message, "ghl_operator_request_create_failed");
      }
      operatorReviewRequestsEnsured += 1;
    }
  }

  if (replayRequested === 0 && operatorReview.length > 0 && !params.allowOperatorReview) {
    throw new ApiError(
      409,
      "Uncertain or operator-required GHL effects cannot be replayed. Explicit operator review is required.",
      "ghl_operator_review_required",
    );
  }

  const alreadySucceeded = events.filter((event) => asString(event.status) === "succeeded").length;
  const alreadyQueued = events.filter((event) =>
    ["pending", "replay_requested", "dispatching"].includes(asString(event.status)),
  ).length;

  return {
    status: replayRequested > 0
      ? "replay_requested" as const
      : operatorReviewRequestsEnsured > 0
        ? "operator_action_required" as const
        : alreadySucceeded === events.length
          ? "already_succeeded" as const
          : "no_replayable_effects" as const,
    leadId: params.leadId,
    replayRequested,
    operatorReviewRequestsEnsured,
    alreadySucceeded,
    alreadyQueued,
    providerMutationAttempted: false,
  };
}
