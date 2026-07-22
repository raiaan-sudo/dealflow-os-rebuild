#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import {
  anchorAccountDeletionTombstone,
  AntiResurrectionPolicyError,
  resolveAntiResurrectionPolicy,
} from "../src/lib/account-deletion/anti-resurrection-contract";
import { evaluateLeadOutcomeQuality } from "../src/lib/analytics/lead-outcome-quality";
import { buildMetaReportingPortfolio } from "../src/lib/integrations/meta/reporting-portfolio-contract";
import {
  verifyAndParseSupportLifecycleCallback,
} from "../src/lib/integrations/support/lifecycle-callback";
import { classifyGhlLifecycleOutcome } from "../src/lib/integrations/gohighlevel/outcome-contract";

async function main() {
const now = new Date("2026-07-17T16:00:00.000Z");
const secret = "dfqa_K8p4zV2mN7cR5xT9wQ3jL6sB1uH0yF8a";
const rawBody = JSON.stringify({
  eventId: "evt_delivery_0001",
  eventType: "delivered",
  providerReceiptId: "provider-receipt-0001",
  occurredAt: "2026-07-17T15:59:00.000Z",
});
const timestamp = Math.floor(now.getTime() / 1_000);
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`, "utf8")
  .digest("hex");
const verifiedCallback = verifyAndParseSupportLifecycleCallback({
  rawBody,
  signatureHeader: `sha256=${signature}`,
  timestampHeader: String(timestamp),
  secret,
  nowMs: now.getTime(),
});
assert.equal(verifiedCallback.eventType, "delivered");
assert.match(verifiedCallback.payloadDigest, /^[a-f0-9]{64}$/);
assert.throws(
  () => verifyAndParseSupportLifecycleCallback({
    rawBody,
    signatureHeader: `sha256=${"0".repeat(64)}`,
    timestampHeader: String(timestamp),
    secret,
    nowMs: now.getTime(),
  }),
  (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "support_callback_signature_invalid",
);
assert.throws(
  () => verifyAndParseSupportLifecycleCallback({
    rawBody,
    signatureHeader: `sha256=${signature}`,
    timestampHeader: String(timestamp - 301),
    secret,
    nowMs: now.getTime(),
  }),
  (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "support_callback_timestamp_invalid",
);

const nonproductionPolicy = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_ENVIRONMENT: "staging",
  ACCOUNT_DELETION_TOMBSTONE_ANCHOR_ENABLED: "true",
  ACCOUNT_DELETION_TOMBSTONE_ATTESTATION: "DEALFLOW_DELETION_TOMBSTONE_EXTERNAL_V1",
  ACCOUNT_DELETION_TOMBSTONE_ENDPOINT: "http://127.0.0.1:43210/tombstones",
  ACCOUNT_DELETION_TOMBSTONE_TOKEN: secret,
};
assert.equal(resolveAntiResurrectionPolicy(nonproductionPolicy).production, false);
assert.throws(
  () => resolveAntiResurrectionPolicy({
    ...nonproductionPolicy,
    ACCOUNT_DELETION_TOMBSTONE_ENDPOINT: "https://external.example/tombstones",
  }),
  (error: unknown) =>
    error instanceof AntiResurrectionPolicyError &&
    error.code === "account_deletion_tombstone_endpoint_forbidden",
);
const anchored = await anchorAccountDeletionTombstone({
  requestId: "11111111-1111-4111-8111-111111111111",
  subjectDigest: `sha256:${"1".repeat(64)}`,
  manifestDigest: "2".repeat(64),
  backupExpiryAt: "2026-08-16T16:00:00.000Z",
  tombstoneExpiryAt: "2036-07-14T16:00:00.000Z",
  environment: nonproductionPolicy,
  transport: async () => new Response(null, {
    status: 200,
    headers: { "x-dealflow-tombstone-receipt": "receipt-test-0001" },
  }),
});
assert.match(anchored.receiptDigest, /^sha256:[a-f0-9]{64}$/);

const missingPortfolio = buildMetaReportingPortfolio({ snapshot: null, now });
assert.equal(missingPortfolio.state, "missing");
assert.deepEqual(missingPortfolio.metrics, {
  spend: null,
  impressions: null,
  clicks: null,
  leads: null,
  ctr: null,
  cpl: null,
});
const currentPortfolio = buildMetaReportingPortfolio({
  snapshot: {
    syncedAt: "2026-07-17T15:55:00.000Z",
    reportingCompleteness: "complete",
    syncResult: "success",
    deliveryMetrics: {
      spend: 25,
      impressions: 1_000,
      clicks: 20,
      leads: 0,
      ctr: 2,
    },
  } as never,
  now,
});
assert.equal(currentPortfolio.state, "current");
assert.equal(currentPortfolio.metrics.leads, 0);
assert.equal(currentPortfolio.metrics.cpl, null);
assert.equal(buildMetaReportingPortfolio({
  snapshot: {
    syncedAt: "2026-07-17T14:00:00.000Z",
    reportingCompleteness: "complete",
    syncResult: "success",
    deliveryMetrics: {},
  } as never,
  now,
}).state, "stale");
assert.equal(buildMetaReportingPortfolio({
  snapshot: {
    syncedAt: "2026-07-17T15:55:00.000Z",
    reportingCompleteness: "failed",
    syncResult: "failed",
    deliveryMetrics: { spend: 100, leads: 5 },
  } as never,
  now,
}).metrics.spend, null);

assert.deepEqual(evaluateLeadOutcomeQuality({
  definitionAvailable: true,
  sampleCount: 20,
  completeLineageCount: 20,
  hasConflicts: false,
  latestReceivedAt: "2026-07-17T15:55:00.000Z",
  minimumSampleSize: 20,
  maximumObservationAgeMinutes: 60,
  now,
}).blockers, []);
assert.deepEqual(evaluateLeadOutcomeQuality({
  definitionAvailable: true,
  sampleCount: 2,
  completeLineageCount: 1,
  hasConflicts: true,
  latestReceivedAt: "2026-07-17T12:00:00.000Z",
  minimumSampleSize: 20,
  maximumObservationAgeMinutes: 60,
  now,
}).blockers, ["lineage_incomplete", "outcome_conflict", "sample_too_small", "observation_stale"]);

const baseGhlEvent = {
  locationId: "location-test",
  providerEventId: "event-test-0001",
  providerObjectId: "object-test",
  providerContactId: "contact-test",
  providerCalendarId: "calendar-test",
  startsAt: "2026-07-18T13:00:00.000Z",
  endsAt: "2026-07-18T13:30:00.000Z",
  providerUpdatedAt: "2026-07-17T15:59:00.000Z",
  payloadFingerprint: "3".repeat(64),
};
assert.equal(classifyGhlLifecycleOutcome({
  ...baseGhlEvent,
  eventType: "AppointmentCreate",
  appointmentStatus: "confirmed",
}), "appointment_booked");
assert.equal(classifyGhlLifecycleOutcome({
  ...baseGhlEvent,
  eventType: "AppointmentUpdate",
  appointmentStatus: "showed",
}), "appointment_attended");
assert.equal(classifyGhlLifecycleOutcome({
  ...baseGhlEvent,
  eventType: "OpportunityStatusUpdate",
  appointmentStatus: "won",
}), "closed_won");
assert.equal(classifyGhlLifecycleOutcome({
  ...baseGhlEvent,
  eventType: "OutboundMessage",
  appointmentStatus: null,
}), null);

const migrations = readdirSync("supabase/migrations")
  .filter((file) => /^\d{14}_.+\.sql$/.test(file))
  .sort();
assert.equal(migrations.length, 125);
assert.deepEqual(migrations.slice(-8), [
  "20260717081000_expand_campaign_lifecycle_authority.sql",
  "20260717082000_provider_aware_funnel_publication.sql",
  "20260717090000_create_canonical_lead_outcome_ledger.sql",
  "20260720010000_add_ghl_embed_sso_authority.sql",
  "20260722010000_modernize_provider_service_role_claims.sql",
  "20260722020000_persist_ghl_location_token_scope.sql",
  "20260722030000_support_direct_ghl_embed_sso.sql",
  "20260722040000_add_service_only_operator_grant_probe.sql",
]);
const lifecycleSource = readFileSync("src/lib/services/canonical-campaign-lifecycle-service.ts", "utf8");
const scheduledSource = readFileSync("src/lib/services/scheduled-campaign-launch-service.ts", "utf8");
const manualSource = readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8");
const ghlSource = readFileSync("src/lib/services/ghl-personalization-service.ts", "utf8");
const metaSyncSource = readFileSync("src/lib/services/meta-campaign-sync-service.ts", "utf8");
const lifecycleMigration = readFileSync(
  "supabase/migrations/20260717081000_expand_campaign_lifecycle_authority.sql",
  "utf8",
);
assert.match(lifecycleSource, /transition_campaign_lifecycle_v1/);
assert.match(scheduledSource, /toState: "publishing"/);
assert.match(scheduledSource, /toState: "provider_paused"/);
assert.match(manualSource, /toState: "publishing"/);
assert.match(manualSource, /toState: "provider_paused"/);
assert.match(ghlSource, /publicationRow\.status !== "ready"/);
assert.match(metaSyncSource, /const lifecycleClient = createAdminClient\(\)/);
assert.match(metaSyncSource, /client: lifecycleClient/);
assert.match(
  lifecycleMigration,
  /auth\.role\(\) is distinct from 'service_role' and p_actor_kind <> 'customer'/,
);
assert.match(
  lifecycleMigration,
  /p_to_state not in \('draft','generated','review_required','approved','scheduled','canceled'\)/,
);

console.log("post-audit successor runtime contracts: PASS");
}

void main();
