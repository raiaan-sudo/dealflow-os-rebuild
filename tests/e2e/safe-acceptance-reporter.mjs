import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const AUTHENTICATED_SUITE = "authenticated isolated-staging product proof";
const EXPECTED_PROJECTS = Object.freeze([
  "desktop-chromium",
  "mobile-chromium",
  "desktop-firefox",
  "desktop-webkit",
]);
const EXPECTED_AUTHENTICATED_RESULTS_PER_PROJECT = 4;

export function exactReporterProjectName(test, titlePath = test.titlePath()) {
  const projectName = test.parent?.project?.()?.name;
  if (typeof projectName === "string" && projectName.length > 0) return projectName;
  const fallback = titlePath.find((entry) => EXPECTED_PROJECTS.includes(entry));
  return fallback ?? null;
}

export function classifyAuthenticatedAcceptance({
  hosted,
  authenticatedResults,
}) {
  if (!hosted) {
    return {
      status: "authenticated_deferred",
      shouldFail: false,
      reason: "Local browser proof covers public and unauthenticated routes only.",
    };
  }

  const skipped = authenticatedResults.filter((record) => record.status === "skipped");
  const passed = authenticatedResults.filter((record) => record.status === "passed");
  if (authenticatedResults.length === 0) {
    return {
      status: "failed",
      shouldFail: true,
      reason: "Hosted acceptance executed zero authenticated tests.",
    };
  }
  if (skipped.length > 0) {
    return {
      status: "failed",
      shouldFail: true,
      reason: `Hosted acceptance skipped ${skipped.length} authenticated test result(s).`,
    };
  }
  if (passed.length !== authenticatedResults.length) {
    return {
      status: "failed",
      shouldFail: true,
      reason: "Hosted authenticated acceptance was not fully green.",
    };
  }
  const countsByProject = Object.fromEntries(
    EXPECTED_PROJECTS.map((projectName) => [
      projectName,
      authenticatedResults.filter((record) => record.projectName === projectName).length,
    ]),
  );
  const unknownProjectCount = authenticatedResults.filter(
    (record) => !EXPECTED_PROJECTS.includes(record.projectName),
  ).length;
  if (
    unknownProjectCount !== 0 ||
    authenticatedResults.length !==
      EXPECTED_PROJECTS.length * EXPECTED_AUTHENTICATED_RESULTS_PER_PROJECT ||
    Object.values(countsByProject).some(
      (count) => count !== EXPECTED_AUTHENTICATED_RESULTS_PER_PROJECT,
    )
  ) {
    return {
      status: "failed",
      shouldFail: true,
      reason: "Hosted authenticated acceptance did not cover the exact four-engine matrix.",
    };
  }
  return {
    status: "passed",
    shouldFail: false,
    reason: "Every hosted authenticated test result passed with zero skips.",
  };
}

export default class SafeAcceptanceReporter {
  authenticatedResults = [];

  onTestEnd(test, result) {
    const path = test.titlePath();
    const titlePath = path.join(" > ");
    if (!titlePath.includes(AUTHENTICATED_SUITE)) return;
    this.authenticatedResults.push({
      titlePath,
      projectName: exactReporterProjectName(test, path),
      status: result.status,
      retry: result.retry,
    });
  }

  onEnd(result) {
    const hosted = Boolean(process.env.SAFE_E2E_BASE_URL?.trim());
    const classification = classifyAuthenticatedAcceptance({
      hosted,
      authenticatedResults: this.authenticatedResults,
    });
    const outputRoot = resolve(
      process.env.SAFE_E2E_RESOLVED_OUTPUT_DIR?.trim() ||
        process.env.SAFE_E2E_OUTPUT_DIR?.trim() ||
        join(tmpdir(), `dealflow-playwright-safe-${process.pid}`),
    );
    mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
    const summary = {
      schemaVersion: "dealflow.safe-browser-acceptance.v1",
      executionMode: hosted ? "hosted_authenticated" : "local_public",
      playwrightStatus: result.status,
      authenticatedStatus: classification.status,
      authenticatedReason: classification.reason,
      authenticatedResultCount: this.authenticatedResults.length,
      authenticatedSkippedCount: this.authenticatedResults.filter(
        (record) => record.status === "skipped",
      ).length,
      authenticatedProjectCounts: Object.fromEntries(
        EXPECTED_PROJECTS.map((projectName) => [
          projectName,
          this.authenticatedResults.filter((record) => record.projectName === projectName).length,
        ]),
      ),
      authenticatedResults: this.authenticatedResults,
    };
    writeFileSync(
      join(outputRoot, "safe-browser-acceptance-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    if (classification.shouldFail) return { status: "failed" };
    return undefined;
  }
}
