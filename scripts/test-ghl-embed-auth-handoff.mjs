#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const capabilitySource = fs.readFileSync(
  "src/lib/white-label/ghl-embed-capability.ts",
  "utf8",
);
const routeSource = fs.readFileSync(
  "src/app/api/integrations/ghl/embed-context/route.ts",
  "utf8",
);
const bootstrapSource = fs.readFileSync(
  "src/app/ghl/embed/ghl-embed-bootstrap.tsx",
  "utf8",
);
const migrationSource = fs.readFileSync(
  "supabase/migrations/20260720010000_add_ghl_embed_sso_authority.sql",
  "utf8",
);
const operatorProbeMigrationSource = fs.readFileSync(
  "supabase/migrations/20260722040000_add_service_only_operator_grant_probe.sql",
  "utf8",
);

function normalizePartnerDomainHost(value) {
  const candidate = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!candidate || candidate.length > 253 || candidate.includes(":") || candidate.includes("/")) {
    return null;
  }
  const labels = candidate.split(".");
  return labels.length >= 2 && labels.every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  ) ? candidate : null;
}

const output = ts.transpileModule(capabilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const loadedModule = { exports: {} };
const runtimeProcess = {
  env: {
    GHL_IFRAME_EMBED_ENABLED: "true",
    GHL_APP_SHARED_SECRET: "sentinel-secure-ghl-app-shared-secret-2026-alpha",
    GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS: "true",
    GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON: "{}",
  },
};
new Function("require", "module", "exports", "process", output)(
  (specifier) => {
    if (specifier.endsWith("verified-partner-domain")) return { normalizePartnerDomainHost };
    throw new Error(`Unexpected capability import: ${specifier}`);
  },
  loadedModule,
  loadedModule.exports,
  runtimeProcess,
);
const helpers = loadedModule.exports;

const now = 1_800_000_000;
const encryptedData = "U2FsdGVkX1+bounded-synthetic-context-payload";
const payloadDigest = await helpers.createGhlEmbedSignedContextDigest(encryptedData);
assert.match(payloadDigest, /^[0-9a-f]{64}$/);
assert.equal(await helpers.createGhlEmbedSignedContextDigest(encryptedData), payloadDigest);
assert.notEqual(payloadDigest, encryptedData);

const handoffInput = {
  receiptId: "10000000-0000-4000-8000-000000000001",
  payloadDigest,
  partnerId: "20000000-0000-4000-8000-000000000001",
  domain: "partner.example",
  organizationId: "30000000-0000-4000-8000-000000000001",
  locationId: "location_partner_001",
  companyId: "company_partner_001",
  ghlUserId: "ghl_user_partner_001",
  dealflowUserId: "40000000-0000-4000-8000-000000000001",
  parentOrigin: "https://app.gohighlevel.com",
};
const handoffToken = await helpers.createGhlEmbedAuthHandoff(handoffInput, now);
assert.ok(handoffToken);
assert.deepEqual(
  await helpers.verifyGhlEmbedAuthHandoff(handoffToken, {
    expectedHost: "partner.example",
    nowSeconds: now + 30,
  }),
  { ...handoffInput, v: 1, iat: now, exp: now + 120 },
);
assert.equal(
  await helpers.verifyGhlEmbedAuthHandoff(handoffToken, {
    expectedHost: "other.example",
    nowSeconds: now + 30,
  }),
  null,
);
assert.equal(
  await helpers.verifyGhlEmbedAuthHandoff(handoffToken, {
    expectedHost: "partner.example",
    nowSeconds: now + 121,
  }),
  null,
);
assert.equal(
  await helpers.verifyGhlEmbedAuthHandoff(`${handoffToken.slice(0, -1)}x`, {
    expectedHost: "partner.example",
    nowSeconds: now + 30,
  }),
  null,
);

for (const marker of [
  "dealflow_user_id",
  "bind_workspace_ghl_dealflow_user_v1",
  "verifyPasswordlessEmbedAuthority",
  "has_platform_operator_grant_v1",
  "account_deletion_suspensions",
  "begin_ghl_embed_auth_exchange_v1",
  "consume_ghl_embed_auth_exchange_v1",
  "verifyGhlEmbedAuthHandoff",
  "createGhlEmbedSignedContextDigest",
  "auth.admin.generateLink",
  "createServerSupabase(response)",
  "responseClient.auth.verifyOtp",
  "responseClient.auth.setSession",
]) {
  assert.ok(routeSource.includes(marker), `embed route is missing ${marker}`);
}
assert.ok(
  routeSource.indexOf("const authorityValid = await verifyPasswordlessEmbedAuthority") <
    routeSource.indexOf("if (dealflowUser)"),
  "active-authority verification must cover existing and passwordless embed sessions",
);
assert.match(routeSource, /consume_ghl_embed_auth_exchange_v1[\s\S]+auth\.admin\.generateLink/);
assert.doesNotMatch(routeSource, /auth\.admin\.createUser/);
assert.doesNotMatch(routeSource, /signInWithPassword/);
assert.doesNotMatch(routeSource, /\.from\(["']platform_operator_grants["']\)/);
assert.match(
  routeSource,
  /provisioningMappings\.length === 1[\s\S]+createGhlMarketplaceEmbedBootstrapClaim[\s\S]+status: "connection_required"/,
  "an interrupted first-install must issue a fresh short-lived authorization claim",
);
assert.doesNotMatch(
  routeSource,
  /provisioningMappings\.length === 1[\s\S]{0,400}ghl_embed_connection_pending/,
  "a provisioning mapping must not deadlock OAuth recovery",
);
assert.match(
  routeSource,
  /operatorResult\.data === false/,
  "embed authority must fail closed when the service-only operator probe is not exactly false",
);
for (const marker of [
  "security definer",
  "has_platform_operator_grant_v1",
  "platform_operator_grants",
  "service_role_required",
  "has_table_privilege",
  "has_function_privilege",
]) {
  assert.ok(
    operatorProbeMigrationSource.includes(marker),
    `operator grant probe migration is missing ${marker}`,
  );
}
assert.doesNotMatch(
  operatorProbeMigrationSource,
  /grant\s+select\s+on\s+(?:table\s+)?public\.platform_operator_grants/i,
);
for (const marker of [
  "auth.users",
  "platform_operator_grants",
  "account_deletion_suspensions",
  "email_confirmed_at",
  "is_anonymous",
  "dealflow_user_id",
  "service_role_required",
  "ghl_embed_auth_exchange_digest_unique",
  "interval '24 hours'",
]) {
  assert.ok(migrationSource.includes(marker), `embed migration is missing ${marker}`);
}
assert.doesNotMatch(migrationSource, /createUser|signInWithPassword/);
assert.match(bootstrapSource, /finalizationAttemptedRef/);
assert.match(bootstrapSource, /await document\.requestStorageAccess\(\);[\s\S]+await finalizeHandoff\(handoff\)/);
assert.doesNotMatch(
  bootstrapSource,
  /await document\.requestStorageAccess\(\);[\s\S]{0,200}await exchangeContext\(context\)/,
);

console.log("GHL embed one-time passwordless handoff, authority, and storage-access contract: PASS");
