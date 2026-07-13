import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const requireFromRepo = createRequire(import.meta.url);
const checks = [];

function loadTypeScriptModule(relativePath, mockedImports = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });
  const loadedModule = { exports: {} };
  const evaluate = new Function("require", "module", "exports", compiled.outputText);
  evaluate(
    (specifier) => mockedImports[specifier] ?? requireFromRepo(specifier),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

function check(name, operation) {
  operation();
  checks.push(name);
}

const onboarding = loadTypeScriptModule("src/lib/onboarding-contract.ts");
const activation = loadTypeScriptModule("src/lib/commercial-activation-policy.ts");
const billingPlans = loadTypeScriptModule("src/lib/billing/plans.ts");
const stripePlanResolution = loadTypeScriptModule(
  "src/lib/billing/stripe-plan-resolution.ts",
  { "@/lib/billing/plans": billingPlans },
);

const draft = {
  agentFirstName: "Jane",
  agentLastName: "Smith",
  agentCompanyName: "Smith Realty Group",
  agentPhone: "+14165550123",
  campaignMode: "buyer",
  market: "Toronto, ON",
  audience: "Move-ready buyers comparing family homes",
  propertyType: "Single Family Homes",
  priceRange: "$600k-$900k",
  dailyBudget: "30",
  offer: "Private listings and a buyer strategy call",
  funnelLanguage: "en",
  leadCaptureMode: "quality_funnel",
  leadFormQuestions: ["When are you hoping to move?"],
  leadFormQuestionDraft: "",
  themePrimaryColor: "#17212c",
  themeSecondaryColor: "#f3eee5",
  themeAccentColor: "#f59e42",
  logoUrl: "https://example.com/logo.png",
  planTier: "pro",
  idempotencySeed: "fixture-onboarding-1",
};

check("every material draft field propagates through the shared submission builder", () => {
  const submission = onboarding.buildOnboardingSubmission(draft);
  for (const [key, value] of Object.entries(draft)) {
    assert.deepEqual(submission[key], value, `${key} did not propagate`);
  }
  assert.equal(submission.businessType, "real_estate_realtor");
  assert.equal(submission.dailyBudgetCents, 3_000);
  assert.equal(submission.monthlyBudget, 900);
});

check("unknown fields are rejected instead of silently ignored", () => {
  const submission = onboarding.buildOnboardingSubmission(draft);
  assert.equal(
    onboarding.onboardingSubmissionSchema.safeParse({ ...submission, silentlyDropped: true }).success,
    false,
  );
});

check("non-realtor industry payloads are rejected", () => {
  const submission = onboarding.buildOnboardingSubmission(draft);
  assert.equal(
    onboarding.onboardingSubmissionSchema.safeParse({ ...submission, businessType: "generic_business" }).success,
    false,
  );
});

check("derived budget disagreement is rejected", () => {
  const submission = onboarding.buildOnboardingSubmission(draft);
  assert.equal(
    onboarding.onboardingSubmissionSchema.safeParse({ ...submission, dailyBudgetCents: 1 }).success,
    false,
  );
});

check("server draft envelope round-trips every draft field", () => {
  const envelope = onboarding.buildOnboardingDraftEnvelope({
    draft,
    currentStep: "review",
    furthestStepIndex: 9,
  });
  assert.deepEqual(envelope.draft, draft);
  assert.equal(envelope.currentStep, "review");
});

check("navigation pointers expire deterministically", () => {
  const now = Date.now();
  assert.equal(
    onboarding.isUnexpiredNavigationState({
      idempotencySeed: "seed",
      currentStep: "market",
      furthestStepIndex: 1,
      expiresAt: now + 1,
    }, now),
    true,
  );
  assert.equal(
    onboarding.isUnexpiredNavigationState({
      idempotencySeed: "seed",
      currentStep: "market",
      furthestStepIndex: 1,
      expiresAt: now,
    }, now),
    false,
  );
});

const initialCheckout = {
  source: "checkout.session.completed",
  billingStateApplied: true,
  organizationId: "org-1",
  userId: "user-1",
  sourceEventId: "evt-initial",
  sourceEventCreated: 100,
  amountPaidCents: 29_700,
  paymentStatus: "paid",
  invoiceBillingReason: null,
};

check("first applied paid checkout activates once and grants exactly $10", () => {
  const decision = activation.evaluateCommercialActivationCandidate(initialCheckout);
  assert.deepEqual(decision, { eligible: true, reason: "qualifying_initial_payment" });
  const result = activation.applyCommercialActivationDecision(
    { activated: false, creditBalanceCents: 0 },
    decision,
  );
  assert.equal(result.activationCreated, true);
  assert.equal(result.initialCreditGrantedCents, 1_000);
  assert.equal(result.creditBalanceCents, 1_000);
});

check("duplicate and resubscription-shaped initial events cannot regrant", () => {
  const decision = activation.evaluateCommercialActivationCandidate(initialCheckout);
  const result = activation.applyCommercialActivationDecision(
    { activated: true, creditBalanceCents: 0 },
    decision,
  );
  assert.equal(result.activationCreated, false);
  assert.equal(result.initialCreditGrantedCents, 0);
  assert.equal(result.creditBalanceCents, 0);
});

check("subscription reconnect events are not qualifying payment sources", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({
      ...initialCheckout,
      source: "customer.subscription.updated",
    }),
    { eligible: false, reason: "source_not_qualifying" },
  );
});

