import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/support-ticket-contract.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { buildSupportTicketPayload, SupportTicketValidationError } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

assert.throws(
  () =>
    buildSupportTicketPayload({
      requestId: "2af8a047-61bf-41f7-88b5-7de48a947dc3",
      confusedText: "  ",
      blockerText: "\r\n",
      page: "/dashboard",
    }),
  SupportTicketValidationError,
);

assert.throws(
  () =>
    buildSupportTicketPayload({
      requestId: "not-a-uuid",
      confusedText: "This should not be accepted.",
      blockerText: "",
      page: "/dashboard",
    }),
  (error) =>
    error instanceof SupportTicketValidationError &&
    error.code === "feedback_request_invalid",
);

const payload = buildSupportTicketPayload({
  requestId: "2af8a047-61bf-41f7-88b5-7de48a947dc3",
  confusedText: "The status was unclear.\r\nWhich system is authoritative?",
  blockerText: "I cannot tell whether the campaign is live.",
  page: "/dashboard?secret=must-not-be-stored#section",
});
assert.equal(payload.category, "product_blocker");
assert.equal(payload.routePath, "/dashboard");
assert.match(payload.message, /^Confusing or unclear\n/);
assert.match(payload.message, /Blocking adoption\n/);
assert.equal(payload.safeContext.replyRoute, "authenticated_account_email");
assert.doesNotMatch(JSON.stringify(payload.safeContext), /secret|@/i);

const externalRoute = buildSupportTicketPayload({
  requestId: "2af8a047-61bf-41f7-88b5-7de48a947dc3",
  confusedText: "The page was unclear.",
  blockerText: "",
  page: "https://attacker.example/path",
});
assert.equal(externalRoute.routePath, null);
assert.equal(externalRoute.category, "product_feedback");

