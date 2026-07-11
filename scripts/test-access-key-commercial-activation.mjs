import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const policySource = await readFile("src/lib/commercial-activation-policy.ts", "utf8");
const policyOutput = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { evaluateCommercialActivationCandidate, applyCommercialActivationDecision } =
  await import(`data:text/javascript;base64,${Buffer.from(policyOutput).toString("base64")}`);

const decision = evaluateCommercialActivationCandidate({
  source: "checkout.session.completed",
  billingStateApplied: true,
  organizationId: "workspace-1",
  userId: "user-1",
  sourceEventId: "evt_access_key_paid",
  sourceEventCreated: 1_783_700_000,
  amountPaidCents: 49_900,
  paymentStatus: "paid",
  invoiceBillingReason: null,
});
assert.deepEqual(decision, { eligible: true, reason: "qualifying_initial_payment" });

const first = applyCommercialActivationDecision(
  { activated: false, creditBalanceCents: 0 },
  decision,
);
assert.equal(first.activationCreated, true);
assert.equal(first.initialCreditGrantedCents, 1_000);
assert.equal(first.creditBalanceCents, 1_000);
const replay = applyCommercialActivationDecision(first, decision);
assert.equal(replay.activationCreated, false);
assert.equal(replay.initialCreditGrantedCents, 0);
assert.equal(replay.creditBalanceCents, 1_000);

for (const candidate of [
  { paymentStatus: "unpaid", amountPaidCents: 49_900 },
  { paymentStatus: "paid", amountPaidCents: 0 },
]) {
  assert.equal(
    evaluateCommercialActivationCandidate({
      source: "checkout.session.completed",
      billingStateApplied: true,
      organizationId: "workspace-1",
      userId: "user-1",
      sourceEventId: "evt_blocked",
      sourceEventCreated: 1_783_700_000,
      invoiceBillingReason: null,
      ...candidate,
    }).eligible,
    false,
  );
}

