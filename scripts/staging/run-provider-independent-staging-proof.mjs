#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA,
  parseSyntheticProviderSessionBundle,
} from "./provider-session-bundle-contract.mjs";
import { parseExactHostedSupabaseProjectUrl } from "./exact-supabase-project-url.mjs";

const FIXTURE = "DF-STAGING-20260712";
const EXPECTED_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const EXPECTED_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const EXPECTED_PROJECT_SUFFIX = "qibh";
const RETENTION_AUTHORITY_MARKER =
  "DEALFLOW_ISOLATED_STAGING_QIBH_SYNTHETIC_RETENTION_AUTHORITY_V1";
const STAGING_TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const IDS = Object.freeze({
  organization: "d1000000-0000-4000-8000-000000000001",
  campaign: "d2000000-0000-4000-8000-000000000001",
  staleCampaign: "d2000000-0000-4000-8000-000000000002",
  failedCampaign: "d2000000-0000-4000-8000-000000000003",
  partnerOneCampaign: "d2000000-0000-4000-8000-000000000004",
  partnerTwoCampaign: "d2000000-0000-4000-8000-000000000005",
  partnerOneOrganization: "d1000000-0000-4000-8000-000000000007",
  partnerTwoOrganization: "d1000000-0000-4000-8000-000000000015",
  deletionOrganization: "d1000000-0000-4000-8000-000000000019",
  retryJob: "d8000000-0000-4000-8000-000000000001",
  deadLetterJob: "d8000000-0000-4000-8000-000000000002",
  workerPendingJob: "d8000000-0000-4000-8000-000000000003",
  workerCrashJob: "d8000000-0000-4000-8000-000000000004",
});
const EMAILS = Object.freeze({
  paid: "dealflow-staging-20260712@example.com",
  partnerOneChild: "dealflow-staging-partner-child-20260712@example.com",
  partnerTwoChild: "dealflow-staging-partner-two-child-20260712@example.com",
  deletion: "dealflow-staging-deletion-20260712@example.com",
  capturedLead: "dealflow-staging-real-capture-20260712@example.com",
});
const PROVIDER_ENV_NAMES = [
  "META_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_SYSTEM_USER_ACCESS_TOKEN",
  "META_TOKEN_ENCRYPTION_KEY",
  "GHL_API_KEY",
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_SANDBOX_AGENCY_TOKEN",
  "GHL_PRODUCTION_AGENCY_TOKEN",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "OPENAI_API_KEY",
  "HIGGSFIELD_API_KEY",
  "HIGGSFIELD_API_SECRET",
  "HEYGEN_API_KEY",
  "ELEVENLABS_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "SUPPORT_EXTERNAL_DELIVERY_TOKEN",
];

