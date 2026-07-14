import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const scenario = process.argv[2];
const secret = "T9!dealflow-isolated-staging-access-only-84Q";
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
});

let path = "/privacy";
let suppliedSecret: string | null = null;
let suppliedCookieSecret: string | null = null;
if (scenario === "authorized") {
  suppliedSecret = secret;
} else if (scenario === "authorized_static_header") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedSecret = secret;
} else if (scenario === "authorized_static_cookie") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedCookieSecret = secret;
} else if (scenario === "wrong_static_header") {
  path = "/_next/static/chunks/staging-gate-proof.js";
  suppliedSecret = "W".repeat(secret.length);
} else if (scenario === "authorized_image_header") {
  path = "/_next/image?url=%2Fstaging-image-optimizer-proof.png&w=32&q=75";
  suppliedSecret = secret;
} else if (scenario === "authorized_image_cookie") {
  path = "/_next/image?url=%2Fstaging-image-optimizer-proof.png&w=32&q=75";
  suppliedCookieSecret = secret;
} else if (scenario === "wrong_image_cookie") {
  path = "/_next/image?url=%2Fstaging-image-optimizer-proof.png&w=32&q=75";
  suppliedCookieSecret = "W".repeat(secret.length);
} else if (scenario === "public_optimizer_source") {
  path = "/staging-image-optimizer-proof.png";
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
} else if (scenario === "unauthorized_static") {
  path = "/_next/static/chunks/staging-gate-proof.js";
} else if (scenario === "unauthorized_image") {
  path = "/_next/image?url=%2Fstaging-image-optimizer-proof.png&w=32&q=75";
} else if (scenario === "unauthorized_next_internal") {
  path = "/_next/data/staging-gate-proof.json";
} else if (scenario === "native_callback") {
  path = "/api/stripe/webhook";
} else if (scenario === "lead_capture_blocked") {
  path = "/api/lead-capture";
} else if (scenario !== "unauthorized") {
  throw new Error(`Unknown staging access gate scenario: ${scenario}`);
}

async function main() {
  const { proxy } = await import("../../src/proxy");
  const headers = new Headers();
  if (suppliedSecret) headers.set("x-dealflow-staging-access", suppliedSecret);
  if (suppliedCookieSecret) {
    const ordinaryCookie = scenario === "authorized_cookie_only"
      ? ""
      : "ordinary-cookie=retained; ";
    headers.set(
      "cookie",
      `${ordinaryCookie}__Host-dealflow-staging-access=${suppliedCookieSecret}`,
    );
  }
  const response = await proxy(
    new NextRequest(`https://dealflow-isolated.example${path}`, { headers }),
  );
  const serializedHeaders = JSON.stringify([...response.headers]).toLowerCase();
  assert.doesNotMatch(serializedHeaders, /dealflow-isolated-staging-access-only/);
  assert.doesNotMatch(serializedHeaders, /x-dealflow-staging-access/);
  assert.doesNotMatch(serializedHeaders, /__host-dealflow-staging-access/);

  if (
    scenario === "unauthorized" ||
    scenario === "unauthorized_cookie" ||
    scenario === "unauthorized_static" ||
    scenario === "unauthorized_image" ||
    scenario === "unauthorized_next_internal" ||
    [
      "wrong_static_header",
      "wrong_image_cookie",
      "wrong_next_internal_header",
    ].includes(scenario) ||
    scenario === "lead_capture_blocked"
  ) {
    assert.equal(response.status, 404);
  } else if (
    scenario === "missing_config" ||
    scenario === "weak_config" ||
    scenario === "wrong_project" ||
    scenario === "missing_project" ||
    scenario === "missing_attestation"
  ) {
    assert.equal(response.status, 503);
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
