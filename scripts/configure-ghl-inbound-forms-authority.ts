#!/usr/bin/env -S npx tsx

import {
  createEnvironmentGhlCredentialResolver,
  createGhlProductionAdapter,
  createProductionEnvironmentGhlCredentialResolver,
  ghlProductionGateFromEnvironment,
  ghlSandboxGateFromEnvironment,
  GhlSandboxAdapter,
} from "../src/lib/integrations/gohighlevel";
import { createAdminClient } from "../src/lib/supabase/admin";
import {
  configureGhlInboundFormsAuthorities,
  parseGhlInboundFormsAuthorityBindings,
} from "../src/lib/services/ghl-inbound-forms-authority-configuration-service";

const providerEnvironment = process.argv[2]?.trim() || process.env.GHL_PROVIDER_ENVIRONMENT?.trim();
if (providerEnvironment !== "sandbox" && providerEnvironment !== "production") {
  throw new Error("Usage: npx tsx scripts/configure-ghl-inbound-forms-authority.ts sandbox|production");
}

const client = createAdminClient();
if (!client) throw new Error("Supabase service-role authority is unavailable.");

const prefix = providerEnvironment === "production" ? "GHL_PRODUCTION" : "GHL_SANDBOX";
const enableRuntime = process.env[`${prefix}_INBOUND_FORM_RECONCILIATION_ENABLED`] === "true";
const enablePeriodicSweep = process.env[`${prefix}_INBOUND_FORM_SWEEP_ENABLED`] === "true";
// Emergency disable must remain available even when the registry is absent or
// malformed. Parsing location bindings is an enable/rotation-only concern.
const bindings = enableRuntime
  ? parseGhlInboundFormsAuthorityBindings({
      environment: providerEnvironment,
      serialized: process.env[`${prefix}_INBOUND_FORMS_BINDINGS_JSON`],
    })
  : [];
const authorization = process.env[`${prefix}_INBOUND_FORMS_AUTHORIZATION`];
const sandboxGate = providerEnvironment === "sandbox"
  ? ghlSandboxGateFromEnvironment(process.env)
  : undefined;
const productionGate = providerEnvironment === "production"
  ? ghlProductionGateFromEnvironment("form_submissions_read", process.env)
  : undefined;

const result = await configureGhlInboundFormsAuthorities({
  client: client as any,
  environment: providerEnvironment,
  bindings,
  enableRuntime,
  enablePeriodicSweep,
  authorization,
  sandboxGate,
  productionGate,
  providerFactory: ({ authority, credentialRef }) => providerEnvironment === "production"
    ? createGhlProductionAdapter({
        credentialRef,
        credentialResolver: createProductionEnvironmentGhlCredentialResolver(process.env),
        gate: productionGate!,
        companyId: authority.providerAgencyId,
      })
    : new GhlSandboxAdapter({
        credentialRef,
        credentialResolver: createEnvironmentGhlCredentialResolver(process.env),
        gate: sandboxGate!,
        companyId: authority.providerAgencyId,
      }),
});

// The result contains only canonical ids, counts, and a credential-reference
// fingerprint. It never returns or logs secret values.
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
