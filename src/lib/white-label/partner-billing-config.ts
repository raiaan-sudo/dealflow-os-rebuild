import { type BillingPlanTier } from "@/lib/billing/plans";
import type { Json } from "@/lib/supabase/types";

export type PartnerPricingPlanKey = Extract<BillingPlanTier, "starter" | "pro">;

export type PartnerPricingPlanConfig = {
  label: string;
  priceId?: string | null;
  basePriceId?: string | null;
  meteredLeadPriceId?: string | null;
  meterEventName?: string | null;
};

export type PartnerPricingConfig = {
  displayProductName: string | null;
  checkoutHeadline: string | null;
  visiblePlans: PartnerPricingPlanKey[];
  allowDefaultDealFlowPrices: boolean;
  billingModel?: "base_plus_immediate_lead_charge" | "base_plus_metered_usage" | null;
  leadChargeAmountCents?: number | null;
  plans: Partial<Record<PartnerPricingPlanKey, PartnerPricingPlanConfig>>;
};

const PARTNER_PLAN_KEYS = ["starter", "pro"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeVisiblePlans(value: unknown): PartnerPricingPlanKey[] {
  // Starter remains parseable as a legacy configuration record, but it is
  // never exposed as a new public checkout choice.
  void value;
  return ["pro"];
}

function normalizePlanConfig(value: unknown): PartnerPricingPlanConfig {
  const record = asRecord(value);
  return {
    label: optionalText(record.label) ?? "",
    priceId: optionalText(record.priceId),
    basePriceId: optionalText(record.basePriceId),
    meteredLeadPriceId: optionalText(record.meteredLeadPriceId),
    meterEventName: optionalText(record.meterEventName),
  };
}

export function parsePartnerPricingConfig(value: unknown): PartnerPricingConfig {
  const record = asRecord(value);
  const plansRecord = asRecord(record.plans);
  const plans: PartnerPricingConfig["plans"] = {};

  for (const key of PARTNER_PLAN_KEYS) {
    const plan = normalizePlanConfig(plansRecord[key]);
    if (plan.label || plan.priceId || plan.basePriceId || plan.meteredLeadPriceId || plan.meterEventName) {
      plans[key] = plan;
    }
  }

  return {
    displayProductName: optionalText(record.displayProductName),
    checkoutHeadline: optionalText(record.checkoutHeadline),
    visiblePlans: normalizeVisiblePlans(record.visiblePlans),
    allowDefaultDealFlowPrices: record.allowDefaultDealFlowPrices === true,
    billingModel:
      record.billingModel === "base_plus_metered_usage"
        ? "base_plus_metered_usage"
        : record.billingModel === "base_plus_immediate_lead_charge"
          ? "base_plus_immediate_lead_charge"
          : null,
    leadChargeAmountCents:
      typeof record.leadChargeAmountCents === "number" && Number.isInteger(record.leadChargeAmountCents)
        ? record.leadChargeAmountCents
        : null,
    plans,
  };
}

export function serializePartnerPricingConfig(config: PartnerPricingConfig): Json {
  return {
    displayProductName: config.displayProductName,
    checkoutHeadline: config.checkoutHeadline,
    visiblePlans: config.visiblePlans,
    allowDefaultDealFlowPrices: config.allowDefaultDealFlowPrices,
    billingModel: config.billingModel ?? null,
    leadChargeAmountCents: config.leadChargeAmountCents ?? null,
    plans: config.plans,
  } satisfies Json;
}

export function isStripePriceId(value: string | null | undefined) {
  return typeof value === "string" && /^price_[A-Za-z0-9_]+$/.test(value.trim());
}

export function getPartnerPlanConfig(
  pricing: PartnerPricingConfig | null | undefined,
  planTier: BillingPlanTier,
) {
  if (!pricing || planTier === "growth") {
    return null;
  }

  return pricing.plans[planTier] ?? null;
}

export function getPartnerPlanLabel(
  pricing: PartnerPricingConfig | null | undefined,
  planTier: BillingPlanTier,
) {
  const plan = getPartnerPlanConfig(pricing, planTier);
  return plan?.label?.trim() || pricing?.displayProductName?.trim() || null;
}

export function validatePartnerPricingConfig(pricing: PartnerPricingConfig) {
  const issues: string[] = [];

  if (pricing.displayProductName && pricing.displayProductName.length > 120) {
    issues.push("Partner product name must be 120 characters or fewer.");
  }

  for (const tier of pricing.visiblePlans) {
    const plan = pricing.plans[tier];
    if (!plan && !pricing.allowDefaultDealFlowPrices) {
      issues.push(`${tier} is visible but has no partner Stripe price configuration.`);
      continue;
    }

    if (!plan) {
      continue;
    }

    if (!isStripePriceId(plan.priceId)) {
      issues.push(`${tier} price ID must start with price_.`);
    }
  }

  return issues;
}

export function getPartnerMeterEventName(plan: PartnerPricingPlanConfig | null | undefined) {
  return plan?.meterEventName?.trim() || "dealflow_qualified_lead";
}

export function hasPartnerPricingConfiguration(pricing: PartnerPricingConfig | null | undefined) {
  if (!pricing) {
    return false;
  }

  return Boolean(
    pricing.displayProductName ||
      pricing.checkoutHeadline ||
      pricing.allowDefaultDealFlowPrices ||
      Object.keys(pricing.plans).length > 0,
  );
}
