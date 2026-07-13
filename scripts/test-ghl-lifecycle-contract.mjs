#!/usr/bin/env node

import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/lib/integrations/gohighlevel/webhook-contract.ts",
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const loadedModule = { exports: {} };
new Function("require", "module", "exports", output)(
  (specifier) => {
    if (specifier === "node:crypto") return nodeCrypto;
    if (specifier === "@/lib/api/route") return { ApiError };
    throw new Error(`Unexpected GHL lifecycle-contract import: ${specifier}`);
  },
  loadedModule,
  loadedModule.exports,
);

const { parseGhlLifecycleWebhook, verifyGhlWebhookSignature } = loadedModule.exports;

function parse(fixture) {
  return parseGhlLifecycleWebhook(JSON.stringify(fixture));
}

const appointment = parse({
  type: "AppointmentCreate",
  locationId: "location_official_001",
  webhookId: "webhook_appointment_001",
  timestamp: "2026-07-13T18:00:00.000Z",
  appointment: {
    id: "appointment_official_001",
    contactId: "contact_official_001",
    calendarId: "calendar_official_001",
    appointmentStatus: "confirmed",
    startTime: "2026-07-14T13:00:00.000Z",
    endTime: "2026-07-14T13:30:00.000Z",
    dateAdded: "2026-07-13T17:00:00.000Z",
    dateUpdated: "2026-07-13T17:30:00.000Z",
  },
});
assert.equal(appointment.providerObjectId, "appointment_official_001");
assert.equal(appointment.providerContactId, "contact_official_001");
assert.equal(appointment.providerCalendarId, "calendar_official_001");
assert.equal(appointment.appointmentStatus, "confirmed");
assert.equal(appointment.startsAt, "2026-07-14T13:00:00.000Z");
assert.equal(appointment.providerUpdatedAt, "2026-07-13T17:30:00.000Z");
assert.equal(appointment.providerEventId, "webhook_appointment_001");

const contact = parse({
  type: "ContactUpdate",
  locationId: "location_official_001",
  id: "contact_official_001",
  dateAdded: "2026-07-13T17:01:00.000Z",
  timestamp: "2026-07-13T18:01:00.000Z",
});
assert.equal(contact.providerObjectId, "contact_official_001");
assert.equal(contact.providerContactId, "contact_official_001");
assert.equal(contact.providerUpdatedAt, "2026-07-13T18:01:00.000Z");
const contactWithoutUpdateTimestamp = parse({
  type: "ContactUpdate",
  locationId: "location_official_001",
  id: "contact_official_001",
  dateAdded: "2026-07-13T17:01:00.000Z",
});
assert.equal(
  contactWithoutUpdateTimestamp.providerUpdatedAt,
  null,
  "ContactUpdate.dateAdded is creation time and must not be treated as an update version",
);
const contactLater = parse({
  type: "ContactUpdate",
  locationId: "location_official_001",
  id: "contact_official_001",
  dateAdded: "2026-07-13T17:01:00.000Z",
  timestamp: "2026-07-13T18:02:00.000Z",
});
assert.ok(contactLater.providerUpdatedAt > contact.providerUpdatedAt);

const opportunity = parse({
  type: "OpportunityStatusUpdate",
  locationId: "location_official_001",
  id: "opportunity_official_001",
  contactId: "contact_official_001",
  status: "open",
  dateAdded: "2026-07-13T16:02:00.000Z",
  timestamp: "2026-07-13T17:02:00.000Z",
});
assert.equal(opportunity.providerObjectId, "opportunity_official_001");
assert.equal(opportunity.providerContactId, "contact_official_001");
assert.equal(opportunity.appointmentStatus, "open");
assert.equal(opportunity.providerUpdatedAt, "2026-07-13T17:02:00.000Z");
const opportunityLater = parse({
  type: "OpportunityStatusUpdate",
  locationId: "location_official_001",
  id: "opportunity_official_001",
  contactId: "contact_official_001",
  status: "won",
  dateAdded: "2026-07-13T16:02:00.000Z",
  timestamp: "2026-07-13T17:03:00.000Z",
});
assert.ok(opportunityLater.providerUpdatedAt > opportunity.providerUpdatedAt);

// HighLevel's documented SMS-shaped example can omit messageId. The durable
// identity must therefore fall back through emailMessageId to conversationId.
const outboundSms = parse({
  type: "OutboundMessage",
  locationId: "location_official_001",
  conversationId: "conversation_official_001",
  contactId: "contact_official_001",
  messageType: "SMS",
  dateAdded: "2026-07-13T17:03:00.000Z",
});
assert.match(outboundSms.providerObjectId, /^outbound_[0-9a-f]{64}$/);

const outboundEmail = parse({
  type: "OutboundMessage",
  locationId: "location_official_001",
  emailMessageId: "email_message_official_001",
  conversationId: "conversation_official_002",
  contactId: "contact_official_001",
  messageType: "Email",
  dateAdded: "2026-07-13T17:04:00.000Z",
});
assert.equal(outboundEmail.providerObjectId, "email_message_official_001");

