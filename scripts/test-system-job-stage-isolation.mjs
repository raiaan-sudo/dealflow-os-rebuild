#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/lib/services/system-job-orchestrator.ts", "utf8");
const routeSource = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
for (const marker of [
  "runIsolatedSystemJobStages",
  "options.canStart(stage.name)",
  "await stage.run()",
  "options.onFailure",
  'errorCode === "system_jobs_safe_deadline_exhausted"',
  "system_job_stage_failed",
]) {
  assert.ok(source.includes(marker), `Missing isolated-stage contract: ${marker}`);
}

const compiled = (await import("typescript")).default.transpileModule(source, {
  compilerOptions: {
    module: (await import("typescript")).default.ModuleKind.ES2022,
    target: (await import("typescript")).default.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { runIsolatedSystemJobStages } = await import(moduleUrl);

const executed = [];
const failures = [];
const secretSentinel = "sk_live_must_never_escape";
const results = await runIsolatedSystemJobStages([
  { name: "first", run: async () => { executed.push("first"); return { ok: true }; } },
  {
    name: "poison",
    run: async () => {
      executed.push("poison");
      const error = new Error(secretSentinel);
      error.code = `invalid code ${secretSentinel}`;
      throw error;
    },
  },
  { name: "later", run: async () => { executed.push("later"); return { completed: true }; } },
], {
  canStart: () => {},
  onFailure: (failure) => failures.push(failure),
});

assert.deepEqual(executed, ["first", "poison", "later"]);
assert.equal(results.poison.status, "failed");
assert.equal(results.poison.errorCode, "system_job_stage_failed");
assert.equal(results.later.status, "passed");
assert.deepEqual(failures, [{ stage: "poison", errorCode: "system_job_stage_failed" }]);
assert.doesNotMatch(JSON.stringify({ results, failures }), /sk_live_must_never_escape/);

const postTimeoutExecution = [];
const timeoutFailures = [];
const postTimeoutResults = await runIsolatedSystemJobStages([
  {
    name: "ghl_provider",
    run: async () => {
      postTimeoutExecution.push("ghl_provider");
      const error = new Error("synthetic bounded inbound timeout");
      error.code = "ghl_timeout";
      throw error;
    },
  },
  {
    name: "support_outbox",
    run: async () => {
      postTimeoutExecution.push("support_outbox");
      return { deliveredIds: ["synthetic-support-delivery"] };
    },
  },
  {
    name: "reporting_enqueue",
    run: async () => {
      postTimeoutExecution.push("reporting_enqueue");
      return { enqueuedCount: 1 };
    },
  },
], {
  canStart: () => {},
  onFailure: (failure) => timeoutFailures.push(failure),
});
assert.deepEqual(postTimeoutExecution, ["ghl_provider", "support_outbox", "reporting_enqueue"],
  "a bounded GHL reconciliation timeout starved later system-job stages");
assert.deepEqual(timeoutFailures, [{ stage: "ghl_provider", errorCode: "ghl_timeout" }]);
assert.equal(postTimeoutResults.ghl_provider.status, "failed");
assert.equal(postTimeoutResults.support_outbox.status, "passed");
assert.equal(postTimeoutResults.reporting_enqueue.status, "passed");

assert.match(
  routeSource,
  /processGhlProviderWorkerFromEnvironment\(\{[\s\S]*?maxProvisioningSteps: 1,[\s\S]*?maxLeadItems: 3,[\s\S]*?maxReconciliationItems: 1,[\s\S]*?\}\)/,
  "system-job route must explicitly budget at most one inbound reconciliation receipt",
);
assert.match(
  routeSource,
  /const ghlComponentFailures = ghlProvider[\s\S]*?stage: `ghl_provider\.\$\{component\}`[\s\S]*?const failedStages = \[\.\.\.outerFailedStages, \.\.\.ghlComponentFailures\];/,
  "a nested GHL component failure must contribute an explicit failed stage and 503 response",
);
assert.match(
  routeSource,
  /logError\("internal\.system_jobs_runner\.ghl_reconciliation_operator_action_required", \{\s*requestId,\s*count: reconciliationOperatorRequired,\s*codes: reconciliationSummary\.operatorActionCodes,\s*\}\);/,
  "operator-required reconciliation must emit only the PII-free count and bounded error codes",
);
assert.doesNotMatch(
  routeSource.match(/logError\("internal\.system_jobs_runner\.ghl_reconciliation_operator_action_required", \{([\s\S]*?)\}\);/)?.[1] ?? "",
  /(resultIds|receiptIds|reconciliationIds|leadIds|providerContactIds|submissionIds|operatorRequiredIds)/,
  "operator-action telemetry must not contain reconciliation, lead, contact, or submission identifiers",
);
for (const marker of [
  "ghlReconciliationProcessed: ghlProvider?.reconciliation.processed ?? 0",
  "ghlReconciliationOutcomeCounts: reconciliationSummary.outcomeCounts",
  "ghlReconciliationOperatorRequired: reconciliationOperatorRequired",
  "ghlReconciliationOperatorActionCodes: reconciliationSummary.operatorActionCodes",
]) {
  assert.ok(routeSource.includes(marker), `missing PII-free GHL reconciliation summary field: ${marker}`);
}

assert.match(
  routeSource,
  /status: failedStages\.length > 0 \? 503 : 200/,
  "cron invocation must return non-2xx when any isolated stage fails",
);
assert.match(
  routeSource,
  /failedStages\.length > 0 \? \{ "Retry-After": "60" \} : \{\}/,
  "partial failures must explicitly invite a bounded retry",
);
assert.match(
  routeSource,
  /logError\("internal\.system_jobs_runner\.partial_failure"/,
  "partial failures must emit an error-level operational signal",
);

await assert.rejects(
  runIsolatedSystemJobStages([
    {
      name: "deadline",
      run: async () => {
        const error = new Error("deadline");
        error.code = "system_jobs_safe_deadline_exhausted";
        throw error;
      },
    },
  ], { canStart: () => {}, onFailure: () => {} }),
  /deadline/,
);

console.log("system-job stage isolation and secret-safe continuation: PASS");
