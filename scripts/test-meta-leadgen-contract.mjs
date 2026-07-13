#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const nodeRequire = createRequire(import.meta.url);

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadTsModule(file, mocks, env = {}) {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === "node:crypto") return crypto;
      if (specifier === "zod") return nodeRequire("zod");
      throw new Error(`Unexpected test import: ${specifier}`);
    },
    process: { env: { NODE_ENV: "test", ...env } },
    crypto,
    Buffer,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    console,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: file });
  return context.module.exports;
}

const apiMock = { ApiError: TestApiError };
const contract = loadTsModule(
  "src/lib/integrations/meta/leadgen-contract.ts",
  { "@/lib/api/route": apiMock },
);
const rawBody = fs.readFileSync(
  "scripts/fixtures/meta-leadgen/valid-webhook.json",
  "utf8",
);
const providerLead = JSON.parse(
  fs.readFileSync("scripts/fixtures/meta-leadgen/provider-lead.json", "utf8"),
);
const providerAd = JSON.parse(
  fs.readFileSync("scripts/fixtures/meta-leadgen/provider-ad.json", "utf8"),
);
const appSecret = "offline-meta-app-secret-with-at-least-32-bytes";
const verifyToken = "offline-meta-verify-token-with-at-least-32-bytes";
const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

assert.equal(
  contract.verifyMetaLeadgenWebhookSignature({
    rawBody,
    signatureHeader: signature,
    appSecret,
  }),
  true,
);
assert.equal(
  contract.verifyMetaLeadgenWebhookSignature({
    rawBody,
    signatureHeader: `sha256=${"0".repeat(64)}`,
    appSecret,
  }),
  false,
);
assert.equal(contract.timingSafeMetaVerifyTokenEquals(verifyToken, verifyToken), true);
assert.equal(contract.timingSafeMetaVerifyTokenEquals(`${verifyToken}x`, verifyToken), false);

const events = contract.parseMetaLeadgenWebhookPayload(rawBody);
assert.equal(events.length, 1);
assert.equal(events[0].providerLeadgenId, "200000000000001");
assert.equal(events[0].providerPageId, "100000000000001");
assert.equal(events[0].providerFormId, "300000000000001");
assert.equal(events[0].providerAdId, "400000000000001");

const verified = contract.assertMetaLeadgenProviderIdentity({
  event: events[0],
  expectedAdAccountId: "act_500000000000001",
  providerLead,
  providerAd,
});
assert.equal(verified.normalizedAdAccountId, "500000000000001");
assert.throws(
  () =>
    contract.assertMetaLeadgenProviderIdentity({
      event: events[0],
      expectedAdAccountId: "500000000000099",
      providerLead,
      providerAd,
    }),
  (error) => error?.code === "meta_leadgen_provider_identity_mismatch",
);

const normalized = contract.normalizeMetaLeadgenProviderLead(providerLead);
assert.equal(normalized.name, "Offline Fixture Lead");
assert.equal(normalized.email, "meta-leadgen-fixture@example.com");
assert.equal(normalized.phone, "+14165550199");
assert.deepEqual(
  JSON.parse(JSON.stringify(normalized.customAnswers)),
  { preferred_area: "Fixture District" },
);
assert.equal(Object.hasOwn(normalized, "smsConsent"), false);

const PROVISION_ORG = "20000000-0000-4000-8000-000000000001";
const PROVISION_USER = "10000000-0000-4000-8000-000000000001";
const PROVISION_ORDINARY_MEMBER = "10000000-0000-4000-8000-000000000002";
const PROVISION_ADMIN_MEMBER = "10000000-0000-4000-8000-000000000003";
const PROVISION_ORGANIZATION_OWNER = "10000000-0000-4000-8000-000000000004";
const PROVISION_CAMPAIGN = "30000000-0000-4000-8000-000000000001";
const PROVISION_ACCOUNT = "40000000-0000-4000-8000-000000000001";
const PROVISION_ROUTE = "90000000-0000-4000-8000-000000000001";
const membershipRoles = new Map([
  [PROVISION_USER, "member"],
  [PROVISION_ORDINARY_MEMBER, "member"],
  [PROVISION_ADMIN_MEMBER, "admin"],
]);
let campaignVisible = true;
let campaignLaunchStatus = "provider_paused";
let accountSelectionComplete = true;
let provisioned = false;
let provisioningRpcCount = 0;
let expectedProvisioningActor = PROVISION_USER;

