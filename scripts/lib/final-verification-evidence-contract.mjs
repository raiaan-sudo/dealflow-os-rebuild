import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statfsSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readSecureFileSnapshot } from "./secure-file-snapshot.mjs";

export const FINAL_VERIFICATION_MINIMUM_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS = Object.freeze([
  "desktop-chromium",
  "mobile-chromium",
  "desktop-firefox",
  "desktop-webkit",
]);
export const FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT = 10;
export const FINAL_VERIFICATION_LOCAL_BROWSER_SKIPPED_PER_PROJECT = 4;
export const FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT =
  FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.length *
  FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FATAL_RESOURCE_PATTERNS = Object.freeze([
  ["ENOSPC", /\bENOSPC\b|no space left on device/i],
  ["EDQUOT", /\bEDQUOT\b|disk quota exceeded/i],
  ["ENOMEM", /\bENOMEM\b|cannot allocate memory|out of memory/i],
  ["EMFILE", /\bEMFILE\b|too many open files/i],
  ["EIO", /\bEIO\b|input\/output error/i],
]);

function fail(message) {
  throw new Error(message);
}

function readRequiredRegularFile(path, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`${label} must be a real regular file`);
  }
  if (stat.size === 0) fail(`${label} must be nonempty`);
  return readSecureFileSnapshot(path).contents;
}

function parseRequiredJson(path, label) {
  try {
    return JSON.parse(readRequiredRegularFile(path, label).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} must contain valid JSON`);
    throw error;
  }
}

function collectTreeFiles(root) {
  const files = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        fail("Verification evidence contains a symlink");
      }
      if (stat.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!stat.isFile()) {
        fail("Verification evidence contains an unsupported filesystem entry");
      }
      if (stat.size === 0) {
        fail("Verification evidence contains an empty file");
      }
      files.push(absolute);
    }
  };
  visit(root);
  if (files.length === 0) {
    fail("Verification evidence contains no sealable files");
  }
  return files;
}

function evidenceTreeDigest(root, files) {
  const digest = createHash("sha256");
  const records = files
    .map((absolute) => ({ absolute, path: relative(root, absolute) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const record of records) {
    const contents = readFileSync(record.absolute);
    digest.update(String(Buffer.byteLength(record.path)));
    digest.update("\0");
    digest.update(record.path);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return digest.digest("hex");
}

function flattenPlaywrightResults(suites) {
  const records = [];
  const visit = (suite) => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec?.tests ?? []) {
        if (!Array.isArray(test.results) || test.results.length !== 1) {
          fail("Local browser proof must contain one non-retried result per test");
        }
        records.push({ spec, test, result: test.results[0] });
      }
    }
    for (const child of suite?.suites ?? []) visit(child);
  };
  for (const suite of suites ?? []) visit(suite);
  return records;
}

function assertInsideRealDirectory(path, root, label) {
  if (!isAbsolute(path)) fail(`${label} must use an absolute path`);
  const realRoot = realpathSync(root);
  const realPath = realpathSync(path);
  const relation = relative(realRoot, realPath);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`)
  ) {
    fail(`${label} must remain inside the exact artifact directory`);
  }
  return realPath;
}

