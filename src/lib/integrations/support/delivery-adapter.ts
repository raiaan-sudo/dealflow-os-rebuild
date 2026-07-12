import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";

export type SupportDeliveryMode =
  | "internal_operator_inbox"
  | "staging_sink"
  | "external";

export type SupportDeliveryReceipt = {
  receiptId: string;
  adapter: "internal_operator_inbox" | "staging_sink";
  scope: "internal_only" | "noncommunication_test";
};

export class SupportDeliveryPolicyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SupportDeliveryPolicyError";
  }
}

export function getSupportDeliveryMode(
  env: Record<string, string | undefined> = process.env,
): SupportDeliveryMode {
  const configured = env.SUPPORT_NOTIFICATION_DELIVERY_MODE?.trim().toLowerCase();
  if (configured === "staging_sink" || configured === "external") return configured;
  return "internal_operator_inbox";
}

export async function deliverSupportNotification(params: {
  admin: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
  outboxId: string;
  workerId: string;
  env?: Record<string, string | undefined>;
}): Promise<SupportDeliveryReceipt> {
  const env = params.env ?? process.env;
  const mode = getSupportDeliveryMode(env);

  if (mode === "external") {
    throw new SupportDeliveryPolicyError(
      "External support delivery is blocked until the owner selects and configures the canonical destination.",
      "support_external_destination_owner_blocked",
    );
  }

  if (
    mode === "staging_sink" &&
    (env.SUPPORT_STAGING_SINK_ENABLED !== "true" ||
      !isExplicitNonProductionDeployment(env))
  ) {
    throw new SupportDeliveryPolicyError(
      "The no-communication support staging sink requires an explicitly enabled nonproduction target.",
      "support_staging_sink_target_blocked",
    );
  }

  const { data, error } = await params.admin.rpc(
    "deliver_support_notification_to_operator_inbox",
    {
      p_outbox_id: params.outboxId,
      p_worker_id: params.workerId,
    },
  );
  if (error || typeof data !== "string" || !data) {
    throw new SupportDeliveryPolicyError(
      error?.message ?? "Support sink did not return a durable receipt.",
      error?.code ?? "support_sink_receipt_missing",
    );
  }

  return {
    receiptId: data,
    adapter: mode,
    scope: mode === "staging_sink" ? "noncommunication_test" : "internal_only",
  };
}
