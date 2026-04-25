import { logError, logInfo } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";
import type { CampaignExecutionLog, CampaignExecutionStepStatus } from "@/lib/types/campaign-execution";

type ExecutionSupabaseClient = {
  from: (table: "campaign_execution_logs") => {
    insert: (value: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
};

async function writeExecutionLog(params: {
  supabase: ExecutionSupabaseClient;
  executionId: string;
  stepKey: string;
  stepStatus: CampaignExecutionStepStatus;
  message?: string | null;
  payload?: Json | null;
}) {
  const { error } = await params.supabase.from("campaign_execution_logs").insert({
    execution_id: params.executionId,
    step_key: params.stepKey,
    step_status: params.stepStatus,
    message: params.message ?? null,
    payload: params.payload ?? null,
  });

  if (error) {
    logError("Campaign execution log write failed", {
      executionId: params.executionId,
      stepKey: params.stepKey,
      message: error.message,
    });
  }
}

export async function logExecutionInfo(
  supabase: ExecutionSupabaseClient,
  executionId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logInfo("Campaign execution step", {
    executionId,
    stepKey,
    message: message ?? null,
  });
  await writeExecutionLog({
    supabase,
    executionId,
    stepKey,
    stepStatus: "info",
    message,
    payload,
  });
}

export async function logExecutionSuccess(
  supabase: ExecutionSupabaseClient,
  executionId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logInfo("Campaign execution step succeeded", {
    executionId,
    stepKey,
    message: message ?? null,
  });
  await writeExecutionLog({
    supabase,
    executionId,
    stepKey,
    stepStatus: "success",
    message,
    payload,
  });
}

export async function logExecutionFailure(
  supabase: ExecutionSupabaseClient,
  executionId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logError("Campaign execution step failed", {
    executionId,
    stepKey,
    message: message ?? null,
  });
  await writeExecutionLog({
    supabase,
    executionId,
    stepKey,
    stepStatus: "failure",
    message,
    payload,
  });
}

export function summarizeExecutionLogs(logs: CampaignExecutionLog[]) {
  return logs.map((log) => ({
    id: log.id,
    stepKey: log.step_key,
    stepStatus: log.step_status,
    message: log.message,
    createdAt: log.created_at,
  }));
}
