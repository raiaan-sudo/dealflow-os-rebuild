import "server-only";

import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { syncMetaCampaignStatus } from "@/lib/services/meta-campaign-sync-service";
import {
  REALTOR_OPTIMIZATION_POLICY_V1,
  evaluateRealtorOptimizationPolicy,
} from "@/lib/optimization-engine/realtor-policy";
import { evaluateOptimizationEvidence } from "@/lib/optimization-engine/safety-policy";
import { recordOptimizationDecision } from "@/lib/services/optimization-decision-service";
import type { SystemJobRecord } from "@/lib/services/system-job-service";
import type { SystemJobLease } from "@/lib/services/system-job-lease-service";

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  return admin as any;
}

function reportingScheduleId(job: SystemJobRecord<"meta_reporting_sync">) {
  const value = (job.payload as { reportingScheduleId?: unknown }).reportingScheduleId;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new ApiError(400, "Reporting schedule payload is invalid.", "meta_reporting_payload_invalid");
  }
  return value;
}

export async function enqueueDueMetaReportingSyncJobs(limit = 25) {
  const admin = adminOrThrow();
  const { data, error } = await admin.rpc("enqueue_due_meta_reporting_sync_jobs", {
    p_limit: Math.min(100, Math.max(1, limit)),
  });
  if (error) throw new ApiError(500, error.message, "meta_reporting_enqueue_failed");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    enqueuedCount: Number(row?.enqueued_count ?? 0),
    enqueuedJobIds: Array.isArray(row?.enqueued_job_ids) ? row.enqueued_job_ids.map(String) : [],
  };
}

export async function refreshMetaReportingFreshnessAlerts() {
  const admin = adminOrThrow();
  const { data, error } = await admin.rpc("refresh_meta_reporting_freshness_alerts");
  if (error) throw new ApiError(500, error.message, "meta_reporting_freshness_refresh_failed");
  return Number(data ?? 0);
}

