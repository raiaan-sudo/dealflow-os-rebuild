import {
  isGrandfatheredPlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from "@/lib/billing/plans";

type StripePlanItem = {
  priceId: string | null;
  quantity?: number | null;
};

type StripePlanResolutionInput = {
  items: StripePlanItem[];
  configuredPriceIds: Record<BillingPlanTier, string | null>;
  metadataPlanTier?: string | null;
  legacyTierReconciled?: boolean;
};

export type StripePlanResolution =
  | {
      ok: true;
      planTier: BillingPlanTier;
      priceId: string;
      itemIndex: number;
      source: "current_price" | "legacy_reconciled_metadata";
    }
  | {
      ok: false;
      reason:
        | "subscription_item_ambiguous"
        | "subscription_price_missing"
        | "subscription_price_unknown"
        | "configured_price_ambiguous"
        | "legacy_tier_authority_missing";
    };

export type StripeSubscriptionPersistenceDecision = {
  planTier: BillingPlanTier;
  status: string;
  operatorReconciliationReason: Extract<StripePlanResolution, { ok: false }>["reason"] | null;
};

export function getStripeSubscriptionPersistenceDecision(params: {
  resolution: StripePlanResolution;
  authoritativeStatus: string;
}): StripeSubscriptionPersistenceDecision {
  if (params.resolution.ok) {
    return {
      planTier: params.resolution.planTier,
      status: params.authoritativeStatus,
      operatorReconciliationReason: null,
    };
  }

  return {
    planTier: "starter",
    status: "operator_action_required",
    operatorReconciliationReason: params.resolution.reason,
  };
}

export function resolveStripeSubscriptionPlanTier(
  input: StripePlanResolutionInput,
): StripePlanResolution {
  const activeItems = input.items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.quantity !== 0);

  if (activeItems.length !== 1) {
    return { ok: false, reason: "subscription_item_ambiguous" };
  }

  const [activeItem] = activeItems;
  if (!activeItem.priceId) {
    return { ok: false, reason: "subscription_price_missing" };
  }

  const matchingTiers = (Object.entries(input.configuredPriceIds) as Array<
    [BillingPlanTier, string | null]
  >)
    .filter(([, configuredPriceId]) => configuredPriceId === activeItem.priceId)
    .map(([planTier]) => planTier);

  if (matchingTiers.length === 1) {
    const matchedTier = matchingTiers[0];
    if (isGrandfatheredPlanTier(matchedTier)) {
      if (
        input.legacyTierReconciled !== true ||
        input.metadataPlanTier !== matchedTier
      ) {
        return { ok: false, reason: "legacy_tier_authority_missing" };
      }

      return {
        ok: true,
        planTier: matchedTier,
        priceId: activeItem.priceId,
        itemIndex: activeItem.index,
        source: "legacy_reconciled_metadata",
      };
    }

    return {
      ok: true,
      planTier: matchedTier,
      priceId: activeItem.priceId,
      itemIndex: activeItem.index,
      source: "current_price",
    };
  }

  if (matchingTiers.length > 1) {
    return { ok: false, reason: "configured_price_ambiguous" };
  }

  if (input.legacyTierReconciled === true) {
    const planTier = normalizeBillingPlanTier(input.metadataPlanTier);
    if (
      input.metadataPlanTier === planTier &&
      isGrandfatheredPlanTier(planTier)
    ) {
      return {
        ok: true,
        planTier,
        priceId: activeItem.priceId,
        itemIndex: activeItem.index,
        source: "legacy_reconciled_metadata",
      };
    }
  }

  return { ok: false, reason: "subscription_price_unknown" };
}
