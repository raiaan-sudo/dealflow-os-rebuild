#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const equalsAt = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (!key || process.env[key]?.trim()) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value.trim()) {
      process.env[key] = value.trim();
    }
  }
}

for (const envFile of [".env.production.local", ".env.local", ".env"]) {
  loadLocalEnvFile(path.join(root, envFile));
}

const requirePublicProof =
  process.env.META_REQUIRE_PUBLIC_NON_ADMIN_PROOF === "1" ||
  process.env.FULL_STACK_AUDIT_PUBLIC_META === "1";
const requireRuntimeConfig =
  requirePublicProof || process.env.META_REQUIRE_RUNTIME_CONFIG === "1";

function present(name) {
  return Boolean(String(process.env[name] ?? "").trim());
}

function redact(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function readRequiredFile(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function assertStaticRuntimeWiring() {
  const envSource = readRequiredFile("src/lib/env.ts");
  const connectRoute = readRequiredFile("src/app/api/integrations/meta/connect/route.ts");
  const envExample = readRequiredFile(".env.example");

  assert.match(
    envSource,
    /const loginConfigId = process\.env\.META_LOGIN_CONFIG_ID\?\.trim\(\) \|\| null;/,
    "Meta env must read optional META_LOGIN_CONFIG_ID for Facebook Login for Business.",
  );
  assert.match(envSource, /loginConfigId,/, "Meta env must expose loginConfigId.");
  assert.match(
    connectRoute,
    /url\.searchParams\.set\("config_id", env\.loginConfigId\);/,
    "Meta OAuth connect route must include config_id when configured.",
  );
  assert.match(
    connectRoute,
    /loginConfigEnabled: Boolean\(env\.loginConfigId\)/,
    "Telemetry must log only whether Meta login config is enabled.",
  );
  assert.doesNotMatch(
    connectRoute.slice(connectRoute.indexOf("metadata: {"), connectRoute.indexOf("idempotencyKey:")),
    /loginConfigId\s*:/,
    "Telemetry must not store the raw Meta login configuration id.",
  );
  assert.match(
    envExample,
    /META_LOGIN_CONFIG_ID=your-facebook-login-for-business-configuration-id/,
    ".env.example must document META_LOGIN_CONFIG_ID.",
  );
}

function verifyProofArtifact(filePath) {
  if (!filePath) {
    return {
      status: "missing",
      reason: "META_NON_ADMIN_OAUTH_PROOF_PATH is not set",
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      status: "missing",
      reason: `proof artifact does not exist: ${filePath}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      status: "invalid",
      reason: `proof artifact is not valid JSON: ${error.message}`,
    };
  }

  const requiredBooleans = [
    "nonAdminUser",
    "facebookDialogAvailable",
    "callbackReturnedToApp",
    "metaConnectionSaved",
    "adAccountPagePixelSelectionSaved",
    "launchNotClicked",
  ];
  const missing = requiredBooleans.filter((field) => parsed[field] !== true);
  if (missing.length > 0) {
    return {
      status: "invalid",
      reason: `proof artifact missing required true fields: ${missing.join(", ")}`,
    };
  }

  return {
    status: "pass",
    proofPath: filePath,
    userType: parsed.userType ?? "non_admin_customer",
    testedAt: parsed.testedAt ?? null,
  };
}

async function fetchMetaAppMetadata() {
  if (!present("META_APP_ID") || !present("META_APP_SECRET")) {
    return {
      status: "skipped",
      reason: "META_APP_ID or META_APP_SECRET not loaded locally",
    };
  }

  const appId = process.env.META_APP_ID.trim();
  const appSecret = process.env.META_APP_SECRET.trim();
  const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(appId)}`);
  url.searchParams.set(
    "fields",
    [
      "name",
      "app_domains",
      "privacy_policy_url",
      "terms_of_service_url",
      "website_url",
      "icon_url",
      "logo_url",
      "category",
      "subcategory",
    ].join(","),
  );
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: "fail",
      statusCode: response.status,
      message: body?.error?.message ?? "Meta Graph app metadata request failed",
    };
  }

  const appDomains = Array.isArray(body.app_domains) ? body.app_domains : [];
  const requiredChecks = [
    {
      id: "app_domain_agentdealflow",
      passed: appDomains.includes("agentdealflow.io"),
      value: appDomains,
    },
    {
      id: "privacy_policy_url",
      passed: typeof body.privacy_policy_url === "string" && body.privacy_policy_url.includes("agentdealflow.io"),
      value: body.privacy_policy_url ?? null,
    },
    {
      id: "terms_of_service_url",
      passed: typeof body.terms_of_service_url === "string" && body.terms_of_service_url.includes("agentdealflow.io"),
      value: body.terms_of_service_url ?? null,
    },
    {
      id: "website_url",
      passed: typeof body.website_url === "string" && body.website_url.includes("agentdealflow.io"),
      value: body.website_url ?? null,
    },
    {
      id: "icon_or_logo",
      passed: Boolean(body.icon_url || body.logo_url),
      value: Boolean(body.icon_url || body.logo_url),
    },
  ];

  return {
    status: requiredChecks.every((check) => check.passed) ? "pass" : "fail",
    appId: redact(appId),
    name: body.name ?? null,
    category: body.category ?? null,
    subcategory: body.subcategory ?? null,
    checks: requiredChecks,
  };
}

assertStaticRuntimeWiring();

const requiredRuntimeEnv = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_REDIRECT_URI",
  "META_LOGIN_CONFIG_ID",
  "META_TOKEN_ENCRYPTION_KEY",
];

