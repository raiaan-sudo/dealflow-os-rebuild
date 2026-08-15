import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const scenario = process.argv[2];
const secret = "T9!dealflow-isolated-staging-access-only-84Q";
const releaseCommit = "a".repeat(40);
const privateImageSourcePath =
  `/staging-private-image-gate-proof-v2/${releaseCommit}.png`;
const privateImageOptimizerQuery =
  `url=${encodeURIComponent(privateImageSourcePath)}&w=32&q=75`;
const projectId = process.env.DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID ?? "";
assert.match(projectId, /^prj_[A-Za-z0-9]+$/);

Object.assign(process.env, {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_HOST_ATTESTATION:
    "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  STAGING_ACCESS_GATE_SECRET: secret,
  NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT: releaseCommit,
  NEXT_PUBLIC_APP_URL: "https://dealflow-isolated.example",
  GHL_IFRAME_EMBED_ENABLED: "true",
  GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS: "true",
  GHL_APP_SHARED_SECRET: "S7!dealflow-ghl-shared-staging-sentinel-91Q",
});

let path = "/privacy";
let method = "GET";
let suppliedSecret: string | null = null;
let suppliedCookieSecret: string | null = null;
let requestBody: string | null = null;
const scenarioHeaders = new Headers();
const internalSystemJobsSecret =
  "I8!dealflow-isolated-staging-internal-jobs-92Q";
