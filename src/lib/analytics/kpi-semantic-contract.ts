export const KPI_SEMANTIC_VERSION = "dealflow-kpi/1.0.0-candidate.1" as const;

export type KpiKey =
  | "activation"
  | "first_launch"
  | "first_lead"
  | "qualified_lead"
  | "meaningful_conversation"
  | "time_to_value"
  | "mrr"
  | "gross_revenue_retention"
  | "net_revenue_retention"
  | "logo_churn"
  | "revenue_churn"
  | "lead_quality"
  | "provider_cost";

export type SemanticConfigurationState =
  | "configured_by_product_contract"
  | "unconfigured_owner_decision"
  | "not_applicable";

export type InstrumentationState = "implemented" | "partial" | "missing";

type SemanticValue = {
  state: SemanticConfigurationState;
  value: string | null;
  ownerDecisionRequired: string | null;
};

type FormulaDefinition = {
  state: SemanticConfigurationState;
  expression: string | null;
  numerator: string | null;
  denominator: string | null;
  ownerDecisionRequired: string | null;
};

type SourceOfRecord = {
  system: string;
  relation: string;
  role:
    | "authoritative_application_ledger"
    | "authoritative_external_provider"
    | "supporting_projection"
    | "candidate_input_only";
};

export type KpiSemanticDefinition = {
  key: KpiKey;
  label: string;
  semanticVersion: typeof KPI_SEMANTIC_VERSION;
  definition: SemanticValue;
  formula: FormulaDefinition;
  target: SemanticValue;
  sourceOfRecord: readonly SourceOfRecord[];
  grain: string;
  eventTimestamp: string | null;
  timezone: "UTC";
  eligibility: string;
  exclusions: string;
  dedupeKey: string | null;
  attributionWindow: SemanticValue;
  currencyAndFxTreatment: SemanticValue;
  refundAndDisputeTreatment: SemanticValue;
  freshness: SemanticValue;
  measurementWindow: SemanticValue;
  lateEventAndRestatementPolicy: SemanticValue;
  tenantScope: string;
  instrumentationState: InstrumentationState;
  instrumentationGap: string | null;
  outcomeMaturity: "event_available" | "requires_mature_cohort" | "not_measurable";
};

const UNCONFIGURED_TARGET = {
  state: "unconfigured_owner_decision",
  value: null,
  ownerDecisionRequired: "Owner must approve a target and evaluation window before any target or score is displayed.",
} as const;

const NOT_APPLICABLE = {
  state: "not_applicable",
  value: null,
  ownerDecisionRequired: null,
} as const;

const UNCONFIGURED_WINDOW = {
  state: "unconfigured_owner_decision",
  value: null,
  ownerDecisionRequired: "Owner must approve the measurement window.",
} as const;

const UNCONFIGURED_FRESHNESS = {
  state: "unconfigured_owner_decision",
  value: null,
  ownerDecisionRequired: "Owner must approve the freshness objective and stale-data behavior.",
} as const;

const UNCONFIGURED_RESTATEMENT = {
  state: "unconfigured_owner_decision",
  value: null,
  ownerDecisionRequired: "Owner must approve the late-event, backfill, and restatement policy.",
} as const;

const UNCONFIGURED_FORMULA = (decision: string): FormulaDefinition => ({
  state: "unconfigured_owner_decision",
  expression: null,
  numerator: null,
  denominator: null,
  ownerDecisionRequired: decision,
});

const EVENT_ATTRIBUTION = {
  state: "configured_by_product_contract",
  value: "Attribute the event to the exact organization_id carried by its authoritative application row.",
  ownerDecisionRequired: null,
} as const;

const CURRENT_ENTITLEMENT_NOTE = {
  state: "configured_by_product_contract",
  value:
    "Refunds and disputes do not rewrite the immutable first-activation fact; current entitlement and revenue metrics must reflect their own authoritative Stripe state.",
  ownerDecisionRequired: null,
} as const;

