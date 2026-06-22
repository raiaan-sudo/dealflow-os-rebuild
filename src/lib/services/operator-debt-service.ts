import "server-only";

import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/supabase/types";

type OperatorDebtJobRow = {
  id: string;
  kind: string | null;
  status: string | null;
  organization_id: string | null;
  campaign_id: string | null;
  partner_id: string | null;
  retry_count: number | null;
  attempt_count: number | null;
  max_attempts: number | null;
  error_message: string | null;
  last_error_code: string | null;
  dead_lettered_at: string | null;
  dead_letter_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution_note: string | null;
  created_at: string | null;
  next_run_at: string | null;
  locked_by: string | null;
  locked_until: string | null;
  payload: Json | null;
  result: Json | null;
};

export type OperatorDebtJob = {
  id: string;
  kind: string;
  status: string;
  createdAt: string | null;
  organizationId: string | null;
  campaignId: string | null;
  partnerId: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  errorMessage: string | null;
  deadLetteredAt: string | null;
  deadLetterReason: string | null;
  lockedUntil: string | null;
  payloadSummary: Record<string, Json>;
  resultSummary: Record<string, Json>;
  recovery: {
    category: "known_proof_residue" | "side_effect_review_required" | "manual_review_required";
    retryAllowed: boolean;
    acknowledgeAllowed: boolean;
    recommendedAction: string;
  };
};

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured for operator debt.", "operator_debt_service_role_missing");
  }
  return admin;
}

function asRecord(value: Json | null): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json>;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summarizeJson(value: Json | null): Record<string, Json> {
  const record = asRecord(value);
  const summary: Record<string, Json> = {};
  const safeKeys = Object.keys(record)
    .filter((key) => !/token|secret|authorization|bearer|cookie|password|credential/i.test(key))
    .slice(0, 24);

  summary.keys = safeKeys;

  for (const key of [
    "proofRunId",
    "proof_run_id",
    "mode",
    "source",
    "status",
    "reason",
    "errorCode",
    "leadId",
    "lead_id",
    "campaignId",
    "campaign_id",
    "organizationId",
    "organization_id",
  ]) {
    const valueForKey = record[key];
    if (typeof valueForKey === "string" || typeof valueForKey === "number" || typeof valueForKey === "boolean" || valueForKey === null) {
      summary[key] = valueForKey;
    }
  }

  return summary;
}

function isKnownPerformanceBillingProofResidue(row: OperatorDebtJobRow) {
  const payload = asRecord(row.payload);
  return (
    row.id === "8f7ce814-85eb-48df-a4dc-f1f168335394" &&
    row.kind === "performance_lead_billing" &&
    row.status === "failed" &&
    row.last_error_code === "lead_billing_lead_fetch_failed" &&
    row.dead_lettered_at !== null &&
    row.error_message === "column leads.consent_source does not exist" &&
    payload.leadId === "e7fe6165-f3c5-4fde-8417-4f058326f5b6"
  );
}

function classifyRecovery(row: OperatorDebtJobRow): OperatorDebtJob["recovery"] {
  if (isKnownPerformanceBillingProofResidue(row)) {
    return {
      category: "known_proof_residue",
      retryAllowed: false,
      acknowledgeAllowed: true,
      recommendedAction:
        "Acknowledge as historical public-QA proof residue after the performance billing consent_metadata fix and later billing proof passed.",
    };
  }

  const sideEffectKinds = new Set([
    "lead_side_effects",
    "performance_lead_billing",
    "meta_sync",
    "static_creative_generation",
    "video_generation",
    "campaign_launch",
    "stripe_webhook_recovery",
    "billing_subscription_recovery",
  ]);

  if (row.kind && sideEffectKinds.has(row.kind)) {
    return {
      category: "side_effect_review_required",
      retryAllowed: false,
      acknowledgeAllowed: true,
      recommendedAction:
        "Review root cause and external side-effect risk before retrying. Use acknowledgement only when later proof shows this row is historical evidence.",
    };
  }

  return {
    category: "manual_review_required",
    retryAllowed: false,
    acknowledgeAllowed: true,
    recommendedAction:
      "Review the job payload, owning workspace, and current code path before choosing an operator action.",
  };
}

