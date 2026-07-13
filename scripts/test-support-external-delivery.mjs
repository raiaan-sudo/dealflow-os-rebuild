#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";

const source = fs.readFileSync("src/lib/integrations/support/delivery-adapter.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)(
  (specifier) => {
    if (specifier === "node:crypto") return { createHash };
    if (specifier === "@/lib/deployment-target") {
      return {
        isExplicitNonProductionDeployment: (env) =>
          ["staging", "preview", "development", "test"].includes(env.DEALFLOW_DEPLOYMENT_TARGET),
        isProductionDeployment: (env) => env.DEALFLOW_DEPLOYMENT_TARGET === "production",
      };
    }
    throw new Error(`Unexpected import ${specifier}`);
  },
  loaded,
  loaded.exports,
);

const {
  deliverSupportNotification,
  getSupportDeliveryMode,
  resolveSupportExternalDeliveryPolicy,
  SupportDeliveryPolicyError,
} = loaded.exports;

assert.equal(getSupportDeliveryMode({}), "internal_operator_inbox");
assert.equal(resolveSupportExternalDeliveryPolicy({}), null);
assert.throws(
  () => resolveSupportExternalDeliveryPolicy({ SUPPORT_NOTIFICATION_DELIVERY_MODE: "external" }),
  (error) =>
    error instanceof SupportDeliveryPolicyError &&
    error.code === "support_external_destination_owner_blocked",
);

const productionEnv = {
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "external",
  SUPPORT_EXTERNAL_DESTINATION: "owner@example.test",
  SUPPORT_EXTERNAL_DELIVERY_ENDPOINT: "https://delivery.example.test/v1/support",
  SUPPORT_EXTERNAL_DELIVERY_ALLOWED_ORIGIN: "https://delivery.example.test",
  SUPPORT_EXTERNAL_DELIVERY_ENABLED: "true",
  SUPPORT_DELIVERY_ATTESTATION: "DEALFLOW_SUPPORT_DESTINATION_APPROVED_V1",
  SUPPORT_EXTERNAL_DELIVERY_TOKEN: "test-token",
};
assert.throws(
  () => resolveSupportExternalDeliveryPolicy({
    ...productionEnv,
    DEALFLOW_DEPLOYMENT_TARGET: "unknown",
  }),
  (error) =>
    error instanceof SupportDeliveryPolicyError &&
    error.code === "support_external_deployment_unproven",
);
assert.throws(
  () => resolveSupportExternalDeliveryPolicy(productionEnv),
  (error) =>
    error instanceof SupportDeliveryPolicyError &&
    error.code === "support_external_production_disabled",
);

const mailSinkEnv = {
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "mail_sink",
  SUPPORT_EXTERNAL_DESTINATION: "owner@example.test",
  SUPPORT_EXTERNAL_DELIVERY_ENDPOINT: "http://127.0.0.1:8025/api/support",
  SUPPORT_MAIL_SINK_ENABLED: "true",
  SUPPORT_DELIVERY_ATTESTATION: "DEALFLOW_SUPPORT_MAIL_SINK_ONLY_V1",
};
const policy = resolveSupportExternalDeliveryPolicy(mailSinkEnv);
assert.equal(policy.adapter, "mail_sink");
assert.equal(policy.scope, "noncommunication_test");

const calls = [];
const admin = {
  async rpc(name, args) {
    calls.push({ name, args });
    if (name === "get_support_notification_delivery_payload_v1") {
      return {
        data: [{
          outbox_id: "outbox-1",
          ticket_id: "ticket-1",
          organization_id: "org-1",
          user_id: "user-1",
          correlation_id: "correlation-1",
          category: "product_blocker",
          subject: "Synthetic support request",
          message: "Synthetic message",
          route_path: "/support",
          reply_email: "signed-in@example.test",
        }],
        error: null,
      };
    }
    if (name === "settle_support_external_delivery_v1") {
      return { data: "durable-receipt-1", error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
};
let transportCalls = 0;
const receipt = await deliverSupportNotification({
  admin,
  outboxId: "outbox-1",
  workerId: "worker-1",
  env: mailSinkEnv,
  transport: async ({ endpoint, headers, body }) => {
    transportCalls += 1;
    assert.equal(endpoint.origin, "http://127.0.0.1:8025");
    assert.equal(headers["idempotency-key"], "outbox-1");
    assert.equal(headers.authorization, undefined);
    const payload = JSON.parse(body);
    assert.equal(payload.destination, "owner@example.test");
    assert.equal(payload.replyTo, "signed-in@example.test");
    assert.equal(payload.userReference, undefined);
    assert.equal(payload.organizationReference, undefined);
    assert.equal(payload.correlationReference, "correlation-1");
    return { ok: true, status: 202, receiptId: "sink-receipt-1" };
  },
});
assert.equal(transportCalls, 1);
assert.deepEqual(receipt, {
  receiptId: "durable-receipt-1",
  adapter: "mail_sink",
  scope: "noncommunication_test",
});
assert.deepEqual(calls.map((call) => call.name), [
  "get_support_notification_delivery_payload_v1",
  "settle_support_external_delivery_v1",
]);
assert.equal(calls[1].args.p_provider_receipt_id, "sink-receipt-1");
assert.match(calls[1].args.p_destination_reference, /^sha256:[a-f0-9]{64}$/);
assert.notEqual(calls[1].args.p_destination_reference, "owner@example.test");

await assert.rejects(
  deliverSupportNotification({
    admin,
    outboxId: "outbox-1",
    workerId: "worker-1",
    env: mailSinkEnv,
    transport: async () => {
      throw new Error("simulated timeout after an unknowable provider boundary");
    },
  }),
  (error) =>
    error instanceof SupportDeliveryPolicyError &&
    error.code === "support_external_delivery_ambiguous",
);

const receiptPersistenceAdmin = {
  async rpc(name) {
    if (name === "get_support_notification_delivery_payload_v1") {
      return {
        data: [{
          outbox_id: "outbox-ambiguous-receipt",
          ticket_id: "ticket-1",
          organization_id: "org-1",
          user_id: "user-1",
          correlation_id: "correlation-1",
          category: "product_blocker",
          subject: "Synthetic support request",
          message: "Synthetic message",
          route_path: "/support",
          reply_email: "signed-in@example.test",
        }],
        error: null,
      };
    }
    if (name === "settle_support_external_delivery_v1") {
      return { data: null, error: { code: "40001", message: "simulated fence loss" } };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
};
await assert.rejects(
  deliverSupportNotification({
    admin: receiptPersistenceAdmin,
    outboxId: "outbox-ambiguous-receipt",
    workerId: "worker-1",
    env: mailSinkEnv,
    transport: async () => ({ ok: true, status: 202, receiptId: "sink-receipt-ambiguous" }),
  }),
  (error) =>
    error instanceof SupportDeliveryPolicyError &&
    error.code === "support_external_delivery_ambiguous",
);

console.log("support external delivery policy and no-network mail-sink adapter: PASS");
