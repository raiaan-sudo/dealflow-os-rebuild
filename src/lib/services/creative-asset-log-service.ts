import { logError, logInfo } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";
import type { CreativeAssetLogStatus } from "@/lib/types/creative-assets";

type AssetLogSupabaseClient = {
  from: (table: "creative_asset_logs") => {
    insert: (value: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
};

async function writeAssetLog(params: {
  supabase: AssetLogSupabaseClient;
  creativeAssetId: string;
  stepKey: string;
  stepStatus: CreativeAssetLogStatus;
  message?: string | null;
  payload?: Json | null;
}) {
  const { error } = await params.supabase.from("creative_asset_logs").insert({
    creative_asset_id: params.creativeAssetId,
    step_key: params.stepKey,
    step_status: params.stepStatus,
    message: params.message ?? null,
    payload: params.payload ?? null,
  });

  if (error) {
    logError("Creative asset log write failed", {
      creativeAssetId: params.creativeAssetId,
      stepKey: params.stepKey,
      message: error.message,
    });
  }
}

export async function logCreativeAssetStarted(
  supabase: AssetLogSupabaseClient,
  creativeAssetId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logInfo("Creative asset step started", { creativeAssetId, stepKey, message: message ?? null });
  await writeAssetLog({
    supabase,
    creativeAssetId,
    stepKey,
    stepStatus: "started",
    message,
    payload,
  });
}

export async function logCreativeAssetSuccess(
  supabase: AssetLogSupabaseClient,
  creativeAssetId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logInfo("Creative asset step succeeded", { creativeAssetId, stepKey, message: message ?? null });
  await writeAssetLog({
    supabase,
    creativeAssetId,
    stepKey,
    stepStatus: "success",
    message,
    payload,
  });
}

export async function logCreativeAssetFailure(
  supabase: AssetLogSupabaseClient,
  creativeAssetId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logError("Creative asset step failed", { creativeAssetId, stepKey, message: message ?? null });
  await writeAssetLog({
    supabase,
    creativeAssetId,
    stepKey,
    stepStatus: "failure",
    message,
    payload,
  });
}

export async function logCreativeAssetInfo(
  supabase: AssetLogSupabaseClient,
  creativeAssetId: string,
  stepKey: string,
  message?: string,
  payload?: Json | null,
) {
  logInfo("Creative asset step", { creativeAssetId, stepKey, message: message ?? null });
  await writeAssetLog({
    supabase,
    creativeAssetId,
    stepKey,
    stepStatus: "info",
    message,
    payload,
  });
}
