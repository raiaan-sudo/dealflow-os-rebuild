#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const proxy = readFileSync(join(root, "src", "proxy.ts"), "utf8");
const runner = readFileSync(
  join(root, "scripts", "staging", "run-isolated-staging-acceptance.mjs"),
  "utf8",
);
const optimizerSourceRoute = readFileSync(
  join(root, "src", "app", "staging-image-optimizer-proof.png", "route.ts"),
  "utf8",
);
const scenarioPath = join(
  root,
  "scripts",
  "staging",
  "staging-access-gate-scenario.ts",
);
const optimizerRouteScenarioPath = join(
  root,
  "scripts",
  "staging",
  "staging-image-optimizer-proof-route-scenario.ts",
);
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const canonicalStagingProjectId = String(
  JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"))
    .projectId,
);

assert.match(proxy, /isExactIsolatedStagingVercelHost\(\)/);
assert.match(proxy, /isStrongSecretValue\(secret\)/);
assert.match(proxy, /timingSafeTokenEquals\(headerCandidate, secret\)/);
assert.match(proxy, /timingSafeTokenEquals\(cookieCandidate, secret\)/);
assert.match(proxy, /requestHeaders\.delete\(STAGING_ACCESS_HEADER\)/);
assert.match(proxy, /removeCookieFromRequestHeader\(/);
assert.match(proxy, /STAGING_ACCESS_COOKIE/);
assert.match(proxy, /rawPathname === "\/_next"/);
assert.match(proxy, /rawPathname\.startsWith\("\/_next\/"\)/);
assert.match(proxy, /matcher: \["\/:path\*"\]/);
assert.match(proxy, /STAGING_IMAGE_OPTIMIZER_SOURCE_PATH/);
assert.match(proxy, /pathname === STAGING_IMAGE_OPTIMIZER_SOURCE_PATH/);
assert.match(runner, /%2Fstaging-image-optimizer-proof\.png/);
assert.match(runner, /requestExactPublicOptimizerSource/);
assert.match(optimizerSourceRoute, /"Content-Type": "image\/png"/);
assert.match(optimizerSourceRoute, /"X-Content-Type-Options": "nosniff"/);
assert.match(optimizerSourceRoute, /isExactIsolatedStagingVercelHost\(\)/);
assert.match(optimizerSourceRoute, /status: 404/);
assert.match(optimizerSourceRoute, /"Cache-Control": "private, no-store, max-age=0"/);
assert.doesNotMatch(proxy, /\(\?!_next\/static\|_next\/image\)/);
assert.match(proxy, /hostedProductionSlot && explicitlyStaging && !exactIsolatedStagingHost/);
assert.doesNotMatch(
  /const STAGING_NATIVE_PROVIDER_CALLBACK_PATHS = new Set\(\[([\s\S]*?)\]\);/.exec(proxy)?.[1] ?? "",
  /lead-capture/,
);
for (const path of [
  "/api/integrations/ghl/webhook",
  "/api/meta/data-deletion",
  "/api/meta/leadgen/webhook",
  "/api/sms/twilio",
  "/api/stripe/webhook",
  "/api/webhooks/twilio/status",
]) {
  assert.match(proxy, new RegExp(`"${path.replaceAll("/", "\\/")}"`));
}
assert.match(
  readFileSync(join(root, "src/app/api/meta/leadgen/webhook/route.ts"), "utf8"),
  /verifyMetaLeadgenWebhookSignature/,
);
assert.match(
  readFileSync(join(root, "src/app/api/meta/data-deletion/route.ts"), "utf8"),
  /parseSignedRequest/,
);
assert.match(
  readFileSync(join(root, "src/app/api/integrations/ghl/webhook/route.ts"), "utf8"),
  /verifyGhlWebhookSignature/,
);
assert.match(
  readFileSync(join(root, "src/app/api/stripe/webhook/route.ts"), "utf8"),
  /construct_webhook_event/,
);
for (const route of [
  "src/app/api/sms/twilio/route.ts",
  "src/app/api/webhooks/twilio/status/route.ts",
]) {
  assert.match(readFileSync(join(root, route), "utf8"), /validateTwilioWebhookSignature/);
}
assert.match(runner, /randomBytes\(48\)\.toString\("base64url"\)/);
assert.match(runner, /STAGING_ACCESS_GATE_SECRET: stagingAccessGateSecret/);
assert.match(runner, /withStagingAccess/);

for (const scenario of [
  "authorized",
  "authorized_static_header",
  "authorized_static_cookie",
  "wrong_static_header",
  "authorized_image_header",
  "authorized_image_cookie",
  "wrong_image_cookie",
  "public_optimizer_source",
  "authorized_next_internal_header",
  "authorized_next_internal_cookie",
  "wrong_next_internal_header",
  "authorized_cookie",
  "authorized_cookie_only",
  "unauthorized_cookie",
  "unauthorized_static",
  "unauthorized_image",
  "unauthorized_next_internal",
  "unauthorized",
  "missing_config",
  "weak_config",
  "wrong_project",
  "missing_project",
  "missing_attestation",
  "production_ungated",
  "production_static_ungated",
  "native_callback",
  "lead_capture_blocked",
]) {
  const result = spawnSync(process.execPath, [tsxCli, scenarioPath, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID: canonicalStagingProjectId,
    },
  });
  assert.equal(
    result.status,
    0,
    `staging access scenario ${scenario} failed:\n${result.stderr}\n${result.stdout}`,
  );
  assert.match(result.stdout, new RegExp(`scenario ${scenario}: PASS`));
}

for (const scenario of [
  "exact-staging",
  "production",
  "forged-project",
  "forged-attestation",
]) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, optimizerRouteScenarioPath, scenario],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/private/tmp",
        DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID: canonicalStagingProjectId,
      },
    },
  );
  assert.equal(
    result.status,
    0,
    `staging optimizer proof route scenario ${scenario} failed:\n${result.stderr}\n${result.stdout}`,
  );
  assert.match(result.stdout, new RegExp(`staging optimizer proof route ${scenario}: PASS`));
}

console.log(
  "isolated staging access gate: PASS (private app and lead-capture surface; fail-closed secret; no secret forwarding; production unaffected; exact native-signed provider callbacks remain reachable)",
);