export const KPI_SEMANTIC_CONTRACT = {
  semanticVersion: KPI_SEMANTIC_VERSION,
  authoredOn: "2026-07-16",
  status: "candidate_not_effective",
  effectiveAt: null,
  ownerApproval: {
    state: "unconfigured_owner_decision",
    evidenceReference: null,
  },
  dashboardAuthority: false,
  reportingRule:
    "This candidate contract cannot power business-success, target, or cohort claims until its owner-controlled fields are signed and effectiveAt is set.",
  syntheticDataRule:
    "Server-marked synthetic, staging, QA, demo, and canary records must be excluded at ingestion, aggregation, UI, and export. Universal enforcement is not yet proven.",
  definitions: [
    {
      key: "activation",
      label: "Paid activation",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "configured_by_product_contract",
        value:
          "A workspace activates once, when its first recognized positive Stripe payment is projected into the immutable commercial activation ledger.",
        ownerDecisionRequired: null,
      },
      formula: {
        state: "configured_by_product_contract",
        expression: "COUNT(DISTINCT organization_id) from eligible public.commercial_activations rows",
        numerator: "Distinct activated organization_id values",
        denominator: null,
        ownerDecisionRequired: null,
      },
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        {
          system: "DealFlow",
          relation: "public.commercial_activations",
          role: "authoritative_application_ledger",
        },
        {
          system: "Stripe",
          relation: "recognized positive payment event",
          role: "authoritative_external_provider",
        },
      ],
      grain: "one immutable first activation per organization",
      eventTimestamp: "public.commercial_activations.activated_at",
      timezone: "UTC",
      eligibility:
        "amount_paid_cents > 0 and source_event_type is accepted by the commercial activation contract",
      exclusions: "nonpositive, unrecognized, synthetic, staging, QA, demo, and canary payments",
      dedupeKey: "organization_id plus unique (source_provider, source_event_id)",
      attributionWindow: EVENT_ATTRIBUTION,
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: CURRENT_ENTITLEMENT_NOTE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact child organization; partner payer identity does not merge child activation",
      instrumentationState: "partial",
      instrumentationGap:
        "The activation ledger exists, but universal synthetic-record exclusion and production reconciliation are not proven by this contract.",
      outcomeMaturity: "event_available",
    },
    {
      key: "first_launch",
      label: "First successful launch",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "configured_by_product_contract",
        value:
          "The earliest durable campaign launch record with result_status='success' for an activated organization. A schedule request or browser navigation is not a launch.",
        ownerDecisionRequired: null,
      },
      formula: {
        state: "configured_by_product_contract",
        expression:
          "MIN(campaign_launch_records.created_at) per organization_id where result_status='success' and activation eligibility is satisfied",
        numerator: "Distinct activated organizations with an eligible first successful launch",
        denominator: null,
        ownerDecisionRequired: null,
      },
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        {
          system: "DealFlow",
          relation: "public.campaign_launch_records",
          role: "authoritative_application_ledger",
        },
      ],
      grain: "one first successful launch timestamp per organization",
      eventTimestamp: "public.campaign_launch_records.created_at",
      timezone: "UTC",
      eligibility: "activated organization and result_status='success'",
      exclusions: "scheduled, processing, partial, failed, uncertain, operator-required, synthetic, and test rows",
      dedupeKey: "organization_id plus idempotency_key; select the earliest eligible row",
      attributionWindow: EVENT_ATTRIBUTION,
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact organization_id on the launch receipt",
      instrumentationState: "partial",
      instrumentationGap:
        "The receipt exists, but universal synthetic exclusion and provider-to-receipt reconciliation are not proven by this contract.",
      outcomeMaturity: "event_available",
    },
    {
      key: "first_lead",
      label: "First persisted lead",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "configured_by_product_contract",
        value:
          "The earliest deduplicated, durably persisted, nonsynthetic lead owned by an activated organization. A pixel event or provider callback alone is not a lead.",
        ownerDecisionRequired: null,
      },
      formula: {
        state: "configured_by_product_contract",
        expression: "MIN(leads.created_at) per eligible organization_id after durable lead persistence and deduplication",
        numerator: "Distinct activated organizations with at least one eligible persisted lead",
        denominator: null,
        ownerDecisionRequired: null,
      },
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.leads", role: "authoritative_application_ledger" },
      ],
      grain: "one first-lead timestamp per organization",
      eventTimestamp: "public.leads.created_at",
      timezone: "UTC",
      eligibility: "durably persisted lead that passed the canonical ingestion dedupe boundary",
      exclusions: "synthetic, staging, QA, demo, canary, rejected, and duplicate submissions",
      dedupeKey: "canonical lead persistence identity; never raw page-view or pixel-event count",
      attributionWindow: EVENT_ATTRIBUTION,
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact organization_id on the persisted lead",
      instrumentationState: "partial",
      instrumentationGap:
        "The lead ledger exists, but one universal synthetic marker and a signed backfill/restatement policy are not proven.",
      outcomeMaturity: "event_available",
    },
    {
      key: "qualified_lead",
      label: "Qualified lead",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired:
          "Owner must approve the exact qualification fields, thresholds, human/provider precedence, disqualification rules, and semantic version.",
      },
      formula: UNCONFIGURED_FORMULA("Qualification cannot be counted until its definition and precedence rules are signed."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.leads", role: "candidate_input_only" },
      ],
      grain: "intended one current qualification outcome per deduplicated lead",
      eventTimestamp: null,
      timezone: "UTC",
      eligibility: "unconfigured",
      exclusions: "synthetic/test exclusion required; all other exclusions unconfigured",
      dedupeKey: null,
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision", ownerDecisionRequired: "Owner must approve attribution." },
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact lead organization; cross-tenant pooling prohibited",
      instrumentationState: "partial",
      instrumentationGap: "Lead status exists, but it is not an owner-approved KPI definition or immutable qualification history.",
      outcomeMaturity: "not_measurable",
    },
    {
      key: "meaningful_conversation",
      label: "Meaningful conversation",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired:
          "Owner must define message direction, minimum human engagement, channel coverage, bot-message treatment, and qualification/booking relationship.",
      },
      formula: UNCONFIGURED_FORMULA("Conversation quality cannot be inferred from message count."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.lead_messages", role: "candidate_input_only" },
        { system: "GHL", relation: "conversation/message history", role: "authoritative_external_provider" },
      ],
      grain: "intended one semantic conversation outcome per lead and approved window",
      eventTimestamp: null,
      timezone: "UTC",
      eligibility: "unconfigured",
      exclusions: "automated-only, synthetic, test, spam, and opt-out traffic must be addressed by signed policy",
      dedupeKey: null,
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision", ownerDecisionRequired: "Owner must approve the conversation window." },
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact lead organization and provider location",
      instrumentationState: "missing",
      instrumentationGap: "Messages are recorded, but no signed meaningful-conversation classifier or durable semantic outcome exists.",
      outcomeMaturity: "not_measurable",
    },
    {
      key: "time_to_value",
      label: "Time to value",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired:
          "Owner must select the value milestone: first launch, first lead, qualified lead, meaningful conversation, or another signed event.",
      },
      formula: UNCONFIGURED_FORMULA("Start is paid activation; the terminal value milestone remains unsigned."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.commercial_activations", role: "authoritative_application_ledger" },
        { system: "DealFlow", relation: "selected value-event ledger", role: "candidate_input_only" },
      ],
      grain: "intended one elapsed duration per activated organization",
      eventTimestamp: null,
      timezone: "UTC",
      eligibility: "paid activation is configured; terminal value eligibility is unconfigured",
      exclusions: "synthetic/test and owner-approved censoring rules required",
      dedupeKey: "organization_id once terminal milestone is approved",
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision", ownerDecisionRequired: "Owner must approve censoring and attribution window." },
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: CURRENT_ENTITLEMENT_NOTE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact child organization",
      instrumentationState: "missing",
      instrumentationGap: "No owner-approved terminal value event or durable time-to-value projection exists.",
      outcomeMaturity: "not_measurable",
    },
    {
      key: "mrr",
      label: "Monthly recurring revenue",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired:
          "Owner/finance must approve subscription status, cadence normalization, discounts, tax, credits, currency/FX, refunds, disputes, delinquency, and partner-payer treatment.",
      },
      formula: UNCONFIGURED_FORMULA("A billing status row alone is not an approved MRR formula."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "Stripe", relation: "subscriptions and invoices", role: "authoritative_external_provider" },
        { system: "DealFlow", relation: "public.billing_subscriptions", role: "supporting_projection" },
        { system: "DealFlow", relation: "public.stripe_webhook_events", role: "supporting_projection" },
      ],
      grain: "intended organization-month in approved reporting currency",
      eventTimestamp: null,
      timezone: "UTC",
      eligibility: "unconfigured",
      exclusions: "synthetic/test and owner/finance-approved revenue exclusions required",
      dedupeKey: null,
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision", ownerDecisionRequired: "Owner/finance must approve revenue attribution." },
      currencyAndFxTreatment: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired: "Owner/finance must approve reporting currency, FX source, and rate date.",
      },
      refundAndDisputeTreatment: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired: "Owner/finance must approve refund, dispute, chargeback, and delinquency treatment.",
      },
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact child organization even when a partner is payer",
      instrumentationState: "missing",
      instrumentationGap: "No signed revenue semantic projection or reconciliation job exists.",
      outcomeMaturity: "not_measurable",
    },
    ...([
      ["gross_revenue_retention", "Gross revenue retention"],
      ["net_revenue_retention", "Net revenue retention"],
      ["logo_churn", "Logo churn"],
      ["revenue_churn", "Revenue churn"],
    ] as const).map(([key, label]) => ({
      key,
      label,
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision" as const,
        value: null,
        ownerDecisionRequired:
          "Owner/finance must approve cohort eligibility, start/end states, expansion/contraction, cancellation, grace, reactivation, refund/dispute, and currency treatment.",
      },
      formula: UNCONFIGURED_FORMULA("Retention and churn formulas remain inactive until owner/finance approval."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "Stripe", relation: "subscriptions and invoices", role: "authoritative_external_provider" as const },
        { system: "DealFlow", relation: "public.billing_subscriptions", role: "supporting_projection" as const },
      ],
      grain: "intended owner-approved subscription cohort and measurement window",
      eventTimestamp: null,
      timezone: "UTC" as const,
      eligibility: "unconfigured",
      exclusions: "synthetic/test and owner/finance-approved cohort exclusions required",
      dedupeKey: null,
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision" as const, ownerDecisionRequired: "Owner/finance must approve cohort attribution." },
      currencyAndFxTreatment: {
        state: "unconfigured_owner_decision" as const,
        value: null,
        ownerDecisionRequired: "Owner/finance must approve reporting currency and FX policy.",
      },
      refundAndDisputeTreatment: {
        state: "unconfigured_owner_decision" as const,
        value: null,
        ownerDecisionRequired: "Owner/finance must approve refund, dispute, chargeback, grace, and reactivation treatment.",
      },
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact child organization; partner payer does not collapse child cohorts",
      instrumentationState: "missing" as const,
      instrumentationGap: "No signed cohort semantic projection, reconciler, or mature-cohort result exists.",
      outcomeMaturity: "requires_mature_cohort" as const,
    })),
    {
      key: "lead_quality",
      label: "Lead quality",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired:
          "Owner must approve the outcome labels, component signals, weights/thresholds, human override, attribution window, and model/version governance.",
      },
      formula: UNCONFIGURED_FORMULA("Lead quality cannot be inferred from a fabricated composite score."),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.leads", role: "candidate_input_only" },
        { system: "DealFlow", relation: "public.lead_messages", role: "candidate_input_only" },
        { system: "GHL", relation: "approved CRM outcome fields", role: "authoritative_external_provider" },
      ],
      grain: "intended one versioned quality outcome per deduplicated lead",
      eventTimestamp: null,
      timezone: "UTC",
      eligibility: "unconfigured",
      exclusions: "synthetic/test, spam, duplicates, and owner-approved invalid lead classes required",
      dedupeKey: null,
      attributionWindow: { ...NOT_APPLICABLE, state: "unconfigured_owner_decision", ownerDecisionRequired: "Owner must approve lead-outcome attribution." },
      currencyAndFxTreatment: NOT_APPLICABLE,
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact lead organization and semantic version; no cross-advertiser training aggregate without authority",
      instrumentationState: "missing",
      instrumentationGap: "No owner-approved durable quality outcome or model/version receipt exists.",
      outcomeMaturity: "not_measurable",
    },
    {
      key: "provider_cost",
      label: "Provider cost",
      semanticVersion: KPI_SEMANTIC_VERSION,
      definition: {
        state: "configured_by_product_contract",
        value:
          "Settled provider cost attributable to an exact tenant, operation, and idempotent provider effect; reservations and estimates are not actual cost.",
        ownerDecisionRequired: null,
      },
      formula: UNCONFIGURED_FORMULA(
        "The ledger lacks a complete currency/FX and provider-invoice reconciliation contract, so actual costs cannot yet be safely summed.",
      ),
      target: UNCONFIGURED_TARGET,
      sourceOfRecord: [
        { system: "DealFlow", relation: "public.provider_usage_events", role: "supporting_projection" },
        { system: "Provider", relation: "invoice or usage export", role: "authoritative_external_provider" },
      ],
      grain: "provider operation per organization, idempotency key, and settlement currency",
      eventTimestamp: "public.provider_usage_events.updated_at after status='consumed'",
      timezone: "UTC",
      eligibility: "status='consumed' with reconciled actual_cost and approved currency metadata",
      exclusions: "reserved, released, failed, estimated-only, synthetic, test, QA, demo, and canary usage",
      dedupeKey: "organization_id, provider, operation, idempotency_key, usage_date",
      attributionWindow: EVENT_ATTRIBUTION,
      currencyAndFxTreatment: {
        state: "unconfigured_owner_decision",
        value: null,
        ownerDecisionRequired: "Owner/finance must approve provider currency, reporting currency, FX source, and rate date.",
      },
      refundAndDisputeTreatment: NOT_APPLICABLE,
      freshness: UNCONFIGURED_FRESHNESS,
      measurementWindow: UNCONFIGURED_WINDOW,
      lateEventAndRestatementPolicy: UNCONFIGURED_RESTATEMENT,
      tenantScope: "exact organization/user/campaign scope carried by the usage event",
      instrumentationState: "partial",
      instrumentationGap:
        "Usage reservations exist, but settled currency, invoice reconciliation, and universal synthetic exclusion are incomplete.",
      outcomeMaturity: "not_measurable",
    },
  ],
} as const satisfies {
  semanticVersion: typeof KPI_SEMANTIC_VERSION;
  authoredOn: string;
  status: "candidate_not_effective";
  effectiveAt: null;
  ownerApproval: { state: "unconfigured_owner_decision"; evidenceReference: null };
  dashboardAuthority: false;
  reportingRule: string;
  syntheticDataRule: string;
  definitions: readonly KpiSemanticDefinition[];
};