check("an unverified out-of-order billing event cannot activate", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({
      ...initialCheckout,
      billingStateApplied: false,
    }),
    { eligible: false, reason: "billing_state_not_applied" },
  );
});

check("renewal invoices cannot activate or grant", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({
      ...initialCheckout,
      source: "invoice.payment_succeeded",
      paymentStatus: "paid",
      invoiceBillingReason: "subscription_cycle",
    }),
    { eligible: false, reason: "invoice_not_initial" },
  );
});

check("only a paid initial-subscription invoice qualifies", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({
      ...initialCheckout,
      source: "invoice.payment_succeeded",
      paymentStatus: "paid",
      invoiceBillingReason: "subscription_create",
    }),
    { eligible: true, reason: "qualifying_initial_payment" },
  );
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({
      ...initialCheckout,
      source: "invoice.payment_succeeded",
      paymentStatus: null,
      invoiceBillingReason: "subscription_create",
    }),
    { eligible: false, reason: "invoice_not_paid" },
  );
});

check("zero-dollar and unpaid events cannot activate", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({ ...initialCheckout, amountPaidCents: 0 }),
    { eligible: false, reason: "payment_not_positive" },
  );
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({ ...initialCheckout, paymentStatus: "unpaid" }),
    { eligible: false, reason: "checkout_not_paid" },
  );
});

check("qualifying payments without a durable user identity are blocked", () => {
  assert.deepEqual(
    activation.evaluateCommercialActivationCandidate({ ...initialCheckout, userId: null }),
    { eligible: false, reason: "identity_missing" },
  );
});

const configuredPriceIds = {
  starter: "price_starter_current",
  pro: "price_pro_current",
  growth: "price_growth_current",
};

check("Pro is the only current acquisition price and legacy prices require explicit authority", () => {
  assert.deepEqual(
    stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [{ priceId: configuredPriceIds.starter, quantity: 1 }],
      configuredPriceIds,
      metadataPlanTier: "pro",
    }),
    { ok: false, reason: "legacy_tier_authority_missing" },
  );
  assert.deepEqual(
    stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [{ priceId: configuredPriceIds.starter, quantity: 1 }],
      configuredPriceIds,
      metadataPlanTier: "starter",
      legacyTierReconciled: true,
    }),
    {
      ok: true,
      planTier: "starter",
      priceId: configuredPriceIds.starter,
      itemIndex: 0,
      source: "legacy_reconciled_metadata",
    },
  );
  assert.equal(
    stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [{ priceId: configuredPriceIds.pro, quantity: 1 }],
      configuredPriceIds,
      metadataPlanTier: "starter",
    }).planTier,
    "pro",
  );
});

check("unknown, duplicate-config, and multi-item Stripe tiers fail closed", () => {
  const unknownResolution = stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [{ priceId: "price_unknown", quantity: 1 }],
      configuredPriceIds,
      metadataPlanTier: "growth",
    });
  assert.deepEqual(
    unknownResolution,
    { ok: false, reason: "subscription_price_unknown" },
  );
  const multiItemResolution = stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [
        { priceId: configuredPriceIds.pro, quantity: 1 },
        { priceId: configuredPriceIds.starter, quantity: 1 },
      ],
      configuredPriceIds,
      metadataPlanTier: "pro",
    });
  assert.deepEqual(
    multiItemResolution,
    { ok: false, reason: "subscription_item_ambiguous" },
  );
  assert.deepEqual(
    stripePlanResolution.resolveStripeSubscriptionPlanTier({
      items: [{ priceId: configuredPriceIds.pro, quantity: 1 }],
      configuredPriceIds: {
        ...configuredPriceIds,
        growth: configuredPriceIds.pro,
      },
      metadataPlanTier: "pro",
    }),
    { ok: false, reason: "configured_price_ambiguous" },
  );
  assert.deepEqual(
    stripePlanResolution.getStripeSubscriptionPersistenceDecision({
      resolution: unknownResolution,
      authoritativeStatus: "active",
    }),
    {
      planTier: "starter",
      status: "operator_action_required",
      operatorReconciliationReason: "subscription_price_unknown",
    },
    "an authoritative active event with an unknown price must replace stale Pro access",
  );
  assert.deepEqual(
    stripePlanResolution.getStripeSubscriptionPersistenceDecision({
      resolution: multiItemResolution,
      authoritativeStatus: "active",
    }),
    {
      planTier: "starter",
      status: "operator_action_required",
      operatorReconciliationReason: "subscription_item_ambiguous",
    },
    "an authoritative multi-item event must replace stale Pro access",
  );
});