function fakeRows(relation, filters) {
  if (relation === "campaign_launch_records") {
    return [{
      id: "80000000-0000-4000-8000-000000000001",
      organization_id: PROVISION_ORG,
      user_id: PROVISION_USER,
      campaign_id: PROVISION_CAMPAIGN,
      result_status: "success",
      launch_mode: "provider_paused",
      meta_campaign_id: "710000000000001",
      meta_ad_set_ids: ["720000000000001"],
      meta_creative_id: "730000000000001",
      meta_ad_ids: ["740000000000001"],
    }];
  }
  if (relation === "marketing_accounts") {
    return [{
      id: PROVISION_ACCOUNT,
      organization_id: PROVISION_ORG,
      platform: "meta_ads",
      status: "connected",
      external_account_id: accountSelectionComplete ? "act_500000000000001" : null,
      access_token_encrypted: accountSelectionComplete ? "offline-encrypted-token" : null,
      connection_metadata: accountSelectionComplete
        ? { selected_page_id: "100000000000001" }
        : {},
    }];
  }
  throw new Error(`Unexpected fake list relation: ${relation} ${JSON.stringify(filters)}`);
}

function fakeMaybeSingle(relation, filters) {
  if (relation === "organizations") {
    return { id: PROVISION_ORG, owner_user_id: PROVISION_ORGANIZATION_OWNER };
  }
  if (relation === "organization_memberships") {
    const role = membershipRoles.get(filters.user_id);
    return role
      ? { organization_id: PROVISION_ORG, user_id: filters.user_id, role }
      : null;
  }
  if (relation === "campaign_plans") {
    if (!campaignVisible || filters.organization_id !== PROVISION_ORG) return null;
    return {
      id: PROVISION_CAMPAIGN,
      organization_id: PROVISION_ORG,
      user_id: PROVISION_USER,
      launch_status: campaignLaunchStatus,
    };
  }
  throw new Error(`Unexpected fake single relation: ${relation}`);
}

const provisioningAdmin = {
  from(relation) {
    const filters = {};
    const builder = {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      order() { return this; },
      limit() { return this; },
      async maybeSingle() {
        return { data: fakeMaybeSingle(relation, filters), error: null };
      },
      then(resolve, reject) {
        return Promise.resolve({ data: fakeRows(relation, filters), error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
  async rpc(name, params) {
    assert.equal(name, "upsert_meta_leadgen_route");
    assert.equal(params.p_organization_id, PROVISION_ORG);
    assert.equal(params.p_actor_user_id, expectedProvisioningActor);
    assert.equal(params.p_user_id, PROVISION_USER);
    assert.equal(params.p_campaign_id, PROVISION_CAMPAIGN);
    assert.equal(params.p_marketing_account_id, PROVISION_ACCOUNT);
    assert.equal(params.p_provider_ad_account_id, "500000000000001");
    assert.equal(params.p_provider_page_id, "100000000000001");
    assert.equal(params.p_provider_form_id, "300000000000001");
    provisioningRpcCount += 1;
    provisioned = true;
    return {
      data: [{
        id: PROVISION_ROUTE,
        organization_id: PROVISION_ORG,
        user_id: PROVISION_USER,
        campaign_id: PROVISION_CAMPAIGN,
        marketing_account_id: PROVISION_ACCOUNT,
        provider_ad_account_id: "500000000000001",
        provider_page_id: "100000000000001",
        provider_form_id: "300000000000001",
        status: "active",
      }],
      error: null,
    };
  },
};
const provisioningService = loadTsModule(
  "src/lib/services/meta-leadgen-route-service.ts",
  {
    "server-only": {},
    "@/lib/api/route": apiMock,
    "@/lib/logging": { logOperationalEvent: () => undefined },
    "@/lib/server/supabase-admin": { createAdminClient: () => provisioningAdmin },
  },
);
const provisionInput = {
  actorUserId: PROVISION_USER,
  organizationId: PROVISION_ORG,
  campaignId: PROVISION_CAMPAIGN,
  providerFormId: "300000000000001",
};
const firstProvision = await provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput);
const replayProvision = await provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput);
assert.equal(firstProvision.id, PROVISION_ROUTE);
assert.equal(replayProvision.id, PROVISION_ROUTE);
assert.equal(provisioningRpcCount, 2, "replay did not use the idempotent route RPC");

await assert.rejects(
  provisioningService.provisionMetaLeadgenRouteForCampaign({
    ...provisionInput,
    actorUserId: PROVISION_ORDINARY_MEMBER,
  }),
  (error) => error?.code === "meta_leadgen_route_role_required",
);
assert.equal(provisioningRpcCount, 2, "ordinary member reached the route mutation RPC");

membershipRoles.delete(PROVISION_USER);
await assert.rejects(
  provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput),
  (error) => error?.code === "meta_leadgen_membership_required",
);
assert.equal(provisioningRpcCount, 2, "removed campaign owner reached the route mutation RPC");
membershipRoles.set(PROVISION_USER, "member");

expectedProvisioningActor = PROVISION_ADMIN_MEMBER;
const adminProvision = await provisioningService.provisionMetaLeadgenRouteForCampaign({
  ...provisionInput,
  actorUserId: PROVISION_ADMIN_MEMBER,
});
assert.equal(adminProvision.id, PROVISION_ROUTE);

expectedProvisioningActor = PROVISION_ORGANIZATION_OWNER;
const organizationOwnerProvision =
  await provisioningService.provisionMetaLeadgenRouteForCampaign({
    ...provisionInput,
    actorUserId: PROVISION_ORGANIZATION_OWNER,
  });
assert.equal(organizationOwnerProvision.id, PROVISION_ROUTE);
assert.equal(provisioningRpcCount, 4, "owner/admin route authorization was not preserved");

expectedProvisioningActor = PROVISION_USER;
campaignVisible = false;
await assert.rejects(
  provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput),
  (error) => error?.code === "campaign_not_found",
);
campaignVisible = true;
campaignLaunchStatus = "draft";
await assert.rejects(
  provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput),
  (error) => error?.code === "meta_leadgen_campaign_not_launch_ready",
);
campaignLaunchStatus = "provider_paused";
accountSelectionComplete = false;
await assert.rejects(
  provisioningService.provisionMetaLeadgenRouteForCampaign(provisionInput),
  (error) => error?.code === "meta_leadgen_meta_selection_incomplete",
);
accountSelectionComplete = true;