function mapJob(row: OperatorDebtJobRow): OperatorDebtJob {
  return {
    id: row.id,
    kind: row.kind ?? "unknown",
    status: row.status ?? "unknown",
    createdAt: row.created_at,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    partnerId: row.partner_id,
    attemptCount: row.attempt_count ?? row.retry_count ?? 0,
    maxAttempts: row.max_attempts ?? 0,
    lastErrorCode: row.last_error_code,
    errorMessage: safeString(row.error_message)?.slice(0, 500) ?? null,
    deadLetteredAt: row.dead_lettered_at,
    deadLetterReason: safeString(row.dead_letter_reason)?.slice(0, 500) ?? null,
    lockedUntil: row.locked_until,
    payloadSummary: summarizeJson(row.payload),
    resultSummary: summarizeJson(row.result),
    recovery: classifyRecovery(row),
  };
}

export async function loadOpenOperatorDebtJobs(limit = 20) {
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from("system_jobs")
    .select(
      "id,kind,status,organization_id,campaign_id,partner_id,retry_count,attempt_count,max_attempts,error_message,last_error_code,dead_lettered_at,dead_letter_reason,reviewed_at,reviewed_by,resolution_note,created_at,next_run_at,locked_by,locked_until,payload,result",
    )
    .or("status.eq.failed,dead_lettered_at.not.is.null")
    .is("reviewed_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    throw new ApiError(500, error.message, "operator_debt_jobs_load_failed");
  }

  return ((data ?? []) as OperatorDebtJobRow[]).map(mapJob);
}

export async function acknowledgeOperatorDebtJob(params: {
  id: string;
  actor: string;
  note: string;
}) {
  const note = params.note.trim();
  if (note.length < 20) {
    throw new ApiError(400, "Resolution note must explain why the debt is safe to acknowledge.", "operator_debt_note_required");
  }

  const admin = adminOrThrow();
  const { data: rows, error: readError } = await admin
    .from("system_jobs")
    .select(
      "id,kind,status,organization_id,campaign_id,partner_id,retry_count,attempt_count,max_attempts,error_message,last_error_code,dead_lettered_at,dead_letter_reason,reviewed_at,reviewed_by,resolution_note,created_at,next_run_at,locked_by,locked_until,payload,result",
    )
    .eq("id", params.id)
    .is("reviewed_at", null)
    .limit(1);

  if (readError) {
    throw new ApiError(500, readError.message, "operator_debt_job_lookup_failed");
  }

  const row = ((rows ?? []) as OperatorDebtJobRow[])[0] ?? null;
  if (!row || (row.status !== "failed" && row.dead_lettered_at === null)) {
    throw new ApiError(404, "Open failed/dead-letter job was not found.", "operator_debt_job_not_found");
  }

  const timestamp = new Date().toISOString();
  const { error: updateError } = await admin
    .from("system_jobs")
    .update({
      reviewed_at: timestamp,
      reviewed_by: params.actor.slice(0, 120),
      resolution_note: note.slice(0, 1000),
    } as never)
    .eq("id", row.id)
    .is("reviewed_at", null);

  if (updateError) {
    throw new ApiError(500, updateError.message, "operator_debt_job_acknowledge_failed");
  }

  return {
    acknowledgedAt: timestamp,
    job: mapJob(row),
    sideEffects: {
      retriedJob: false,
      deletedJob: false,
      externalMutation: false,
      smsEmailSent: false,
      metaMutation: false,
      ghlMutation: false,
      stripeCharge: false,
      providerGeneration: false,
    },
  };
}