const accessKeySource = await readFile("src/lib/services/access-key-service.ts", "utf8");
const checkoutRouteSource = await readFile("src/app/api/access-keys/checkout/route.ts", "utf8");
const successPageSource = await readFile("src/app/access-key/success/page.tsx", "utf8");
const revealPanelSource = await readFile("src/components/access-keys/access-key-reveal-panel.tsx", "utf8");
const revealAckRouteSource = await readFile("src/app/api/access-keys/reveal-ack/route.ts", "utf8");
const proxySource = await readFile("src/proxy.ts", "utf8");
const accessKeySecurityMigration = await readFile(
  "supabase/migrations/20260710235992_harden_access_key_reveal_claim.sql",
  "utf8",
);
const accessKeyRecoveryMigration = await readFile(
  "supabase/migrations/20260710235993_harden_access_key_claim_delivery.sql",
  "utf8",
);
const revealCookieSource = await readFile("src/lib/access-key-reveal-cookie.ts", "utf8");
const revealCookieOutput = ts.transpileModule(revealCookieSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const revealCookie = await import(
  `data:text/javascript;base64,${Buffer.from(revealCookieOutput).toString("base64")}`
);
assert.match(accessKeySource, /commercial_activation_payment_proof/);
assert.match(accessKeySource, /session\.payment_status !== "paid"/);
assert.match(accessKeySource, /recordCommercialActivationWithInitialCredit/);
assert.match(accessKeySource, /completeClaimedAccessKey/);
assert.match(accessKeyRecoveryMigration, /'provider_sync_status', 'pending'/);
assert.match(accessKeySource, /provider_sync_status: "completed"/);
assert.match(accessKeySource, /initial_credit_granted: activationResult\.initialCreditGranted/);
const claimCasIndex = accessKeySource.indexOf('"claim_billing_access_key_reconciliation"');
const claimedCompletionIndex = accessKeySource.indexOf(
  "return completeClaimedAccessKey({",
);
assert.ok(claimCasIndex >= 0 && claimedCompletionIndex > claimCasIndex);
assert.match(accessKeySource, /rpc\(\s*"preclaim_billing_access_key"/);
assert.match(accessKeySource, /createHmac\("sha256", requireAccessKeyPepper\(\)\)/);
assert.match(accessKeySource, /buildAccessKeyClaimToken\(keyHash, email\)/);
assert.match(accessKeySource, /rpc\(\s*"begin_billing_access_key_reveal_delivery"/);
assert.match(accessKeySource, /rpc\("release_billing_access_key_reveal_delivery"/);
assert.match(accessKeySource, /rpc\(\s*"ack_billing_access_key_reveal_delivery"/);
assert.match(accessKeySource, /rpc\(\s*"complete_billing_access_key_reconciliation"/);
assert.match(accessKeySource, /rpc\("fail_billing_access_key_reconciliation"/);
assert.doesNotMatch(accessKeySource, /consume_billing_access_key_reveal/);
assert.doesNotMatch(
  accessKeySource,
  /decryptRevealSecret\(row\.metadata\.reveal_ciphertext\)/,
);
assert.match(accessKeySource, /secureHashMatches\(revealedHash, row\.key_hash\)/);
assert.match(checkoutRouteSource, /getAccessKeyRevealCookieName\(session\.sessionId\)/);
assert.match(checkoutRouteSource, /ACCESS_KEY_REVEAL_MAX_IN_FLIGHT/);
assert.match(revealCookieSource, /"HttpOnly"/);
assert.match(revealCookieSource, /"SameSite=Lax"/);
assert.match(successPageSource, /cookies\(\)/);
assert.match(successPageSource, /loadAccessKeyCheckoutSuccess\(sessionId, revealVerifier\)/);
assert.match(successPageSource, /getAccessKeyRevealCookieName\(sessionId\)/);
assert.match(revealPanelSource, /\/api\/access-keys\/reveal-ack/);
assert.match(revealPanelSource, /keepalive: true/);
assert.match(revealAckRouteSource, /assertSameOriginRequest/);
assert.match(revealAckRouteSource, /acknowledgeAccessKeyRevealDelivery/);
assert.match(proxySource, /\^\\\/p\\\/\[\^\/\]\+\\\/checkout\$/);
assert.match(accessKeySecurityMigration, /for update;/i);
assert.match(accessKeySecurityMigration, /reveal_consumed_at is null/);
assert.match(accessKeySecurityMigration, /claim_token_expires_at > changed_at/);
assert.match(accessKeySecurityMigration, /candidate\.status = 'active'/);
assert.match(accessKeyRecoveryMigration, /create or replace function public\.claim_billing_access_key_reconciliation/);
assert.match(accessKeyRecoveryMigration, /claimed_by_user_id = p_user_id/);
assert.match(accessKeyRecoveryMigration, /claimed_organization_id = p_organization_id/);
assert.match(accessKeyRecoveryMigration, /create or replace function public\.begin_billing_access_key_reveal_delivery/);
assert.match(accessKeyRecoveryMigration, /metadata ->> 'reveal_ciphertext'/);
assert.match(accessKeyRecoveryMigration, /create or replace function public\.ack_billing_access_key_reveal_delivery/);
assert.match(accessKeyRecoveryMigration, /metadata - 'reveal_ciphertext'/);
assert.match(accessKeyRecoveryMigration, /same_email_preclaim_recoverable/);

const nowSeconds = 2_000_000_000;
let index = [];
const names = new Set();
for (let number = 1; number <= revealCookie.ACCESS_KEY_REVEAL_MAX_IN_FLIGHT; number += 1) {
  const sessionId = `cs_live_cookie_${number}`;
  names.add(revealCookie.getAccessKeyRevealCookieName(sessionId));
  index = revealCookie.appendAccessKeyRevealCookieIndex(index, sessionId, nowSeconds + number);
  assert.ok(index);
}
assert.equal(names.size, revealCookie.ACCESS_KEY_REVEAL_MAX_IN_FLIGHT);
assert.equal(
  revealCookie.appendAccessKeyRevealCookieIndex(index, "cs_live_cookie_overflow", nowSeconds + 10),
  null,
  "A fifth browser handoff exceeded the bounded cookie capacity",
);
index = revealCookie.removeAccessKeyRevealCookieIndex(index, "cs_live_cookie_2");
assert.ok(
  revealCookie.appendAccessKeyRevealCookieIndex(index, "cs_live_cookie_replacement", nowSeconds + 11),
  "Acknowledging one session did not release its cookie slot",
);
assert.deepEqual(
  revealCookie.parseAccessKeyRevealCookieIndex(`deadbeefdeadbeefdeadbeef:${nowSeconds - 86401}`, nowSeconds),
  [],
  "Expired handoff index entries remained active",
);

console.log("access-key commercial activation: PASS");