export function detectFinalVerificationFatalResourceDiagnostic(value) {
  const text = String(value ?? "");
  for (const [code, pattern] of FATAL_RESOURCE_PATTERNS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

export function readFinalVerificationFreeBytes(
  path,
  { readStatfs = (target) => statfsSync(target, { bigint: true }) } = {},
) {
  const stat = readStatfs(path);
  const blockSize = BigInt(stat?.bsize ?? 0);
  const availableBlocks = BigInt(stat?.bavail ?? 0);
  const availableBytes = blockSize * availableBlocks;
  if (availableBytes < 0n || availableBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("Final verification filesystem capacity is not safely representable");
  }
  return Number(availableBytes);
}

export function assertFinalVerificationDiskHeadroom(
  path,
  options = {},
) {
  const availableBytes = readFinalVerificationFreeBytes(path, options);
  if (availableBytes < FINAL_VERIFICATION_MINIMUM_FREE_BYTES) {
    fail(
      `Final verification requires at least ${FINAL_VERIFICATION_MINIMUM_FREE_BYTES} free bytes`,
    );
  }
  return availableBytes;
}

export function settleFinalVerificationDiskHeadroom(
  paths,
  {
    readFreeBytes = readFinalVerificationFreeBytes,
    wait = (milliseconds) => {
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
        0,
        0,
        milliseconds,
      );
    },
    intervalMs = 1_000,
    maxWaitMs = 60_000,
  } = {},
) {
  if (
    !Array.isArray(paths) ||
    paths.length < 1 ||
    paths.some((path) => typeof path !== "string" || path.length < 1) ||
    typeof readFreeBytes !== "function" ||
    typeof wait !== "function" ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1 ||
    !Number.isSafeInteger(maxWaitMs) ||
    maxWaitMs < 0 ||
    maxWaitMs % intervalMs !== 0
  ) {
    fail("Final verification disk-headroom settlement input is invalid");
  }
  const read = () =>
    Math.min(...paths.map((path) => readFreeBytes(path)));
  const initialAvailableBytes = read();
  let availableBytes = initialAvailableBytes;
  let waitedMs = 0;
  while (
    availableBytes < FINAL_VERIFICATION_MINIMUM_FREE_BYTES &&
    waitedMs < maxWaitMs
  ) {
    wait(intervalMs);
    waitedMs += intervalMs;
    availableBytes = read();
  }
  return Object.freeze({
    initialAvailableBytes,
    availableBytes,
    waitedMs,
    settled: availableBytes >= FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
    minimumRequiredBytes: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  });
}

export function assertExactLocalBrowserEvidence(outputDirectory) {
  const browserRoot = resolve(outputDirectory, "browser-proof");
  const artifactRoot = join(browserRoot, "artifacts");
  const results = parseRequiredJson(
    join(browserRoot, "playwright-results.json"),
    "Playwright JSON results",
  );
  const reporter = parseRequiredJson(
    join(browserRoot, "safe-browser-acceptance-summary.json"),
    "Safe-browser reporter summary",
  );
  const safety = parseRequiredJson(
    join(browserRoot, "safety-preflight.json"),
    "Safe-browser safety preflight",
  );
  const lastRun = parseRequiredJson(
    join(artifactRoot, ".last-run.json"),
    "Playwright last-run record",
  );
  readRequiredRegularFile(
    join(browserRoot, "playwright-results.xml"),
    "Playwright JUnit results",
  );
  readRequiredRegularFile(
    join(browserRoot, "report", "index.html"),
    "Playwright HTML report",
  );

  if (
    results?.stats?.expected !== FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT ||
    results?.stats?.skipped !==
      FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.length *
        FINAL_VERIFICATION_LOCAL_BROWSER_SKIPPED_PER_PROJECT ||
    results?.stats?.unexpected !== 0 ||
    results?.stats?.flaky !== 0 ||
    !Array.isArray(results?.errors) ||
    results.errors.length !== 0 ||
    lastRun?.status !== "passed" ||
    !Array.isArray(lastRun?.failedTests) ||
    lastRun.failedTests.length !== 0
  ) {
    fail("Local browser result portfolio is not the exact passing matrix");
  }

  if (
    reporter?.schemaVersion !== "dealflow.safe-browser-acceptance.v1" ||
    reporter.executionMode !== "local_public" ||
    reporter.playwrightStatus !== "passed" ||
    reporter.authenticatedStatus !== "authenticated_deferred" ||
    reporter.authenticatedResultCount !== 16 ||
    reporter.authenticatedSkippedCount !== 16 ||
    JSON.stringify(reporter.authenticatedProjectCounts) !==
      JSON.stringify(
        Object.fromEntries(
          FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => [project, 4]),
        ),
      ) ||
    !Array.isArray(reporter.authenticatedResults) ||
    reporter.authenticatedResults.length !== 16 ||
    reporter.authenticatedResults.some(
      (record) =>
        !FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.includes(record?.projectName) ||
        record?.status !== "skipped" ||
        record?.retry !== 0,
    )
  ) {
    fail("Local browser reporter portfolio is not the exact deferred-auth matrix");
  }

  if (
    safety?.schemaVersion !== "dealflow.safe-browser-preflight.v1" ||
    safety.mode !== "local_public" ||
    safety.zeroExternalEffects?.ok !== true ||
    safety.zeroExternalEffects?.attestation !==
      "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1" ||
    !Number.isSafeInteger(safety.zeroExternalEffects?.checkedControlCount) ||
    safety.zeroExternalEffects.checkedControlCount <= 0 ||
    !Array.isArray(safety.zeroExternalEffects?.failedControls) ||
    safety.zeroExternalEffects.failedControls.length !== 0 ||
    safety.authenticatedStatus !== "authenticated_deferred" ||
    safety.publicTestsAuthorized !== true ||
    safety.authenticatedTestsAuthorized !== false
  ) {
    fail("Local browser safety preflight is not exact");
  }

  const records = flattenPlaywrightResults(results.suites);
  const expectedResultCount =
    FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.length *
    (FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT +
      FINAL_VERIFICATION_LOCAL_BROWSER_SKIPPED_PER_PROJECT);
  if (records.length !== expectedResultCount) {
    fail("Local browser proof has an inexact result count");
  }

  const projectResultCounts = Object.fromEntries(
    FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => [
      project,
      { passed: 0, skipped: 0 },
    ]),
  );
  const referencedScreenshots = new Set();
  for (const { spec, test, result } of records) {
    const project = test.projectName;
    if (
      !FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.includes(project) ||
      test.projectId !== project ||
      test.status !== (test.expectedStatus === "skipped" ? "skipped" : "expected") ||
      result.retry !== 0 ||
      !Array.isArray(result.errors) ||
      result.errors.length !== 0 ||
      spec?.ok !== true
    ) {
      fail("Local browser test result is not exact");
    }
    const expectedStatus = test.expectedStatus;
    if (
      !["passed", "skipped"].includes(expectedStatus) ||
      result.status !== expectedStatus
    ) {
      fail("Local browser test result status is not exact");
    }
    projectResultCounts[project][expectedStatus] += 1;
    const attachments = result.attachments ?? [];
    if (expectedStatus === "skipped") {
      if (attachments.length !== 0) {
        fail("Skipped local browser tests must not claim screenshot evidence");
      }
      continue;
    }
    if (
      attachments.length !== 1 ||
      attachments[0]?.name !== "screenshot" ||
      attachments[0]?.contentType !== "image/png" ||
      typeof attachments[0]?.path !== "string"
    ) {
      fail("Every passing local browser test must retain one PNG screenshot");
    }
    const screenshotPath = assertInsideRealDirectory(
      attachments[0].path,
      artifactRoot,
      "Local browser screenshot",
    );
    const screenshot = readRequiredRegularFile(
      screenshotPath,
      "Local browser screenshot",
    );
    if (
      screenshot.byteLength <= PNG_SIGNATURE.byteLength ||
      !screenshot.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE) ||
      referencedScreenshots.has(screenshotPath)
    ) {
      fail("Local browser screenshot is not a unique nonempty PNG");
    }
    referencedScreenshots.add(screenshotPath);
  }

  const projectScreenshotCounts = Object.fromEntries(
    FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => {
      const counts = projectResultCounts[project];
      if (
        counts.passed !== FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT ||
        counts.skipped !== FINAL_VERIFICATION_LOCAL_BROWSER_SKIPPED_PER_PROJECT
      ) {
        fail("Local browser proof is incomplete for one or more projects");
      }
      return [project, counts.passed];
    }),
  );

  const artifactFiles = collectTreeFiles(artifactRoot);
  const actualScreenshots = artifactFiles
    .filter((path) => path.endsWith(".png"))
    .map((path) => realpathSync(path));
  const nonScreenshotArtifacts = artifactFiles
    .filter((path) => !path.endsWith(".png"))
    .map((path) => relative(artifactRoot, path));
  if (
    referencedScreenshots.size !== FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT ||
    actualScreenshots.length !== FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT ||
    new Set(actualScreenshots).size !== FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT ||
    actualScreenshots.some((path) => !referencedScreenshots.has(path)) ||
    JSON.stringify(nonScreenshotArtifacts) !== JSON.stringify([".last-run.json"])
  ) {
    fail("Local browser screenshot portfolio is not the exact 40-file set");
  }

  return Object.freeze({
    status: "EXACT_40_NONEMPTY_SCREENSHOTS",
    screenshotCount: FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT,
    projectScreenshotCounts: Object.freeze(projectScreenshotCounts),
  });
}

export function assertFinalVerificationEvidenceIsSealable(outputDirectory) {
  const exactOutput = realpathSync(resolve(outputDirectory));
  const files = collectTreeFiles(exactOutput);
  const summaryPath = join(exactOutput, "verification-summary.json");
  const preSummaryFiles = files.filter((path) => path !== summaryPath);
  if (preSummaryFiles.length === 0) {
    fail("Verification evidence contains no pre-summary sealable files");
  }
  const browser = assertExactLocalBrowserEvidence(exactOutput);
  return Object.freeze({
    status: "PASS",
    fileCountBeforeSummary: preSummaryFiles.length,
    totalFileCount: files.length,
    evidenceTreeSha256BeforeSummary: evidenceTreeDigest(
      exactOutput,
      preSummaryFiles,
    ),
    browser,
  });
}
