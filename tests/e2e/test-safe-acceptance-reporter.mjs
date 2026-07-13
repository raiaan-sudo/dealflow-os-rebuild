#!/usr/bin/env node

import assert from "node:assert/strict";

import { classifyAuthenticatedAcceptance } from "./safe-acceptance-reporter.mjs";

assert.deepEqual(
  classifyAuthenticatedAcceptance({ hosted: false, authenticatedResults: [] }),
  {
    status: "authenticated_deferred",
    shouldFail: false,
    reason: "Local browser proof covers public and unauthenticated routes only.",
  },
);

assert.equal(
  classifyAuthenticatedAcceptance({ hosted: true, authenticatedResults: [] }).shouldFail,
  true,
);
assert.equal(
  classifyAuthenticatedAcceptance({
    hosted: true,
    authenticatedResults: [{ status: "skipped" }],
  }).shouldFail,
  true,
);
assert.equal(
  classifyAuthenticatedAcceptance({
    hosted: true,
    authenticatedResults: [{ status: "passed" }, { status: "failed" }],
  }).shouldFail,
  true,
);
assert.deepEqual(
  classifyAuthenticatedAcceptance({
    hosted: true,
    authenticatedResults: [{ status: "passed" }, { status: "passed" }],
  }),
  {
    status: "passed",
    shouldFail: false,
    reason: "Every hosted authenticated test result passed with zero skips.",
  },
);

console.log("safe browser acceptance reporter: PASS (local deferral is explicit; hosted auth skips fail)");

