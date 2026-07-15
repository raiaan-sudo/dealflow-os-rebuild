#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PLAYWRIGHT_FAILURE_DIAGNOSTIC_SCHEMA,
  buildMinimalPlaywrightFailureDiagnostic,
  buildPlaywrightFailureDiagnostic,
} from "./playwright-failure-diagnostic-contract.mjs";
import { deleteRegisteredUnsealedPlaywrightArtifactDirectories } from "./unsealed-playwright-artifact-cleanup.mjs";

const root = realpathSync(
  mkdtempSync(join(tmpdir(), "dealflow-playwright-failure-diagnostic-")),
);
const secret = `broker-secret-${"s".repeat(48)}`;
const rawHost = "https://dealflow-sensitive-host.example.test/private";
const rawPath = "/private/tmp/dealflow-sensitive/tests/e2e/failure.spec.ts:44:9";

function result(status, message = null) {
  return {
    status,
    errors: message ? [{ message, stack: `${message}\n    at ${rawPath}` }] : [],
    stdout: [],
    stderr: message ? [{ text: `stderr ${rawHost} ${secret}` }] : [],
  };
}

function testCase(projectName, status, message = null) {
  return {
    projectName,
    expectedStatus: "passed",
    results: [result(status, message)],
  };
}

try {
  const reporters = join(root, "reporters");
  mkdirSync(join(reporters, "report"), { recursive: true });
  const jsonPath = join(reporters, "results.json");
  const junitPath = join(reporters, "results.xml");
  const htmlPath = join(reporters, "report", "index.html");
  const safetyPath = join(reporters, "safe-browser-acceptance-summary.json");
  const failureMessage = `Expected lead row at ${rawHost}; ${secret}; stack ${rawPath}`;
  writeFileSync(jsonPath, JSON.stringify({
    errors: [{ message: `global ${rawHost} ${secret} ${rawPath}` }],
    suites: [{
      title: "dealflow-staging-acceptance.spec.ts",
      suites: [{
        title: "lead workflow",
        specs: [
          {
            title: "captures the lead exactly once",
            tests: [
              testCase("desktop-chromium", "passed"),
              testCase("mobile-chromium", "passed"),
            ],
          },
          {
            title: "shows live reporting",
            tests: [
              testCase("desktop-chromium", "failed", failureMessage),
              testCase("mobile-chromium", "failed", failureMessage),
            ],
          },
        ],
      }],
    }],
  }));
  writeFileSync(junitPath, `
<testsuites tests="4" failures="2" skipped="0" errors="0">
  <testsuite hostname="desktop-chromium" tests="2" failures="1" skipped="0" errors="0">
    <testcase name="lead workflow › captures the lead exactly once"></testcase>
    <testcase name="lead workflow › shows live reporting"><failure>${failureMessage}</failure></testcase>
  </testsuite>
  <testsuite hostname="mobile-chromium" tests="2" failures="1" skipped="0" errors="0">
    <testcase name="lead workflow › captures the lead exactly once"></testcase>
    <testcase name="lead workflow › shows live reporting"><failure>${failureMessage}</failure></testcase>
  </testsuite>
</testsuites>`);
  writeFileSync(htmlPath, `<html><body>${secret} ${rawHost} ${rawPath}</body></html>`);
  writeFileSync(safetyPath, JSON.stringify({
    schemaVersion: "dealflow.safe-browser-acceptance.v1",
    executionMode: "hosted_authenticated",
    playwrightStatus: "failed",
    authenticatedStatus: "failed",
    authenticatedResultCount: 8,
    authenticatedSkippedCount: 0,
    forbidden: `${secret} ${rawHost} ${rawPath}`,
  }));

  const diagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "safe",
    executionStatus: 1,
    reporterRoot: reporters,
    jsonReporterPath: jsonPath,
    junitReporterPath: junitPath,
    htmlReporterPath: htmlPath,
    safetyReporterPath: safetyPath,
    commandDiagnostics: [
      `command stderr ${secret} ${rawHost} ${rawPath}`,
      "Browser timeout while waiting for heading\nCall log:\n  - locator remained hidden",
      "x".repeat(2_000),
    ],
    secrets: [secret],
  });
  assert.equal(diagnostic.schemaVersion, PLAYWRIGHT_FAILURE_DIAGNOSTIC_SCHEMA);
  assert.equal(diagnostic.status, "FAILED");
  assert.equal(diagnostic.failureRemainsAuthoritative, true);
  assert.equal(diagnostic.stagingAcceptancePassed, false);
  assert.equal(diagnostic.execution.kind, "nonzero_exit");
  assert.equal(diagnostic.execution.exitStatus, 1);
  assert.equal("signal" in diagnostic.execution, false);
  assert.equal(diagnostic.reporters.json.status, "PARSED");
  assert.deepEqual(diagnostic.reporters.json.counts, {
    tests: 4,
    passed: 2,
    failed: 2,
    skipped: 0,
    interrupted: 0,
    timedOut: 0,
    projectCounts: {
      "desktop-chromium": 2,
      "mobile-chromium": 2,
    },
  });
  assert.equal(diagnostic.reporters.json.testTitleCount, 4);
  assert.deepEqual(
    diagnostic.reporters.json.testTitles.map(({ projectName, title, outcome }) => ({
      projectName,
      title,
      outcome,
    })),
    [
      {
        projectName: "desktop-chromium",
        title: "lead workflow › captures the lead exactly once",
        outcome: "passed",
      },
      {
        projectName: "mobile-chromium",
        title: "lead workflow › captures the lead exactly once",
        outcome: "passed",
      },
      {
        projectName: "desktop-chromium",
        title: "lead workflow › shows live reporting",
        outcome: "failed",
      },
      {
        projectName: "mobile-chromium",
        title: "lead workflow › shows live reporting",
        outcome: "failed",
      },
    ],
  );
  assert.equal(diagnostic.reporters.junit.status, "PARSED");
  assert.equal(diagnostic.reporters.junit.declaredCountsAgree, true);
  assert.equal(diagnostic.reporters.junit.testTitleCount, 4);
  assert.equal(diagnostic.reporters.html.status, "PRESENT_BOUND");
  assert.equal(diagnostic.reporters.html.rawContentsRetained, false);
  assert.equal(diagnostic.reporters.safety.status, "PARSED");
  assert.equal(diagnostic.reporters.jsonJunitExactPortfolioAgreement, true);
  assert.equal(diagnostic.diagnostics.diagnosticsTruncated, true);
  assert.ok(diagnostic.diagnostics.retainedDiagnosticCount > 0);
  assert.ok(
    diagnostic.diagnostics.diagnostics.some((value) =>
      value.includes("Browser timeout while waiting for heading\nCall log:")),
  );
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, /dealflow-sensitive-host/);
  assert.doesNotMatch(serialized, /example\.test/);
  assert.doesNotMatch(serialized, /\/private\/tmp/);
  assert.doesNotMatch(serialized, /failure\.spec\.ts/);
  assert.ok(serialized.length < 256 * 1024);

  const adversarialDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 7,
    reporterRoot: reporters,
    jsonReporterPath: jsonPath,
    junitReporterPath: junitPath,
    htmlReporterPath: htmlPath,
    commandDiagnostics: [
      [
        "db.private.internal:7443",
        "db_service.internal",
        "foo_bar:5432",
        "edge.vendor.cloud",
        "/etc/dealflow/credential-store",
        "config/private/credential-store",
        "config\\private\\credential-store",
        "postgresql://owner:password@db.private.internal:7443/main",
        "file:///etc/dealflow/private-config",
        "[fd00::1]:5432",
        "fd00::1",
      ].join(" "),
      "z".repeat(2 * 1024 * 1024),
    ],
    secrets: [secret],
  });
  const adversarialSerialized = JSON.stringify(adversarialDiagnostic);
  assert.doesNotMatch(
    adversarialSerialized,
    /db\.private\.internal|db_service\.internal|foo_bar|edge\.vendor\.cloud|\/etc\/dealflow|config[\\/]private|postgresql:\/\/|file:\/\/|fd00::1/,
  );
  assert.equal(adversarialDiagnostic.diagnostics.diagnosticsTruncated, true);
  assert.ok(adversarialSerialized.length < 256 * 1024);

  const invalidSafetyPath = join(reporters, "invalid-safety.json");
  writeFileSync(invalidSafetyPath, JSON.stringify({
    schemaVersion: "dealflow.safe-browser-acceptance.v1",
    executionMode: "db.private.internal:7443",
    playwrightStatus: "opaque-secret-status",
    authenticatedStatus: "edge.vendor.cloud",
    authenticatedResultCount: -1,
    authenticatedSkippedCount: -1,
  }));
  const invalidSafetyDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "safe-product-browser",
    reporterProfile: "safe",
    executionStatus: 8,
    reporterRoot: reporters,
    jsonReporterPath: jsonPath,
    junitReporterPath: junitPath,
    htmlReporterPath: htmlPath,
    safetyReporterPath: invalidSafetyPath,
    secrets: [secret],
  });
  assert.equal(invalidSafetyDiagnostic.reporters.safety.status, "MALFORMED");
  assert.doesNotMatch(
    JSON.stringify(invalidSafetyDiagnostic),
    /db\.private\.internal|edge\.vendor\.cloud|opaque-secret-status/,
  );

  const emptyJsonPath = join(reporters, "empty-results.json");
  writeFileSync(emptyJsonPath, JSON.stringify({ suites: [], errors: [] }));
  const emptyDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 9,
    reporterRoot: reporters,
    jsonReporterPath: emptyJsonPath,
    junitReporterPath: join(reporters, "missing-empty.xml"),
    htmlReporterPath: htmlPath,
    secrets: [secret],
  });
  assert.equal(emptyDiagnostic.reporters.json.status, "MALFORMED");
  assert.equal(emptyDiagnostic.reporters.json.exactTestTitlePortfolioRetained, false);

  const oversizedPortfolioPath = join(reporters, "oversized-portfolio.json");
  writeFileSync(oversizedPortfolioPath, JSON.stringify({
    suites: [{
      title: "portfolio.spec.ts",
      specs: Array.from({ length: 257 }, (_, index) => ({
        title: `bounded test ${index + 1}`,
        tests: [testCase("desktop-chromium", "passed")],
      })),
    }],
  }));
  const oversizedPortfolioDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 10,
    reporterRoot: reporters,
    jsonReporterPath: oversizedPortfolioPath,
    junitReporterPath: join(reporters, "missing-oversized.xml"),
    htmlReporterPath: htmlPath,
    secrets: [secret],
  });
  assert.equal(
    oversizedPortfolioDiagnostic.reporters.json.status,
    "REJECTED_TEST_PORTFOLIO_OVERSIZE",
  );
  assert.equal(
    oversizedPortfolioDiagnostic.reporters.json.observedTestCountLowerBound,
    257,
  );

  const missingIdentityJsonPath = join(reporters, "missing-identity.json");
  const missingIdentityJunitPath = join(reporters, "missing-identity.xml");
  writeFileSync(missingIdentityJsonPath, JSON.stringify({
    suites: [{
      title: "missing-identity.spec.ts",
      specs: [{
        title: "",
        tests: [{
          expectedStatus: "passed",
          results: [result("passed")],
        }],
      }],
    }],
  }));
  writeFileSync(missingIdentityJunitPath, `
<testsuites tests="1" failures="0" skipped="0" errors="0">
  <testsuite tests="1" failures="0" skipped="0" errors="0">
    <testcase></testcase>
  </testsuite>
</testsuites>`);
  const missingIdentityDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 13,
    reporterRoot: reporters,
    jsonReporterPath: missingIdentityJsonPath,
    junitReporterPath: missingIdentityJunitPath,
    htmlReporterPath: htmlPath,
    secrets: [secret],
  });
  assert.equal(
    missingIdentityDiagnostic.reporters.json.exactTestTitlePortfolioRetained,
    false,
  );
  assert.equal(
    missingIdentityDiagnostic.reporters.junit.exactTestTitlePortfolioRetained,
    false,
  );
  assert.equal(
    missingIdentityDiagnostic.reporters.jsonJunitNormalizedPortfolioAgreement,
    true,
  );
  assert.equal(
    missingIdentityDiagnostic.reporters.jsonJunitExactPortfolioAgreement,
    null,
  );

  const malformedJsonPath = join(reporters, "malformed.json");
  writeFileSync(malformedJsonPath, "{not-json");
  const missingDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "safe-product-browser",
    reporterProfile: "staging",
    executionStatus: 2,
    reporterRoot: reporters,
    jsonReporterPath: malformedJsonPath,
    junitReporterPath: join(reporters, "missing.xml"),
    htmlReporterPath: join(reporters, "missing.html"),
    commandDiagnostics: [],
    secrets: [secret],
  });
  assert.equal(missingDiagnostic.status, "FAILED");
  assert.equal(missingDiagnostic.reporters.json.status, "MALFORMED");
  assert.equal(missingDiagnostic.reporters.junit.status, "MISSING");
  assert.equal(missingDiagnostic.reporters.html.status, "MISSING");
  assert.equal(missingDiagnostic.reporters.jsonJunitExactPortfolioAgreement, null);
  assert.equal(missingDiagnostic.stagingAcceptancePassed, false);

  const outsideReporter = join(root, "outside-secret.json");
  const symlinkReporter = join(reporters, "symlink-results.json");
  writeFileSync(outsideReporter, JSON.stringify({ secret }));
  symlinkSync(outsideReporter, symlinkReporter);
  const symlinkDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 3,
    reporterRoot: reporters,
    jsonReporterPath: symlinkReporter,
    junitReporterPath: join(reporters, "missing-2.xml"),
    htmlReporterPath: join(reporters, "missing-2.html"),
    secrets: [secret],
  });
  assert.equal(symlinkDiagnostic.reporters.json.status, "REJECTED_UNSAFE_PATH");
  assert.doesNotMatch(JSON.stringify(symlinkDiagnostic), new RegExp(secret));

  const outsideDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 4,
    reporterRoot: reporters,
    jsonReporterPath: outsideReporter,
    junitReporterPath: join(reporters, "missing-3.xml"),
    htmlReporterPath: join(reporters, "missing-3.html"),
    secrets: [secret],
  });
  assert.equal(outsideDiagnostic.reporters.json.status, "REJECTED_OUTSIDE_ROOT");
  assert.doesNotMatch(JSON.stringify(outsideDiagnostic), new RegExp(secret));

  const oversizedReporter = join(reporters, "oversized-results.json");
  writeFileSync(oversizedReporter, "");
  truncateSync(oversizedReporter, (32 * 1024 * 1024) + 1);
  const oversizedDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 5,
    reporterRoot: reporters,
    jsonReporterPath: oversizedReporter,
    junitReporterPath: join(reporters, "missing-4.xml"),
    htmlReporterPath: join(reporters, "missing-4.html"),
    secrets: [secret],
  });
  assert.equal(oversizedDiagnostic.reporters.json.status, "REJECTED_OVERSIZE");
  assert.equal(oversizedDiagnostic.reporters.json.bytes, (32 * 1024 * 1024) + 1);

  const hardlinkReporter = join(reporters, "hardlink-results.json");
  linkSync(jsonPath, hardlinkReporter);
  const hardlinkDiagnostic = buildPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    executionStatus: 11,
    reporterRoot: reporters,
    jsonReporterPath: hardlinkReporter,
    junitReporterPath: join(reporters, "missing-hardlink.xml"),
    htmlReporterPath: htmlPath,
    secrets: [secret],
  });
  assert.equal(hardlinkDiagnostic.reporters.json.status, "REJECTED_HARDLINK");

  const failureEvidence = join(root, "failure-evidence");
  const rawJsonDirectory = join(failureEvidence, "multi-role-browser-artifacts");
  const rawSummaryDirectory = join(failureEvidence, "multi-role-browser");
  mkdirSync(rawJsonDirectory, { recursive: true });
  mkdirSync(rawSummaryDirectory, { recursive: true });
  writeFileSync(join(rawJsonDirectory, "results.json"), JSON.stringify({ secret }));
  writeFileSync(join(rawSummaryDirectory, "failure.png"), Buffer.from([0x89, 0x50]));
  const retainedDiagnosticPath = join(
    failureEvidence,
    "multi-role-browser-failure-diagnostic.json",
  );
  writeFileSync(retainedDiagnosticPath, JSON.stringify(diagnostic));
  const cleanup = deleteRegisteredUnsealedPlaywrightArtifactDirectories({
    evidenceDir: failureEvidence,
    registeredDirectories: [rawJsonDirectory, rawSummaryDirectory],
  });
  assert.equal(cleanup.status, "PASS");
  assert.equal(cleanup.rawReporterArtifactsRetained, false);
  assert.equal(existsSync(rawJsonDirectory), false);
  assert.equal(existsSync(rawSummaryDirectory), false);
  assert.equal(existsSync(retainedDiagnosticPath), true);

  const abnormalFallback = buildMinimalPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    failureKind: "abnormal_command_termination",
    failureDescriptor: `timed out ${secret} ${rawHost} ${rawPath}`,
    secrets: [secret],
  });
  const repeatedAbnormalFallback = buildMinimalPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    failureKind: "abnormal_command_termination",
    failureDescriptor: `timed out ${secret} ${rawHost} ${rawPath}`,
    secrets: [secret],
  });
  assert.deepEqual(abnormalFallback, repeatedAbnormalFallback);
  assert.equal(abnormalFallback.status, "FAILED");
  assert.equal(abnormalFallback.execution.kind, "abnormal_command_termination");
  assert.equal(abnormalFallback.execution.exitStatus, null);
  assert.equal(abnormalFallback.diagnosticConstructionStatus, "FALLBACK_DIGEST_ONLY");
  assert.equal(abnormalFallback.reporters.exactCountsRetained, false);
  assert.doesNotMatch(JSON.stringify(abnormalFallback), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(abnormalFallback), /example\.test|\/private\/tmp/);

  const constructionFallback = buildMinimalPlaywrightFailureDiagnostic({
    suiteName: "safe-product-browser",
    reporterProfile: "safe",
    failureKind: "diagnostic_construction_failed",
    executionStatus: 9,
    failureDescriptor: `parser rejected ${secret} ${rawHost} ${rawPath}`,
    secrets: [secret],
  });
  assert.equal(constructionFallback.status, "FAILED");
  assert.equal(constructionFallback.execution.kind, "diagnostic_construction_failed");
  assert.equal(constructionFallback.execution.exitStatus, 9);
  assert.equal(constructionFallback.rawReporterArtifactsMustBeDeleted, true);

  const evidenceResetFallback = buildMinimalPlaywrightFailureDiagnostic({
    suiteName: "multi-role-browser",
    reporterProfile: "staging",
    failureKind: "evidence_reset_fallback",
    executionStatus: 12,
    failureDescriptor: `reset ${secret} postgresql://owner:password@db.private.internal/main`,
    secrets: [secret],
  });
  assert.equal(evidenceResetFallback.status, "FAILED");
  assert.equal(evidenceResetFallback.execution.kind, "evidence_reset_fallback");
  assert.equal(evidenceResetFallback.execution.exitStatus, 12);
  assert.doesNotMatch(
    JSON.stringify(evidenceResetFallback),
    new RegExp(`${secret}|postgresql|db\\.private\\.internal`),
  );

  assert.throws(
    () => buildPlaywrightFailureDiagnostic({
      suiteName: "multi-role-browser",
      reporterProfile: "staging",
      executionStatus: 0,
      reporterRoot: reporters,
      jsonReporterPath: jsonPath,
      junitReporterPath: junitPath,
      htmlReporterPath: htmlPath,
    }),
    /requires an exact nonzero exit status/,
  );
  assert.throws(
    () => buildPlaywrightFailureDiagnostic({
      suiteName: "multi-role-browser",
      reporterProfile: "unknown",
      executionStatus: 1,
      reporterRoot: reporters,
      jsonReporterPath: jsonPath,
      junitReporterPath: junitPath,
      htmlReporterPath: htmlPath,
    }),
    /reporter profile is invalid/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write("PASS Playwright failure diagnostic contract\n");
