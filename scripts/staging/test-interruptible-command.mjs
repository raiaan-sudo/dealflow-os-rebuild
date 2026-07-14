#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInterruptibleCommand } from "./interruptible-command.mjs";

for (const requestedSignal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const execution = runInterruptibleCommand({
    command: process.execPath,
    args: ["-e", "setTimeout(() => process.stdout.write('unsafe-late-output'), 5000)"],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 10_000,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(requestedSignal), 100);
  const result = await execution;
  assert.equal(result.aborted, true, `${requestedSignal} must abort the child`);
  assert.equal(result.timedOut, false);
  assert.match(String(result.signal), /^SIG(?:TERM|KILL)$/);
  assert.equal(result.stdout.includes("unsafe-late-output"), false);
  assert.ok(Date.now() - startedAt < 3_000, `${requestedSignal} cleanup was not prompt`);
}

const completed = await runInterruptibleCommand({
  command: process.execPath,
  args: ["-e", "process.stdout.write('complete')"],
  cwd: process.cwd(),
  env: process.env,
  timeoutMs: 5_000,
});
assert.equal(completed.status, 0);
assert.equal(completed.signal, null);
assert.equal(completed.aborted, false);
assert.equal(completed.stdout, "complete");

const earlyExitWithInput = await runInterruptibleCommand({
  command: "/usr/bin/false",
  cwd: process.cwd(),
  env: process.env,
  input: "x".repeat(20_000_000),
  timeoutMs: 5_000,
});
assert.notEqual(earlyExitWithInput.status, 0);

const processTreeRoot = mkdtempSync(join(tmpdir(), "dealflow-process-tree-contract-"));
const sentinel = join(processTreeRoot, "orphan-grandchild-sentinel");
try {
  const controller = new AbortController();
  const treeExecution = runInterruptibleCommand({
    command: process.execPath,
    args: [
      "-e",
      [
        "const { spawn } = require('node:child_process');",
        "spawn(process.execPath, ['-e', `setTimeout(() => require('node:fs').writeFileSync(process.env.SENTINEL, 'orphan'), 800)`], { env: process.env, stdio: 'ignore' });",
        "setTimeout(() => {}, 5000);",
      ].join(""),
    ],
    cwd: process.cwd(),
    env: { ...process.env, SENTINEL: sentinel },
    timeoutMs: 10_000,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort("SIGTERM"), 100);
  const treeResult = await treeExecution;
  assert.equal(treeResult.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.equal(existsSync(sentinel), false, "aborted process-group grandchild survived");

  const nonzeroSentinel = join(processTreeRoot, "nonzero-parent-orphan-sentinel");
  const nonzeroTree = await runInterruptibleCommand({
    command: process.execPath,
    args: [
      "-e",
      [
        "const { spawn } = require('node:child_process');",
        "spawn(process.execPath, ['-e', `setTimeout(() => require('node:fs').writeFileSync(process.env.NONZERO_SENTINEL, 'orphan'), 800)`], { env: process.env, stdio: 'ignore' });",
        "process.exit(7);",
      ].join(""),
    ],
    cwd: process.cwd(),
    env: { ...process.env, NONZERO_SENTINEL: nonzeroSentinel },
    timeoutMs: 10_000,
  });
  assert.equal(nonzeroTree.status, 7);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.equal(existsSync(nonzeroSentinel), false, "nonzero parent left an orphan grandchild");

  const outputLimitStartedAt = Date.now();
  const outputLimited = await runInterruptibleCommand({
    command: process.execPath,
    args: [
      "-e",
      "process.on('SIGTERM',()=>{});setInterval(()=>process.stdout.write('x'.repeat(2048)),1)",
    ],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 10_000,
    maxBuffer: 1_024,
  });
  assert.match(outputLimited.error?.message ?? "", /exceeded its output limit/);
  assert.ok(Date.now() - outputLimitStartedAt < 4_000, "output-limit force kill was not bounded");

  const timedOut = await runInterruptibleCommand({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 5000)"],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 100,
  });
  assert.equal(timedOut.timedOut, true);
  assert.match(timedOut.error?.message ?? "", /timed out after 100ms/);
} finally {
  rmSync(processTreeRoot, { recursive: true, force: true });
}

process.stdout.write("PASS interruptible staging child-process contract\n");
