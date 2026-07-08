import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("src/lib/api/route.ts", "utf8");
const clientRouteSource = readFileSync("src/app/api/client-errors/route.ts", "utf8");
const telemetryServiceSource = readFileSync("src/lib/services/client-error-telemetry-service.ts", "utf8");
const leadFormSource = readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");

for (const origin of [
  "https://clicktoscale.io",
  "https://www.clicktoscale.io",
  "https://agentdealflow.io",
  "https://app.agentdealflow.io",
  "https://www.agentdealflow.io",
  "https://dealflow-os-rebuild.vercel.app",
]) {
  assert.ok(routeSource.includes(origin), `${origin} must be trusted explicitly`);
}

for (const envKey of [
  "PUBLIC_FUNNEL_BASE_URLS",
  "TRUSTED_APP_ORIGINS",
  "DEALFLOW_PLATFORM_FUNNEL_HOSTS",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
]) {
  assert.match(routeSource, new RegExp(envKey), `${envKey} must contribute to trusted origin resolution`);
}

assert.match(routeSource, /value\.trim\(\) === "\*"/, "trusted origin resolver must reject wildcard origins");
assert.match(routeSource, /if \(!candidate && referer\)/, "missing Origin with trusted Referer must be handled");
assert.match(routeSource, /localHost/, "localhost must be handled explicitly for local next start browser proof");
assert.match(routeSource, /isLocalHostname/, "local trust must be limited to localhost-style hosts");
assert.match(clientRouteSource, /assertSameOriginRequest\(request\)/, "client telemetry route must keep same-origin protection");
assert.match(clientRouteSource, /z\.enum\(\["public_lead_capture"\]\)/, "client telemetry source must be allowlisted");

for (const eventName of [
  "lead_form_viewed",
  "lead_form_started",
  "lead_form_submit_attempted",
  "lead_form_validation_failed",
  "lead_capture_client_success",
  "lead_capture_client_failed",
]) {
  assert.match(clientRouteSource, new RegExp(eventName), `${eventName} must be an allowed telemetry event`);
}

assert.match(telemetryServiceSource, /FORBIDDEN_METADATA_KEY/, "telemetry service must strip PII metadata keys");
assert.match(telemetryServiceSource, /FORBIDDEN_TEXT_PATTERN/, "telemetry service must scrub PII-like text");
assert.match(clientRouteSource, /maxBytes: 18 \* 1024/, "client telemetry payload size must stay bounded");
assert.match(leadFormSource, /navigator\.sendBeacon\("\/api\/client-errors"/, "public lead telemetry must stay non-blocking");

console.log("Client telemetry origin and safety contract passed.");