const accepted = [];
const apiRouteMock = {
  ApiError: TestApiError,
  apiSuccess(data, init) {
    return Response.json(data, init);
  },
  handleApiError(error) {
    return Response.json(
      { code: error?.code ?? "unknown", error: error?.message ?? "Unknown error" },
      { status: error?.status ?? 500 },
    );
  },
  async parseTextBody(request, options) {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      throw new TestApiError(413, "Body too large.", options.code);
    }
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > options.maxBytes) {
      throw new TestApiError(413, "Body too large.", options.code);
    }
    return text;
  },
};
const route = loadTsModule(
  "src/app/api/meta/leadgen/webhook/route.ts",
  {
    "@/lib/api/route": apiRouteMock,
    "@/lib/api/rate-limit": {
      buildRateLimitResponse: () => Response.json({ code: "rate_limited" }, { status: 429 }),
      consumeRateLimit: async () => null,
      getHashedRateLimitIdentifier: () => "offline-ip-hash",
      getRateLimitKey: () => "offline-rate-key",
      getRequestIp: () => "127.0.0.1",
    },
    "@/lib/env": {
      isStrongSecretValue: (value) =>
        typeof value === "string" && Buffer.byteLength(value.trim()) >= 32,
    },
    "@/lib/integrations/meta/leadgen-contract": contract,
    "@/lib/logging": { logOperationalEvent: () => undefined },
    "@/lib/services/meta-leadgen-ingestion-service": {
      async acceptMetaLeadgenWebhookEvent(input) {
        assert.equal(provisioned, true, "signed ingestion ran before route provisioning");
        accepted.push(input);
        return {
          eventId: "offline-event-id",
          disposition: "queued",
          queued: true,
          reconciliationJobId: "offline-job-id",
        };
      },
    },
  },
  {
    META_APP_SECRET: appSecret,
    META_LEADGEN_VERIFY_TOKEN: verifyToken,
  },
);

const challengeResponse = await route.GET(
  new Request(
    `https://app.invalid/api/meta/leadgen/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=offline-challenge`,
  ),
);
assert.equal(challengeResponse.status, 200);
assert.equal(await challengeResponse.text(), "offline-challenge");

const deniedChallenge = await route.GET(
  new Request(
    "https://app.invalid/api/meta/leadgen/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x",
  ),
);
assert.equal(deniedChallenge.status, 403);

const validResponse = await route.POST(
  new Request("https://app.invalid/api/meta/leadgen/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "content-length": String(Buffer.byteLength(rawBody)),
    },
    body: rawBody,
  }),
);
assert.equal(validResponse.status, 200);
assert.equal((await validResponse.json()).queuedCount, 1);
assert.equal(accepted.length, 1);