const outboundConversationProvider = parse({
  type: "OutboundMessage",
  locationId: "location_official_001",
  conversationProviderId: "conversation_provider_official_001",
  conversationId: "conversation_should_not_win",
  contactId: "contact_official_001",
  messageType: "SMS",
  timestamp: "2026-07-13T17:04:30.000Z",
});
assert.match(outboundConversationProvider.providerObjectId, /^outbound_[0-9a-f]{64}$/);

const outboundCall = parse({
  type: "OutboundMessage",
  locationId: "location_official_001",
  messageId: "call_message_official_001",
  emailMessageId: "email_message_should_not_win",
  conversationId: "conversation_official_003",
  contactId: "contact_official_001",
  messageType: "Call",
  dateAdded: "2026-07-13T17:05:00.000Z",
});
assert.equal(outboundCall.providerObjectId, "call_message_official_001");
assert.match(outboundCall.providerEventId, /^OutboundMessage:[0-9a-f]{64}$/);
assert.ok(outboundCall.providerEventId.length <= 240);

assert.throws(
  () => parse({
    type: "OutboundMessage",
    locationId: "location_official_001",
    contactId: "contact_official_001",
  }),
  (error) => error instanceof ApiError && error.code === "ghl_webhook_identity_invalid",
  "an outbound event without messageId, emailMessageId, or conversationId must fail closed",
);
assert.throws(
  () => parse({
    type: "OpportunityStatusUpdate",
    locationId: "location_official_001",
    id: "opportunity_official_002",
    status: "x".repeat(181),
  }),
  (error) => error instanceof ApiError && error.code === "ghl_webhook_field_too_long",
  "unbounded provider status must fail closed",
);

const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync("ed25519");
const signedBody = JSON.stringify({ type: "ContactUpdate", id: "contact_official_001" });
const signature = nodeCrypto.sign(null, Buffer.from(signedBody), privateKey).toString("base64");
assert.equal(verifyGhlWebhookSignature(signedBody, signature, publicKey), true);
assert.equal(verifyGhlWebhookSignature(`${signedBody} `, signature, publicKey), false);
assert.equal(verifyGhlWebhookSignature(signedBody, "not-base64", publicKey), false);

const serviceSource = fs.readFileSync("src/lib/services/ghl-lifecycle-service.ts", "utf8");
const serviceOutput = ts.transpileModule(serviceSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
let rpcResponse = { data: null, error: null };
let expectedProviderEventId = appointment.providerEventId;
const serviceModule = { exports: {} };
new Function("require", "module", "exports", serviceOutput)(
  (specifier) => {
    if (specifier === "@/lib/api/route") return { ApiError };
    if (specifier === "@/lib/supabase/admin") {
      return {
        createAdminClient: () => ({
          rpc: async (functionName, input) => {
            assert.equal(functionName, "ingest_ghl_lifecycle_webhook_v1");
            assert.equal(input.p_provider_event_id, expectedProviderEventId);
            assert.equal(input.p_environment, "production");
            assert.equal("p_contact_name" in input, false, "signed contact PII is not an authoritative form receipt");
            return rpcResponse;
          },
        }),
      };
    }
    throw new Error(`Unexpected GHL lifecycle-service import: ${specifier}`);
  },
  serviceModule,
  serviceModule.exports,
);
const { acceptGhlLifecycleWebhook } = serviceModule.exports;

rpcResponse = {
  data: { projection_status: "reconciled", projection_code: "canonical_state_projected" },
  error: null,
};
assert.deepEqual(await acceptGhlLifecycleWebhook(appointment, "production"), {
  receipt: rpcResponse.data,
  projectionStatus: "reconciled",
  projectionCode: "canonical_state_projected",
});
rpcResponse = {
  data: { projection_status: "operator_action_required", projection_code: "ghl_lifecycle_unknown_lead_binding" },
  error: null,
};
assert.equal(
  (await acceptGhlLifecycleWebhook(appointment, "production")).projectionStatus,
  "operator_action_required",
  "durable operator action must be acknowledged instead of retried forever",
);
rpcResponse = {
  data: { projection_status: "reconciliation_pending", projection_code: "ghl_form_submission_reconciliation_pending" },
  error: null,
};
expectedProviderEventId = contact.providerEventId;
assert.equal(
  (await acceptGhlLifecycleWebhook(contact, "production")).projectionStatus,
  "reconciliation_pending",
  "a durably queued form reconciliation must receive a quick 2xx acknowledgement",
);
expectedProviderEventId = appointment.providerEventId;
rpcResponse = { data: { projection_status: "received" }, error: null };
await assert.rejects(
  () => acceptGhlLifecycleWebhook(appointment, "production"),
  (error) => error instanceof ApiError && error.status === 503 && error.code === "ghl_lifecycle_projection_incomplete",
  "a nonterminal database receipt must remain retryable",
);
rpcResponse = { data: null, error: { message: "sanitized database failure" } };
await assert.rejects(
  () => acceptGhlLifecycleWebhook(appointment, "production"),
  (error) => error instanceof ApiError && error.status === 503 && error.code === "ghl_lifecycle_ingest_failed",
  "database failure must remain retryable without exposing internal diagnostics",
);

console.log("HighLevel official-shaped lifecycle webhook contract: PASS");
