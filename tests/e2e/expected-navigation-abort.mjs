import { createHash } from "node:crypto";

const EXACT_NAVIGATION_ABORTS = new Set([
  "net::ERR_ABORTED",
  "NS_BINDING_ABORTED",
  "cancelled",
  "Load cancelled",
  "Request cancelled",
  "Load request cancelled",
]);

/**
 * Playwright reports a replaced document navigation with engine-specific
 * error text. Only suppress the exact known Chromium, Firefox, and WebKit
 * cancellation strings. Callers must pass errorText only, never a URL or a
 * combined diagnostic record.
 */
export function isExpectedNavigationAbort(errorText) {
  const normalized = String(errorText ?? "").trim();
  return EXACT_NAVIGATION_ABORTS.has(normalized);
}

const TELEMETRY_REQUEST_CLASS = "locally_intercepted_activation_telemetry";
const PURPOSE_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * Reduce activation telemetry payloads to a non-reversible same-purpose key.
 * Metadata and raw identifiers never leave this function.
 */
export function sanitizedTelemetryPurposeFingerprint(postData) {
  let payload;
  try {
    payload = JSON.parse(String(postData ?? ""));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const eventName = typeof payload.eventName === "string" ? payload.eventName.trim() : "";
  const idempotencyKey =
    typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
  if (
    !/^[a-z0-9][a-z0-9_.:-]{2,127}$/.test(eventName) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,511}$/.test(idempotencyKey)
  ) {
    return null;
  }
  const canonicalPurpose =
    `${eventName.length}:${eventName}|${idempotencyKey.length}:${idempotencyKey}`;
  return `sha256:${createHash("sha256").update(canonicalPurpose).digest("hex")}`;
}

/**
 * Classify one canceled, locally intercepted telemetry POST after the test has
 * proved its final state. This helper is deliberately pure and fail-closed.
 */
export function classifyAbortedInterceptedTelemetry({
  candidate,
  completedMainFrameNavigationCount,
  finalPersistedState,
  successfulTelemetryRequests,
  userVisibleErrorCount,
}) {
  const purposeFingerprint = PURPOSE_FINGERPRINT_PATTERN.test(
    candidate?.purposeFingerprint ?? "",
  )
    ? candidate.purposeFingerprint
    : null;
  const successfulSamePurposeRequest = purposeFingerprint
    ? (successfulTelemetryRequests ?? []).find(
        (request) =>
          request?.telemetrySequence > candidate.telemetrySequence &&
          request?.purposeFingerprint === purposeFingerprint &&
          Number.isInteger(request?.status) &&
          request.status >= 200 &&
          request.status < 400,
      ) ?? null
    : null;
  const completedNavigation =
    Number.isInteger(completedMainFrameNavigationCount) &&
    completedMainFrameNavigationCount > candidate?.navigationSequenceAtStart;
  const supersededBy = successfulSamePurposeRequest
    ? "successful_same_purpose_request"
    : completedNavigation
      ? "completed_navigation"
      : null;
  const duplicateApplicationEffects = candidate?.interceptedBeforeNetwork === true
    ? 0
    : null;
  const exactCandidate =
    candidate?.requestClass === TELEMETRY_REQUEST_CLASS &&
    candidate?.method === "POST" &&
    candidate?.errorText === "net::ERR_ABORTED" &&
    candidate?.isNavigationRequest === false &&
    ["fetch", "xhr"].includes(candidate?.resourceType) &&
    Number.isInteger(candidate?.telemetrySequence) &&
    candidate.telemetrySequence > 0 &&
    Number.isInteger(candidate?.navigationSequenceAtStart) &&
    candidate.navigationSequenceAtStart >= 0;
  const harmless =
    exactCandidate &&
    Boolean(supersededBy) &&
    finalPersistedState === true &&
    userVisibleErrorCount === 0 &&
    duplicateApplicationEffects === 0;

  return Object.freeze({
    method: candidate?.method ?? "unknown",
    target: candidate?.target ?? "[unavailable]",
    resourceType: candidate?.resourceType ?? "unknown",
    initiatorPath: candidate?.initiatorPath ?? "[unavailable]",
    elapsedMs: Number.isInteger(candidate?.elapsedMs) ? candidate.elapsedMs : null,
    httpResult: null,
    purposeFingerprint,
    supersededBy,
    finalPersistedState: finalPersistedState === true,
    userVisibleOutcome: userVisibleErrorCount === 0 && finalPersistedState === true
      ? "complete"
      : "unproven",
    duplicateApplicationEffects,
    classification: harmless
      ? "harmless_locally_intercepted_telemetry"
      : "unproven",
  });
}
