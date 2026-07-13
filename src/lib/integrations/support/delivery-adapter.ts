import { createHash } from "node:crypto";
import {
  isExplicitNonProductionDeployment,
  isExactProductionVercelHost,
  isProductionDeployment,
} from "@/lib/deployment-target";

export type SupportDeliveryMode =
  | "internal_operator_inbox"
  | "staging_sink"
  | "mail_sink"
  | "external";

export type SupportDeliveryReceipt = {
  receiptId: string;
  adapter:
    | "internal_operator_inbox"
    | "staging_sink"
    | "mail_sink"
    | "external_webhook";
  scope: "internal_only" | "noncommunication_test" | "external_operator_notification";
};

type SupportAdmin = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

type SupportDeliveryPayload = {
  outbox_id: string;
  ticket_id: string;
  organization_id: string;
  user_id: string;
  correlation_id: string;
  category: string | null;
  subject: string;
  message: string;
  route_path: string | null;
  reply_email: string;
};

export type SupportDeliveryTransport = (params: {
  endpoint: URL;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  receiptId: string | null;
}>;

const EXTERNAL_ATTESTATION = "DEALFLOW_SUPPORT_DESTINATION_APPROVED_V1";
const MAIL_SINK_ATTESTATION = "DEALFLOW_SUPPORT_MAIL_SINK_ONLY_V1";

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
  if (
    configured === "staging_sink" ||
    configured === "mail_sink" ||
    configured === "external"
  ) {
    return configured;
  }
  return "internal_operator_inbox";
}

function requireDestination(env: Record<string, string | undefined>) {
  const destination = env.SUPPORT_EXTERNAL_DESTINATION?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination) || destination.length > 254) {
    throw new SupportDeliveryPolicyError(
      "External support delivery requires an explicit owner-controlled destination.",
      "support_external_destination_owner_blocked",
    );
  }
  return destination;
}

function requireExternalEndpoint(
  env: Record<string, string | undefined>,
  mode: "external" | "mail_sink",
) {
  let endpoint: URL;
  try {
    endpoint = new URL(env.SUPPORT_EXTERNAL_DELIVERY_ENDPOINT?.trim() ?? "");
  } catch {
    throw new SupportDeliveryPolicyError(
      "The support delivery endpoint is missing or invalid.",
      "support_external_endpoint_invalid",
    );
  }

  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new SupportDeliveryPolicyError(
      "The support delivery endpoint must not contain credentials, query parameters, or fragments.",
      "support_external_endpoint_invalid",
    );
  }

  if (mode === "mail_sink") {
    if (
      endpoint.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname)
    ) {
      throw new SupportDeliveryPolicyError(
        "The nonproduction mail sink accepts only an exact loopback HTTP endpoint.",
        "support_mail_sink_endpoint_forbidden",
      );
    }
    return endpoint;
  }

  const allowedOrigin = env.SUPPORT_EXTERNAL_DELIVERY_ALLOWED_ORIGIN?.trim();
  if (
    endpoint.protocol !== "https:" ||
    !allowedOrigin ||
    endpoint.origin !== allowedOrigin
  ) {
    throw new SupportDeliveryPolicyError(
      "The external support endpoint is outside the exact owner-approved HTTPS origin.",
      "support_external_endpoint_forbidden",
    );
  }
  return endpoint;
}

export function resolveSupportExternalDeliveryPolicy(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = getSupportDeliveryMode(env);
  if (mode !== "external" && mode !== "mail_sink") {
    return null;
  }

  const destination = requireDestination(env);
  const endpoint = requireExternalEndpoint(env, mode);

  if (mode === "mail_sink") {
    if (
      env.SUPPORT_MAIL_SINK_ENABLED !== "true" ||
      env.SUPPORT_DELIVERY_ATTESTATION !== MAIL_SINK_ATTESTATION ||
      !isExplicitNonProductionDeployment(env)
    ) {
      throw new SupportDeliveryPolicyError(
        "The mail sink requires an explicit nonproduction target and exact test-only attestation.",
        "support_mail_sink_target_blocked",
      );
    }

    return {
      mode,
      endpoint,
      destination,
      token: null,
      adapter: "mail_sink" as const,
      scope: "noncommunication_test" as const,
    };
  }

  if (
    env.SUPPORT_EXTERNAL_DELIVERY_ENABLED !== "true" ||
    env.SUPPORT_DELIVERY_ATTESTATION !== EXTERNAL_ATTESTATION
  ) {
    throw new SupportDeliveryPolicyError(
      "External support delivery is disabled until the owner destination and adapter are explicitly attested.",
      "support_external_delivery_disabled",
    );
  }

  if (
    !isProductionDeployment(env)
  ) {
    throw new SupportDeliveryPolicyError(
      "External support delivery requires the production deployment target.",
      "support_external_deployment_unproven",
    );
  }

  if (
    !isExactProductionVercelHost(env)
  ) {
    throw new SupportDeliveryPolicyError(
      "External support delivery requires the exact attested production Vercel project.",
      "support_external_production_host_unproven",
    );
  }

  if (
    env.SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED !== "true"
  ) {
    throw new SupportDeliveryPolicyError(
      "Production support delivery is disabled by default.",
      "support_external_production_disabled",
    );
  }

  const token = env.SUPPORT_EXTERNAL_DELIVERY_TOKEN?.trim();
  if (!token) {
    throw new SupportDeliveryPolicyError(
      "External support delivery credentials are unavailable.",
      "support_external_credential_missing",
    );
  }

  return {
    mode,
    endpoint,
    destination,
    token,
    adapter: "external_webhook" as const,
    scope: "external_operator_notification" as const,
  };
}