function requireEnvironment(name, minimumLength = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function firstRow(value) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function noError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function exactCount(query, expected, label) {
  const result = await query;
  if (result.error || result.count !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${result.count ?? "unknown"}`);
  }
}

async function authenticatedClientFromPortfolio(supabaseUrl, anonKey, portfolio, role, email) {
  const session = portfolio.roles[role];
  if (
    session?.email !== email ||
    !/^[a-f0-9-]{36}$/i.test(session.userId ?? "") ||
    typeof session.accessToken !== "string" ||
    session.accessToken.length < 100 ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt - Math.floor(Date.now() / 1000) < 15 * 60
  ) {
    throw new Error(`Synthetic staging session portfolio is invalid for ${role}`);
  }
  const validator = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const validated = await validator.auth.getUser(session.accessToken);
  if (
    validated.error ||
    validated.data.user?.id !== session.userId ||
    validated.data.user?.email?.trim().toLowerCase() !== email
  ) {
    throw new Error(`Synthetic staging session identity validation failed for ${role}`);
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => session.accessToken,
  });
}

async function callBilling(admin, input, label) {
  const rows = await noError(
    await admin.rpc("apply_billing_subscription_webhook", input),
    label,
  );
  const row = firstRow(rows);
  if (!row || typeof row.applied !== "boolean") {
    throw new Error(`${label}: no durable apply receipt returned`);
  }
  return row;
}

async function callWorker(baseUrl, secret) {
  const stagingAccessGateSecret = requireEnvironment("STAGING_ACCESS_GATE_SECRET");
  const response = await fetch(
    `${baseUrl}/api/internal/system-jobs?maxCycles=5&staleAfterMs=60000`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
        "x-dealflow-staging-access": stagingAccessGateSecret,
      },
      redirect: "error",
    },
  );
  const body = await response.json().catch(() => null);
  if (response.status !== 200 || body?.success !== true || body?.failedStages?.length !== 0) {
    throw new Error(`The isolated hosted system worker failed safely with status ${response.status}`);
  }
  return body;
}

async function captureTableState(admin, table) {
  const result = await admin.from(table).select("*").order("id", { ascending: true });
  if (result.error || !Array.isArray(result.data)) {
    throw new Error(`Could not capture immutable state for ${table}`);
  }
  return {
    count: result.data.length,
    digest: sha256(JSON.stringify(result.data)),
  };
}

function assertEnvironment() {
  const baseUrl = new URL(requireEnvironment("STAGING_ACCEPTANCE_BASE_URL"));
  if (baseUrl.protocol !== "https:" || baseUrl.hostname !== EXPECTED_HOST || baseUrl.pathname !== "/") {
    throw new Error("Provider-independent proof requires the exact isolated staging host");
  }
  if (process.env.DEALFLOW_DEPLOYMENT_TARGET !== "staging") {
    throw new Error("Provider-independent proof requires the staging deployment target");
  }
  if (requireEnvironment("STAGING_TURNSTILE_TEST_TOKEN") !== STAGING_TURNSTILE_TEST_TOKEN) {
    throw new Error("Provider-independent proof requires the exact staging Turnstile test token");
  }
  for (const name of PROVIDER_ENV_NAMES) {
    if (process.env[name]?.trim()) throw new Error(`Provider credential ${name} is forbidden`);
  }
  for (const name of [
    "ALLOW_META_LIVE_LAUNCH",
    "ALLOW_META_CAPI_EVENTS",
    "GHL_SANDBOX_WRITES_ENABLED",
    "INTERNAL_LEAD_SMS_ENABLED",
    "SUPPORT_EXTERNAL_DELIVERY_ENABLED",
    "ACCOUNT_DELETION_EXECUTION_ENABLED",
    "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
    "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
  ]) {
    if (process.env[name] !== "false") throw new Error(`${name} must be exactly false`);
  }
  if (process.env.SUPPORT_NOTIFICATION_DELIVERY_MODE !== "internal_operator_inbox") {
    throw new Error("Support proof must use only the non-delivering internal operator inbox");
  }
  return baseUrl.origin;
}

async function main() {
  const baseUrl = assertEnvironment();
  const supabaseTarget = parseExactHostedSupabaseProjectUrl(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  );
  const supabaseUrl = supabaseTarget.url;
  const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  const serviceRole = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY", 32);
  const internalSecret = requireEnvironment("INTERNAL_SYSTEM_JOBS_SECRET", 32);
  const ref = supabaseTarget.projectRef;
  if (ref.slice(-4) !== EXPECTED_PROJECT_SUFFIX || sha256(ref) !== EXPECTED_PROJECT_FINGERPRINT) {
    throw new Error("Provider-independent proof requires the exact isolated qibh project");
  }
  const sessionPortfolio = parseSyntheticProviderSessionBundle(
    requireEnvironment("STAGING_SYNTHETIC_PROVIDER_SESSION_BUNDLE"),
    {
      projectRef: ref,
      projectFingerprint: EXPECTED_PROJECT_FINGERPRINT,
      safeSuffix: EXPECTED_PROJECT_SUFFIX,
      minimumRemainingLifetimeSeconds: 15 * 60,
    },
  );
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const paid = await authenticatedClientFromPortfolio(
    supabaseUrl,
    anonKey,
    sessionPortfolio,
    "paidDirect",
    EMAILS.paid,
  );

  const subscriptionBefore = await noError(
    await admin
      .from("billing_subscriptions")
      .select("organization_id,user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_tier,status")
      .eq("organization_id", IDS.organization)
      .single(),
    "read synthetic billing baseline",
  );
  if (subscriptionBefore.status !== "active" || subscriptionBefore.plan_tier !== "pro") {
    throw new Error("Synthetic billing baseline is not active Pro");
  }
  const billingBase = {
    p_organization_id: IDS.organization,
    p_user_id: subscriptionBefore.user_id,
    p_stripe_customer_id: subscriptionBefore.stripe_customer_id,
    p_stripe_subscription_id: subscriptionBefore.stripe_subscription_id,
    p_stripe_price_id: subscriptionBefore.stripe_price_id,
    p_current_period_start: null,
    p_current_period_end: "2099-01-01T00:00:00.000Z",
    p_cancel_at_period_end: false,
    p_metadata: { fixture: FIXTURE, synthetic: true, livemode: false },
  };
  const cancellation = await callBilling(admin, {
    ...billingBase,
    p_plan_tier: "pro",
    p_status: "canceled",
    p_stripe_event_id: "evt_test_df_staging_lifecycle_cancel",
    p_stripe_event_created: 1_788_739_300,
  }, "apply synthetic cancellation");
  const stale = await callBilling(admin, {
    ...billingBase,
    p_plan_tier: "pro",
    p_status: "active",
    p_stripe_event_id: "evt_test_df_staging_lifecycle_stale_reactivation",
    p_stripe_event_created: 1_788_739_250,
  }, "reject stale synthetic reactivation");
  const reactivationInput = {
    ...billingBase,
    p_plan_tier: "pro",
    p_status: "active",
    p_stripe_event_id: "evt_test_df_staging_lifecycle_reactivate",
    p_stripe_event_created: 1_788_739_400,
  };
  const reactivation = await callBilling(admin, reactivationInput, "apply synthetic reactivation");
  const reactivationReplay = await callBilling(
    admin,
    reactivationInput,
    "replay synthetic reactivation",
  );
  if (
    cancellation.applied !== true ||
    stale.applied !== false ||
    stale.ignored_reason !== "stale_event" ||
    reactivation.applied !== true ||
    reactivationReplay.applied !== false ||
    reactivationReplay.ignored_reason !== "replay_projection_repaired"
  ) {
    throw new Error("Synthetic billing cancellation/reactivation ordering proof failed");
  }
  const billingAfter = await noError(
    await admin
      .from("billing_subscriptions")
      .select("plan_tier,status,stripe_latest_event_id,stripe_latest_event_created")
      .eq("organization_id", IDS.organization)
      .single(),
    "read synthetic billing lifecycle result",
  );
  const organizationAfterBilling = await noError(
    await admin.from("organizations").select("plan_tier").eq("id", IDS.organization).single(),
    "read synthetic organization billing projection",
  );
  if (
    billingAfter.status !== "active" ||
    billingAfter.plan_tier !== "pro" ||
    billingAfter.stripe_latest_event_id !== reactivationInput.p_stripe_event_id ||
    billingAfter.stripe_latest_event_created !== reactivationInput.p_stripe_event_created ||
    organizationAfterBilling.plan_tier !== "pro"
  ) {
    throw new Error("Synthetic billing lifecycle did not finish in active Pro truth");
  }

  const leadPayload = {
    name: `${FIXTURE} Atomic Captured Lead`,
    email: EMAILS.capturedLead,
    campaign_id: IDS.campaign,
    stage: "launched",
    sms_consent: false,
    landing_page_url: `${baseUrl}/f/df-staging-20260712-funnel?utm_source=staging-proof&utm_medium=acceptance`,
    form_started_at: Date.now() - 5_000,
    turnstile_token: STAGING_TURNSTILE_TEST_TOKEN,
  };
  const captureLead = async () => {
    const stagingAccessGateSecret = requireEnvironment("STAGING_ACCESS_GATE_SECRET");
    const response = await fetch(`${baseUrl}/api/lead-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-dealflow-staging-access": stagingAccessGateSecret,
      },
      body: JSON.stringify(leadPayload),
      redirect: "error",
    });
    const body = await response.json().catch(() => null);
    if (response.status !== 200 || body?.success !== true || !body?.lead_id) {
      throw new Error(`Synthetic lead capture failed with status ${response.status}`);
    }
    return body;
  };
  const leadFirst = await captureLead();
  const leadReplay = await captureLead();
  if (leadFirst.lead_id !== leadReplay.lead_id) {
    throw new Error("Duplicate synthetic lead capture changed durable lead identity");
  }
  const capturedLead = await noError(
    await admin
      .from("leads")
      .select("id,organization_id,campaign_id,email,dedupe_hash,source")
      .eq("id", leadFirst.lead_id)
      .single(),
    "read captured synthetic lead",
  );
  if (
    capturedLead.organization_id !== IDS.organization ||
    capturedLead.campaign_id !== IDS.campaign ||
    capturedLead.email !== EMAILS.capturedLead ||
    !capturedLead.dedupe_hash
  ) {
    throw new Error("Captured synthetic lead is not bound to canonical campaign truth");
  }
  await exactCount(
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.organization)
      .eq("campaign_id", IDS.campaign)
      .eq("email", EMAILS.capturedLead),
    1,
    "verify duplicate lead replay produced one durable row",
  );
  const leadJob = await noError(
    await admin
      .from("system_jobs")
      .select("id,status,idempotency_key,payload")
      .eq("organization_id", IDS.organization)
      .eq("idempotency_key", `lead_side_effects:${capturedLead.id}`)
      .single(),
    "read atomic lead side-effect job",
  );
  if (leadJob.payload?.enabledEffects?.length !== 0 || leadJob.payload?.requiredEffects?.length !== 0) {
    throw new Error("Synthetic lead unexpectedly enabled a provider side effect");
  }

  const supportRequestId = "da100000-0000-4000-8000-000000000001";
  const supportCorrelationId = "da100000-0000-4000-8000-000000000002";
  const supportRows = await noError(
    await paid.rpc("create_support_ticket_with_outbox", {
      p_organization_id: IDS.organization,
      p_user_id: subscriptionBefore.user_id,
      p_request_id: supportRequestId,
      p_correlation_id: supportCorrelationId,
      p_category: "product_blocker",
      p_subject: `${FIXTURE} synthetic support blocker`,
      p_message: "Synthetic isolated-staging support lifecycle proof. No communication is authorized.",
      p_route_path: "/support",
      p_safe_context: { fixture: FIXTURE, synthetic: true, providerMutationPerformed: false },
    }),
    "create synthetic support ticket and outbox atomically",
  );
  const support = firstRow(supportRows);
  if (!support?.ticket_id || !support?.outbox_id) {
    throw new Error("Synthetic support ticket did not return durable identities");
  }

  const providerTableStateBefore = {
    ghlProviderOutbox: await captureTableState(admin, "ghl_provider_outbox"),
    providerUsageEvents: await captureTableState(admin, "provider_usage_events"),
  };
  const workerFirst = await callWorker(baseUrl, internalSecret);
  const workerReplay = await callWorker(baseUrl, internalSecret);
  const workerFixtureRows = await noError(
    await admin
      .from("system_jobs")
      .select("id,status,retry_count,next_run_at,dead_lettered_at,reviewed_at,result,last_error_code")
      .in("id", [
        IDS.retryJob,
        IDS.deadLetterJob,
        IDS.workerPendingJob,
        IDS.workerCrashJob,
        leadJob.id,
      ]),
    "read synthetic worker lifecycle fixtures",
  );
  const workerById = new Map(workerFixtureRows.map((row) => [row.id, row]));
  if (
    workerFirst.resetCount < 1 ||
    workerById.get(IDS.workerPendingJob)?.status !== "completed" ||
    workerById.get(IDS.workerCrashJob)?.status !== "completed" ||
    workerById.get(leadJob.id)?.status !== "completed" ||
    workerById.get(IDS.retryJob)?.status !== "pending" ||
    workerById.get(IDS.retryJob)?.retry_count !== 1 ||
    new Date(workerById.get(IDS.retryJob)?.next_run_at ?? 0).getUTCFullYear() !== 2099 ||
    workerById.get(IDS.deadLetterJob)?.status !== "failed" ||
    !workerById.get(IDS.deadLetterJob)?.dead_lettered_at ||
    !workerById.get(IDS.deadLetterJob)?.reviewed_at ||
    workerReplay.processedJobIds.some((id) =>
      [IDS.workerPendingJob, IDS.workerCrashJob, leadJob.id].includes(id)
    )
  ) {
    throw new Error("Synthetic worker retry/replay/dead-letter/crash proof failed");
  }
  const supportOutbox = await noError(
    await admin
      .from("support_notification_outbox")
      .select("id,ticket_id,status,delivered_at,last_error_code")
      .eq("id", support.outbox_id)
      .single(),
    "read delivered internal support outbox",
  );
  const supportInbox = await noError(
    await admin
      .from("support_operator_inbox")
      .select("id,outbox_id,ticket_id,organization_id,status")
      .eq("outbox_id", support.outbox_id)
      .single(),
    "read internal support operator inbox receipt",
  );
  if (
    supportOutbox.status !== "delivered" ||
    !supportOutbox.delivered_at ||
    supportInbox.ticket_id !== support.ticket_id ||
    supportInbox.organization_id !== IDS.organization
  ) {
    throw new Error("Support journey did not settle into the internal non-delivering inbox");
  }
  const providerTableStateAfter = {
    ghlProviderOutbox: await captureTableState(admin, "ghl_provider_outbox"),
    providerUsageEvents: await captureTableState(admin, "provider_usage_events"),
  };
  if (JSON.stringify(providerTableStateBefore) !== JSON.stringify(providerTableStateAfter)) {
    throw new Error("Provider-independent worker proof changed an external-provider action table");
  }

  const reportingRows = await noError(
    await admin
      .from("campaign_sync_snapshots")
      .select("id,campaign_id,sync_result,delivery_metrics_confirmed,synced_at,delivery_metrics")
      .in("campaign_id", [IDS.campaign, IDS.staleCampaign, IDS.failedCampaign])
      .order("synced_at", { ascending: true }),
    "read synthetic reporting state fixtures",
  );
  const now = Date.now();
  const rowsFor = (campaignId) => reportingRows.filter((row) => row.campaign_id === campaignId);
  const freshConfirmed = rowsFor(IDS.campaign).filter((row) => row.delivery_metrics_confirmed).at(-1);
  const staleConfirmed = rowsFor(IDS.staleCampaign).filter((row) => row.delivery_metrics_confirmed).at(-1);
  const failedRows = rowsFor(IDS.failedCampaign);
  const failedConfirmed = failedRows.filter((row) => row.delivery_metrics_confirmed).at(-1);
  const failedAttempt = failedRows.filter((row) => !row.delivery_metrics_confirmed).at(-1);
  if (
    !freshConfirmed || now - Date.parse(freshConfirmed.synced_at) > 30 * 60_000 ||
    !staleConfirmed || now - Date.parse(staleConfirmed.synced_at) <= 30 * 60_000 ||
    !failedConfirmed || !failedAttempt ||
    Date.parse(failedAttempt.synced_at) <= Date.parse(failedConfirmed.synced_at) ||
    failedAttempt.sync_result !== "failed" ||
    Number(failedConfirmed.delivery_metrics?.leads) !== 4
  ) {
    throw new Error("Synthetic fresh/stale/failed reporting state machine is incomplete");
  }

  const partnerOne = await authenticatedClientFromPortfolio(
    supabaseUrl,
    anonKey,
    sessionPortfolio,
    "partnerChild",
    EMAILS.partnerOneChild,
  );
  const partnerTwo = await authenticatedClientFromPortfolio(
    supabaseUrl,
    anonKey,
    sessionPortfolio,
    "partnerChildTwo",
    EMAILS.partnerTwoChild,
  );
  const ownPartnerOne = await noError(
    await partnerOne.from("campaign_plans").select("id").eq("id", IDS.partnerOneCampaign).maybeSingle(),
    "read partner one own campaign",
  );
  const deniedPartnerOne = await noError(
    await partnerOne.from("campaign_plans").select("id").eq("id", IDS.partnerTwoCampaign).maybeSingle(),
    "deny partner one cross-tenant campaign",
  );
  const ownPartnerTwo = await noError(
    await partnerTwo.from("campaign_plans").select("id").eq("id", IDS.partnerTwoCampaign).maybeSingle(),
    "read partner two own campaign",
  );
  const deniedPartnerTwo = await noError(
    await partnerTwo.from("campaign_plans").select("id").eq("id", IDS.partnerOneCampaign).maybeSingle(),
    "deny partner two cross-tenant campaign",
  );
  if (
    ownPartnerOne?.id !== IDS.partnerOneCampaign ||
    ownPartnerTwo?.id !== IDS.partnerTwoCampaign ||
    deniedPartnerOne !== null ||
    deniedPartnerTwo !== null
  ) {
    throw new Error("Two-partner child-tenant campaign isolation failed");
  }

  const authority = await noError(
    await admin
      .from("account_deletion_retention_configuration")
      .select("grace_days,operational_retention_days,support_retention_days,analytics_retention_days,financial_retention_days,receipt_retention_days,billing_cancellation_mode,policy_version,approved_authority_hash,approved_at")
      .eq("singleton", true)
      .single(),
    "read exact synthetic deletion authority",
  );
  const expectedAuthorityHash = `sha256:${sha256(RETENTION_AUTHORITY_MARKER)}`;
  if (
    authority.approved_authority_hash !== expectedAuthorityHash ||
    !authority.approved_at ||
    authority.grace_days !== 0 ||
    authority.operational_retention_days !== 1 ||
    authority.support_retention_days !== 1 ||
    authority.analytics_retention_days !== 1 ||
    authority.financial_retention_days !== 365 ||
    authority.receipt_retention_days !== 365 ||
    authority.billing_cancellation_mode !== "period_end" ||
    authority.policy_version !== 2
  ) {
    throw new Error("Synthetic deletion authority is not approved in isolated staging");
  }
  const deletionUser = await noError(
    await admin.from("users").select("id,email").eq("email", EMAILS.deletion).single(),
    "read synthetic deletion actor",
  );
  let deletionRequest = await noError(
    await admin
      .from("account_deletion_requests")
      .select("id,organization_id,requested_by_user_id,state,retention_policy,confirmation_code")
      .eq("organization_id", IDS.deletionOrganization)
      .maybeSingle(),
    "read synthetic deletion request",
  );
  if (!deletionRequest) {
    deletionRequest = firstRow(await noError(
      await admin.rpc("create_account_deletion_request_v1", {
        p_organization_id: IDS.deletionOrganization,
        p_actor_user_id: deletionUser.id,
        p_idempotency_key: "df-staging-deletion-provider-writes-disabled",
        p_identity_method: "password",
        p_identity_email_hash: `sha256:${sha256(EMAILS.deletion)}`,
      }),
      "create synthetic fail-closed deletion request",
    ));
  }
  if (
    deletionRequest?.organization_id !== IDS.deletionOrganization ||
    deletionRequest?.requested_by_user_id !== deletionUser.id ||
    deletionRequest?.state !== "suspending" ||
    deletionRequest?.retention_policy?.approvedAuthorityHash !== expectedAuthorityHash ||
    deletionRequest?.retention_policy?.graceDays !== 0 ||
    deletionRequest?.retention_policy?.operationalRetentionDays !== 1 ||
    deletionRequest?.retention_policy?.supportRetentionDays !== 1 ||
    deletionRequest?.retention_policy?.analyticsRetentionDays !== 1 ||
    deletionRequest?.retention_policy?.financialRetentionDays !== 365 ||
    deletionRequest?.retention_policy?.receiptRetentionDays !== 365 ||
    deletionRequest?.retention_policy?.billingCancellationMode !== "period_end" ||
    deletionRequest?.retention_policy?.policyVersion !== 2
  ) {
    throw new Error("Synthetic account-deletion request did not snapshot exact approved authority");
  }
  await exactCount(
    admin.from("account_deletion_tasks").select("id", { count: "exact", head: true })
      .eq("request_id", deletionRequest.id),
    16,
    "verify complete synthetic deletion task plan",
  );
  await exactCount(
    admin.from("account_deletion_receipts").select("id", { count: "exact", head: true })
      .eq("request_id", deletionRequest.id),
    0,
    "verify no deletion provider receipt was fabricated",
  );
  const stagingAccessGateSecret = requireEnvironment("STAGING_ACCESS_GATE_SECRET");
  const deletionWorkerResponse = await fetch(`${baseUrl}/api/internal/account-deletion-worker`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalSecret}`,
      "Content-Type": "application/json",
      "x-dealflow-staging-access": stagingAccessGateSecret,
    },
    body: "{}",
    redirect: "error",
  });
  const deletionWorkerBody = await deletionWorkerResponse.json().catch(() => null);
  if (
    deletionWorkerResponse.status !== 503 ||
    deletionWorkerBody?.code !== "account_deletion_execution_disabled"
  ) {
    throw new Error("Hosted account-deletion worker did not remain fail-closed");
  }
  await exactCount(
    admin.from("account_deletion_tasks").select("id", { count: "exact", head: true })
      .eq("request_id", deletionRequest.id)
      .eq("status", "queued"),
    16,
    "verify disabled deletion worker claimed no lifecycle task",
  );
  await exactCount(
    admin.from("account_deletion_suspensions").select("organization_id", { count: "exact", head: true })
      .eq("organization_id", IDS.deletionOrganization)
      .eq("request_id", deletionRequest.id),
    1,
    "verify synthetic deletion access suspension",
  );

  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    fixture: FIXTURE,
    projectFingerprint: sha256(ref),
    safeSuffix: ref.slice(-4),
    billingLifecycle: {
      cancellationApplied: true,
      staleReactivationRejected: true,
      reactivationApplied: true,
      exactReplayIdempotent: true,
      finalStatus: "active",
      finalPlan: "pro",
      providerActionPerformed: false,
    },
    leadCapture: {
      leadId: capturedLead.id,
      durableRowCount: 1,
      duplicateReplaySameIdentity: true,
      sideEffectJobId: leadJob.id,
      providerEffectsEnabled: 0,
      providerActionPerformed: false,
    },
    support: {
      ticketId: support.ticket_id,
      outboxId: support.outbox_id,
      operatorInboxReceiptId: supportInbox.id,
      finalStatus: supportOutbox.status,
      deliveryMode: "internal_operator_inbox",
      externalCommunicationPerformed: false,
    },
    worker: {
      resetCount: workerFirst.resetCount,
      pendingCompleted: true,
      crashedLeaseRecovered: true,
      futureRetryPreserved: true,
      deadLetterPreserved: true,
      deadLetterReviewed: true,
      completedReplayNoOp: true,
      providerTableStateUnchanged: true,
    },
    reporting: {
      freshCampaignId: IDS.campaign,
      staleCampaignId: IDS.staleCampaign,
      failedCampaignId: IDS.failedCampaign,
      freshConfirmed: true,
      staleDetected: true,
      failedRefreshPreservedLastConfirmed: true,
      providerActionPerformed: false,
    },
    partnerIsolation: {
      configuredPartnerCount: 2,
      separateChildTenantCount: 2,
      ownCampaignReadable: true,
      crossPartnerCampaignDenied: true,
    },
    authentication: {
      sessionPortfolioSchema: SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA,
      reusedRoleCount: 3,
      passwordSignInCount: 0,
      rawTokenPersisted: false,
    },
    accountDeletion: {
      requestId: deletionRequest.id,
      retentionAuthorityMarker: RETENTION_AUTHORITY_MARKER,
      authorityHashFingerprint: sha256(expectedAuthorityHash),
      requestState: deletionRequest.state,
      taskCount: 16,
      suspended: true,
      executionEnabled: false,
      providerWritesEnabled: false,
      providerReceiptCount: 0,
      hostedWorkerFailClosed: true,
      fullProviderOffboardingPerformed: false,
    },
    externalProviderAcceptance: {
      meta: "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY",
      ghl: "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY",
      higgsfield: "BLOCKED_CREDENTIAL_AND_PAID_PROVIDER_AUTHORITY",
      twilio: "BLOCKED_CREDENTIAL_AND_COMMUNICATION_AUTHORITY",
    },
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    realCustomerDataAccessed: false,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