const envPresence = Object.fromEntries(requiredRuntimeEnv.map((name) => [name, present(name)]));
const missingRuntimeEnv = requiredRuntimeEnv.filter((name) => !envPresence[name]);
const metaMetadata = await fetchMetaAppMetadata();
const nonAdminProof = verifyProofArtifact(process.env.META_NON_ADMIN_OAUTH_PROOF_PATH?.trim());

const businessVerificationConfirmed = process.env.META_BUSINESS_VERIFICATION_CONFIRMED === "1";
const advancedAccessConfirmed = process.env.META_ADVANCED_ACCESS_CONFIRMED === "1";
const appReviewApproved = process.env.META_APP_REVIEW_APPROVED === "1";

const publicProofBlockers = [
  ...(businessVerificationConfirmed ? [] : ["Meta business verification is not confirmed"]),
  ...(advancedAccessConfirmed ? [] : ["Meta Advanced Access / App Review is not confirmed"]),
  ...(appReviewApproved ? [] : ["Meta app review approval is not confirmed"]),
  ...(nonAdminProof.status === "pass" ? [] : [`non-admin OAuth proof missing or invalid: ${nonAdminProof.reason}`]),
];

const runtimeConfigAvailable = missingRuntimeEnv.length === 0 && metaMetadata.status !== "fail";
const runtimeConfigPassed = runtimeConfigAvailable || !requireRuntimeConfig;
const publicProofPassed = publicProofBlockers.length === 0;
const status = runtimeConfigPassed && (!requirePublicProof || publicProofPassed) ? "PASS" : "FAIL";

const report = {
  status,
  mode: requirePublicProof ? "public_non_admin_required" : "runtime_config_only",
  runtimeConfig: {
    required: requireRuntimeConfig,
    available: runtimeConfigAvailable,
    envPresence,
    missingRuntimeEnv,
    loginConfigId: redact(process.env.META_LOGIN_CONFIG_ID),
    redirectUriHost: process.env.META_REDIRECT_URI ? new URL(process.env.META_REDIRECT_URI).host : null,
    metaAppMetadata: metaMetadata,
  },
  publicNonAdminLaunchGate: {
    required: requirePublicProof,
    businessVerificationConfirmed,
    advancedAccessConfirmed,
    appReviewApproved,
    nonAdminProof,
    blockers: publicProofBlockers,
  },
  safety: [
    "does not mutate Meta campaigns",
    "does not launch ads",
    "does not create Stripe charges",
    "does not send SMS or email",
    "does not print Meta secrets",
  ],
};

console.log(JSON.stringify(report, null, 2));
process.exit(status === "PASS" ? 0 : 1);
