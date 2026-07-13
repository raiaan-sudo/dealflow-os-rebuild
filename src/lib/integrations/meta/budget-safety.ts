import { ApiError } from "@/lib/api/route";
import { getDeploymentTarget } from "@/lib/deployment-target";
import { isMetaLiveWriteAllowed } from "@/lib/integrations/meta/contract";

export type MetaBudgetKind = "daily" | "lifetime";

/**
 * These defaults exist only for explicitly identified development/test
 * contract paths while real Meta writes are disabled. Hosted and live-write
 * paths must provide both hard ceilings explicitly.
 */
export const DEFAULT_META_DAILY_BUDGET_HARD_CEILING_CENTS = 100_000;
export const DEFAULT_META_LIFETIME_BUDGET_HARD_CEILING_CENTS = 3_100_000;

const ABSOLUTE_META_DAILY_BUDGET_HARD_CEILING_CENTS = 10_000_000;
const ABSOLUTE_META_LIFETIME_BUDGET_HARD_CEILING_CENTS = 310_000_000;

const BUDGET_CONFIG: Record<
  MetaBudgetKind,
  {
    environmentKey:
      | "META_DAILY_BUDGET_HARD_CEILING_CENTS"
      | "META_LIFETIME_BUDGET_HARD_CEILING_CENTS";
    defaultCents: number;
    absoluteMaximumCents: number;
    label: string;
  }
> = {
  daily: {
    environmentKey: "META_DAILY_BUDGET_HARD_CEILING_CENTS",
    defaultCents: DEFAULT_META_DAILY_BUDGET_HARD_CEILING_CENTS,
    absoluteMaximumCents: ABSOLUTE_META_DAILY_BUDGET_HARD_CEILING_CENTS,
    label: "Meta daily budget",
  },
  lifetime: {
    environmentKey: "META_LIFETIME_BUDGET_HARD_CEILING_CENTS",
    defaultCents: DEFAULT_META_LIFETIME_BUDGET_HARD_CEILING_CENTS,
    absoluteMaximumCents: ABSOLUTE_META_LIFETIME_BUDGET_HARD_CEILING_CENTS,
    label: "Meta lifetime budget",
  },
};

function isDefaultSafeContractPath(environment: Record<string, string | undefined>) {
  const target = getDeploymentTarget(environment);
  return (
    (target === "development" || target === "test") &&
    !isMetaLiveWriteAllowed(environment)
  );
}

function budgetConfigurationError(params: {
  status: 503;
  message: string;
  code: "meta_budget_ceiling_unconfigured" | "meta_budget_ceiling_invalid";
}) {
  return new ApiError(params.status, params.message, params.code);
}

/**
 * Returns a ceiling expressed in Meta minor currency units (cents in the
 * currently supported USD/CAD launch contract). Daily and lifetime ceilings
 * are intentionally independent: a lifetime total is never compared with the
 * daily ceiling.
 */
export function getMetaBudgetHardCeilingCents(
  kind: MetaBudgetKind,
  environment: Record<string, string | undefined> = process.env,
) {
  const config = BUDGET_CONFIG[kind];
  const rawValue = environment[config.environmentKey]?.trim();

  if (!rawValue) {
    if (isDefaultSafeContractPath(environment)) {
      return config.defaultCents;
    }

    throw budgetConfigurationError({
      status: 503,
      message: `${config.environmentKey} must be explicitly configured before this deployment can validate or execute Meta provider budgets.`,
      code: "meta_budget_ceiling_unconfigured",
    });
  }

  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw budgetConfigurationError({
      status: 503,
      message: `${config.environmentKey} must be a positive integer in minor currency units.`,
      code: "meta_budget_ceiling_invalid",
    });
  }

  const configured = Number(rawValue);
  if (
    !Number.isSafeInteger(configured) ||
    configured > config.absoluteMaximumCents
  ) {
    throw budgetConfigurationError({
      status: 503,
      message: `${config.environmentKey} exceeds the supported configuration range.`,
      code: "meta_budget_ceiling_invalid",
    });
  }

  return configured;
}

export function getMetaDailyBudgetHardCeilingCents(
  environment: Record<string, string | undefined> = process.env,
) {
  return getMetaBudgetHardCeilingCents("daily", environment);
}

export function getMetaLifetimeBudgetHardCeilingCents(
  environment: Record<string, string | undefined> = process.env,
) {
  return getMetaBudgetHardCeilingCents("lifetime", environment);
}