process.env.INTERNAL_SYSTEM_JOBS_SECRET = internalSystemJobsSecret;
if (scenario === "authorized") {
  suppliedSecret = secret;
} else if (scenario === "authorized_internal_cron") {
  path = "/api/internal/system-jobs";
  scenarioHeaders.set("authorization", `Bearer ${internalSystemJobsSecret}`);
} else if (scenario === "wrong_internal_cron") {
  path = "/api/internal/system-jobs";
  scenarioHeaders.set("authorization", `Bearer ${"W".repeat(internalSystemJobsSecret.length)}`);
} else if (scenario === "missing_internal_cron_secret") {
  path = "/api/internal/system-jobs";
  delete process.env.INTERNAL_SYSTEM_JOBS_SECRET;
} else if (scenario === "authorized_static_header") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedSecret = secret;
} else if (scenario === "authorized_static_cookie") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedCookieSecret = secret;
} else if (scenario === "wrong_static_header") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedSecret = "W".repeat(secret.length);
} else if (scenario === "authorized_default_image_header") {
  path = `/_next/image?${privateImageOptimizerQuery}`;
  suppliedSecret = secret;
} else if (scenario === "authorized_default_image_cookie") {
  path = `/_next/image?${privateImageOptimizerQuery}`;
  suppliedCookieSecret = secret;
} else if (scenario === "closed_disabled_image_no_gate") {
  path = `/_dealflow-staging-image-optimizer-disabled?${privateImageOptimizerQuery}`;
} else if (scenario === "closed_disabled_image_header") {
  path = `/_dealflow-staging-image-optimizer-disabled?${privateImageOptimizerQuery}`;
  suppliedSecret = secret;
} else if (scenario === "closed_disabled_image_cookie") {
  path = `/_dealflow-staging-image-optimizer-disabled?${privateImageOptimizerQuery}`;
  suppliedCookieSecret = secret;
} else if (scenario === "wrong_image_cookie") {
  path = `/_next/image?${privateImageOptimizerQuery}`;
  suppliedCookieSecret = "W".repeat(secret.length);
} else if (scenario === "private_image_source_header") {
  path = privateImageSourcePath;
  suppliedSecret = secret;
} else if (scenario === "private_image_source_cookie") {
  path = privateImageSourcePath;
  suppliedCookieSecret = secret;
} else if (scenario === "private_image_source_no_gate") {
  path = privateImageSourcePath;
} else if (scenario === "retired_image_source_no_gate") {
  path = "/staging-image-optimizer-proof.png";
} else if (scenario === "retired_image_source_header") {
  path = "/staging-image-optimizer-proof.png";
  suppliedSecret = secret;
} else if (scenario === "retired_image_source_cookie") {
  path = "/staging-image-optimizer-proof.png";
  suppliedCookieSecret = secret;
} else if (scenario === "authorized_next_internal_header") {
  path = "/_next/data/staging-gate-proof.json";
  suppliedSecret = secret;
} else if (scenario === "authorized_next_internal_cookie") {
  path = "/_next/data/staging-gate-proof.json";
  suppliedCookieSecret = secret;
} else if (scenario === "wrong_next_internal_header") {
  path = "/_next/data/staging-gate-proof.json";
  suppliedSecret = "W".repeat(secret.length);
} else if (scenario === "authorized_cookie") {
  suppliedCookieSecret = secret;
} else if (scenario === "authorized_cookie_only") {
  suppliedCookieSecret = secret;
} else if (scenario === "unauthorized_cookie") {
  suppliedCookieSecret = "W".repeat(secret.length);
} else if (scenario === "missing_config") {
  delete process.env.STAGING_ACCESS_GATE_SECRET;
} else if (scenario === "weak_config") {
  process.env.STAGING_ACCESS_GATE_SECRET = "weak";
} else if (scenario === "wrong_project") {
  process.env.VERCEL_PROJECT_ID = `${projectId}-wrong`;
} else if (scenario === "missing_project") {
  delete process.env.VERCEL_PROJECT_ID;
} else if (scenario === "missing_attestation") {
  delete process.env.DEALFLOW_STAGING_HOST_ATTESTATION;
} else if (scenario === "production_ungated") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
} else if (scenario === "production_static_ungated") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
  path = "/_next/static/chunks/staging-gate-proof.js";
} else if (scenario === "production_image_ungated") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
  path = "/_next/image?url=%2Flogo.png&w=32&q=75";
} else if (scenario === "unauthorized_static") {
  path = "/_next/static/chunks/staging-gate-proof.js";
} else if (scenario === "unauthorized_image") {
  path = `/_next/image?${privateImageOptimizerQuery}`;
} else if (scenario === "unauthorized_next_internal") {
  path = "/_next/data/staging-gate-proof.json";
} else if (scenario === "native_callback") {
  path = "/api/stripe/webhook";
} else if (scenario === "ghl_marketplace_crm_callback") {
  path = "/api/integrations/crm/marketplace/callback";
} else if (scenario === "ghl_marketplace_legacy_callback") {
  path = "/api/integrations/ghl/marketplace/callback";
} else if (scenario === "lead_capture_blocked") {
  path = "/api/lead-capture";
} else if (scenario === "ghl_bootstrap_valid") {
  path = "/crm/embed";
  scenarioHeaders.set("referer", "https://app.gohighlevel.com/v2/location/example/custom-page-link/example");
  scenarioHeaders.set("sec-fetch-site", "cross-site");
  scenarioHeaders.set("sec-fetch-dest", "iframe");
} else if (scenario === "ghl_bootstrap_wrong_parent") {
  path = "/crm/embed";
  scenarioHeaders.set("referer", "https://attacker.example/embed");
  scenarioHeaders.set("sec-fetch-site", "cross-site");
  scenarioHeaders.set("sec-fetch-dest", "iframe");
} else if (scenario === "ghl_bootstrap_top_level") {
  path = "/crm/embed";
  scenarioHeaders.set("referer", "https://app.gohighlevel.com/v2/location/example");
  scenarioHeaders.set("sec-fetch-site", "cross-site");
  scenarioHeaders.set("sec-fetch-dest", "document");
} else if (scenario === "ghl_bootstrap_static") {
  path = "/_next/static/chunks/ghl-embed-bootstrap.js";
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/crm/embed");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "script");
} else if (scenario === "ghl_bootstrap_context_get") {
  path = "/api/integrations/ghl/embed-context";
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/crm/embed");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "empty");
} else if (scenario === "ghl_bootstrap_context_post") {
  path = "/api/integrations/ghl/embed-context";
  method = "POST";
  scenarioHeaders.set("origin", "https://dealflow-isolated.example");
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/crm/embed");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "empty");
} else if (scenario === "ghl_connect_entry_cross_site") {
  path = "/crm/connect";
  scenarioHeaders.set("sec-fetch-site", "cross-site");
  scenarioHeaders.set("sec-fetch-dest", "document");
} else if (scenario === "ghl_connect_static") {
  path = "/_next/static/chunks/ghl-connect.js";
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/crm/connect");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "script");
} else if (
  scenario === "ghl_connect_bootstrap_valid" ||
  scenario === "ghl_connect_bootstrap_invalid" ||
  scenario === "ghl_connect_bootstrap_wrong_host_claim"
) {
  path = "/api/integrations/ghl/marketplace/bootstrap";
  method = "POST";
  scenarioHeaders.set("origin", "https://dealflow-isolated.example");
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/crm/connect");
  scenarioHeaders.set("content-type", "application/json");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "empty");
} else if (scenario === "ghl_bootstrap_missing_config") {
  path = "/crm/embed";
  delete process.env.STAGING_ACCESS_GATE_SECRET;
  scenarioHeaders.set("referer", "https://app.gohighlevel.com/v2/location/example");
  scenarioHeaders.set("sec-fetch-site", "cross-site");
  scenarioHeaders.set("sec-fetch-dest", "iframe");
} else if (
  scenario === "ghl_authenticated_static" ||
  scenario === "ghl_authenticated_static_mismatched_session"
) {
  path = "/_next/static/chunks/ghl-authenticated-app.js";
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/dashboard");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "script");
} else if (scenario === "ghl_authenticated_admin_denied") {
  path = "/admin";
  scenarioHeaders.set("referer", "https://dealflow-isolated.example/dashboard");
  scenarioHeaders.set("sec-fetch-site", "same-origin");
  scenarioHeaders.set("sec-fetch-dest", "document");
} else if (scenario !== "unauthorized") {
  throw new Error(`Unknown staging access gate scenario: ${scenario}`);
}

