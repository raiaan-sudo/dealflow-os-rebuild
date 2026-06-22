#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const middlewarePath = "src/proxy.ts";
const apiRoot = "src/app/api";
const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const expectedPublicApiRoutes = new Map([
  ["/api/meta/data-deletion", new Set(["GET", "POST"])],
  ["/api/integrations/meta/callback", new Set(["GET"])],
  ["/api/lead-capture", new Set(["POST"])],
  ["/api/sms/twilio", new Set(["POST"])],
  ["/api/stripe/webhook", new Set(["POST"])],
  ["/api/webhooks/twilio/status", new Set(["POST"])],
  ["/api/client-errors", new Set(["POST"])],
  ["/api/client-errors/csp", new Set(["POST"])],
]);

const expectedInternalApiRoutes = new Map([
  ["/api/internal/qa-auth-session", {
    methods: new Set(["POST"]),
    markers: [
      "assertQaAuthHarnessRequest",
      "QA_AUTH_HARNESS_ENABLED",
      "QA_AUTH_HARNESS_PRODUCTION_ENABLED",
      "QA_EMAIL",
      "assertQaUserIsNonAdmin",
      "isInternalAdminEmail",
      "partner_memberships",
      "organization_memberships",
      "non_admin_qa",
      "redactEmail",
    ],
  }],
  ["/api/internal/stripe-test-proof", {
    methods: new Set(["POST"]),
    markers: ["assertInternalSystemRequest", "STRIPE_TEST_HARNESS_ENABLED"],
  }],
  ["/api/internal/stripe-live-zero-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "STRIPE_LIVE_ZERO_PROOF_ENABLED",
      "STRIPE_LIVE_ZERO_PROOF_PRICE_ID",
      "createZeroPrice",
      "createCouponCheckout",
      "prices.create",
      "coupons.create",
      "percent_off: 100",
      "duration: \"forever\"",
      "unit_amount: 0",
      "proof_type: \"stripe_live_zero_dollar_proof\"",
      "assertZeroLivePrice",
      "assertLiveRecurringPrice",
      "getStripePlanPriceConfiguration",
      "price.unitAmount < 1",
      "discounts",
      "payment_method_collection: \"if_required\"",
      "handleStripeBillingEvent",
      "simulateCancellationWebhook",
      "subscriptions.cancel",
      "amountExposureCents: 0",
      "GHL_CONTACT_WRITES_ENABLED",
      "GHL_OPPORTUNITY_WRITES_ENABLED",
      "GHL_PROVISIONING_WRITES_ENABLED",
      "GHL_WORKFLOW_ENROLLMENT_ENABLED",
      "INTERNAL_LEAD_SMS_ENABLED",
      "secretsExposed: false",
      "tokensExposed: false",
    ],
  }],
  ["/api/internal/lead-capture-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "LEAD_CAPTURE_PROOF_HARNESS_ENABLED",
      "APPLY_LEAD_CAPTURE_PROOF",
      "CLEANUP_LEAD_CAPTURE_PROOF",
      "proof_run_id",
      "queueLeadSideEffectsJobSkipped",
      "queuePerformanceLeadBillingJobSkipped",
    ],
  }],
  ["/api/internal/lead-side-effects-crm-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED",
      "LEAD_SIDE_EFFECTS_CRM_PROOF_SECRET",
      "assertProofRequest",
      "runLeadSideEffects",
      "proof_ghl_writes_disabled_stub",
      "processedRealSystemJob: false",
      "createdRealLead: false",
      "createdSystemJob: false",
      "liveGhlCall: false",
      "smsEmailSent: false",
      "metaMutation: false",
      "stripeBillingProviderAction: false",
      "provisioning: false",
      "workflowEnrollment: false",
    ],
  }],
  ["/api/internal/martine-sms-test", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "MARTINE_SMS_TEST_ENABLED",
      "TARGET_PHONE_E164",
      "createdLead: false",
      "createdSystemJob: false",
      "mutatedMeta: false",
      "mutatedGhl: false",
      "createdStripeCharge: false",
      "ranProviderGeneration: false",
    ],
  }],
  ["/api/internal/partner-crm-sync-dry-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "PARTNER_CRM_SYNC_DRY_PROOF_ENABLED",
      "PARTNER_CRM_SYNC_DRY_PROOF_SECRET",
      "assertProofRequest",
      "safeSyncLeadToPartnerCrm",
      "dryRun: true",
      "writeEventLedger: false",
      "liveGhlCall: false",
      "createdRealLead: false",
      "createdSystemJob: false",
      "smsEmailSent: false",
      "metaMutation: false",
      "stripeBillingProviderAction: false",
      "provisioning: false",
      "workflowEnrollment: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/internal/partner-crm-sync-live-contact-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED",
      "GHL_CONTACT_WRITES_ENABLED",
      "GHL_OPPORTUNITY_WRITES_ENABLED",
      "INTERNAL_LEAD_SMS_ENABLED",
      "GHL_AUTO_PROVISIONING_ENABLED",
      "GHL_PROVISIONING_WRITES_ENABLED",
      "GHL_WORKFLOW_ENROLLMENT_ENABLED",
      "safeSyncLeadToPartnerCrm",
      "dryRun: false",
      "writeEventLedger: true",
      "publicLeadCreated: false",
      "processedRealSystemJob: false",
      "smsEmailSent: false",
      "metaMutation: false",
      "stripeBillingProviderAction: false",
      "providerGeneration: false",
      "opportunityWriteGate",
      "provisioning: false",
      "workflowEnrollment: Boolean",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/internal/provider-static-generation-proof", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "PROVIDER_STATIC_GENERATION_PROOF_ENABLED",
      "generateStaticCreativeAds",
      "persistStaticCreativeAssets",
      "assertProviderGenerationHardCapsConfigured",
      "consumeSessionCostBudget",
      "markSessionCostBudgetEvent",
      "max_static_image_generations: 1",
      "maxStaticAssetProviderCalls: 1",
      "videoGenerationAttempted: false",
      "batchGeneration: false",
      "createdRealLead: false",
      "createdSystemJob: false",
      "smsEmailSent: false",
      "metaMutation: false",
      "ghlMutation: false",
      "stripeBillingProviderAction: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/internal/ghl-opportunity-discovery", {
    methods: new Set(["POST"]),
    markers: [
      "assertInternalSystemRequest",
      "assertSameOriginRequest",
      "GHL_OPPORTUNITY_DISCOVERY_PROOF_ENABLED",
      "readWorkspaceGhlConfig",
      "getGhlPrivateTokenFromCredentialRef",
      "/opportunities/pipelines",
      "readOnlyGhlRequest: true",
      "dbMutation: false",
      "ghlContactWrite: false",
      "ghlOpportunityWrite: false",
      "provisioning: false",
      "workflowEnrollment: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/internal/public-qa-ghl-job-proof", {
    methods: new Set(["POST"]),
    markers: [
      "QA_GHL_JOB_PROOF_ENABLED",
      "QA_GHL_JOB_PROOF_SECRET",
      "assertProofRequest",
      "claimSystemJobByIdForWorker",
      "processSystemJob",
      "processedRealSystemJob: true",
      "createdRealLead: false",
      "createdSystemJob: false",
      "smsEmailSent: false",
      "metaMutation: false",
      "stripeBillingProviderAction: false",
      "providerGeneration: false",
      "opportunityCreation: false",
      "provisioning: false",
      "workflowEnrollment: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/internal/system-jobs", {
    methods: new Set(["GET", "POST"]),
    markers: ["assertInternalSystemRequest", "runSystemJobWorkerBatch"],
  }],
  ["/api/internal/scale-monitor", {
    methods: new Set(["GET", "POST"]),
    markers: ["assertInternalSystemRequest", "runScaleMonitor"],
  }],
]);

const expectedAutopilotApiRoutes = new Map([
  ["/api/autonomy", {
    methods: new Set(["GET", "PATCH"]),
    markers: [
      "assertSameOriginRequest",
      "evaluateAutonomy",
      "getCampaignEntitlementsForCampaign(plan.id)",
      "assertAutonomyExecutionAccess",
    ],
    disallowedMarkers: [
      'executionMode: "recommendation_only"',
      "Autonomous execution is recommendation-only during beta.",
    ],
  }],
  ["/api/autonomy/run", {
    methods: new Set(["POST"]),
    markers: [
      "assertSameOriginRequest",
      "evaluateAutonomy",
      "getCampaignEntitlementsForCampaign(plan.id)",
      "assertAutonomyExecutionAccess",
    ],
    disallowedMarkers: [
      'executionMode: "recommendation_only"',
    ],
  }],
]);

const expectedAdminApiRoutes = new Map([
  ["/api/admin/operator-debt/[id]", {
    methods: new Set(["POST"]),
    markers: [
      "assertSameOriginRequest",
      "assertInternalOperatorAccess",
      "acknowledgeOperatorDebtJob",
      "operator_debt_action_required",
    ],
  }],
  ["/api/admin/fulfillment-monitor/crm-retry", {
    methods: new Set(["POST"]),
    markers: [
      "assertSameOriginRequest",
      "assertInternalOperatorAccess",
      "RETRY_CRM_SYNC",
      "retryFulfillmentCrmSync",
      "crmSyncOnly: true",
      "smsEmailSent: false",
      "metaMutation: false",
      "stripeBillingProviderAction: false",
      "providerGeneration: false",
      "provisioning: false",
      "workflowEnrollment: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
  ["/api/admin/fulfillment-monitor/health", {
    methods: new Set(["GET"]),
    markers: [
      "assertInternalOperatorAccess",
      "readOnlyHealthCheck: true",
      "dbMutation: false",
      "ghlContactWrite: false",
      "ghlOpportunityWrite: false",
      "provisioning: false",
      "workflowEnrollment: false",
      "tokensExposed: false",
      "credentialRefsExposed: false",
    ],
  }],
]);

const ownershipMarkers = [
  "getAuthenticatedContext",
  "getCampaignById",
  "updateCampaignPublishState",
  "deleteCreativeAssetById",
  "getCreativeAssetById",
  "listCampaignCreativeAssets",
  "uploadManualCreativeAsset",
  "assertMetaLaunchBillingAccess",
  "assertInternalOperatorAccess",
  "auth.userId",
  "auth.organizationId",
  "organization_id",
  "user_id",
];

let failures = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  failures += 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function routePathFromFile(filePath) {
  const relative = path.relative(path.join(root, apiRoot), filePath);
  const withoutRoute = relative.replace(/\/route\.ts$/, "");
  return `/api/${withoutRoute.replace(/\/index$/, "").replaceAll(path.sep, "/")}`;
}

function exportedMethods(text) {
  const found = new Set();
  for (const method of routeMethods) {
    if (new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(text)) {
      found.add(method);
    }
  }
  return found;
}

function parsePublicApiAllowlist() {
  const middleware = read(middlewarePath);
  const match = middleware.match(/const\s+PUBLIC_API_PATHS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);

  if (!match) {
    fail("Middleware public API allowlist", "PUBLIC_API_PATHS set was not found");
    return new Set();
  }

  return new Set([...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]));
}

function checkPublicAllowlist(publicApiRoutes, routeFilesByPath) {
  for (const route of expectedPublicApiRoutes.keys()) {
    if (!publicApiRoutes.has(route)) {
      fail("Expected public API route", `${route} is missing from middleware allowlist`);
    }
  }

  for (const route of publicApiRoutes) {
    if (!expectedPublicApiRoutes.has(route)) {
      fail("Unexpected public API route", `${route} is public but not documented in check-route-security`);
      continue;
    }

    const file = routeFilesByPath.get(route);
    if (!file) {
      fail("Public API route file", `${route} is allowlisted but no route.ts exists`);
      continue;
    }

    const actual = exportedMethods(read(path.relative(root, file)));
    const expected = expectedPublicApiRoutes.get(route);
    const unexpectedMethods = [...actual].filter((method) => !expected.has(method));
    if (unexpectedMethods.length > 0) {
      fail("Public API method surface", `${route} also exports ${unexpectedMethods.join(", ")}`);
    } else {
      pass("Public API method surface", `${route} exports ${[...actual].join(", ")}`);
    }
  }

  if (failures === 0) {
    pass("Middleware public API allowlist", "only documented public API routes are exposed");
  }
}

function checkPrivateMutationGuards(routeFilesByPath, publicApiRoutes) {
  for (const [route, file] of routeFilesByPath) {
    if (publicApiRoutes.has(route)) {
      continue;
    }

    const text = read(path.relative(root, file));
    const methods = exportedMethods(text);
    const privateMutations = [...methods].filter((method) => mutatingMethods.has(method));

    if (privateMutations.length === 0) {
      continue;
    }

    if (
      text.includes("assertSameOriginRequest") ||
      text.includes("assertInternalSystemRequest") ||
      text.includes("assertQaAuthHarnessRequest")
    ) {
      pass("Private mutation same-origin guard", `${route} ${privateMutations.join(", ")}`);
    } else {
      fail("Private mutation same-origin guard", `${route} exports ${privateMutations.join(", ")} without assertSameOriginRequest`);
    }
  }
}

function checkInternalApiGuards(publicApiRoutes, routeFilesByPath) {
  const middleware = read(middlewarePath);

  if (middleware.includes("isInternalApiRequest") && middleware.includes("getInternalSystemJobSecrets")) {
    pass("Internal API middleware guard", "/api/internal/* bypasses user auth only after bearer secret validation");
  } else {
    fail("Internal API middleware guard", "middleware does not contain the internal bearer-secret guard");
  }

  for (const [route, expected] of expectedInternalApiRoutes) {
    if (publicApiRoutes.has(route)) {
      fail("Internal API public exposure", `${route} must not be in PUBLIC_API_PATHS`);
    }

    const file = routeFilesByPath.get(route);
    if (!file) {
      fail("Internal API route file", `${route} route.ts was not found`);
      continue;
    }

    const relativePath = path.relative(root, file);
    const text = read(relativePath);
    const actualMethods = exportedMethods(text);
    const expectedMethods = expected.methods;
    const missingMethods = [...expectedMethods].filter((method) => !actualMethods.has(method));
    const unexpectedMethods = [...actualMethods].filter((method) => !expectedMethods.has(method));

    if (missingMethods.length > 0 || unexpectedMethods.length > 0) {
      fail("Internal API method surface", `${route} expected ${[...expectedMethods].join(", ")}, found ${[...actualMethods].join(", ")}`);
    } else {
      pass("Internal API method surface", `${route} exports ${[...actualMethods].join(", ")}`);
    }

    const missingMarkers = expected.markers.filter((marker) => !text.includes(marker));
    if (missingMarkers.length === 0) {
      pass("Internal API route guard", `${route} requires internal authorization and expected env gates`);
    } else {
      fail("Internal API route guard", `${route} is missing ${missingMarkers.join(", ")}`);
    }
  }
}

function readRouteWithShared(relativePath) {
  const text = read(relativePath);
  const sharedPath = "src/app/api/autonomy/_shared.ts";

  if (relativePath.startsWith("src/app/api/autonomy/") && fs.existsSync(path.join(root, sharedPath))) {
    return `${text}\n${read(sharedPath)}`;
  }

  return text;
}

function checkAutopilotApiGuards(publicApiRoutes, routeFilesByPath) {
  for (const [route, expected] of expectedAutopilotApiRoutes) {
    if (publicApiRoutes.has(route)) {
      fail("Pro Autopilot public exposure", `${route} must not be in PUBLIC_API_PATHS`);
    }

    const file = routeFilesByPath.get(route);
    if (!file) {
      fail("Pro Autopilot route file", `${route} route.ts was not found`);
      continue;
    }

    const relativePath = path.relative(root, file);
    const text = readRouteWithShared(relativePath);
    const actualMethods = exportedMethods(read(relativePath));
    const missingMethods = [...expected.methods].filter((method) => !actualMethods.has(method));
    const unexpectedMethods = [...actualMethods].filter((method) => !expected.methods.has(method));

    if (missingMethods.length > 0 || unexpectedMethods.length > 0) {
      fail("Pro Autopilot method surface", `${route} expected ${[...expected.methods].join(", ")}, found ${[...actualMethods].join(", ")}`);
    } else {
      pass("Pro Autopilot method surface", `${route} exports ${[...actualMethods].join(", ")}`);
    }

    const missingMarkers = expected.markers.filter((marker) => !text.includes(marker));
    if (missingMarkers.length === 0) {
      pass("Pro Autopilot route guard", `${route} has same-origin/pro-entitlement guard markers`);
    } else {
      fail("Pro Autopilot route guard", `${route} is missing ${missingMarkers.join(", ")}`);
    }

    const presentDisallowedMarkers = expected.disallowedMarkers.filter((marker) => text.includes(marker));
    if (presentDisallowedMarkers.length === 0) {
      pass("Pro Autopilot execution readiness", `${route} is not hard-coded recommendation-only`);
    } else {
      fail("Pro Autopilot execution readiness", `${route} still contains ${presentDisallowedMarkers.join(", ")}`);
    }
  }
}

function checkAdminApiGuards(publicApiRoutes, routeFilesByPath) {
  for (const [route, expected] of expectedAdminApiRoutes) {
    if (publicApiRoutes.has(route)) {
      fail("Admin API public exposure", `${route} must not be in PUBLIC_API_PATHS`);
    }

    const file = routeFilesByPath.get(route);
    if (!file) {
      fail("Admin API route file", `${route} route.ts was not found`);
      continue;
    }

    const relativePath = path.relative(root, file);
    const text = read(relativePath);
    const actualMethods = exportedMethods(text);
    const missingMethods = [...expected.methods].filter((method) => !actualMethods.has(method));
    const unexpectedMethods = [...actualMethods].filter((method) => !expected.methods.has(method));

    if (missingMethods.length > 0 || unexpectedMethods.length > 0) {
      fail("Admin API method surface", `${route} expected ${[...expected.methods].join(", ")}, found ${[...actualMethods].join(", ")}`);
    } else {
      pass("Admin API method surface", `${route} exports ${[...actualMethods].join(", ")}`);
    }

    const missingMarkers = expected.markers.filter((marker) => !text.includes(marker));
    if (missingMarkers.length === 0) {
      pass("Admin API route guard", `${route} has admin/safety guard markers`);
    } else {
      fail("Admin API route guard", `${route} is missing ${missingMarkers.join(", ")}`);
    }
  }
}

function checkDynamicOwnershipMarkers(routeFilesByPath, publicApiRoutes) {
  for (const [route, file] of routeFilesByPath) {
    if (publicApiRoutes.has(route) || !route.includes("[")) {
      continue;
    }

    const text = read(path.relative(root, file));
    const marker = ownershipMarkers.find((candidate) => text.includes(candidate));

    if (marker) {
      pass("Dynamic route ownership marker", `${route} uses ${marker}`);
    } else {
      fail("Dynamic route ownership marker", `${route} has no recognized tenant/auth ownership marker`);
    }
  }
}

const publicApiRoutes = parsePublicApiAllowlist();
const routeFiles = walk(path.join(root, apiRoot));
const routeFilesByPath = new Map(routeFiles.map((file) => [routePathFromFile(file), file]));

checkPublicAllowlist(publicApiRoutes, routeFilesByPath);
checkInternalApiGuards(publicApiRoutes, routeFilesByPath);
checkAutopilotApiGuards(publicApiRoutes, routeFilesByPath);
checkAdminApiGuards(publicApiRoutes, routeFilesByPath);
checkPrivateMutationGuards(routeFilesByPath, publicApiRoutes);
checkDynamicOwnershipMarkers(routeFilesByPath, publicApiRoutes);

if (failures > 0) {
  process.exitCode = 1;
}
