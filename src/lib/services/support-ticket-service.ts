import { ApiError } from "@/lib/api/route";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  buildSupportTicketPayload,
  SupportTicketValidationError,
  type SupportTicketInput,
} from "@/lib/support-ticket-contract";
import {
  deliverSupportNotification,
  SupportDeliveryPolicyError,
} from "@/lib/integrations/support/delivery-adapter";

export type { SupportTicketInput } from "@/lib/support-ticket-contract";

type SupportTicketClient = SupabaseClient<Database>;

export async function createSupportTicket(params: {
  supabase: SupportTicketClient;
  organizationId: string;
  userId: string;
  input: SupportTicketInput;
}) {
  let payload: ReturnType<typeof buildSupportTicketPayload>;

  try {
    payload = buildSupportTicketPayload(params.input);
  } catch (error) {
    if (error instanceof SupportTicketValidationError) {
      throw new ApiError(400, error.message, error.code);
    }

    throw error;
  }
  const correlationId = crypto.randomUUID();
  const { data, error } = await (params.supabase as any).rpc(
    "create_support_ticket_with_outbox",
    {
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_request_id: params.input.requestId,
      p_correlation_id: correlationId,
      p_category: payload.category,
      p_subject: payload.subject,
      p_message: payload.message,
      p_route_path: payload.routePath,
      p_safe_context: payload.safeContext,
    },
  );
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ticket_id?: unknown;
        correlation_id?: unknown;
        outbox_id?: unknown;
        outbox_status?: unknown;
      }
    | null;
  const validOutboxStatuses = new Set([
    "pending",
    "processing",
    "retrying",
    "delivered",
    "failed",
    "operator_action_required",
  ]);

  if (
    error ||
    typeof row?.ticket_id !== "string" ||
    typeof row?.correlation_id !== "string" ||
    typeof row?.outbox_id !== "string" ||
    typeof row?.outbox_status !== "string" ||
    !validOutboxStatuses.has(row.outbox_status)
  ) {
    throw new ApiError(
      500,
      error?.message ?? "The support ticket and operator notification could not be recorded atomically.",
      "support_ticket_atomic_insert_failed",
    );
  }

  return {
    ticketId: row.ticket_id,
    correlationId: row.correlation_id,
    outboxId: row.outbox_id,
    ticketStatus: "open" as const,
    operatorNotificationStatus: row.outbox_status as
      | "pending"
      | "processing"
      | "retrying"
      | "delivered"
      | "failed"
      | "operator_action_required",
  };
}

type SupportOutboxRow = {
  id: string;
  ticket_id: string;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
};

const SUPPORT_DELIVERY_OPERATOR_ACTION_CODES = new Set([
  "support_external_delivery_ambiguous",
  "support_external_receipt_missing",
  "support_reply_route_missing",
]);

export async function processSupportNotificationOutbox(maxRows = 25) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(
      503,
      "Supabase service role is required for the internal support mailbox consumer.",
      "support_outbox_service_role_missing",
    );
  }

  const workerId = `support-mailbox:${crypto.randomUUID()}`;
  const { data, error } = await (admin as any).rpc(
    "claim_support_notification_outbox",
    {
      p_worker_id: workerId,
      p_limit: Math.min(Math.max(Math.floor(maxRows), 1), 100),
    },
  );

  if (error) {
    throw new ApiError(500, error.message, "support_outbox_claim_failed");
  }

  const claimed = (Array.isArray(data) ? data : []) as SupportOutboxRow[];
  const deliveredIds: string[] = [];
  const retryingIds: string[] = [];
  const failedIds: string[] = [];
  const deliveryReceipts: Array<{
    outboxId: string;
    receiptId: string;
    adapter: string;
    scope: string;
  }> = [];

  for (const row of claimed) {
    let deliveryReceipt: Awaited<ReturnType<typeof deliverSupportNotification>> | null = null;
    let deliveryError: { code?: string; message?: string } | null = null;
    try {
      deliveryReceipt = await deliverSupportNotification({
        admin: admin as any,
        outboxId: row.id,
        workerId,
      });
    } catch (error) {
      deliveryError = {
        code:
          error instanceof SupportDeliveryPolicyError
            ? error.code
            : "operator_inbox_delivery_failed",
        message:
          error instanceof Error
            ? error.message
            : "Support delivery outcome could not be proven.",
      };
    }
    if (deliveryReceipt) {
      deliveredIds.push(row.id);
      deliveryReceipts.push({
        outboxId: row.id,
        receiptId: deliveryReceipt.receiptId,
        adapter: deliveryReceipt.adapter,
        scope: deliveryReceipt.scope,
      });
      continue;
    }

    const exhausted = row.attempt_count >= row.max_attempts;
    const requiresReconciliation = SUPPORT_DELIVERY_OPERATOR_ACTION_CODES.has(
      deliveryError?.code ?? "",
    );
    const nextStatus =
      exhausted || requiresReconciliation ? "operator_action_required" : "retrying";
    const nextAttemptAt = new Date(
      Date.now() + Math.min(60 * 60_000, Math.max(1, row.attempt_count) * 60_000),
    ).toISOString();
    const { data: updated, error: updateError } = await (admin as any)
      .from("support_notification_outbox")
      .update({
        status: nextStatus,
        delivered_at: null,
        next_attempt_at: nextAttemptAt,
        last_error_code: deliveryError?.code ?? "operator_inbox_delivery_failed",
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing")
      .eq("locked_by", workerId)
      .select("id")
      .maybeSingle();

    if (updateError || !updated?.id) {
      logWarn("support_outbox_completion_fence_lost", {
        outboxId: row.id,
        ticketId: row.ticket_id,
        workerId,
      });
      continue;
    }

    if (nextStatus === "retrying") retryingIds.push(row.id);
    else failedIds.push(row.id);
  }

  logOperationalEvent("support.internal_mailbox_outbox_processed", {
    workerId,
    claimedCount: claimed.length,
    deliveredCount: deliveredIds.length,
    retryingCount: retryingIds.length,
    failedCount: failedIds.length,
  });

  return {
    claimedCount: claimed.length,
    deliveredIds,
    retryingIds,
    failedIds,
    deliveryReceipts,
  };
}
