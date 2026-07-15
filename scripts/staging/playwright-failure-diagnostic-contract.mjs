import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const PLAYWRIGHT_FAILURE_DIAGNOSTIC_SCHEMA =
  "dealflow.playwright-failure-diagnostic.v1";

const MAX_REPORTER_BYTES = 32 * 1024 * 1024;
const MAX_TEST_RECORDS = 256;
const MAX_TITLE_CHARS = 320;
const MAX_DIAGNOSTIC_RECORDS = 32;
const MAX_DIAGNOSTIC_CHARS = 1_000;
const MAX_DIAGNOSTIC_SOURCE_RECORDS = 128;
const MAX_DIAGNOSTIC_SOURCE_CHARS = 16_384;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink
  );
}

function confinedReporterPath(reporterRoot, path) {
  if (typeof path !== "string" || path.length === 0) {
    return Object.freeze({ status: "MISSING", exactPath: null });
  }
  if (
    typeof reporterRoot !== "string" ||
    !isAbsolute(reporterRoot) ||
    resolve(reporterRoot) !== reporterRoot
  ) {
    return Object.freeze({ status: "REJECTED_UNSAFE_ROOT", exactPath: null });
  }
  const exactRoot = resolve(reporterRoot);
  const exactPath = resolve(path);
  const pathFromRoot = relative(exactRoot, exactPath);
  if (
    !pathFromRoot ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    resolve(exactRoot, pathFromRoot) !== exactPath
  ) {
    return Object.freeze({ status: "REJECTED_OUTSIDE_ROOT", exactPath: null });
  }
  let rootIdentity = null;
  if (existsSync(exactRoot)) {
    const rootStat = lstatSync(exactRoot);
    if (
      !rootStat.isDirectory() ||
      rootStat.isSymbolicLink() ||
      realpathSync(exactRoot) !== exactRoot
    ) {
      return Object.freeze({ status: "REJECTED_UNSAFE_ROOT", exactPath: null });
    }
    rootIdentity = rootStat;
  }
  if (existsSync(exactPath) && realpathSync(exactPath) !== exactPath) {
    return Object.freeze({ status: "REJECTED_UNSAFE_PATH", exactPath: null });
  }
  return Object.freeze({ status: "PASS", exactPath, exactRoot, rootIdentity });
}

