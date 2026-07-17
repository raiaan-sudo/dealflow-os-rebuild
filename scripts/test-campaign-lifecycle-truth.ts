import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyOptimizationRuntime,
  applyProviderDispatchResultRuntime,
  applyProviderReadbackRuntime,
  archiveLocalRuntime,
  CampaignLifecycleTransitionError,
  decideCampaignRuntimeWrite,
  markLaunchIntentRuntime,
  pauseLocalRuntime,
  setExperienceRuntime,
} from "../src/lib/services/campaign-lifecycle-state-machine";
import type { CampaignRuntime } from "../src/lib/services/campaign-plan-service";

const T0 = "2026-07-17T10:00:00.000Z";
const T1 = "2026-07-17T10:01:00.000Z";

function runtime(overrides: Partial<CampaignRuntime> = {}): CampaignRuntime {
  return {
    status: "launch_ready",
    safetyState: "ready",
    launchMode: "test",
    lastAction: null,
    statusUpdatedAt: T0,
    launchedAt: null,
    campaignId: null,
    adSetId: null,
    adId: null,
    budgetDaily: null,
    budgetDailyInput: null,
    lastOptimizationAction: null,
    lastOptimizationAt: null,
    metaPushStatus: "not_pushed",
    metaAdSetIds: [],
    metaAdIds: [],
    pausedAdIds: [],
    queuedCampaignClones: [],
    metaLastMessage: null,
    ...overrides,
  };
}

function assertTransitionError(callback: () => unknown, code: string) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof CampaignLifecycleTransitionError);
    assert.equal(error.code, code);
    return true;
  });
}

