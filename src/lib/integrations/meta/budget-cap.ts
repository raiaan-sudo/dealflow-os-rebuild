export function getMetaDailyBudgetCapCents() {
  const raw = process.env.META_DAILY_BUDGET_CAP_CENTS?.trim();

  if (!raw || /^(0|none|off|unlimited)$/i.test(raw)) {
    return null;
  }

  const configuredCap = Number(raw);
  return Number.isFinite(configuredCap) && configuredCap > 0
    ? Math.floor(configuredCap)
    : null;
}

export function isMetaDailyBudgetCapRequiredForProductionLaunch() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_META_LIVE_LAUNCH === "true"
  );
}

export function assertMetaDailyBudgetCapConfiguredForLiveLaunch() {
  if (!isMetaDailyBudgetCapRequiredForProductionLaunch()) {
    return;
  }

  if (getMetaDailyBudgetCapCents() === null) {
    throw new Error("META_DAILY_BUDGET_CAP_CENTS must be finite before production Meta launch approval can create paused objects.");
  }
}

export function applyMetaDailyBudgetCapCents(valueCents: number) {
  const capCents = getMetaDailyBudgetCapCents();

  if (capCents === null) {
    return valueCents;
  }

  return Math.min(valueCents, capCents);
}