check("Stripe metadata fallback requires an explicit legacy reconciliation marker", () => {
  const resolution = stripePlanResolution.resolveStripeSubscriptionPlanTier({
    items: [{ priceId: "price_legacy", quantity: 1 }],
    configuredPriceIds,
    metadataPlanTier: "growth",
    legacyTierReconciled: true,
  });
  assert.equal(resolution.ok, true);
  assert.equal(resolution.planTier, "growth");
  assert.equal(resolution.source, "legacy_reconciled_metadata");
});

const pageSource = fs.readFileSync(path.join(root, "src/app/(app)/onboarding/page.tsx"), "utf8");
const onboardingContractSource = fs.readFileSync(path.join(root, "src/lib/onboarding-contract.ts"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "src/app/api/onboarding/plan/route.ts"), "utf8");
const billingSource = fs.readFileSync(path.join(root, "src/lib/services/billing-service.ts"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations/20260710180000_activation_onboarding_contract.sql"),
  "utf8",
);

check("browser render stores no draft or navigation and removes the legacy PII key", () => {
  assert.doesNotMatch(pageSource, /dealflow-guided-onboarding-v4-navigation/);
  assert.match(pageSource, /dealflow-guided-onboarding-v3/);
  assert.doesNotMatch(pageSource, /localStorage\.(?:setItem|getItem)/);
  assert.match(pageSource, /method: "PUT"/);
  assert.match(pageSource, /if \(!hydrated \|\| persistenceRevision === 0\) return/);
  assert.match(pageSource, /setPersistenceRevision\(\(current\) => current \+ 1\)/);
});

check("passive onboarding render does not write activation telemetry", () => {
  assert.doesNotMatch(pageSource, /eventName: "onboarding_started"/);
  assert.match(pageSource, /eventName: "onboarding_step_completed"/);
});

check("campaign persistence materializes the complete onboarding contract", () => {
  for (const field of [
    "onboarding_contract",
    "campaign_modes",
    "targeting_summary",
    "property_type",
    "daily_budget_cents",
    "monthly_budget",
    "language",
    "lead_capture_mode",
    "lead_form_questions",
    "theme",
    "agent_name",
    "brokerage_name",
    "phone",
  ]) {
    assert.match(routeSource, new RegExp(`${field}:`), `${field} is not persisted`);
  }
  assert.match(onboardingContractSource, /businessType: z\.literal\("real_estate_realtor"\)/);
  assert.match(routeSource, /buildWinningFunnel\(\{/);
  assert.match(routeSource, /customLeadFormQuestions: submission\.leadFormQuestions/);
  assert.match(routeSource, /campaign_payload:/);
  assert.match(routeSource, /campaignIdFromOnboardingIdempotencyKey/);
  assert.match(routeSource, /campaignId: deterministicCampaignId/);
  assert.match(routeSource, /createOnly: true/);
  assert.match(routeSource, /onboarding_idempotency_key: idempotencyKey/);
  assert.match(routeSource, /organizationId\}\|\$\{userId\}\|/);
});

check("database contract serializes activation and initial credit atomically", () => {
  assert.match(migrationSource, /unique \(organization_id\)/i);
  assert.match(migrationSource, /pg_advisory_xact_lock/);
  assert.match(migrationSource, /commercial_activation_initial_credit/);
  assert.match(migrationSource, /\n\s*1000,/);
  assert.match(migrationSource, /reference_type = 'commercial_activation'/);
  assert.match(migrationSource, /raise exception 'commercial activation exists without its initial credit ledger entry'/);
  assert.match(migrationSource, /commercial activation user is not a member of the organization/);
  assert.match(migrationSource, /commercial_activations_append_only_guard/);
  assert.match(migrationSource, /onboarding_drafts_campaign_tenant_fk/);
});

check("billing handler verifies durable identity before applying a qualifying payment", () => {
  assert.match(billingSource, /resolveCommercialActivationBillingState/);
  assert.match(billingSource, /historical_payment_identity_verified/);
  assert.match(billingSource, /billingStateApplied: syncResult\.applied/);
  assert.match(billingSource, /parent\?\.subscription_details/);
  assert.match(billingSource, /applyCommercialActivationFromStripePayment\([\s\S]*activationSyncResult/);
  assert.match(billingSource, /recordCommercialActivationWithInitialCredit/);
});

console.log(`onboarding/activation/billing contract: ${checks.length} checks passed`);
for (const name of checks) {
  console.log(`PASS ${name}`);
}
