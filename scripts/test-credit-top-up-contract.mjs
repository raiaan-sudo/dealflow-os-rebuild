#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const billingSource = fs.readFileSync(
  path.join(root, "src/lib/services/billing-service.ts"),
  "utf8",
);
const creditSource = fs.readFileSync(
  path.join(root, "src/lib/services/credit-service.ts"),
  "utf8",
);
const routeSource = fs.readFileSync(
  path.join(root, "src/app/api/billing/credits/checkout/route.ts"),
  "utf8",
);
const buttonSource = fs.readFileSync(
  path.join(root, "src/components/billing/credit-top-up-button.tsx"),
  "utf8",
);
const settingsSource = fs.readFileSync(
  path.join(root, "src/app/(app)/settings/page.tsx"),
  "utf8",
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260716180000_harden_credit_top_up_request_idempotency.sql",
  ),
  "utf8",
);

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const calls = {
  appContext: 0,
  serverClient: 0,
  adminClient: 0,
  provider: 0,
  safeMode: 0,
};

const fallback = new Proxy({}, {
  get() {
    return () => undefined;
  },
});
const dependencies = new Map([
  ["@/lib/api/route", { ApiError: TestApiError }],
  [
    "@/lib/env",
    {
      getStripeEnv: () => ({ mode: "test", livemode: false }),
      isBillingAdminOverrideEnabled: () => false,
      isInternalAdminEmail: () => false,
      isBillingCheckoutSafeModeEnabled: () => {
        calls.safeMode += 1;
        return false;
      },
    },
  ],
  [
    "@/lib/services/credit-service",
    {
      CREDIT_TOP_UP_MINIMUM_CENTS: 2_500,
      CREDIT_TOP_UP_MAXIMUM_CENTS: 100_000,
      recordCommercialActivationWithInitialCredit: () => undefined,
    },
  ],
  [
    "@/lib/services/app-context",
    {
      getAppContext: () => {
        calls.appContext += 1;
        return null;
      },
    },
  ],
  [
    "@/lib/supabase/server",
    {
      createClient: () => {
        calls.serverClient += 1;
        return null;
      },
    },
  ],
  [
    "@/lib/supabase/admin",
    {
      createAdminClient: () => {
        calls.adminClient += 1;
        return null;
      },
    },
  ],
  [
    "@/lib/integrations/stripe/provider",
    {
      getStripeBillingProvider: () => {
        calls.provider += 1;
        return { isConfigured: () => true, execute: () => undefined };
      },
    },
  ],
]);

const transpiled = ts.transpileModule(billingSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const loadedModule = { exports: {} };
new Function("require", "module", "exports", transpiled)(
  (specifier) => dependencies.get(specifier) ?? fallback,
  loadedModule,
  loadedModule.exports,
);
const billing = loadedModule.exports;
const validRequestId = "11111111-1111-4111-8111-111111111111";
const invalidCases = [
  [{ amountCents: 2_499, clientRequestId: validRequestId }, "credit_top_up_minimum_not_met"],
  [{ amountCents: 100_001, clientRequestId: validRequestId }, "credit_top_up_maximum_exceeded"],
  [{ amountCents: 2_500.5, clientRequestId: validRequestId }, "credit_top_up_amount_invalid"],
  [{ amountCents: Number.NaN, clientRequestId: validRequestId }, "credit_top_up_amount_invalid"],
  [{ amountCents: 2_500, clientRequestId: "not-a-uuid" }, "credit_top_up_request_id_invalid"],
];

for (const [input, expectedCode] of invalidCases) {
  await assert.rejects(
    () => billing.createCreditTopUpCheckoutSession(input),
    (error) => error instanceof TestApiError && error.code === expectedCode,
  );
}
assert.deepEqual(calls, {
  appContext: 0,
  serverClient: 0,
  adminClient: 0,
  provider: 0,
  safeMode: 0,
}, "invalid top-ups reached an environment, auth, database, or provider dependency");

const topUpFunction = billingSource.slice(
  billingSource.indexOf("export async function createCreditTopUpCheckoutSession"),
  billingSource.indexOf("export async function reconcileBillingCheckoutSuccess"),
);
assert.match(creditSource, /CREDIT_TOP_UP_MINIMUM_CENTS\s*=\s*2_500/);
assert.match(creditSource, /CREDIT_TOP_UP_MAXIMUM_CENTS\s*=\s*100_000/);
assert.match(topUpFunction, /Number\.isInteger\(params\.amountCents\)/);
assert.doesNotMatch(topUpFunction, /Math\.floor/);
assert.match(topUpFunction, /create_credit_top_up_intent_v2/);
assert.match(topUpFunction, /allow_promotion_codes:\s*false/);
assert.match(topUpFunction, /intent\.status === "checkout_created"/);
assert.match(topUpFunction, /action:\s*"retrieve_checkout_session"/);
assert.equal(
  (billingSource.match(/isMatchingOpenCreditTopUpCheckoutSession\(/g) ?? []).length,
  3,
  "both created and replayed provider sessions must use the shared exact-identity validator",
);
assert.match(
  billingSource,
  /amountCents as number\) > CREDIT_TOP_UP_MAXIMUM_CENTS/,
  "authoritative Stripe settlement must also reject amounts above the top-up maximum",
);
assert.match(routeSource, /client_request_id:\s*z\.string\(\)\.uuid\(\)/);
assert.match(routeSource, /CREDIT_TOP_UP_MAXIMUM_CENTS/);
assert.match(buttonSource, /useRef<string \| null>\(null\)/);
assert.match(buttonSource, /crypto\.randomUUID\(\)/);
assert.match(buttonSource, /amountCents:\s*selectedAmountCents/);
assert.match(buttonSource, /client_request_id:\s*clientRequestId/);
assert.match(buttonSource, /clientRequestIdRef\.current\s*=\s*null/);
assert.match(buttonSource, /selectedAmountCents\s*>=\s*minimumAmountCents/);
assert.match(buttonSource, /selectedAmountCents\s*<=\s*maximumAmountCents/);
assert.match(creditSource, /\.from\("user_credit_ledger"\)/);
assert.match(creditSource, /\.from\("provider_usage_events"\)/);
assert.match(creditSource, /\.eq\("status",\s*"reserved"\)/);
assert.match(creditSource, /reservationStatus:/);
assert.match(settingsSource, /allowAmountSelection/);
assert.match(settingsSource, /credits\.activity\.map/);
assert.match(settingsSource, /settings\.reservedBalance/);
assert.match(migrationSource, /credit_top_up_intents_actor_request_unique/);
assert.match(migrationSource, /on conflict \(organization_id, user_id, client_request_id\)/);
assert.match(migrationSource, /credit_top_up_request_identity_collision/);
assert.match(migrationSource, /from public, anon, authenticated/);
assert.match(migrationSource, /to service_role/);

console.log("PASS credit top-up contract: strict boundaries, pre-I/O rejection, UUID replay, and promotions disabled");
