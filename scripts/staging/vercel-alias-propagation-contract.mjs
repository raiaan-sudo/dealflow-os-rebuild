import { performance } from "node:perf_hooks";

export const EXACT_ALIAS_PROPAGATION_TIMEOUT_MS = 180_000;
export const EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS = 2_000;
export const EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS = 15_000;

const EXACT_OBSERVATION_KEYS = Object.freeze([
  "disposition",
  "locationPresent",
  "redirected",
  "responseUrlExact",
  "status",
]);

export function classifyExactAliasPropagationObservation(observation) {
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation) ||
    JSON.stringify(Object.keys(observation).sort()) !==
      JSON.stringify(EXACT_OBSERVATION_KEYS) ||
    observation.redirected !== false ||
    observation.locationPresent !== false ||
    observation.responseUrlExact !== true ||
    observation.status !== 404
  ) {
    throw new Error(
      "Alias propagation observed a response outside the exact closed staging surface",
    );
  }

  if (observation.disposition === "VERCEL_DEPLOYMENT_NOT_FOUND") {
    return "WAIT_FOR_VERCEL_EDGE";
  }
  if (observation.disposition === "DEALFLOW_APPLICATION_GATE") {
    return "READY_EXACT_DEALFLOW_GATE";
  }
  throw new Error(
    "Alias propagation observed an unrecognized exact-URL staging response",
  );
}

export class ExactAliasPropagationTimeoutError extends Error {
  constructor({ elapsedMs, observations }) {
    super("Exact staging alias edge propagation timed out");
    this.name = "ExactAliasPropagationTimeoutError";
    this.elapsedMs = elapsedMs;
    this.safeObservations = Object.freeze([...observations]);
  }
}

export class ExactAliasPropagationHardFailureError extends Error {
  constructor({ phase, cause, elapsedMs, observations, terminalObservation = null }) {
    super(cause instanceof Error ? cause.message : "Exact staging alias propagation failed hard", {
      cause,
    });
    this.name = "ExactAliasPropagationHardFailureError";
    this.phase = phase;
    this.elapsedMs = elapsedMs;
    this.safeObservations = Object.freeze([...observations]);
    this.safeTerminalObservation = terminalObservation
      ? Object.freeze({ ...terminalObservation })
      : null;
  }
}

function safeTerminalObservation(observation) {
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation) ||
    JSON.stringify(Object.keys(observation).sort()) !==
      JSON.stringify(EXACT_OBSERVATION_KEYS) ||
    !Number.isSafeInteger(observation.status) ||
    observation.status < 100 ||
    observation.status > 599 ||
    typeof observation.redirected !== "boolean" ||
    typeof observation.locationPresent !== "boolean" ||
    typeof observation.responseUrlExact !== "boolean" ||
    ![
      "VERCEL_DEPLOYMENT_NOT_FOUND",
      "DEALFLOW_APPLICATION_GATE",
      "AUTHORIZED_HTTP_200",
      "UNRECOGNIZED",
    ].includes(observation.disposition)
  ) {
    return null;
  }
  return {
    status: observation.status,
    redirected: observation.redirected,
    locationPresent: observation.locationPresent,
    responseUrlExact: observation.responseUrlExact,
    disposition: observation.disposition,
  };
}

function timeoutError(startedAt, now, observations) {
  return new ExactAliasPropagationTimeoutError({
    elapsedMs: Math.max(0, Math.floor(now() - startedAt)),
    observations,
  });
}

function hardFailureError({
  phase,
  cause,
  startedAt,
  now,
  observations,
  terminalObservation = null,
}) {
  return new ExactAliasPropagationHardFailureError({
    phase,
    cause,
    elapsedMs: Math.max(0, Math.floor(now() - startedAt)),
    observations,
    terminalObservation: safeTerminalObservation(terminalObservation),
  });
}