async function main() {
  const { proxy } = await import("../../src/proxy");
  if (
    scenario === "ghl_connect_bootstrap_valid" ||
    scenario === "ghl_connect_bootstrap_wrong_host_claim"
  ) {
    const { createGhlEmbedBootstrapClaim } = await import(
      "../../src/lib/white-label/ghl-embed-capability"
    );
    const claimToken = await createGhlEmbedBootstrapClaim({
      claimId: "44444444-4444-4444-8444-444444444444",
      payloadDigest: "b".repeat(64),
      partnerId: null,
      domain: scenario === "ghl_connect_bootstrap_valid"
        ? "dealflow-isolated.example"
        : "attacker.example",
    });
    assert.ok(claimToken);
    requestBody = JSON.stringify({ claimToken });
  } else if (scenario === "ghl_connect_bootstrap_invalid") {
    requestBody = JSON.stringify({ claimToken: "x".repeat(128) });
  }
  const authenticatedEmbedScenario = scenario.startsWith("ghl_authenticated_");
  let authenticatedEmbedCookies: string | null = null;
  if (authenticatedEmbedScenario) {
    const {
      createGhlEmbedCapability,
      createGhlEmbedSessionMarker,
      GHL_EMBED_CAPABILITY_COOKIE,
      GHL_EMBED_SESSION_COOKIE,
    } = await import("../../src/lib/white-label/ghl-embed-capability");
    const dealflowUserId = "11111111-1111-4111-8111-111111111111";
    const capability = await createGhlEmbedCapability({
      stage: "authenticated",
      partnerId: null,
      domain: "dealflow-isolated.example",
      organizationId: "22222222-2222-4222-8222-222222222222",
      locationId: "location_test_1",
      companyId: "company_test_1",
      ghlUserId: "ghl_user_test_1",
      ghlEmail: "synthetic@example.test",
      parentOrigin: "https://app.gohighlevel.com",
      dealflowUserId,
    });
    const sessionMarker = await createGhlEmbedSessionMarker({
      domain: "dealflow-isolated.example",
      partnerId: null,
      parentOrigin: "https://app.gohighlevel.com",
      dealflowUserId:
        scenario === "ghl_authenticated_static_mismatched_session"
          ? "33333333-3333-4333-8333-333333333333"
          : dealflowUserId,
    });
    assert.ok(capability && sessionMarker);
    authenticatedEmbedCookies =
      `${GHL_EMBED_CAPABILITY_COOKIE}=${capability}; ` +
      `${GHL_EMBED_SESSION_COOKIE}=${sessionMarker}`;
  }
  const headers = new Headers();
  for (const [name, value] of scenarioHeaders) headers.set(name, value);
  headers.set(
    "x-vercel-protection-bypass",
    "synthetic-vercel-bypass-must-not-reach-application",
  );
  headers.set(
    "x-vercel-set-bypass-cookie",
    "synthetic-vercel-cookie-bootstrap-must-not-reach-application",
  );
  headers.set(
    "cookie",
    `_vercel_jwt=synthetic-vercel-jwt-must-not-reach-application${
      authenticatedEmbedCookies ? `; ${authenticatedEmbedCookies}` : ""
    }`,
  );
  if (suppliedSecret) headers.set("x-dealflow-staging-access", suppliedSecret);
  if (suppliedCookieSecret) {
    const ordinaryCookie = scenario === "authorized_cookie_only"
      ? ""
      : "ordinary-cookie=retained; ";
    headers.set(
      "cookie",
      `_vercel_jwt=synthetic-vercel-jwt-must-not-reach-application; ${ordinaryCookie}__Host-dealflow-staging-access=${suppliedCookieSecret}`,
    );
  }
  const response = await proxy(
    new NextRequest(`https://dealflow-isolated.example${path}`, {
      headers,
      method,
      body: requestBody,
    }),
  );
  const serializedHeaders = JSON.stringify([...response.headers]).toLowerCase();
  if (scenario === "ghl_connect_bootstrap_valid") {
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /__Host-dealflow-staging-access=/i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Max-Age=600/i);
  } else {
    assert.doesNotMatch(serializedHeaders, /dealflow-isolated-staging-access-only/);
    assert.doesNotMatch(serializedHeaders, /__host-dealflow-staging-access/);
  }
  assert.doesNotMatch(serializedHeaders, /x-dealflow-staging-access/);
  assert.doesNotMatch(serializedHeaders, /x-vercel-protection-bypass/);
  assert.doesNotMatch(serializedHeaders, /x-vercel-set-bypass-cookie/);
  assert.doesNotMatch(serializedHeaders, /_vercel_jwt/);
  assert.doesNotMatch(serializedHeaders, /synthetic-vercel-bypass-must-not-reach-application/);
  assert.doesNotMatch(serializedHeaders, /synthetic-vercel-cookie-bootstrap-must-not-reach-application/);
  assert.doesNotMatch(serializedHeaders, /synthetic-vercel-jwt-must-not-reach-application/);

  if (
    scenario === "unauthorized" ||
    scenario === "unauthorized_cookie" ||
    scenario === "wrong_internal_cron" ||
    scenario === "missing_internal_cron_secret" ||
    scenario === "unauthorized_static" ||
    scenario === "unauthorized_image" ||
    scenario === "closed_disabled_image_no_gate" ||
    scenario === "closed_disabled_image_header" ||
    scenario === "closed_disabled_image_cookie" ||
    scenario === "private_image_source_no_gate" ||
    scenario === "retired_image_source_no_gate" ||
    scenario === "retired_image_source_header" ||
    scenario === "retired_image_source_cookie" ||
    scenario === "unauthorized_next_internal" ||
    [
      "wrong_static_header",
      "wrong_image_cookie",
      "wrong_next_internal_header",
    ].includes(scenario) ||
    scenario === "lead_capture_blocked"
    || scenario === "ghl_bootstrap_wrong_parent"
    || scenario === "ghl_bootstrap_top_level"
    || scenario === "ghl_connect_bootstrap_invalid"
    || scenario === "ghl_connect_bootstrap_wrong_host_claim"
    || scenario === "ghl_authenticated_static_mismatched_session"
    || scenario === "ghl_authenticated_admin_denied"
  ) {
    assert.equal(response.status, 404);
  } else if (
    scenario === "missing_config" ||
    scenario === "weak_config" ||
    scenario === "wrong_project" ||
    scenario === "missing_project" ||
    scenario === "missing_attestation"
    || scenario === "ghl_bootstrap_missing_config"
  ) {
    assert.equal(response.status, 503);
  } else if (
    scenario === "ghl_connect_bootstrap_valid"
  ) {
    // This fixture intentionally has no Supabase configuration. The valid
    // signed claim must still mint the short-lived staging cookie before the
    // ordinary authenticated-route boundary redirects to setup.
    assert.equal(response.status, 307);
    const location = new URL(
      response.headers.get("location") ?? "",
      "https://dealflow-isolated.example",
    );
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("reason"), "setup");
  } else if (
    scenario === "ghl_marketplace_crm_callback" ||
    scenario === "ghl_marketplace_legacy_callback"
  ) {
    // The isolated outer gate must let the exact OAuth callback reach the
    // ordinary authenticated-route boundary. This fixture deliberately omits
    // Supabase configuration, so that boundary proves itself with a setup
    // redirect rather than a middleware pass-through.
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location") ?? "", "https://dealflow-isolated.example");
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("reason"), "setup");
  } else {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    if (scenario === "authorized_cookie") {
      assert.match(response.headers.get("x-middleware-request-cookie") ?? "", /ordinary-cookie=retained/);
    }
    if (scenario === "authorized_cookie_only") {
      assert.equal(response.headers.get("x-middleware-request-cookie"), null);
    }
  }
  process.stdout.write(`staging access gate scenario ${scenario}: PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
