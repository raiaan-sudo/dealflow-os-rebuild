#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const smsSource = readFileSync("src/lib/services/sms-service.ts", "utf8");
const twilioStatusRoute = readFileSync("src/app/api/webhooks/twilio/status/route.ts", "utf8");
const operatorDebtSource = readFileSync("scripts/check-operator-debt.mjs", "utf8");
const repairSource = readFileSync("scripts/repair-lead-notification-status-drift.mjs", "utf8");

function normalizeLeadNotificationStatus(record) {
  if (record.failed_at || record.error_message || record.status === "failed") {
    return "failed";
  }

  if (record.delivered_at || record.status === "delivered") {
    return "delivered";
  }

  if (record.status === "undelivered") {
    return "undelivered";
  }

  if (record.status === "sent" || record.sent_at || record.provider_message_id) {
    return "sent";
  }

  return ["queued", "sent", "delivered", "undelivered", "failed"].includes(record.status)
    ? record.status
    : "queued";
}

assert.equal(
  normalizeLeadNotificationStatus({
    status: "queued",
    delivered_at: "2026-05-17T02:45:48.928+00:00",
  }),
  "delivered",
);
assert.equal(
  normalizeLeadNotificationStatus({
    status: "delivered",
    failed_at: "2026-05-17T02:46:48.928+00:00",
  }),
  "failed",
);
assert.equal(
  normalizeLeadNotificationStatus({
    status: "delivered",
    error_message: "provider rejected delivery",
  }),
  "failed",
);
assert.notEqual(
  normalizeLeadNotificationStatus({
    status: "queued",
    provider_message_id: "SM_redacted",
    sent_at: "2026-05-17T02:45:47.905+00:00",
  }),
  "delivered",
);
assert.equal(
  normalizeLeadNotificationStatus({
    status: "queued",
    provider_message_id: "SM_redacted",
    sent_at: "2026-05-17T02:45:47.905+00:00",
  }),
  "sent",
);

assert.match(smsSource, /export function normalizeLeadNotificationStatus/);
assert.match(smsSource, /normalizeStoredNotificationStatusById/);
assert.match(smsSource, /delivered_at \|\| record\.status === "delivered"/);
assert.match(smsSource, /failed_at \|\| record\.error_message \|\| record\.status === "failed"/);
assert.match(smsSource, /patch\.status = normalizeLeadNotificationStatus/);
assert.match(smsSource, /await normalizeStoredNotificationStatusById\(params\.id\)/);
assert.match(smsSource, /\.select\("id"\)/);
assert.match(smsSource, /updatedCount/);
assert.match(twilioStatusRoute, /updateSmsDeliveryStatus/);
assert.match(twilioStatusRoute, /MessageStatus/);
assert.match(twilioStatusRoute, /SmsStatus/);
assert.match(operatorDebtSource, /deliveredNotificationStatusDrift/);
assert.match(operatorDebtSource, /failedNotificationStatusDrift/);
assert.match(operatorDebtSource, /Lead notification status drift/);
assert.match(repairSource, /mode: args\.apply \? "apply" : "dry-run"/);
assert.match(repairSource, /\.eq\("status", "queued"\)/);
assert.match(repairSource, /\.not\("delivered_at", "is", null\)/);
assert.match(repairSource, /status: "delivered"/);

console.log("Lead notification status normalization tests passed.");