export async function processMetaReportingSyncJob(params: {
  job: SystemJobRecord<"meta_reporting_sync">;
  lease: SystemJobLease;
}) {
  const admin = adminOrThrow();
  const scheduleId = reportingScheduleId(params.job);
  if (!params.job.campaign_id) {
    throw new ApiError(400, "Reporting job is missing its campaign.", "meta_reporting_campaign_missing");
  }
  try {
    const snapshot = await syncMetaCampaignStatus({
      campaignId: params.job.campaign_id,
      internalActor: {
        organizationId: params.job.organization_id,
        userId: params.job.user_id,
      },
    });
    const raw = snapshot.deliveryMetrics;
    const impressions = Number(raw.impressions ?? 0);
    const clicks = Number(raw.clicks ?? 0);
    const spend = Number(raw.spend ?? 0);
    const leads = Number(raw.leads ?? 0);
    const metrics = {
      ctr: Number(((Number(raw.ctr ?? 0) <= 1 ? Number(raw.ctr ?? 0) * 100 : Number(raw.ctr ?? 0))).toFixed(2)),
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
      cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
      frequency: Number(raw.frequency ?? 0),
      spend,
      leads,
      lp_cvr: clicks > 0 ? Number(((leads / clicks) * 100).toFixed(2)) : 0,
      impressions,
      clicks,
    };
    const [controlsResult, executionResult, launchResult] = await Promise.all([
      admin.from("optimization_campaign_controls")
        .select("*")
        .eq("organization_id", params.job.organization_id)
        .eq("campaign_id", params.job.campaign_id)
        .maybeSingle(),
      admin.from("campaign_executions")
        .select("daily_budget,created_at")
        .eq("organization_id", params.job.organization_id)
        .eq("campaign_id", params.job.campaign_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("campaign_launch_records")
        .select("created_at")
        .eq("organization_id", params.job.organization_id)
        .eq("campaign_id", params.job.campaign_id)
        .eq("result_status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (controlsResult.error) {
      throw new ApiError(500, controlsResult.error.message, "optimization_controls_lookup_failed");
    }
    if (executionResult.error) {
      throw new ApiError(500, executionResult.error.message, "optimization_execution_budget_lookup_failed");
    }
    if (launchResult.error) {
      throw new ApiError(500, launchResult.error.message, "optimization_launch_age_lookup_failed");
    }
    const controls = controlsResult.data;
    const currentDailyBudget = Number(executionResult.data?.daily_budget ?? 0);
    const launchMs = Date.parse(String(launchResult.data?.created_at ?? ""));
    const campaignAgeHours = Number.isFinite(launchMs)
      ? Math.max(0, (Date.now() - launchMs) / 3_600_000)
      : null;
    const customerCeiling = Number(controls?.customer_daily_budget_ceiling ?? 0);
    const snapshotSyncedAt = snapshot.syncedAt ?? null;
    const approvedPolicy = {
      ...REALTOR_OPTIMIZATION_POLICY_V1,
      customerDailyBudgetCeiling: customerCeiling,
    };
    const evidence = evaluateOptimizationEvidence({
      sourceStatus: snapshot.syncResult === "success" ? "confirmed" : "partial",
      syncedAt: snapshotSyncedAt,
      metrics,
      approvedPolicy,
      lastProviderMutationAt: controls?.last_provider_mutation_at ?? null,
    });
    const policyEvaluation = evaluateRealtorOptimizationPolicy({
      sourceStatus: snapshot.syncResult === "success" ? "confirmed" : "partial",
      syncedAt: snapshotSyncedAt,
      metrics,
      dailyBudget: currentDailyBudget > 0 ? currentDailyBudget : null,
      customerDailyBudgetCeiling: customerCeiling,
      campaignAgeHours,
      scaleAppliedLast24HoursPercent: Number(controls?.scale_applied_last_24h_percent ?? 0),
      lastProviderMutationAt: controls?.last_provider_mutation_at ?? null,
      switches: {
        global: controls?.global_kill_switch !== false,
        account: controls?.account_kill_switch === true,
        campaign: controls?.campaign_kill_switch === true,
        emergencyStop: controls?.emergency_stop === true,
      },
    });
    const decision = await recordOptimizationDecision({
      campaignId: params.job.campaign_id,
      sourceStatus: snapshot.syncResult === "success" ? "confirmed" : "partial",
      sourceTimestamp: snapshotSyncedAt,
      metrics,
      evidence,
      approvedPolicy,
      lastProviderMutationAt: controls?.last_provider_mutation_at ?? null,
      proposedActions:
        policyEvaluation.state === "PROPOSED"
          ? [`${policyEvaluation.action.type}:${policyEvaluation.action.changePercent}`]
          : [],
      internalActor: {
        organizationId: params.job.organization_id,
        userId: params.job.user_id,
      },
    });
    const { data, error } = await admin.rpc("settle_meta_reporting_sync", {
      p_schedule_id: scheduleId,
      p_job_id: params.job.id,
      p_worker_id: params.lease.workerId,
      p_lease_token: params.lease.token,
      p_lease_generation: params.lease.generation,
      p_snapshot_id: snapshot.id,
    });
    if (error || data !== true) {
      throw new ApiError(409, error?.message ?? "Reporting lease was lost.", "meta_reporting_lease_lost");
    }
    return {
      scheduleId,
      snapshotId: snapshot.id,
      syncResult: snapshot.syncResult,
      syncedAt: snapshot.syncedAt,
      optimizationDecisionId: decision.id,
      optimizationState: policyEvaluation.state,
    };
  } catch (error) {
    const errorCode = error instanceof ApiError ? error.code : "meta_reporting_sync_failed";
    await admin.rpc("record_meta_reporting_sync_failure", {
      p_schedule_id: scheduleId,
      p_job_id: params.job.id,
      p_worker_id: params.lease.workerId,
      p_lease_token: params.lease.token,
      p_lease_generation: params.lease.generation,
      p_error_code: errorCode,
    }).catch(() => null);
    throw error;
  }
}