function assertMetaBudgetCents(params: {
  value: number;
  kind: MetaBudgetKind;
  label?: string;
  environment?: Record<string, string | undefined>;
}) {
  const label = params.label ?? BUDGET_CONFIG[params.kind].label;
  if (!Number.isSafeInteger(params.value) || params.value <= 0) {
    throw new ApiError(
      400,
      `${label} must be a positive integer in minor currency units.`,
      "meta_budget_invalid",
    );
  }

  const ceiling = getMetaBudgetHardCeilingCents(
    params.kind,
    params.environment ?? process.env,
  );
  if (params.value > ceiling) {
    throw new ApiError(
      400,
      `${label} exceeds the configured ${params.kind} hard ceiling of ${ceiling} cents.`,
      "meta_budget_hard_ceiling_exceeded",
    );
  }

  // Return the exact customer-approved integer. Never clamp or round it.
  return params.value;
}

export function assertCustomerApprovedMetaBudgetCents(
  value: number,
  label = "Meta daily budget",
  environment: Record<string, string | undefined> = process.env,
) {
  return assertMetaBudgetCents({ value, kind: "daily", label, environment });
}

export function assertCustomerApprovedMetaLifetimeBudgetCents(
  value: number,
  environment: Record<string, string | undefined> = process.env,
) {
  return assertMetaBudgetCents({ value, kind: "lifetime", environment });
}

export function customerApprovedMetaBudgetCentsFromDollars(
  valueInDollars: number,
  kind: MetaBudgetKind,
  environment: Record<string, string | undefined> = process.env,
) {
  if (!Number.isFinite(valueInDollars) || valueInDollars <= 0) {
    throw new ApiError(
      400,
      `Customer-approved Meta ${kind} budget is invalid.`,
      "meta_budget_invalid",
    );
  }

  const scaled = valueInDollars * 100;
  const cents = Math.round(scaled);
  const floatingPointTolerance = Math.max(
    1e-9,
    Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8,
  );
  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(scaled - cents) > floatingPointTolerance
  ) {
    throw new ApiError(
      400,
      `Customer-approved Meta ${kind} budget must use no more than two decimal places.`,
      "meta_budget_invalid",
    );
  }

  return assertMetaBudgetCents({
    value: cents,
    kind,
    label: `Customer-approved Meta ${kind} budget`,
    environment,
  });
}

export function customerApprovedMetaDailyBudgetCents(
  valueInDollars: number,
  environment: Record<string, string | undefined> = process.env,
) {
  return customerApprovedMetaBudgetCentsFromDollars(
    valueInDollars,
    "daily",
    environment,
  );
}

function validPositiveMinorUnits(value: number | null | undefined) {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

/**
 * Resolves the exact daily budget used by the direct Meta launch path.
 *
 * The canonical campaign record is the source of truth. Payload copies are
 * retained only for backwards-compatible recovery, and a valid payload copy
 * that disagrees with a valid canonical value is treated as state drift rather
 * than silently winning or being clamped.
 */
export function resolveExactCustomerApprovedMetaDailyBudgetCents(input: {
  canonicalDailyBudgetCents?: number | null;
  payloadDailyBudgetCents?: number | null;
  payloadBudgetPlanDailyBudgetCents?: number | null;
  legacyDailyBudgetDollars?: number | null;
  environment?: Record<string, string | undefined>;
}) {
  const canonical = validPositiveMinorUnits(input.canonicalDailyBudgetCents);
  const payloadCopies = [
    validPositiveMinorUnits(input.payloadDailyBudgetCents),
    validPositiveMinorUnits(input.payloadBudgetPlanDailyBudgetCents),
  ].filter((value): value is number => value !== null);

  if (canonical !== null) {
    if (payloadCopies.some((value) => value !== canonical)) {
      throw new ApiError(
        409,
        "The stored Meta daily budget disagrees with the canonical campaign budget. Rebuild the campaign before launch.",
        "meta_budget_contract_mismatch",
      );
    }

    return assertCustomerApprovedMetaBudgetCents(
      canonical,
      "Meta daily budget",
      input.environment ?? process.env,
    );
  }

  const legacyExactCents = payloadCopies[0] ?? null;
  if (legacyExactCents !== null) {
    return assertCustomerApprovedMetaBudgetCents(
      legacyExactCents,
      "Meta daily budget",
      input.environment ?? process.env,
    );
  }

  return customerApprovedMetaDailyBudgetCents(
    Number(input.legacyDailyBudgetDollars ?? 0),
    input.environment ?? process.env,
  );
}
