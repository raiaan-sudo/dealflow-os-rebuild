#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  classifyAuthenticatedAcceptance,
  exactReporterProjectName,
} from "./safe-acceptance-reporter.mjs";

const projects = [
  "desktop-chromium",
  "mobile-chromium",
  "desktop-firefox",
  "desktop-webkit",
];
const exactGreenMatrix = projects.flatMap((projectName) =>
  Array.from({ length: 4 }, (_, index) => ({
    projectName,
    status: "passed",
    titlePath: `authenticated-${index}`,
  })),
);

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
    authenticatedResults: exactGreenMatrix,
  }),
  {
    status: "passed",
    shouldFail: false,
    reason: "Every hosted authenticated test result passed with zero skips.",
  },
);
assert.equal(
  classifyAuthenticatedAcceptance({
    hosted: true,
    authenticatedResults: exactGreenMatrix.slice(0, -1),
  }).shouldFail,
  true,
);
assert.equal(
  classifyAuthenticatedAcceptance({
    hosted: true,
    authenticatedResults: [
      ...exactGreenMatrix.slice(1),
      { projectName: "unknown", status: "passed" },
    ],
  }).shouldFail,
  true,
);

assert.equal(
  exactReporterProjectName(
    { parent: { project: () => ({ name: "desktop-firefox" }) }, titlePath: () => [] },
    ["", "wrong-fallback"],
  ),
  "desktop-firefox",
);
assert.equal(
  exactReporterProjectName(
    { parent: {}, titlePath: () => [] },
    ["", "desktop-webkit", "dealflow-safe.spec.ts"],
  ),
  "desktop-webkit",
);

console.log("safe browser acceptance reporter: PASS (local deferral is explicit; hosted auth skips fail)");