export function getKpiSemanticDefinition(key: KpiKey): KpiSemanticDefinition {
  const definition = KPI_SEMANTIC_CONTRACT.definitions.find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error(`Unknown KPI semantic key: ${key}`);
  }

  return definition;
}

export function listUnconfiguredKpiOwnerDecisions() {
  return KPI_SEMANTIC_CONTRACT.definitions.flatMap((definition) => {
    const decisions = [
      ["definition", definition.definition],
      ["formula", definition.formula],
      ["target", definition.target],
      ["attributionWindow", definition.attributionWindow],
      ["currencyAndFxTreatment", definition.currencyAndFxTreatment],
      ["refundAndDisputeTreatment", definition.refundAndDisputeTreatment],
      ["freshness", definition.freshness],
      ["measurementWindow", definition.measurementWindow],
      ["lateEventAndRestatementPolicy", definition.lateEventAndRestatementPolicy],
    ] as const;

    return decisions.flatMap(([field, value]) =>
      value.state === "unconfigured_owner_decision"
        ? [{ key: definition.key, field, decision: value.ownerDecisionRequired }]
        : [],
    );
  });
}

export function canKpiContractPowerDashboard(): boolean {
  const authorityState: {
    dashboardAuthority: boolean;
    effectiveAt: string | null;
    ownerApproval: { state: SemanticConfigurationState };
  } = KPI_SEMANTIC_CONTRACT;

  return (
    authorityState.dashboardAuthority &&
    authorityState.effectiveAt !== null &&
    authorityState.ownerApproval.state !== "unconfigured_owner_decision"
  );
}