function hashDestination(destination: string) {
  return `sha256:${createHash("sha256").update(destination).digest("hex")}`;
}

async function loadDeliveryPayload(
  admin: SupportAdmin,
  outboxId: string,
  workerId: string,
) {
  const { data, error } = await admin.rpc(
    "get_support_notification_delivery_payload_v1",
    { p_outbox_id: outboxId, p_worker_id: workerId },
  );
  const row = (Array.isArray(data) ? data[0] : data) as SupportDeliveryPayload | null;
  if (
    error ||
    !row ||
    row.outbox_id !== outboxId ||
    typeof row.ticket_id !== "string" ||
    typeof row.organization_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.correlation_id !== "string" ||
    typeof row.subject !== "string" ||
    typeof row.message !== "string"
  ) {
    throw new SupportDeliveryPolicyError(
      error?.message ?? "The claimed support payload is unavailable.",
      error?.code ?? "support_delivery_payload_missing",
    );
  }
  if (
    typeof row.reply_email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.reply_email) ||
    row.reply_email.length > 254
  ) {
    throw new SupportDeliveryPolicyError(
      "The authenticated account does not have a valid reply email.",
      "support_reply_route_missing",
    );
  }
  return row;
}

const fetchTransport: SupportDeliveryTransport = async (params) => {
  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: params.headers,
    body: params.body,
    signal: params.signal,
    redirect: "error",
    cache: "no-store",
  });
  return {
    ok: response.ok,
    status: response.status,
    receiptId: response.headers.get("x-support-delivery-receipt")?.trim() || null,
  };
};

async function deliverThroughExternalAdapter(params: {
  admin: SupportAdmin;
  outboxId: string;
  workerId: string;
  policy: NonNullable<ReturnType<typeof resolveSupportExternalDeliveryPolicy>>;
  transport: SupportDeliveryTransport;
}) {
  const payload = await loadDeliveryPayload(params.admin, params.outboxId, params.workerId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response: Awaited<ReturnType<SupportDeliveryTransport>>;
  try {
    response = await params.transport({
      endpoint: params.policy.endpoint,
      headers: {
        "content-type": "application/json",
        "idempotency-key": params.outboxId,
        ...(params.policy.token
          ? { authorization: `Bearer ${params.policy.token}` }
          : {}),
      },
      body: JSON.stringify({
        destination: params.policy.destination,
        replyTo: payload.reply_email,
        idempotencyKey: params.outboxId,
        ticketReference: payload.ticket_id,
        correlationReference: payload.correlation_id,
        category: payload.category,
        subject: payload.subject,
        message: payload.message,
        routePath: payload.route_path,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new SupportDeliveryPolicyError(
      "The support delivery outcome is ambiguous and must reconcile by idempotency key before retry.",
      "support_external_delivery_ambiguous",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new SupportDeliveryPolicyError(
      `The support delivery endpoint rejected the request with status ${response.status}.`,
      "support_external_delivery_rejected",
    );
  }
  if (!response.receiptId || !/^[A-Za-z0-9._:-]{1,300}$/.test(response.receiptId)) {
    throw new SupportDeliveryPolicyError(
      "The support delivery endpoint did not return a valid durable receipt.",
      "support_external_receipt_missing",
    );
  }

  const { data, error } = await params.admin.rpc(
    "settle_support_external_delivery_v1",
    {
      p_outbox_id: params.outboxId,
      p_worker_id: params.workerId,
      p_adapter: params.policy.adapter,
      p_delivery_scope: params.policy.scope,
      p_destination_reference: hashDestination(params.policy.destination),
      p_provider_receipt_id: response.receiptId,
    },
  );
  if (error || typeof data !== "string" || !data) {
    throw new SupportDeliveryPolicyError(
      error?.message ?? "Delivery may have succeeded, but its receipt could not be persisted. Reconciliation is required before retry.",
      "support_external_delivery_ambiguous",
    );
  }

  return {
    receiptId: data,
    adapter: params.policy.adapter,
    scope: params.policy.scope,
  } satisfies SupportDeliveryReceipt;
}

export async function deliverSupportNotification(params: {
  admin: SupportAdmin;
  outboxId: string;
  workerId: string;
  env?: Record<string, string | undefined>;
  transport?: SupportDeliveryTransport;
}): Promise<SupportDeliveryReceipt> {
  const env = params.env ?? process.env;
  const mode = getSupportDeliveryMode(env);

  if (mode === "external" || mode === "mail_sink") {
    const policy = resolveSupportExternalDeliveryPolicy(env);
    if (!policy) {
      throw new SupportDeliveryPolicyError(
        "The support delivery policy is unavailable.",
        "support_external_policy_missing",
      );
    }
    return deliverThroughExternalAdapter({
      ...params,
      policy,
      transport: params.transport ?? fetchTransport,
    });
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
    { p_outbox_id: params.outboxId, p_worker_id: params.workerId },
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
