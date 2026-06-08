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
  return false;
}

export function assertMetaDailyBudgetCapConfiguredForLiveLaunch() {
  if (!isMetaDailyBudgetCapRequiredForProductionLaunch()) {
    return;
  }

  return;
}

export function applyMetaDailyBudgetCapCents(valueCents: number) {
  const capCents = getMetaDailyBudgetCapCents();

  if (capCents === null) {
    return valueCents;
  }

  return Math.min(valueCents, capCents);
}