async function main() {
assert.equal(
  decideCampaignRuntimeWrite({
    currentRuntime: runtime() as unknown as Record<string, unknown>,
    targetRuntime: runtime({ status: "launching" }) as unknown as Record<string, unknown>,
    expectedStatusUpdatedAt: T0,
  }),
  "apply",
);
assert.equal(
  decideCampaignRuntimeWrite({
    currentRuntime: runtime({ status: "launching", statusUpdatedAt: T1 }) as unknown as Record<string, unknown>,
    targetRuntime: runtime({ status: "launching", statusUpdatedAt: T1 }) as unknown as Record<string, unknown>,
    expectedStatusUpdatedAt: T0,
  }),
  "idempotent",
);
assert.equal(
  decideCampaignRuntimeWrite({
    currentRuntime: runtime({ status: "provider_paused", statusUpdatedAt: T1 }) as unknown as Record<string, unknown>,
    targetRuntime: runtime({ status: "launching", statusUpdatedAt: T1 }) as unknown as Record<string, unknown>,
    expectedStatusUpdatedAt: T0,
  }),
  "conflict",
);

const launching = markLaunchIntentRuntime({
  runtime: runtime(),
  at: T1,
  message: "intent",
});
assert.equal(launching.status, "launching");
assert.equal(launching.metaPushStatus, "publishing");
assert.equal(launching.campaignId, null, "launch intent must not fabricate provider IDs");

assertTransitionError(
  () =>
    setExperienceRuntime({
      runtime: runtime({ status: "launch_ready" }),
      status: "preview",
      at: T1,
      lastAction: "regress",
    }),
  "campaign_lifecycle_regression_blocked",
);

assertTransitionError(
  () =>
    applyProviderDispatchResultRuntime({
      runtime: launching,
      result: "provider_paused",
      identity: { campaignId: "cmp-1", adSetIds: [], adIds: ["ad-1"] },
      at: T1,
      message: "incomplete",
    }),
  "campaign_lifecycle_provider_receipt_incomplete",
);

const providerPaused = applyProviderDispatchResultRuntime({
  runtime: launching,
  result: "provider_paused",
  identity: { campaignId: "cmp-1", adSetIds: ["set-1"], adIds: ["ad-1"] },
  at: T1,
  message: "paused receipt",
});
assert.equal(providerPaused.status, "provider_paused");
assert.equal(providerPaused.metaPushStatus, "provider_paused");
assert.equal(providerPaused.safetyState, "paused");
assert.equal(providerPaused.launchedAt, null);

const partial = applyProviderDispatchResultRuntime({
  runtime: launching,
  result: "partial",
  identity: { campaignId: "cmp-1", adSetIds: [], adIds: [] },
  at: T1,
  message: "partial",
});
assert.equal(partial.status, "operator_action_required");
assert.equal(partial.metaPushStatus, "operator_action_required");

const unauthorizedActive = applyProviderReadbackRuntime({
  runtime: providerPaused,
  providerState: "active",
  campaignId: "cmp-1",
  activationAuthorized: false,
  at: T1,
  message: "unexpected active",
});
assert.equal(unauthorizedActive.status, "operator_action_required");
assert.equal(unauthorizedActive.metaPushStatus, "operator_action_required");

const processing = applyProviderReadbackRuntime({
  runtime: providerPaused,
  providerState: "processing",
  campaignId: "cmp-1",
  activationAuthorized: true,
  at: T1,
  message: "review pending",
});
assert.equal(processing.status, "provider_processing");
assert.equal(processing.metaPushStatus, "provider_processing");

const live = applyProviderReadbackRuntime({
  runtime: providerPaused,
  providerState: "active",
  campaignId: "cmp-1",
  activationAuthorized: true,
  at: T1,
  message: "active readback",
});
assert.equal(live.status, "live");
assert.equal(live.metaPushStatus, "published");
assert.equal(live.launchedAt, T1);

assertTransitionError(
  () =>
    applyOptimizationRuntime({
      runtime: providerPaused,
      at: T1,
      actionTitle: "scale",
    }),
  "campaign_lifecycle_optimization_not_live",
);
const optimizing = applyOptimizationRuntime({
  runtime: live,
  at: T1,
  actionTitle: "scale",
});
assert.equal(optimizing.status, "optimizing");
assert.equal(optimizing.metaPushStatus, "published");

const locallyPaused = pauseLocalRuntime(live, T1);
assert.equal(locallyPaused.status, "live");
assert.equal(locallyPaused.metaPushStatus, "published");
assert.equal(locallyPaused.safetyState, "paused");

assertTransitionError(
  () => archiveLocalRuntime(providerPaused, T1),
  "campaign_lifecycle_archive_provider_blocked",
);

const runtimeSource = await readFile(
  new URL("../src/lib/services/campaign-runtime-service.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(runtimeSource, /STATUS_TIMINGS_MS|buildLaunchIds|CAM-\$\{/);
assert.match(runtimeSource, /Runtime reads are deliberately side-effect free/);

const executionSource = await readFile(
  new URL("../src/lib/services/meta-campaign-execution-service.ts", import.meta.url),
  "utf8",
);
assert.match(executionSource, /result\.status === "success"\s*\? "provider_paused"/);

const persistenceSource = await readFile(
  new URL("../src/lib/services/campaign-plan-persistence-service.ts", import.meta.url),
  "utf8",
);
assert.match(persistenceSource, /\.eq\("updated_at", existingRow\.updated_at\)/);
assert.match(persistenceSource, /CampaignPlanWriteConflictError/);

const migrationSource = await readFile(
  new URL(
    "../supabase/migrations/20260717020000_canonicalize_campaign_lifecycle_truth.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migrationSource, /'metaPushStatus', 'operator_action_required'/);
assert.match(migrationSource, /intent\.provider_delivery_status = 'delivery_active'/);
assert.match(migrationSource, /'metaPushStatus', projected_push_status/);
assert.match(migrationSource, /projected_status := case when active_count > 0 then 'provider_processing' else 'provider_paused' end/);
assert.match(migrationSource, /intent\.status <> 'processing'/);
assert.match(migrationSource, /intent\.status = 'operator_required'/);
assert.equal(
  (migrationSource.match(/create or replace function public\.settle_meta_campaign_activation/g) ?? []).length,
  1,
  "activation settlement replacement must be deterministic on migration replay",
);

console.log("campaign lifecycle truth tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
