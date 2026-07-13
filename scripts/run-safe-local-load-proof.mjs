#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";

const port = 3420;
const baseUrl = `http://127.0.0.1:${port}`;
const attestation = "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";
const internalSecret = randomBytes(32).toString("hex");

if (process.versions.node.split(".")[0] !== "20") {
  throw new Error(`Safe local load proof requires Node 20; received ${process.version}`);
}
if (!existsSync(".next/BUILD_ID")) {
  throw new Error("Safe local load proof requires the current production build output");
}

const safeServerEnvironment = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  DEALFLOW_DEPLOYMENT_TARGET: "test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-local-anon-key",
  QA_ISOLATED_SUPABASE_PROJECT_REF: "local",
  INTERNAL_SYSTEM_JOBS_SECRET: internalSecret,
  SCHEMA_VALIDATION_MODE: "warn",
  BILLING_CHECKOUT_SAFE_MODE: "true",
  ALLOW_BILLING_ADMIN_OVERRIDE: "false",
  ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE: "false",
  STRIPE_FORCE_TEST_MODE: "false",
  ALLOW_AI_TEXT_GENERATION: "false",
  ALLOW_OPENAI_IMAGE_GENERATION: "false",
  ALLOW_HEYGEN_VIDEO_GENERATION: "false",
  ALLOW_HIGGSFIELD_VIDEO_GENERATION: "false",
  ALLOW_ELEVENLABS_VOICE_GENERATION: "false",
  ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "false",
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "false",
  ENABLE_DEMO_WORKSPACE_SEEDING: "false",
  ENABLE_STRUCTURED_INFO_LOGS: "false",
  PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED: "false",
  UI_DIRECTION_PREVIEW: "0",
  GHL_IFRAME_EMBED_ENABLED: "false",
  ALLOW_META_LIVE_LAUNCH: "false",
  ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_META_DUE_ACTIVATION: "false",
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false",
  ALLOW_META_STAGING_DUE_ACTIVATION: "false",
  ALLOW_META_SANDBOX_OPTIMIZATION: "false",
  ALLOW_META_PRODUCTION_OPTIMIZATION: "false",
  META_OPTIMIZATION_EXECUTION_MODE: "shadow",
  ALLOW_META_CAPI_EVENTS: "false",
  ALLOW_META_PIXEL_EVENTS: "false",
  ALLOW_META_LAUNCH_INTERRUPTION_TESTS: "false",
  ENABLE_META_LAUNCH_TEST_MODE: "false",
  META_EXECUTION_MODE: "sandbox",
  GHL_SANDBOX_WRITES_ENABLED: "false",
  GHL_PRODUCTION_WRITES_ENABLED: "false",
  GHL_PRODUCTION_PROVISIONING_ENABLED: "false",
  GHL_PRODUCTION_LEAD_DELIVERY_ENABLED: "false",
  GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED: "false",
  GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED: "false",
  SUPPORT_EXTERNAL_DELIVERY_ENABLED: "false",
  SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED: "false",
  SUPPORT_MAIL_SINK_ENABLED: "false",
  SUPPORT_STAGING_SINK_ENABLED: "false",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox",
  INTERNAL_LEAD_SMS_ENABLED: "false",
  SMS_MOCK_MODE: "false",
  TEST_SMS_MODE: "",
  SMS_COMPLIANCE_ACK: "",
  STRIPE_TEST_HARNESS_ENABLED: "false",
  ENABLE_ACCESS_KEY_CHECKOUT: "false",
  ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED: "false",
  LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED: "false",
  LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE: "false",
  TWILIO_EXECUTION_MODE: "disabled",
};

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: process.cwd(),
    env: safeServerEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-16_000);
  });
}

async function waitForReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("Safe local load server exited before readiness");
    }
    try {
      const response = await fetch(`${baseUrl}/privacy`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The bounded readiness loop is intentionally quiet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Safe local load server did not become ready within 60 seconds");
}

let loadResult;
try {
  await waitForReady();
  loadResult = spawn(process.execPath, ["scripts/load-test.mjs", "routes"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOAD_BASE_URL: baseUrl,
      LOAD_CONCURRENCY: "20",
      LOAD_REQUESTS: "100",
      LOAD_MAX_ERROR_RATE: "0",
      LOAD_MAX_P95_MS: "2500",
      LOAD_ZERO_EXTERNAL_EFFECTS_ATTESTATION: attestation,
      LOAD_TEST_INTERNAL_SECRET: internalSecret,
    },
    stdio: "inherit",
  });
  const [exitCode] = await once(loadResult, "exit");
  if (exitCode !== 0) throw new Error("Safe local route load proof failed");
} finally {
  if (loadResult?.exitCode === null) loadResult.kill("SIGTERM");
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

if (/\b(?:secret|token|password)\s*[=:]\s*\S+/i.test(serverOutput)) {
  throw new Error("Safe local load server output contained a probable credential assignment");
}

console.log("safe local load proof: PASS (100 route requests, centralized server-side zero-external-effects gate)");