const invalidSignatureResponse = await route.POST(
  new Request("https://app.invalid/api/meta/leadgen/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
    body: rawBody,
  }),
);
assert.equal(invalidSignatureResponse.status, 401);
assert.equal((await invalidSignatureResponse.json()).code, "meta_leadgen_signature_invalid");
assert.equal(accepted.length, 1, "invalid signature reached the durable acceptor");

const malformedBody = "{not-json";
const malformedResponse = await route.POST(
  new Request("https://app.invalid/api/meta/leadgen/webhook", {
    method: "POST",
    headers: {
      "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", appSecret).update(malformedBody).digest("hex")}`,
    },
    body: malformedBody,
  }),
);
assert.equal(malformedResponse.status, 400);
assert.equal((await malformedResponse.json()).code, "meta_leadgen_invalid_json");

const oversized = "x".repeat(contract.META_LEADGEN_WEBHOOK_BODY_LIMIT_BYTES + 1);
const oversizedResponse = await route.POST(
  new Request("https://app.invalid/api/meta/leadgen/webhook", {
    method: "POST",
    headers: {
      "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", appSecret).update(oversized).digest("hex")}`,
      "content-length": String(Buffer.byteLength(oversized)),
    },
    body: oversized,
  }),
);
assert.equal(oversizedResponse.status, 413);
assert.equal((await oversizedResponse.json()).code, "meta_leadgen_body_too_large");

const serviceSource = fs.readFileSync(
  "src/lib/services/meta-leadgen-ingestion-service.ts",
  "utf8",
);
assert.match(serviceSource, /enabledEffects:\s*\["ghl_delivery"\]/);
assert.match(serviceSource, /requiredEffects:\s*\["ghl_delivery"\]/);
assert.match(serviceSource, /communicationsEnabled:\s*false/);
assert.match(serviceSource, /capiEnabled:\s*false/);
assert.match(serviceSource, /ghlDeliveryRequested:\s*true/);
assert.match(serviceSource, /providerMutationPerformed:\s*false/);
assert.match(serviceSource, /createVerifiedProviderLeadAndStartConversation/);
assert.doesNotMatch(serviceSource, /sendSMS|sendEmail|safeSendMetaLeadConversion|fetchMetaResponse\([^)]*method:\s*["']POST/);
assert.match(serviceSource, /\.eq\("organization_id", params\.claim\.organizationId\)/);
assert.match(serviceSource, /\.eq\("campaign_id", params\.claim\.campaignId\)/);
assert.match(serviceSource, /\.eq\("user_id", params\.claim\.userId\)/);

const leadHandlerSource = fs.readFileSync(
  "src/lib/services/lead-handler-service.ts",
  "utf8",
);
assert.match(leadHandlerSource, /createVerifiedProviderLeadAndStartConversation/);
assert.match(leadHandlerSource, /allowUnconsentedPhoneStorage:\s*true/);
assert.match(leadHandlerSource, /\.eq\("organization_id", context\.organizationId\)/);
assert.match(leadHandlerSource, /\.eq\("user_id", context\.userId\)/);

const systemJobSource = fs.readFileSync(
  "src/lib/services/system-job-service.ts",
  "utf8",
);
assert.match(systemJobSource, /meta_leadgen_reconciliation/);
assert.match(systemJobSource, /reconcileMetaLeadgenEvent/);

const routeProvisionSource = fs.readFileSync(
  "src/app/api/integrations/meta/leadgen/routes/route.ts",
  "utf8",
);
assert.match(routeProvisionSource, /assertSameOriginRequest/);
assert.match(routeProvisionSource, /getAuthenticatedContext/);
assert.match(routeProvisionSource, /provisionMetaLeadgenRouteForCampaign/);

const envSource = fs.readFileSync("src/lib/env.ts", "utf8");
assert.match(envSource, /pages_manage_metadata/);
assert.match(envSource, /leads_retrieval/);

const migrationSource = fs.readFileSync(
  "supabase/migrations/20260710235990_create_meta_leadgen_ingestion.sql",
  "utf8",
);
assert.match(migrationSource, /meta_leadgen_route_ambiguous/);
assert.match(migrationSource, /meta_leadgen_route_unknown/);
assert.match(migrationSource, /meta_leadgen_event_identity_collision/);
assert.match(migrationSource, /native_leadgen_no_communication_default/);
assert.match(migrationSource, /native_leadgen_no_capi_default/);
assert.match(migrationSource, /read_only_ingestion_contract/);
assert.match(migrationSource, /revoke all on table public\.meta_leadgen_events from public, anon, authenticated, service_role/);

console.log(
  "PASS Meta leadgen contract: verification, signed POST, provider identity, consent suppression, and GHL-only delivery",
);