const serviceSource = await readFile("src/lib/services/support-ticket-service.ts", "utf8");
const deliveryAdapterSource = await readFile(
  "src/lib/integrations/support/delivery-adapter.ts",
  "utf8",
);
const routeSource = await readFile("src/app/api/feedback/route.ts", "utf8");
const widgetSource = await readFile("src/components/layout/feedback-widget.tsx", "utf8");
const migrationSource = await readFile(
  "supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
  "utf8",
);
const externalDeliveryMigrationSource = await readFile(
  "supabase/migrations/20260713010000_harden_support_external_delivery.sql",
  "utf8",
);
const runnerSource = await readFile("src/app/api/internal/system-jobs/route.ts", "utf8");
const monitorSource = await readFile("src/lib/services/internal-launch-monitor.ts", "utf8");
assert.match(serviceSource, /create_support_ticket_with_outbox/);
assert.match(serviceSource, /p_request_id: params\.input\.requestId/);
assert.doesNotMatch(serviceSource, /support ticket was recorded but the operator outbox row failed/i);
assert.match(serviceSource, /claim_support_notification_outbox/);
assert.match(serviceSource, /deliverSupportNotification/);
assert.match(deliveryAdapterSource, /deliver_support_notification_to_operator_inbox/);
assert.match(deliveryAdapterSource, /SUPPORT_STAGING_SINK_ENABLED/);
assert.match(deliveryAdapterSource, /support_external_destination_owner_blocked/);
assert.match(deliveryAdapterSource, /SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED/);
assert.match(deliveryAdapterSource, /DEALFLOW_SUPPORT_DESTINATION_APPROVED_V1/);
assert.match(deliveryAdapterSource, /DEALFLOW_SUPPORT_MAIL_SINK_ONLY_V1/);
assert.match(deliveryAdapterSource, /get_support_notification_delivery_payload_v1/);
assert.match(deliveryAdapterSource, /settle_support_external_delivery_v1/);
assert.match(deliveryAdapterSource, /providerIdempotencyKey = `support\/\$\{params\.outboxId\}`/);
assert.match(deliveryAdapterSource, /"idempotency-key": providerIdempotencyKey/);
assert.match(deliveryAdapterSource, /replyTo: payload\.reply_email/);
assert.doesNotMatch(deliveryAdapterSource, /userReference|organizationReference/);
assert.match(deliveryAdapterSource, /noncommunication_test/);
assert.doesNotMatch(serviceSource, /const delivered = !ticketError/);
assert.match(serviceSource, /if \(deliveryReceipt\)/);
assert.match(serviceSource, /SUPPORT_DELIVERY_OPERATOR_ACTION_CODES/);
assert.match(serviceSource, /support_external_delivery_ambiguous/);
assert.match(serviceSource, /\.eq\("locked_by", workerId\)/);
assert.match(migrationSource, /create or replace function public\.create_support_ticket_with_outbox/);
assert.match(migrationSource, /support_tickets_request_unique unique \(organization_id, user_id, request_id\)/);
assert.match(migrationSource, /on conflict \(organization_id, user_id, request_id\)/);
assert.match(migrationSource, /on conflict \(idempotency_key\)/);
assert.match(migrationSource, /create or replace function public\.claim_support_notification_outbox/);
assert.match(migrationSource, /support_outbox_attempts_exhausted/);
assert.match(
  migrationSource,
  /status = 'operator_action_required'[\s\S]*attempt_count >= queue\.max_attempts/,
);
assert.match(migrationSource, /create table if not exists public\.support_operator_inbox/);
assert.match(migrationSource, /create or replace function public\.deliver_support_notification_to_operator_inbox/);
assert.match(migrationSource, /auth\.role\(\) is distinct from 'service_role'/);
assert.doesNotMatch(migrationSource, /support_tickets_member_access[\s\S]{0,120}for all/i);
assert.match(
  migrationSource,
  /create policy support_tickets_member_select[\s\S]*user_id = auth\.uid\(\)/,
);
assert.doesNotMatch(migrationSource, /create policy support_tickets_owner_insert/);
assert.doesNotMatch(migrationSource, /create policy support_tickets_owner_update/);
assert.match(
  migrationSource,
  /insert into public\.support_operator_inbox[\s\S]*update public\.support_notification_outbox delivered[\s\S]*return receipt\.id/,
);
assert.match(migrationSource, /support_tickets_safe_context_size/);
assert.match(externalDeliveryMigrationSource, /create table if not exists public\.support_delivery_receipts/);
assert.match(externalDeliveryMigrationSource, /user_id uuid not null/);
assert.match(externalDeliveryMigrationSource, /destination_reference ~ '\^sha256:/);
assert.match(externalDeliveryMigrationSource, /create or replace function public\.get_support_notification_delivery_payload_v1/);
assert.match(externalDeliveryMigrationSource, /create or replace function public\.settle_support_external_delivery_v1/);
assert.match(externalDeliveryMigrationSource, /candidate\.locked_by = trim\(p_worker_id\)/);
assert.match(externalDeliveryMigrationSource, /join auth\.users identity on identity\.id = ticket\.user_id/);
assert.match(externalDeliveryMigrationSource, /lower\(nullif\(trim\(coalesce\(identity\.email/);
assert.match(externalDeliveryMigrationSource, /status = 'delivered'/);
assert.match(
  migrationSource,
  /support_notification_outbox_member_select[\s\S]*ticket\.user_id = auth\.uid\(\)/,
);
assert.match(runnerSource, /processSupportNotificationOutbox/);
assert.match(monitorSource, /\.from\("support_operator_inbox"\)/);
assert.match(monitorSource, /\.in\("ticket\.status", \["open", "in_progress"\]\)/);
assert.doesNotMatch(
  monitorSource,
  /\.from\("support_operator_inbox"\)[\s\S]{0,320}\.gte\("created_at", since\)/,
);
assert.match(routeSource, /requestId: z\.string\(\)\.uuid\(\)/);
assert.match(routeSource, /requestId: body\.requestId/);
assert.doesNotMatch(routeSource, /email: z\.string/);
assert.match(widgetSource, /const requestId = crypto\.randomUUID\(\)/);
assert.match(widgetSource, /body: JSON\.stringify\(\{\s*requestId,/);
assert.doesNotMatch(widgetSource, /feedback-email|setEmail/);

console.log("support ticket contract: PASS");