function readBoundedReporter(reporterRoot, path) {
  const confinement = confinedReporterPath(reporterRoot, path);
  if (confinement.status !== "PASS") {
    return Object.freeze({
      status: confinement.status,
      bytes: 0,
      sha256: null,
    });
  }
  const exactPath = confinement.exactPath;
  let before;
  try {
    before = lstatSync(exactPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Object.freeze({ status: "MISSING", bytes: 0, sha256: null });
    }
    return Object.freeze({ status: "UNREADABLE", bytes: 0, sha256: null });
  }
  if (!before.isFile() || before.isSymbolicLink()) {
    return Object.freeze({
      status: "REJECTED_UNSAFE_TYPE",
      bytes: Number(before.size),
      sha256: null,
    });
  }
  if (before.nlink !== 1) {
    return Object.freeze({
      status: "REJECTED_HARDLINK",
      bytes: Number(before.size),
      sha256: null,
    });
  }
  if (!Number.isSafeInteger(before.size) || before.size < 0) {
    return Object.freeze({ status: "REJECTED_INVALID_SIZE", bytes: 0, sha256: null });
  }
  if (before.size > MAX_REPORTER_BYTES) {
    return Object.freeze({
      status: "REJECTED_OVERSIZE",
      bytes: before.size,
      sha256: null,
    });
  }
  let descriptor = null;
  try {
    descriptor = openSync(
      exactPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !sameFileIdentity(before, opened)
    ) {
      return Object.freeze({
        status: "REJECTED_CHANGED_DURING_READ",
        bytes: before.size,
        sha256: null,
      });
    }
    const contents = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < before.size) {
      const bytesRead = readSync(
        descriptor,
        contents,
        offset,
        before.size - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const growthProbe = Buffer.allocUnsafe(1);
    const growthBytes = readSync(
      descriptor,
      growthProbe,
      0,
      1,
      before.size,
    );
    const after = fstatSync(descriptor);
    const finalPathState = lstatSync(exactPath);
    const finalRootState = lstatSync(confinement.exactRoot);
    if (
      !sameFileIdentity(opened, after) ||
      !sameFileIdentity(after, finalPathState) ||
      !confinement.rootIdentity ||
      !sameFileIdentity(confinement.rootIdentity, finalRootState) ||
      !finalRootState.isDirectory() ||
      finalRootState.isSymbolicLink() ||
      realpathSync(confinement.exactRoot) !== confinement.exactRoot ||
      realpathSync(exactPath) !== exactPath ||
      offset !== before.size ||
      growthBytes !== 0
    ) {
      return Object.freeze({
        status: "REJECTED_CHANGED_DURING_READ",
        bytes: before.size,
        sha256: null,
      });
    }
    return Object.freeze({
      status: "READ",
      bytes: contents.length,
      sha256: sha256(contents),
      contents,
    });
  } catch {
    return Object.freeze({ status: "UNREADABLE", bytes: before.size, sha256: null });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function sanitizeText(value, secrets) {
  let output = String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  for (const secret of secrets
    .filter((secret) => typeof secret === "string" && secret.length > 0)
    .sort((left, right) => right.length - left.length)) {
    output = output.split(secret).join("[REDACTED_SECRET]");
  }
  return output
    .replace(
      /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'()<>]+/gi,
      "[REDACTED_URI]",
    )
    .replace(/\b[A-Z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]*/gi, "[REDACTED_PATH]")
    .replace(/\\\\[A-Za-z0-9._-]+\\[^\s"'<>|]*/g, "[REDACTED_PATH]")
    .replace(
      /(^|[^A-Za-z0-9_.-])(?:[A-Za-z0-9_.-]+\\)+[A-Za-z0-9_.-]+/g,
      "$1[REDACTED_PATH]",
    )
    .replace(
      /(^|[^A-Za-z0-9])\/(?:[^\s"'()<>]|\((?![^)]*\)))+/g,
      "$1[REDACTED_PATH]",
    )
    .replace(
      /(?:[A-Za-z0-9_.-]+\/)+(?:[A-Za-z0-9_.-]+\.(?:[cm]?[jt]sx?|json|html|xml))(?:[:#]\d+(?::\d+)?)?/g,
      "[REDACTED_PATH]",
    )
    .replace(
      /(^|[^A-Za-z0-9_.-])(?:\.\.?\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+/g,
      "$1[REDACTED_PATH]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[REDACTED_HOST]")
    .replace(/\[[0-9a-f:]+\](?::\d+)?/gi, "[REDACTED_HOST]")
    .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, "[REDACTED_HOST]")
    .replace(
      /\b(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z_](?:[a-z_-]{0,61}[a-z_])?(?::\d{1,5})?\b(?![A-Za-z0-9_.-])/gi,
      "[REDACTED_HOST]",
    )
    .replace(/\b(?:localhost|[a-z_][a-z0-9_-]{1,62}):\d{2,5}\b/gi, "[REDACTED_HOST]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_PROVIDER_KEY]")
    .replace(/\bbase64-[A-Za-z0-9_-]{24,}\b/g, "[REDACTED_AUTH_COOKIE]")
    .replace(/\r/g, "")
    .trim();
}

function boundedText(value, secrets, limit = MAX_DIAGNOSTIC_CHARS) {
  const sanitized = sanitizeText(value, secrets);
  return Object.freeze({
    text: sanitized.slice(0, limit),
    truncated: sanitized.length > limit,
  });
}

function normalizeProjectName(value, secrets) {
  const missing = typeof value !== "string" || value.trim().length === 0;
  const raw = missing ? "__missing_project__" : value.trim();
  const normalized = boundedText(raw, secrets, 96);
  return Object.freeze({
    projectName: normalized.text || "__missing_project__",
    truncated: normalized.truncated,
    sanitizationApplied:
      missing || normalized.truncated || normalized.text !== raw,
  });
}

function normalizeTitle(value, secrets) {
  const missing = typeof value !== "string" || value.trim().length === 0;
  const raw = missing ? "__missing_test_title__" : value.trim();
  const normalized = boundedText(raw, secrets, MAX_TITLE_CHARS);
  return Object.freeze({
    title: normalized.text || "__missing_test_title__",
    truncated: normalized.truncated,
    sanitizationApplied:
      missing || normalized.truncated || normalized.text !== raw,
  });
}

function normalizeOutcome(testCase) {
  const results = Array.isArray(testCase?.results) ? testCase.results : [];
  const lastStatus = results.at(-1)?.status;
  if (lastStatus === "passed") return "passed";
  if (lastStatus === "skipped" || (results.length === 0 && testCase?.expectedStatus === "skipped")) {
    return "skipped";
  }
  if (lastStatus === "interrupted") return "interrupted";
  if (lastStatus === "timedOut") return "timedOut";
  return "failed";
}

function countTestPortfolio(testRecords) {
  const counts = {
    tests: testRecords.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    timedOut: 0,
    projectCounts: {},
  };
  for (const record of testRecords) {
    counts.projectCounts[record.projectName] =
      (counts.projectCounts[record.projectName] ?? 0) + 1;
    if (record.outcome === "passed") counts.passed += 1;
    else if (record.outcome === "skipped") counts.skipped += 1;
    else if (record.outcome === "interrupted") counts.interrupted += 1;
    else if (record.outcome === "timedOut") counts.timedOut += 1;
    else counts.failed += 1;
  }
  counts.projectCounts = Object.fromEntries(
    Object.entries(counts.projectCounts).sort(([left], [right]) =>
      left.localeCompare(right)),
  );
  return counts;
}

function pushDiagnostic(target, context, value) {
  const candidates = [];
  if (typeof value === "string" && value.trim()) {
    candidates.push(`${context}: ${value}`);
  }
  if (value && typeof value === "object") {
    for (const key of ["message", "stack", "snippet", "text", "value"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        candidates.push(`${context}: ${value[key]}`);
      }
    }
  }
  for (const candidate of candidates) {
    target.observedDiagnosticCount =
      (target.observedDiagnosticCount ?? target.length) + 1;
    if (target.length < MAX_DIAGNOSTIC_SOURCE_RECORDS) target.push(candidate);
    else target.sourceRecordsTruncated = true;
  }
}

function parseJsonReporter(reporter, secrets) {
  const base = {
    status: reporter.status === "READ" ? "MALFORMED" : reporter.status,
    bytes: reporter.bytes,
    sha256: reporter.sha256,
    counts: null,
    testTitleCount: 0,
    testTitles: [],
    exactTestTitlePortfolioRetained: false,
    titleTruncationApplied: false,
  };
  if (reporter.status !== "READ") return Object.freeze({ summary: base, diagnostics: [] });
  let parsed;
  try {
    parsed = JSON.parse(reporter.contents.toString("utf8"));
  } catch {
    return Object.freeze({ summary: base, diagnostics: [] });
  }
  const records = [];
  const rawDiagnostics = [];
  let testPortfolioOversize = false;
  for (const error of Array.isArray(parsed?.errors) ? parsed.errors : []) {
    pushDiagnostic(rawDiagnostics, "global reporter error", error);
  }

  function visitSuite(suite, parents = []) {
    if (!suite || typeof suite !== "object" || testPortfolioOversize) return;
    const suiteTitle = typeof suite.title === "string" ? suite.title.trim() : "";
    const isFileTitle = /\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(suiteTitle);
    const nextParents = suiteTitle && !isFileTitle ? [...parents, suiteTitle] : parents;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      const rawTitle = [...nextParents, spec?.title].filter(Boolean).join(" › ");
      for (const testCase of Array.isArray(spec?.tests) ? spec.tests : []) {
        if (records.length >= MAX_TEST_RECORDS) {
          testPortfolioOversize = true;
          return;
        }
        const title = normalizeTitle(rawTitle, secrets);
        const project = normalizeProjectName(testCase?.projectName, secrets);
        const projectName = project.projectName;
        const outcome = normalizeOutcome(testCase);
        records.push({
          projectName,
          title: title.title,
          expectedStatus: ["passed", "failed", "skipped"].includes(testCase?.expectedStatus)
            ? testCase.expectedStatus
            : "unknown",
          outcome,
          titleTruncated: title.truncated,
          identitySanitizationApplied:
            title.sanitizationApplied || project.sanitizationApplied,
        });
        if (outcome !== "passed") {
          for (const result of Array.isArray(testCase?.results) ? testCase.results : []) {
            for (const error of Array.isArray(result?.errors) ? result.errors : []) {
              pushDiagnostic(rawDiagnostics, `${projectName} ${title.title}`, error);
            }
            pushDiagnostic(rawDiagnostics, `${projectName} ${title.title}`, result?.error);
            for (const stream of [result?.stderr, result?.stdout]) {
              for (const entry of Array.isArray(stream) ? stream : []) {
                pushDiagnostic(rawDiagnostics, `${projectName} ${title.title}`, entry);
              }
            }
          }
        }
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
      visitSuite(child, nextParents);
      if (testPortfolioOversize) return;
    }
  }
  for (const suite of Array.isArray(parsed?.suites) ? parsed.suites : []) visitSuite(suite);
  if (testPortfolioOversize) {
    return Object.freeze({
      summary: {
        ...base,
        status: "REJECTED_TEST_PORTFOLIO_OVERSIZE",
        counts: null,
        testTitleCount: null,
        observedTestCountLowerBound: MAX_TEST_RECORDS + 1,
      },
      diagnostics: rawDiagnostics,
    });
  }
  if (records.length === 0) {
    return Object.freeze({ summary: base, diagnostics: rawDiagnostics });
  }
  const testTitles = records.map(({
    titleTruncated: _ignoredTitleTruncated,
    identitySanitizationApplied: _ignoredSanitization,
    ...record
  }) => record);
  const titleTruncationApplied = records.some((record) => record.titleTruncated);
  const identitySanitizationApplied = records.some(
    (record) => record.identitySanitizationApplied,
  );
  return Object.freeze({
    summary: {
      ...base,
      status: "PARSED",
      counts: countTestPortfolio(records),
      testTitleCount: records.length,
      testTitles,
      exactTestTitlePortfolioRetained:
        !titleTruncationApplied && !identitySanitizationApplied,
      titleTruncationApplied,
      identitySanitizationApplied,
    },
    diagnostics: rawDiagnostics,
  });
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttributes(source) {
  const attributes = {};
  for (const match of String(source ?? "").matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function nonnegativeInteger(value) {
  return /^\d+$/.test(value ?? "") ? Number.parseInt(value, 10) : null;
}

function parseJunitReporter(reporter, secrets) {
  const base = {
    status: reporter.status === "READ" ? "MALFORMED" : reporter.status,
    bytes: reporter.bytes,
    sha256: reporter.sha256,
    declaredCounts: null,
    counts: null,
    declaredCountsAgree: false,
    testTitleCount: 0,
    testTitles: [],
    exactTestTitlePortfolioRetained: false,
    titleTruncationApplied: false,
  };
  if (reporter.status !== "READ") return Object.freeze({ summary: base, diagnostics: [] });
  const xml = reporter.contents.toString("utf8");
  const rootMatch = /<testsuites\b([^>]*)>/i.exec(xml);
  if (!rootMatch) return Object.freeze({ summary: base, diagnostics: [] });
  const rootAttributes = xmlAttributes(rootMatch[1]);
  const declaredCounts = {
    tests: nonnegativeInteger(rootAttributes.tests),
    failed: nonnegativeInteger(rootAttributes.failures),
    skipped: nonnegativeInteger(rootAttributes.skipped),
    errors: nonnegativeInteger(rootAttributes.errors),
  };
  const records = [];
  const rawDiagnostics = [];
  let testPortfolioOversize = false;
  for (const suiteMatch of xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gi)) {
    const suiteAttributes = xmlAttributes(suiteMatch[1]);
    const project = normalizeProjectName(suiteAttributes.hostname, secrets);
    const projectName = project.projectName;
    for (const caseMatch of suiteMatch[2].matchAll(
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi,
    )) {
      if (records.length >= MAX_TEST_RECORDS) {
        testPortfolioOversize = true;
        break;
      }
      const caseAttributes = xmlAttributes(caseMatch[1]);
      const title = normalizeTitle(caseAttributes.name, secrets);
      const body = caseMatch[2] ?? "";
      const outcome = /<(?:failure|error)\b/i.test(body)
        ? "failed"
        : /<skipped\b/i.test(body)
          ? "skipped"
          : "passed";
      records.push({
        projectName,
        title: title.title,
        outcome,
        titleTruncated: title.truncated,
        identitySanitizationApplied:
          title.sanitizationApplied || project.sanitizationApplied,
      });
      if (outcome === "failed") {
        for (const failure of body.matchAll(/<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/gi)) {
          pushDiagnostic(
            rawDiagnostics,
            `${projectName} ${title.title}`,
            decodeXml(failure[1]).replace(/<[^>]+>/g, " "),
          );
        }
      }
    }
    if (testPortfolioOversize) break;
  }
  if (testPortfolioOversize) {
    return Object.freeze({
      summary: {
        ...base,
        status: "REJECTED_TEST_PORTFOLIO_OVERSIZE",
        declaredCounts,
        observedTestCountLowerBound: MAX_TEST_RECORDS + 1,
      },
      diagnostics: rawDiagnostics,
    });
  }
  const counts = countTestPortfolio(records);
  const declaredCountsAgree =
    Object.values(declaredCounts).every(Number.isSafeInteger) &&
    declaredCounts.tests === counts.tests &&
    declaredCounts.failed + declaredCounts.errors === counts.failed &&
    declaredCounts.skipped === counts.skipped &&
    declaredCounts.tests ===
      counts.passed + counts.failed + counts.skipped + counts.interrupted + counts.timedOut;
  if (records.length === 0) {
    return Object.freeze({
      summary: {
        ...base,
        status: "MALFORMED",
        declaredCounts,
        counts,
        declaredCountsAgree,
        testTitleCount: records.length,
      },
      diagnostics: rawDiagnostics,
    });
  }
  const titleTruncationApplied = records.some((record) => record.titleTruncated);
  const identitySanitizationApplied = records.some(
    (record) => record.identitySanitizationApplied,
  );
  return Object.freeze({
    summary: {
      ...base,
      status: "PARSED",
      declaredCounts,
      counts,
      declaredCountsAgree,
      testTitleCount: records.length,
      testTitles: records.map(({
        titleTruncated: _ignoredTitleTruncated,
        identitySanitizationApplied: _ignoredSanitization,
        ...record
      }) => record),
      exactTestTitlePortfolioRetained:
        !titleTruncationApplied && !identitySanitizationApplied,
      titleTruncationApplied,
      identitySanitizationApplied,
    },
    diagnostics: rawDiagnostics,
  });
}

function summarizeOpaqueReporter(reporter) {
  return Object.freeze({
    status: reporter.status === "READ" ? "PRESENT_BOUND" : reporter.status,
    bytes: reporter.bytes,
    sha256: reporter.sha256,
    rawContentsRetained: false,
  });
}

function parseSafetyReporter(reporter) {
  const base = {
    status: reporter.status === "READ" ? "MALFORMED" : reporter.status,
    bytes: reporter.bytes,
    sha256: reporter.sha256,
    executionMode: null,
    playwrightStatus: null,
    authenticatedStatus: null,
    authenticatedResultCount: null,
    authenticatedSkippedCount: null,
  };
  if (reporter.status !== "READ") return base;
  try {
    const parsed = JSON.parse(reporter.contents.toString("utf8"));
    if (
      parsed?.schemaVersion !== "dealflow.safe-browser-acceptance.v1" ||
      !["hosted_authenticated", "local_public"].includes(parsed.executionMode) ||
      !["passed", "failed", "timedout", "interrupted"].includes(
        parsed.playwrightStatus,
      ) ||
      !["passed", "failed", "authenticated_deferred"].includes(
        parsed.authenticatedStatus,
      ) ||
      !Number.isSafeInteger(parsed.authenticatedResultCount) ||
      parsed.authenticatedResultCount < 0 ||
      !Number.isSafeInteger(parsed.authenticatedSkippedCount) ||
      parsed.authenticatedSkippedCount < 0
    ) {
      return base;
    }
    return Object.freeze({
      ...base,
      status: "PARSED",
      executionMode: parsed.executionMode,
      playwrightStatus: parsed.playwrightStatus,
      authenticatedStatus: parsed.authenticatedStatus,
      authenticatedResultCount: parsed.authenticatedResultCount,
      authenticatedSkippedCount: parsed.authenticatedSkippedCount,
    });
  } catch {
    return base;
  }
}

function canonicalTestPortfolio(records) {
  return records
    .map((record) => `${record.projectName}\u0000${record.title}\u0000${record.outcome}`)
    .sort();
}

function diagnosticPortfolio(diagnosticGroups, secrets) {
  const observed = [];
  let observedDiagnosticCount = 0;
  let sourceRecordsTruncated = false;
  for (const group of diagnosticGroups) {
    if (!Array.isArray(group)) continue;
    observedDiagnosticCount += group.observedDiagnosticCount ?? group.length;
    sourceRecordsTruncated ||= group.sourceRecordsTruncated === true;
    for (const value of group) {
      if (observed.length >= MAX_DIAGNOSTIC_SOURCE_RECORDS) {
        sourceRecordsTruncated = true;
        break;
      }
      if (typeof value === "string" && value.trim()) observed.push(value);
    }
  }
  const sanitized = [];
  let anyTextTruncated = sourceRecordsTruncated;
  for (const raw of observed) {
    const source = raw.slice(0, MAX_DIAGNOSTIC_SOURCE_CHARS);
    const bounded = boundedText(source, secrets);
    anyTextTruncated ||=
      raw.length > MAX_DIAGNOSTIC_SOURCE_CHARS || bounded.truncated;
    if (bounded.text && !sanitized.includes(bounded.text)) sanitized.push(bounded.text);
  }
  const retained = sanitized.slice(0, MAX_DIAGNOSTIC_RECORDS);
  return Object.freeze({
    observedDiagnosticCount,
    distinctSanitizedDiagnosticCount: sanitized.length,
    retainedDiagnosticCount: retained.length,
    diagnosticsTruncated:
      anyTextTruncated || sanitized.length > MAX_DIAGNOSTIC_RECORDS,
    maxDiagnosticRecords: MAX_DIAGNOSTIC_RECORDS,
    maxDiagnosticChars: MAX_DIAGNOSTIC_CHARS,
    maxSourceDiagnosticRecords: MAX_DIAGNOSTIC_SOURCE_RECORDS,
    maxSourceDiagnosticChars: MAX_DIAGNOSTIC_SOURCE_CHARS,
    diagnostics: retained,
  });
}

function diagnosticStringMaterial(record) {
  const strings = [];
  const seen = new WeakSet();
  const visit = (value) => {
    if (typeof value === "string") {
      strings.push(value);
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      strings.push(key);
      visit(nested);
    }
  };
  visit(record);
  return strings;
}

function assertNoForbiddenMaterial(record, secrets) {
  // Scan actual string material rather than JSON.stringify(record). JSON
  // escaping turns ordinary multiline text into `word\\nNext`, which can be
  // misclassified as a relative Windows path even though no backslash exists
  // in the retained diagnostic.
  const stringMaterial = diagnosticStringMaterial(record);
  for (const secret of secrets.filter(
    (value) => typeof value === "string" && value.length > 0,
  )) {
    if (stringMaterial.some((value) => value.includes(secret))) {
      throw new Error("Sanitized Playwright diagnostic retained an exact protected value");
    }
  }
  const forbiddenPatterns = [
    ["uri", /\b[a-z][a-z0-9+.-]{0,31}:\/\//i],
    ["posix_path", /(^|[^A-Za-z0-9])\/(?:[^\s"'()<>]|\((?![^)]*\)))+/i],
    [
      "relative_path",
      /(^|[^A-Za-z0-9_.-])(?:\.\.?\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+/i,
    ],
    ["windows_path", /\b[A-Z]:\\/i],
    ["unc_path", /\\\\[A-Za-z0-9._-]+\\/i],
    [
      "relative_windows_path",
      /(^|[^A-Za-z0-9_.-])(?:[A-Za-z0-9_.-]+\\)+[A-Za-z0-9_.-]+/i,
    ],
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["ipv6", /\[[0-9a-f:]+\](?::\d+)?/i],
    ["unbracketed_ipv6", /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/i],
    [
      "domain",
      /\b(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z_](?:[a-z_-]{0,61}[a-z_])?(?::\d{1,5})?\b(?![A-Za-z0-9_.-])/i,
    ],
    ["host_port", /\b(?:localhost|[a-z_][a-z0-9_-]{1,62}):\d{2,5}\b/i],
  ];
  const forbiddenClass = forbiddenPatterns.find(([, pattern]) =>
    stringMaterial.some((value) => pattern.test(value)))?.[0];
  if (forbiddenClass) {
    throw new Error(
      `Sanitized Playwright diagnostic retained forbidden ${forbiddenClass} material`,
    );
  }
}

export function buildPlaywrightFailureDiagnostic({
  suiteName,
  reporterProfile,
  executionStatus,
  reporterRoot,
  jsonReporterPath,
  junitReporterPath,
  htmlReporterPath,
  safetyReporterPath = null,
  commandDiagnostics = [],
  secrets = [],
}) {
  if (!Number.isInteger(executionStatus) || executionStatus === 0) {
    throw new Error("Playwright failure diagnostic requires an exact nonzero exit status");
  }
  if (!["staging", "safe"].includes(reporterProfile)) {
    throw new Error("Playwright failure diagnostic reporter profile is invalid");
  }
  const exactSecrets = [...new Set(secrets.filter(
    (value) => typeof value === "string" && value.length > 0,
  ))];
  const json = parseJsonReporter(
    readBoundedReporter(reporterRoot, jsonReporterPath),
    exactSecrets,
  );
  const junit = parseJunitReporter(
    readBoundedReporter(reporterRoot, junitReporterPath),
    exactSecrets,
  );
  const html = summarizeOpaqueReporter(
    readBoundedReporter(reporterRoot, htmlReporterPath),
  );
  const safety = reporterProfile === "safe"
    ? parseSafetyReporter(readBoundedReporter(reporterRoot, safetyReporterPath))
    : null;
  const jsonPortfolio = json.summary.status === "PARSED"
    ? canonicalTestPortfolio(json.summary.testTitles)
    : null;
  const junitPortfolio = junit.summary.status === "PARSED"
    ? canonicalTestPortfolio(junit.summary.testTitles)
    : null;
  const normalizedCrossReporterAgreement =
    jsonPortfolio && junitPortfolio
      ? JSON.stringify(jsonPortfolio) === JSON.stringify(junitPortfolio)
      : null;
  const exactCrossReporterAgreement =
    json.summary.exactTestTitlePortfolioRetained === true &&
    junit.summary.exactTestTitlePortfolioRetained === true
      ? normalizedCrossReporterAgreement
      : null;
  const diagnostics = diagnosticPortfolio(
    [
      json.diagnostics,
      junit.diagnostics,
      commandDiagnostics,
    ],
    exactSecrets,
  );
  const diagnostic = Object.freeze({
    schemaVersion: PLAYWRIGHT_FAILURE_DIAGNOSTIC_SCHEMA,
    status: "FAILED",
    failureRemainsAuthoritative: true,
    stagingAcceptancePassed: false,
    suiteName: normalizeTitle(suiteName, exactSecrets).title,
    reporterProfile,
    execution: {
      kind: "nonzero_exit",
      exitStatus: executionStatus,
    },
    reporters: {
      json: json.summary,
      junit: junit.summary,
      html,
      safety,
      jsonJunitExactPortfolioAgreement: exactCrossReporterAgreement,
      jsonJunitNormalizedPortfolioAgreement: normalizedCrossReporterAgreement,
    },
    diagnostics,
    bounds: {
      maxReporterBytes: MAX_REPORTER_BYTES,
      maxTestRecords: MAX_TEST_RECORDS,
      maxTitleChars: MAX_TITLE_CHARS,
      maxDiagnosticRecords: MAX_DIAGNOSTIC_RECORDS,
      maxDiagnosticChars: MAX_DIAGNOSTIC_CHARS,
    },
    rawReporterArtifactsMustBeDeleted: true,
    rawReporterContentsRetained: false,
    rawReporterPathsRetained: false,
    rawHostsRetained: false,
    protectedValuesRetained: false,
  });
  assertNoForbiddenMaterial(diagnostic, exactSecrets);
  return diagnostic;
}

export function buildMinimalPlaywrightFailureDiagnostic({
  suiteName,
  reporterProfile,
  failureKind,
  executionStatus = null,
  failureDescriptor = "",
  secrets = [],
}) {
  if (!["staging", "safe"].includes(reporterProfile)) {
    throw new Error("Minimal Playwright failure diagnostic reporter profile is invalid");
  }
  if (![
    "abnormal_command_termination",
    "diagnostic_construction_failed",
    "evidence_reset_fallback",
  ].includes(failureKind)) {
    throw new Error("Minimal Playwright failure diagnostic kind is invalid");
  }
  if (
    executionStatus !== null &&
    (!Number.isInteger(executionStatus) || executionStatus === 0)
  ) {
    throw new Error("Minimal Playwright failure diagnostic exit status is invalid");
  }
  const exactSecrets = [...new Set(secrets.filter(
    (value) => typeof value === "string" && value.length > 0,
  ))];
  const sanitizedDescriptor = sanitizeText(failureDescriptor, exactSecrets);
  const diagnostic = Object.freeze({
    schemaVersion: PLAYWRIGHT_FAILURE_DIAGNOSTIC_SCHEMA,
    status: "FAILED",
    failureRemainsAuthoritative: true,
    stagingAcceptancePassed: false,
    suiteName: normalizeTitle(suiteName, exactSecrets).title,
    reporterProfile,
    execution: {
      kind: failureKind,
      exitStatus: executionStatus,
    },
    diagnosticConstructionStatus: "FALLBACK_DIGEST_ONLY",
    sanitizedFailureDescriptorSha256: sha256(sanitizedDescriptor),
    reporters: {
      status: "NOT_RETAINED_IN_MINIMAL_FALLBACK",
      exactCountsRetained: false,
      exactTestTitlePortfolioRetained: false,
    },
    rawReporterArtifactsMustBeDeleted: true,
    rawReporterContentsRetained: false,
    rawReporterPathsRetained: false,
    rawHostsRetained: false,
    protectedValuesRetained: false,
  });
  assertNoForbiddenMaterial(diagnostic, exactSecrets);
  return diagnostic;
}
