import "server-only";

import { ApiError } from "@/lib/api/route";
import type { MetaOptimizationReceipt } from "@/lib/optimization-engine/meta-sandbox-executor";
import { OPTIMIZATION_POLICY_CONTRACT_VERSION } from "@/lib/optimization-engine/safety-policy";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/supabase/types";

export function createMetaOptimizationReceiptRepository(params: {
  organizationId: string;
  campaignId: string;
}) {
  const admin = createAdminClient() as any;
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  return {
    async findReceipt(idempotencyKey: string): Promise<MetaOptimizationReceipt | null> {
      const { data, error } = await admin.from("meta_optimization_action_receipts")
        .select("*")
        .eq("organization_id", params.organizationId)
        .eq("campaign_id", params.campaignId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new ApiError(500, error.message, "meta_optimization_receipt_lookup_failed");
      if (!data) return null;
      return {
        idempotencyKey: data.idempotency_key,
        providerReceiptId: data.provider_receipt_id,
        before: data.before_state,
        intended: data.intended_state,
        after: data.after_state,
        reconciled: data.reconciled,
        rollback: data.rollback_state,
      } as MetaOptimizationReceipt;
    },
    async appendReceipt(receipt: MetaOptimizationReceipt) {
      const { error } = await admin.from("meta_optimization_action_receipts").insert({
        organization_id: params.organizationId,
        campaign_id: params.campaignId,
        idempotency_key: receipt.idempotencyKey,
        policy_version: OPTIMIZATION_POLICY_CONTRACT_VERSION,
        action_type: receipt.intended.type,
        before_state: receipt.before as unknown as Json,
        intended_state: receipt.intended as unknown as Json,
        provider_receipt_id: receipt.providerReceiptId,
        after_state: receipt.after as unknown as Json,
        reconciled: receipt.reconciled,
        rollback_state: receipt.rollback as unknown as Json,
      });
      if (error?.code === "23505") return;
      if (error) throw new ApiError(500, error.message, "meta_optimization_receipt_insert_failed");
    },
  };
}
