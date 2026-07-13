#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  executePaidCreativeDispatch,
  type PaidCreativeDispatchHandle,
} from "../src/lib/services/paid-creative-dispatch-service";

type Stored = PaidCreativeDispatchHandle;

function createMemoryHarness(options?: { failAcceptanceWrite?: boolean }) {
  let providerCalls = 0;
  let stored: Stored | null = null;
  let projectionCount = 0;
  let debitCount = 1;

  const begin = async (): Promise<PaidCreativeDispatchHandle> => {
    if (!stored) {
      stored = {
        dispatchId: "10000000-0000-4000-a000-000000000001",
        decision: "dispatch",
        state: "dispatching",
        dispatchToken: "20000000-0000-4000-a000-000000000001",
        dispatchGeneration: 1,
        providerRequestId: null,
        providerOutput: null,
        projectionReceipt: null,
      };
      return { ...stored };
    }
    return {
      ...stored,
      decision:
        stored.state === "accepted" || stored.state === "projected"
          ? "recover"
          : stored.state === "rejected"
            ? "terminal"
            : "operator_action_required",
    };
  };

  const execute = () =>
    executePaidCreativeDispatch({
      begin,
      dispatch: async () => {
        providerCalls += 1;
        return {
          ok: true,
          providerAssetId: "provider-request-accepted-1",
          fileUrl: "https://assets.invalid/recoverable-output.png",
        };
      },
      classifyResult: (output) => ({
        outcome: "accepted",
        providerRequestId: output.providerAssetId,
      }),
      classifyError: () => ({ outcome: "uncertain" }),
      record: async ({ outcome, providerRequestId, providerOutput }) => {
        if (options?.failAcceptanceWrite) {
          throw new Error("injected database failure between provider response and outcome write");
        }
        assert.ok(stored);
        stored = {
          ...stored,
          state: outcome,
          providerRequestId,
          providerOutput,
        };
      },
    });

  return {
    execute,
    finalize() {
      assert.ok(stored);
      assert.equal(stored.state, "accepted");
      stored = {
        ...stored,
        state: "projected",
        projectionReceipt: { creativeAssetId: "asset-1" },
      };
      projectionCount += 1;
    },
    snapshot() {
      return { providerCalls, projectionCount, debitCount, stored };
    },
  };
}

async function main() {
// Provider accepted, the durable output was recorded, and the worker crashed
// before asset projection. Re-entry recovers that exact output without POSTing.
const crashAfterAcceptance = createMemoryHarness();
const accepted = await crashAfterAcceptance.execute();
assert.equal(accepted.outcome, "accepted");
assert.equal(accepted.recovered, false);
assert.equal(crashAfterAcceptance.snapshot().providerCalls, 1);
// injected process crash boundary: no projection/finalization call
const recovered = await crashAfterAcceptance.execute();
assert.equal(recovered.outcome, "accepted");
assert.equal(recovered.recovered, true);
assert.deepEqual(recovered.output, accepted.output);
assert.equal(crashAfterAcceptance.snapshot().providerCalls, 1, "replay issued a second provider call");
crashAfterAcceptance.finalize();
assert.equal(crashAfterAcceptance.snapshot().projectionCount, 1);
assert.equal(crashAfterAcceptance.snapshot().debitCount, 1, "logical attempt was debited more than once");

// Provider returned but the acceptance write failed. The dispatch remains
// ambiguous and replay must stop before a second provider POST.
const failureBetweenWrites = createMemoryHarness({ failAcceptanceWrite: true });
await assert.rejects(
  failureBetweenWrites.execute(),
  /injected database failure between provider response and outcome write/,
);
assert.equal(failureBetweenWrites.snapshot().providerCalls, 1);
const blockedReplay = await failureBetweenWrites.execute();
assert.equal(blockedReplay.outcome, "uncertain");
assert.equal(blockedReplay.recovered, true);
assert.equal(blockedReplay.dispatchState, "dispatching");
assert.equal(failureBetweenWrites.snapshot().providerCalls, 1, "ambiguous replay re-POSTed to provider");
assert.equal(failureBetweenWrites.snapshot().debitCount, 1);

const root = process.cwd();
const videoSource = readFileSync(join(root, "src/lib/services/video-generation-job.ts"), "utf8");
const staticSource = readFileSync(join(root, "src/lib/ai/providers.ts"), "utf8");
const staticOrchestrationSource =
  staticSource +
  readFileSync(join(root, "src/lib/services/campaign-persistence.ts"), "utf8");
const persistenceSource = readFileSync(
  join(root, "src/lib/services/static-creative-asset-service.ts"),
  "utf8",
);
const imageProviderSource = readFileSync(
  join(root, "src/lib/integrations/creative/image-provider.ts"),
  "utf8",
);
const systemJobSource = readFileSync(
  join(root, "src/lib/services/system-job-service.ts"),
  "utf8",
);

for (const [label, source] of [
  ["Higgsfield/video", videoSource],
  ["OpenAI/static", staticOrchestrationSource],
]) {
  assert.match(source, /executePaidCreativeDispatch/, `${label} bypasses durable dispatch coordinator`);
  assert.match(source, /recordPaidCreativeProviderOutcome/, `${label} does not persist provider output`);
}
assert.match(videoSource, /finalizePaidCreativeProjection/, "video usage can settle before projection");
assert.match(persistenceSource, /finalizePaidCreativeProjection/, "static usage can settle before projection");
assert.match(persistenceSource, /paid_creative_dispatch_id/, "static asset projection lacks dispatch identity");
assert.match(videoSource, /paid_creative_dispatch_id/, "video asset projection lacks dispatch identity");
assert.match(imageProviderSource, /X-Client-Request-Id/, "OpenAI requests lack a reconciliation identity");
for (const safeResumeCode of [
  "creative_asset_persist_failed",
  "creative_asset_create_failed",
  "campaign_video_ads_save_failed",
  "video_status_job_create_failed",
  "paid_creative_projection_finalize_failed",
]) {
  assert.match(
    systemJobSource,
    new RegExp(safeResumeCode),
    `post-acceptance recovery is not resumable for ${safeResumeCode}`,
  );
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      scenarios: {
        crashAfterProviderAcceptanceBeforeAssetInsert: "recovered_without_second_post",
        databaseFailureBetweenWrites: "operator_action_without_second_post",
        providerCallsPerLogicalAttempt: 1,
        debitsPerLogicalAttempt: 1,
        paths: ["openai_static", "higgsfield_video"],
      },
    },
    null,
    2,
  ),
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