export async function waitForExactAliasPropagation({
  probe,
  verifyMapping,
  delay,
  timeoutMs = EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
  pollIntervalMs = EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
  requestTimeoutMaximumMs = EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  now = () => performance.now(),
}) {
  if (
    typeof probe !== "function" ||
    typeof verifyMapping !== "function" ||
    typeof delay !== "function" ||
    typeof now !== "function" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > EXACT_ALIAS_PROPAGATION_TIMEOUT_MS ||
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 1 ||
    pollIntervalMs > timeoutMs ||
    !Number.isSafeInteger(requestTimeoutMaximumMs) ||
    requestTimeoutMaximumMs < 1 ||
    requestTimeoutMaximumMs > EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS
  ) {
    throw new Error("Alias propagation polling configuration is outside the bounded contract");
  }

  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const observations = [];

  while (now() < deadline) {
    const requestTimeoutMs = Math.min(
      requestTimeoutMaximumMs,
      Math.max(1, Math.floor(deadline - now())),
    );
    let observation;
    try {
      observation = await probe({ timeoutMs: requestTimeoutMs });
    } catch (cause) {
      throw hardFailureError({
        phase: "PROBE",
        cause,
        startedAt,
        now,
        observations,
      });
    }
    let classification;
    try {
      classification = classifyExactAliasPropagationObservation(observation);
    } catch (cause) {
      throw hardFailureError({
        phase: "CLASSIFICATION",
        cause,
        startedAt,
        now,
        observations,
        terminalObservation: observation,
      });
    }
    observations.push(Object.freeze({
      attempt: observations.length + 1,
      elapsedMs: Math.max(0, Math.floor(now() - startedAt)),
      status: observation.status,
      disposition: observation.disposition,
      classification,
    }));

    if (now() >= deadline) {
      throw timeoutError(startedAt, now, observations);
    }

    if (classification === "READY_EXACT_DEALFLOW_GATE") {
      let mappingProof;
      try {
        mappingProof = await verifyMapping({
          timeoutMs: Math.max(1, Math.floor(deadline - now())),
        });
      } catch (cause) {
        if (now() >= deadline) {
          throw timeoutError(startedAt, now, observations);
        }
        throw hardFailureError({
          phase: "MAPPING_VERIFICATION",
          cause,
          startedAt,
          now,
          observations,
        });
      }
      if (now() >= deadline) {
        throw timeoutError(startedAt, now, observations);
      }
      return Object.freeze({
        elapsedMs: Math.max(0, Math.floor(now() - startedAt)),
        observations: Object.freeze([...observations]),
        mappingProof,
      });
    }

    const remainingMs = Math.floor(deadline - now());
    if (remainingMs <= 0) break;
    try {
      await delay(Math.min(pollIntervalMs, remainingMs));
    } catch (cause) {
      throw hardFailureError({
        phase: "DELAY",
        cause,
        startedAt,
        now,
        observations,
      });
    }
  }

  throw timeoutError(startedAt, now, observations);
}

export function summarizeExactAliasPropagationFailure(error) {
  const isTimeout = error instanceof ExactAliasPropagationTimeoutError;
  const isHardFailure = error instanceof ExactAliasPropagationHardFailureError;
  const typedFailure = isTimeout || isHardFailure;
  const observations = typedFailure ? error.safeObservations : [];
  const terminalObservation = isHardFailure
    ? error.safeTerminalObservation
    : null;
  const completedResponseCount =
    observations.length + (terminalObservation ? 1 : 0);
  const requestAttemptCount = typedFailure
    ? observations.length + (
      isHardFailure && ["PROBE", "CLASSIFICATION"].includes(error.phase) ? 1 : 0
    )
    : null;
  const publicWindowObserved =
    terminalObservation?.status >= 200 && terminalObservation.status < 300
      ? true
      : isTimeout || terminalObservation
        ? false
        : null;
  return Object.freeze({
    failurePhase: isHardFailure
      ? error.phase
      : isTimeout
        ? "DEADLINE"
        : "UNCLASSIFIED",
    requestAttemptCount,
    completedResponseCount: typedFailure ? completedResponseCount : null,
    elapsedMs: typedFailure ? error.elapsedMs : null,
    observations,
    terminalObservation,
    redirectsFollowed: terminalObservation
      ? terminalObservation.redirected
      : isTimeout
        ? false
        : null,
    responseUrlExact: terminalObservation
      ? terminalObservation.responseUrlExact
      : isTimeout
        ? true
        : null,
    publicWindowObserved,
    publicWindowProofStatus: publicWindowObserved === true
      ? "OBSERVED_UNAUTHENTICATED_HTTP_2XX"
      : publicWindowObserved === false
        ? "NOT_OBSERVED_IN_RETAINED_RESPONSES"
        : "NOT_PROVEN",
  });
}

export async function proveSequentialExactApplicationGate({
  label,
  request,
  getSecret,
  headerName,
  cookieName,
}) {
  if (
    typeof label !== "string" ||
    label.length === 0 ||
    typeof request !== "function" ||
    typeof getSecret !== "function" ||
    typeof headerName !== "string" ||
    headerName.length === 0 ||
    typeof cookieName !== "string" ||
    cookieName.length === 0
  ) {
    throw new Error("Sequential application-gate proof configuration is invalid");
  }

  const noGate = await request({});
  if (
    noGate.status !== 404 ||
    noGate.disposition !== "DEALFLOW_APPLICATION_GATE"
  ) {
    throw new Error(`${label} did not retain the exact closed unauthenticated application gate`);
  }

  const secret = getSecret();
  const headerGate = await request({ [headerName]: secret });
  if (
    headerGate.status !== 200 ||
    headerGate.disposition !== "AUTHORIZED_HTTP_200"
  ) {
    throw new Error(`${label} did not authorize the exact header-gated application surface`);
  }

  const cookieGate = await request({ Cookie: `${cookieName}=${secret}` });
  if (
    cookieGate.status !== 200 ||
    cookieGate.disposition !== "AUTHORIZED_HTTP_200"
  ) {
    throw new Error(`${label} did not prove the exact closed application gate`);
  }
  return Object.freeze({ noGate, headerGate, cookieGate });
}
