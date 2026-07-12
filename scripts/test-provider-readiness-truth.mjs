#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function loadStripeProviderModule() {
  const file = "src/lib/integrations/stripe/provider.ts";
  const transpiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const moduleShim = { exports: {} };
  const context = vm.createContext({
    Date,
    Error,
    module: moduleShim,
    exports: moduleShim.exports,
    require(specifier) {
      if (specifier === "stripe") return class FakeStripe {};
      if (specifier === "@/lib/api/route") return { ApiError: Error };
      if (specifier === "@/lib/env") {
        return {
          getStripeEnv: () => null,
          validateStripeEnv: () => ({ configured: false, missing: ["STRIPE_SECRET_KEY"] }),
        };
      }
      throw new Error(`Unexpected test import: ${specifier}`);
    },
  });
  vm.runInContext(transpiled, context, { filename: file });
  return moduleShim.exports;
}

const { buildStripeConfigurationStatus } = loadStripeProviderModule();
const absent = buildStripeConfigurationStatus({
  configured: false,
  missingConfig: ["STRIPE_SECRET_KEY"],
});
assert.equal(absent.status, "disconnected");
assert.equal(absent.state, "not_configured");
assert.equal(absent.metadata.configured, false);

const configured = buildStripeConfigurationStatus({ configured: true, missingConfig: [] });
assert.equal(configured.status, "pending");
assert.equal(configured.state, "configured");
assert.equal(configured.metadata.evidenceScope, "configuration_only");
assert.equal(configured.metadata.configured, true);
assert.equal(configured.metadata.reachable, null);
assert.equal(configured.metadata.authenticated, null);
assert.equal(configured.metadata.functional, null);
assert.match(configured.message, /not proven/i);
assert.doesNotMatch(configured.message, /ready/i);

const registrySource = fs.readFileSync(
  "src/lib/integrations/provider-registry.ts",
  "utf8",
);
const contractsSource = fs.readFileSync("src/lib/integrations/contracts.ts", "utf8");
for (const creativeProviderPath of [
  "src/lib/integrations/creative/image-provider.ts",
  "src/lib/integrations/creative/avatar-provider.ts",
  "src/lib/integrations/creative/voice-provider.ts",
]) {
  const source = fs.readFileSync(creativeProviderPath, "utf8");
  assert.match(source, /buildConfigurationOnlyProviderStatus/);
  assert.doesNotMatch(
    source,
    /status:\s*validation\.configured\s*\?\s*"connected"/,
    `${creativeProviderPath} still promotes configuration-only evidence to connected`,
  );
}
assert.match(contractsSource, /safeStatus === "configured"/);
assert.doesNotMatch(
  contractsSource,
  /safeStatus === "connected" \|\| safeStatus === "configured"/,
);
assert.match(registrySource, /aggregateReadinessAuthority:\s*false/);
for (const system of [
  "gohighlevel_tenant_provisioning",
  "twilio_messaging",
  "supabase_database_auth",
  "support_notification_delivery",
]) {
  assert.match(registrySource, new RegExp(system));
}
for (const dimension of [
  "configured",
  "reachable",
  "authenticated",
  "functional",
  "observed_at",
]) {
  assert.match(registrySource, new RegExp(`"${dimension}"`));
}

console.log("Provider readiness truth contract passed (configuration is not live readiness).");
