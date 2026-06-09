export function getMetaDailyBudgetCapCents() {
  return null;
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
  return valueCents;
}
