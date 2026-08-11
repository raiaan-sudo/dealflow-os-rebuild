import assert from "node:assert/strict";
import {
  KPI_SEMANTIC_CONTRACT,
  KPI_SEMANTIC_VERSION,
  canKpiContractPowerDashboard,
  getKpiSemanticDefinition,
  getKpiPresentationState,
  listUnconfiguredKpiOwnerDecisions,
  type KpiKey,
} from "../src/lib/analytics/kpi-semantic-contract";

const expectedKeys: KpiKey[] = [
  "activation",
  "first_launch",
  "first_lead",
  "qualified_lead",
  "meaningful_conversation",
  "time_to_value",
  "mrr",
  "gross_revenue_retention",
  "net_revenue_retention",
  "logo_churn",
  "revenue_churn",
  "lead_quality",
  "provider_cost",
];

assert.match(KPI_SEMANTIC_VERSION, /^dealflow-kpi\/\d+\.\d+\.\d+-candidate\.\d+$/);
assert.equal(KPI_SEMANTIC_CONTRACT.status, "candidate_not_effective");
assert.equal(KPI_SEMANTIC_CONTRACT.effectiveAt, null);
assert.equal(KPI_SEMANTIC_CONTRACT.dashboardAuthority, false);
assert.equal(KPI_SEMANTIC_CONTRACT.ownerApproval.state, "unconfigured_owner_decision");
assert.equal(KPI_SEMANTIC_CONTRACT.ownerApproval.evidenceReference, null);
assert.equal(canKpiContractPowerDashboard(), false);
for (const state of [
  { instrumentationState: "implemented" as const, observationAvailable: true, observationFresh: true, refreshFailed: false },
  { instrumentationState: "partial" as const, observationAvailable: true, observationFresh: true, refreshFailed: false },
  { instrumentationState: "implemented" as const, observationAvailable: true, observationFresh: false, refreshFailed: false },
  { instrumentationState: "implemented" as const, observationAvailable: true, observationFresh: true, refreshFailed: true },
  { instrumentationState: "missing" as const, observationAvailable: false, observationFresh: false, refreshFailed: true },
]) {
  assert.equal(
    getKpiPresentationState(state),
    "unavailable",
    "an unsigned candidate KPI contract must never present current business truth",
  );
}

assert.deepEqual(
  KPI_SEMANTIC_CONTRACT.definitions.map(({ key }) => key),
  expectedKeys,
  "the semantic contract must cover every required KPI exactly once and in a stable order",
);
assert.equal(new Set(expectedKeys).size, KPI_SEMANTIC_CONTRACT.definitions.length);

for (const definition of KPI_SEMANTIC_CONTRACT.definitions) {
  assert.equal(definition.semanticVersion, KPI_SEMANTIC_VERSION);
  assert.equal(definition.timezone, "UTC");
  assert.ok(definition.sourceOfRecord.length > 0, `${definition.key} requires an explicit source boundary`);
  assert.ok(definition.grain.trim().length > 0, `${definition.key} requires a grain`);
  assert.ok(definition.tenantScope.trim().length > 0, `${definition.key} requires tenant scope`);
  assert.match(definition.exclusions, /synthetic|test/i, `${definition.key} must address synthetic/test exclusion`);
  assert.equal(
    definition.target.state,
    "unconfigured_owner_decision",
    `${definition.key} must not manufacture a target before owner approval`,
  );
  assert.equal(definition.target.value, null, `${definition.key} target must remain null`);
  assert.ok(definition.target.ownerDecisionRequired);

  if (definition.definition.state === "unconfigured_owner_decision") {
    assert.equal(definition.definition.value, null, `${definition.key} unconfigured definition must not carry a value`);
    assert.ok(definition.definition.ownerDecisionRequired);
  }

  if (definition.formula.state === "unconfigured_owner_decision") {
    assert.equal(definition.formula.expression, null, `${definition.key} unconfigured formula must not carry an expression`);
    assert.equal(definition.formula.numerator, null, `${definition.key} unconfigured formula must not carry a numerator`);
    assert.equal(definition.formula.denominator, null, `${definition.key} unconfigured formula must not carry a denominator`);
    assert.ok(definition.formula.ownerDecisionRequired);
  }
}

const configuredDefinitions = KPI_SEMANTIC_CONTRACT.definitions
  .filter(({ definition }) => definition.state === "configured_by_product_contract")
  .map(({ key }) => key);
assert.deepEqual(configuredDefinitions, ["activation", "first_launch", "first_lead", "provider_cost"]);

const configuredFormulas = KPI_SEMANTIC_CONTRACT.definitions
  .filter(({ formula }) => formula.state === "configured_by_product_contract")
  .map(({ key }) => key);
assert.deepEqual(configuredFormulas, ["activation", "first_launch", "first_lead"]);

const activation = getKpiSemanticDefinition("activation");
assert.equal(activation.sourceOfRecord[0]?.relation, "public.commercial_activations");
assert.match(activation.definition.value ?? "", /recognized positive Stripe payment/i);
assert.match(activation.formula.expression ?? "", /COUNT\(DISTINCT organization_id\)/);

const firstLaunch = getKpiSemanticDefinition("first_launch");
assert.equal(firstLaunch.sourceOfRecord[0]?.relation, "public.campaign_launch_records");
assert.match(firstLaunch.formula.expression ?? "", /result_status='success'/);

const firstLead = getKpiSemanticDefinition("first_lead");
assert.equal(firstLead.sourceOfRecord[0]?.relation, "public.leads");
assert.match(firstLead.definition.value ?? "", /durably persisted/i);

const ownerDefinedKeys: KpiKey[] = [
  "qualified_lead",
  "meaningful_conversation",
  "time_to_value",
  "mrr",
  "gross_revenue_retention",
  "net_revenue_retention",
  "logo_churn",
  "revenue_churn",
  "lead_quality",
];
for (const key of ownerDefinedKeys) {
  const definition = getKpiSemanticDefinition(key);
  assert.equal(definition.definition.state, "unconfigured_owner_decision");
  assert.equal(definition.formula.state, "unconfigured_owner_decision");
  assert.equal(definition.outcomeMaturity === "event_available", false);
}

for (const key of ["gross_revenue_retention", "net_revenue_retention", "logo_churn", "revenue_churn"] as const) {
  assert.equal(getKpiSemanticDefinition(key).outcomeMaturity, "requires_mature_cohort");
}

const providerCost = getKpiSemanticDefinition("provider_cost");
assert.equal(providerCost.definition.state, "configured_by_product_contract");
assert.equal(providerCost.formula.state, "unconfigured_owner_decision");
assert.equal(providerCost.currencyAndFxTreatment.state, "unconfigured_owner_decision");
assert.equal(providerCost.sourceOfRecord[1]?.role, "authoritative_external_provider");

const openDecisions = listUnconfiguredKpiOwnerDecisions();
assert.ok(openDecisions.length >= expectedKeys.length, "every KPI must retain at least its target decision");
assert.ok(openDecisions.every(({ decision }) => typeof decision === "string" && decision.length > 0));

console.log(
  `KPI semantic truth contract: PASS (${KPI_SEMANTIC_CONTRACT.definitions.length} versioned definitions, ${openDecisions.length} explicit owner decisions, dashboard authority=false)`,
);
