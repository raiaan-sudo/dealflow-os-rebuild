import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260512010000_scope_provider_usage_idempotency.sql",
  "utf8",
);
const sessionCostGuard = readFileSync("src/lib/services/session-cost-guard.ts", "utf8");
const systemJobService = readFileSync("src/lib/services/system-job-service.ts", "utf8");
const campaignPersistence = readFileSync("src/lib/services/campaign-persistence.ts", "utf8");
const staticJobBranch = systemJobService.slice(
  systemJobService.indexOf('processingJob.kind === "static_creative_generation"'),
  systemJobService.indexOf('processingJob.kind === "video_generation"'),
);

assert.match(migration, /drop index if exists public\.provider_usage_events_idempotency_unique/);
assert.match(migration, /provider_usage_events_scoped_idempotency_unique/);
assert.match(migration, /organization_id,\s*\n\s*user_id,\s*\n\s*coalesce\(campaign_id/s);
assert.match(migration, /where idempotency_key = p_idempotency_key\s*\n\s*and organization_id = p_organization_id/s);
assert.match(migration, /and user_id = p_user_id/);
assert.match(migration, /and provider = p_provider\s*\n\s*and operation = p_operation\s*\n\s*and usage_date = today/s);
assert.doesNotMatch(
  migration,
  /from public\.provider_usage_events\s*\n\s*where idempotency_key = p_idempotency_key;\s*\n/s,
  "provider usage idempotency lookup must not be globally scoped",
);
assert.match(
  sessionCostGuard,
  /assertProviderGenerationSpendAllowed/,
  "provider usage reservations must pass the hard spend-cap guard before durable reservation",
);
assert.match(
  sessionCostGuard,
  /p_limit_count: effectiveLimit/,
  "provider usage reservation daily count limit is capped by the hard provider-generation count cap",
);
assert.match(
  sessionCostGuard,
  /p_estimated_cost: params\.estimatedCost \?\? spendGuard\.estimatedCost/,
  "provider usage events must carry estimated cost from the hard spend-cap guard when callers omit it",
);
assert.match(
  sessionCostGuard,
  /catch \(error\)[\s\S]*markSessionCostBudgetEvent\({[\s\S]*status: "released"/,
  "credit reservation failures release provider usage through the shared counter-decrement path",
);
assert.doesNotMatch(
  sessionCostGuard,
  /catch \(error\)[\s\S]{0,250}\.from\("provider_usage_events"\)[\s\S]{0,160}\.update\(\{[\s\S]{0,80}status: "released"/,
  "credit reservation failure path must not directly update provider events without releasing usage count",
);
assert.match(
  systemJobService,
  /providerUsageRunId: staticPayload\?\.providerUsageRunId\?\.trim\(\) \|\| processingJob\.id/,
  "static creative automatic persistence retries must reuse the stable job id provider usage scope",
);
assert.doesNotMatch(
  staticJobBranch,
  /providerUsageRunId: `\$\{processingJob\.id\}:\$\{processingJob\.attempt_count/,
  "static creative persistence retries must not change provider usage scope by attempt count",
);
assert.match(
  campaignPersistence,
  /image_generation:\$\{provider\}:\$\{row\.organization_id[\s\S]*:\$\{runScope\}/,
  "static image provider usage idempotency remains scoped by stable run scope",
);

console.log("Provider usage idempotency scope tests passed.");
