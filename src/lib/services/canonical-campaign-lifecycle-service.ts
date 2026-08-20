import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function digest(value: unknown) {
  // codeql[js/insufficient-password-hash] This is a non-secret evidence
  // fingerprint used for integrity/idempotency, never password storage.
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function row(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
}

async function transition(params: {
  client: any;
  campaignId: string;
  version: number;
  toState: string;
  approvalSnapshotId?: string | null;
  evidence: unknown;
  idempotencyKey: string;
}) {
  const { data, error } = await params.client.rpc("transition_campaign_lifecycle_v1", {
    p_campaign_id: params.campaignId,
    p_expected_version: params.version,
    p_to_state: params.toState,
    p_reason_code: `customer_${params.toState}`,
    p_evidence_digest: digest(params.evidence),
    p_idempotency_key: params.idempotencyKey,
    p_approval_snapshot_id: params.approvalSnapshotId ?? null,
    p_actor_kind: "customer",
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Campaign lifecycle transition was rejected.", "campaign_lifecycle_transition_rejected");
  }
  const result = row(data);
  if (!result || typeof result.state_version !== "number") {
    throw new ApiError(500, "Campaign lifecycle returned invalid evidence.", "campaign_lifecycle_result_invalid");
  }
  return result;
}

export async function prepareCanonicalCampaignApproval(params: {
  campaignId: string;
  materialInputDigest: string;
  approvedSnapshot: Record<string, unknown>;
  approvedDailyBudgetMinor: number;
  currency: string;
  scheduledFor: string;
}) {
  const client = await createRouteHandlerClient();
  if (!client) throw new ApiError(503, "Campaign lifecycle authority is unavailable.", "campaign_lifecycle_unavailable");
  const { data, error } = await (client as any).rpc("approve_campaign_snapshot_v1", {
    p_campaign_id: params.campaignId,
    p_material_input_digest: params.materialInputDigest,
    p_approved_snapshot: {
      schemaVersion: "1",
      metaLaunch: params.approvedSnapshot,
      materialInputDigest: params.materialInputDigest,
    },
    p_approved_daily_budget_minor: params.approvedDailyBudgetMinor,
    p_currency: params.currency,
    p_scheduled_for: params.scheduledFor,
    p_idempotency_key: `approval:${params.campaignId}:${params.materialInputDigest}`,
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Campaign approval was rejected.", "campaign_approval_rejected");
  }
  const approval = row(data);
  if (!approval || typeof approval.id !== "string") {
    throw new ApiError(500, "Campaign approval returned invalid evidence.", "campaign_approval_result_invalid");
  }
  const currentResult = await (client as any)
    .from("campaign_lifecycle_authority")
    .select("state,state_version,active_approval_snapshot_id")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();
  if (currentResult.error) {
    throw new ApiError(503, "Campaign lifecycle could not be read.", "campaign_lifecycle_unavailable");
  }
  let current = currentResult.data as Record<string, unknown> | null;
  let version = Number(current?.state_version ?? 1);
  const state = typeof current?.state === "string" ? current.state : "draft";
  const approvalSnapshotId = String(approval.id);
  const path = ["draft", "generated", "review_required", "approved"];
  let position = path.indexOf(state);
  if (position < 0) {
    if (["approved", "scheduled", "publishing", "provider_paused", "active", "paused", "completed", "archived"].includes(state)) {
      return { approvalSnapshotId, version, state, client };
    }
    throw new ApiError(409, "Campaign lifecycle requires operator reconciliation before approval.", "campaign_lifecycle_reconciliation_required");
  }
  while (position < path.length - 1) {
    const nextState = path[position + 1];
    current = await transition({
      client,
      campaignId: params.campaignId,
      version,
      toState: nextState,
      approvalSnapshotId: nextState === "approved" ? approvalSnapshotId : null,
      evidence: { materialInputDigest: params.materialInputDigest, approvalSnapshotId, nextState },
      idempotencyKey: `lifecycle:${params.campaignId}:${params.materialInputDigest}:${nextState}`,
    });
    version = Number(current.state_version);
    position += 1;
  }
  return { approvalSnapshotId, version, state: "approved", client };
}

export async function markCanonicalCampaignScheduled(params: {
  campaignId: string;
  approvalSnapshotId: string;
  expectedVersion: number;
  scheduledFor: string;
  activationAuthorizationId: string;
  client: any;
}) {
  return transition({
    client: params.client,
    campaignId: params.campaignId,
    version: params.expectedVersion,
    toState: "scheduled",
    approvalSnapshotId: params.approvalSnapshotId,
    evidence: {
      approvalSnapshotId: params.approvalSnapshotId,
      scheduledFor: params.scheduledFor,
      activationAuthorizationId: params.activationAuthorizationId,
    },
    idempotencyKey: `lifecycle:${params.campaignId}:${params.activationAuthorizationId}:scheduled`,
  });
}

export type CanonicalCampaignLifecycleState =
  | "draft"
  | "generated"
  | "review_required"
  | "approved"
  | "scheduled"
  | "publishing"
  | "provider_paused"
  | "active"
  | "paused"
  | "completed"
  | "archived"
  | "failed"
  | "canceled"
  | "ambiguous"
  | "operator_required";

export async function transitionCanonicalCampaignLifecycleBySystem(params: {
  organizationId: string;
  campaignId: string;
  toState: CanonicalCampaignLifecycleState;
  reasonCode: string;
  evidence: unknown;
  idempotencyKey: string;
  actorKind?: "system_worker" | "provider_reconciliation" | "operator";
  client?: any;
  allowUnapprovedLegacyNoop?: boolean;
}) {
  const client = params.client ?? createAdminClient();
  if (!client) {
    throw new ApiError(503, "Campaign lifecycle authority is unavailable.", "campaign_lifecycle_unavailable");
  }

  const currentResult = await client
    .from("campaign_lifecycle_authority")
    .select("state,state_version,active_approval_snapshot_id")
    .eq("organization_id", params.organizationId)
    .eq("campaign_id", params.campaignId)
    .maybeSingle();
  if (currentResult.error) {
    throw new ApiError(503, currentResult.error.message ?? "Campaign lifecycle could not be read.", "campaign_lifecycle_unavailable");
  }
  const current = currentResult.data as Record<string, unknown> | null;
  if (!current || typeof current.state !== "string" || typeof current.state_version !== "number") {
    throw new ApiError(409, "Campaign lifecycle authority has not been initialized.", "campaign_lifecycle_not_initialized");
  }
  if (current.state === params.toState) {
    return current;
  }
  if (
    params.allowUnapprovedLegacyNoop &&
    typeof current.active_approval_snapshot_id !== "string"
  ) {
    return current;
  }

  const { data, error } = await client.rpc("transition_campaign_lifecycle_v1", {
    p_campaign_id: params.campaignId,
    p_expected_version: current.state_version,
    p_to_state: params.toState,
    p_reason_code: params.reasonCode,
    p_evidence_digest: digest(params.evidence),
    p_idempotency_key: params.idempotencyKey,
    p_approval_snapshot_id:
      typeof current.active_approval_snapshot_id === "string"
        ? current.active_approval_snapshot_id
        : null,
    p_actor_kind: params.actorKind ?? "system_worker",
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Campaign lifecycle transition was rejected.", "campaign_lifecycle_transition_rejected");
  }
  const result = row(data);
  if (!result || typeof result.state_version !== "number" || result.state !== params.toState) {
    throw new ApiError(500, "Campaign lifecycle returned invalid evidence.", "campaign_lifecycle_result_invalid");
  }
  return result;
}
