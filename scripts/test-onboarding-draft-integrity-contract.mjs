#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260717010000_harden_onboarding_draft_integrity.sql");
const route = read("src/app/api/onboarding/plan/route.ts");
const page = read("src/app/(app)/onboarding/page.tsx");
const preview = read("src/components/onboarding/prepaywall-campaign-preview.tsx");
const service = read("src/lib/services/campaign-plan-service.ts");
const provenanceSource = read("src/lib/onboarding-provenance.ts");
const checks = [];

function check(name, operation) {
  operation();
  checks.push(name);
}

check("migration adds 24-hour expiry and monotonic CAS revision", () => {
  assert.match(migration, /revision bigint/);
  assert.match(migration, /expires_at timestamptz/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /existing_draft\.revision <> p_expected_revision/);
  assert.match(migration, /revision = existing_draft\.revision \+ 1/);
  assert.match(migration, /onboarding_draft_stale_revision/);
});

check("authenticated writes use versioned RPCs and direct writes are revoked", () => {
  assert.match(migration, /save_onboarding_draft_v2/);
  assert.match(migration, /delete_onboarding_draft_v2/);
  assert.match(migration, /grant execute[\s\S]*save_onboarding_draft_v2[\s\S]*to authenticated/);
  assert.match(migration, /revoke all on table public\.onboarding_drafts from anon, authenticated/);
  assert.doesNotMatch(route, /\.from\("onboarding_drafts"\)\.upsert/);
  assert.match(route, /\.rpc\("save_onboarding_draft_v2"/);
  assert.match(route, /export async function DELETE/);
});

check("submit creates campaign and consumes draft in one service-only function", () => {
  assert.match(migration, /submit_onboarding_draft_v2/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(migration, /create_campaign_plan_with_entitlement_v1/);
  assert.match(migration, /onboarding_submission_receipts/);
  assert.match(migration, /insert into public\.onboarding_submission_receipts/);
  assert.match(migration, /delete from public\.onboarding_drafts draft/);
  assert.match(migration, /onboarding_submit_consumed_collision/);
  assert.match(route, /createAdminClient\(\)/);
  assert.match(route, /\.rpc\([\s\S]*"submit_onboarding_draft_v2"/);
});

check("consumed provenance is durable and authenticated DELETE cannot erase it", () => {
  assert.match(migration, /if existing_draft\.submission_status = 'submitted' then return false/);
  assert.match(migration, /revoke all on table public\.onboarding_submission_receipts/);
  assert.match(migration, /reused_consumed_receipt boolean/);
  assert.doesNotMatch(migration, /return query select existing_draft\.revision - 1/);
  assert.match(route, /reusedConsumedReceipt: saved\.reused_consumed_receipt === true/);
});

check("campaign, funnel, creative, and launch inputs retain versioned provenance", () => {
  for (const marker of [
    "onboarding_provenance",
    "campaignInputDigest",
    "funnelInputDigest",
    "creativeInputDigest",
    "launchInputDigest",
    "launch_input_provenance",
    "onboardingProvenance",
  ]) {
    assert.match(`${route}\n${provenanceSource}`, new RegExp(marker));
  }
  assert.match(service, /export async function prepareCampaignPlanPayload/);
  assert.match(route, /prepareCampaignPlanPayload/);
  assert.doesNotMatch(route, /saveCampaignPlan/);
});

check("browser serializes saves, submits exact revision and digest, and deletes on reset", () => {
  assert.match(page, /saveQueueRef/);
  assert.match(page, /writeAtRevision\(serverRevisionRef\.current\)/);
  assert.match(page, /result\.response\.status === 409/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /writeAtRevision\(authoritativeRevision\)/);
  assert.match(page, /await enqueueDraftSave\(\{[\s\S]*currentStep: step/);
  assert.match(page, /await goToStep\(visibleSteps\[nextIndex\]\.key, preparedDraft\)/);
  assert.match(page, /draftPayloadDigest: savedDraft\.draftPayloadDigest/);
  assert.match(page, /await enqueueDraftSave/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /draftConflictRef\.current = true/);
});

check("no component reads or writes onboarding PII in localStorage", () => {
  assert.doesNotMatch(page, /localStorage\.(?:getItem|setItem)/);
  assert.doesNotMatch(preview, /localStorage\.(?:getItem|setItem)/);
  assert.doesNotMatch(preview, /dealflow-guided-onboarding-v3/);
  assert.match(page, /localStorage\.removeItem\(legacyStorageKey\)/);
});

check("provenance digest is deterministic and input-sensitive", () => {
  const compiled = ts.transpileModule(provenanceSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  const evaluate = new Function("require", "module", "exports", compiled);
  const requireFromRepo = createRequire(import.meta.url);
  evaluate(requireFromRepo, loaded, loaded.exports);
  const left = loaded.exports.digestOnboardingInput({ z: 1, a: { y: 2, x: 3 } });
  const reordered = loaded.exports.digestOnboardingInput({ a: { x: 3, y: 2 }, z: 1 });
  const changed = loaded.exports.digestOnboardingInput({ a: { x: 4, y: 2 }, z: 1 });
  assert.equal(left, reordered);
  assert.notEqual(left, changed);
  assert.match(left, /^[0-9a-f]{64}$/);
});

console.log(`onboarding draft integrity contract: PASS (${checks.length}/${checks.length})`);
for (const name of checks) console.log(`PASS ${name}`);
