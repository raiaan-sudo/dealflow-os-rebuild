import { performance } from "node:perf_hooks";

export const EXACT_ALIAS_PROPAGATION_TIMEOUT_MS = 180_000;
export const EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS = 2_000;
export const EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS = 15_000;

const EXACT_OBSERVATION_KEYS = Object.freeze([
  "disposition",
  "locationPresent",
  "protectionBypass",
  "protectionRedirect",
  "redirected",
  "responseUrlExact",
  "status",
]);

const EXACT_PROTECTION_REDIRECT_KEYS = Object.freeze([
  "locationOriginPath",
  "locationQueryShapeExact",
  "nonceFormatExact",
  "redirectFollowed",
  "returnUrlExact",
]);

const EXACT_PROTECTION_BYPASS_KEYS = Object.freeze([
  "disposition",
  "locationPresent",
  "redirected",
  "responseUrlExact",
  "status",
]);

const SAFE_DISPOSITIONS = Object.freeze([
  "VERCEL_DEPLOYMENT_NOT_FOUND",
  "DEALFLOW_APPLICATION_GATE",
  "AUTHORIZED_HTTP_200",
  "VERCEL_AUTOMATION_PROTECTION",
  "VERCEL_DEPLOYMENT_NOT_FOUND_BEHIND_VERCEL_AUTOMATION_PROTECTION",
  "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
  "UNRECOGNIZED",
]);

function hasExactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys)
  );
}

function isSafeBasicResponse(value) {
  return (
    hasExactKeys(value, EXACT_PROTECTION_BYPASS_KEYS) &&
    Number.isSafeInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599 &&
    typeof value.redirected === "boolean" &&
    typeof value.locationPresent === "boolean" &&
    typeof value.responseUrlExact === "boolean" &&
    SAFE_DISPOSITIONS.includes(value.disposition)
  );
}

function isExactProtectionRedirectProof(value) {
  return (
    hasExactKeys(value, EXACT_PROTECTION_REDIRECT_KEYS) &&
    value.locationOriginPath === "https://vercel.com/sso-api" &&
    value.locationQueryShapeExact === true &&
    value.nonceFormatExact === true &&
    value.redirectFollowed === false &&
    value.returnUrlExact === true
  );
}

function isExactProtectedApplicationGate(observation) {
  return (
    observation.status === 302 &&
    observation.redirected === false &&
    observation.locationPresent === true &&
    observation.responseUrlExact === true &&
    observation.disposition ===
      "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION" &&
    isExactProtectionRedirectProof(observation.protectionRedirect) &&
    isSafeBasicResponse(observation.protectionBypass) &&
    observation.protectionBypass.status === 404 &&
    observation.protectionBypass.redirected === false &&
    observation.protectionBypass.locationPresent === false &&
    observation.protectionBypass.responseUrlExact === true &&
    observation.protectionBypass.disposition === "DEALFLOW_APPLICATION_GATE"
  );
}

function isExactProtectedDeploymentNotFound(observation) {
  return (
    observation.status === 302 &&
    observation.redirected === false &&
    observation.locationPresent === true &&
    observation.responseUrlExact === true &&
    observation.disposition ===
      "VERCEL_DEPLOYMENT_NOT_FOUND_BEHIND_VERCEL_AUTOMATION_PROTECTION" &&
    isExactProtectionRedirectProof(observation.protectionRedirect) &&
    isSafeBasicResponse(observation.protectionBypass) &&
    observation.protectionBypass.status === 404 &&
    observation.protectionBypass.redirected === false &&
    observation.protectionBypass.locationPresent === false &&
    observation.protectionBypass.responseUrlExact === true &&
    observation.protectionBypass.disposition === "VERCEL_DEPLOYMENT_NOT_FOUND"
  );
}

export function classifyExactVercelAutomationProtectionRedirect({
  endpointUrl,
  responseUrl,
  status,
  redirected,
  rawLocation,
}) {
  let endpoint;
  let location;
  try {
    endpoint = new URL(endpointUrl);
    location = typeof rawLocation === "string" && rawLocation.length > 0
      ? new URL(rawLocation, endpoint)
      : null;
  } catch {
    throw new Error("Vercel automation protection redirect was not exact");
  }
  const entries = location ? [...location.searchParams.entries()] : [];
  const queryKeys = entries.map(([key]) => key).sort();
  const nonce = location?.searchParams.get("nonce") ?? "";
  const returnUrl = location?.searchParams.get("url") ?? "";
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== "" ||
    status !== 302 ||
    redirected !== false ||
    responseUrl !== endpoint.toString() ||
    !location ||
    location.origin !== "https://vercel.com" ||
    location.pathname !== "/sso-api" ||
    location.username !== "" ||
    location.password !== "" ||
    location.hash !== "" ||
    JSON.stringify(queryKeys) !== JSON.stringify(["nonce", "url"]) ||
    location.searchParams.getAll("nonce").length !== 1 ||
    location.searchParams.getAll("url").length !== 1 ||
    !/^[a-f0-9]{64}$/.test(nonce) ||
    returnUrl !== endpoint.toString()
  ) {
    throw new Error("Vercel automation protection redirect was not exact");
  }
  return Object.freeze({
    locationOriginPath: "https://vercel.com/sso-api",
    locationQueryShapeExact: true,
    nonceFormatExact: true,
    redirectFollowed: false,
    returnUrlExact: true,
  });
}

export function classifyExactAliasPropagationObservation(observation) {
  if (
    !hasExactKeys(observation, EXACT_OBSERVATION_KEYS) ||
    !Number.isSafeInteger(observation.status) ||
    observation.status < 100 ||
    observation.status > 599 ||
    typeof observation.redirected !== "boolean" ||
    typeof observation.locationPresent !== "boolean" ||
    typeof observation.responseUrlExact !== "boolean" ||
    !SAFE_DISPOSITIONS.includes(observation.disposition)
  ) {
    throw new Error(
      "Alias propagation observed a response outside the exact closed staging surface",
    );
  }

  if (isExactProtectedApplicationGate(observation)) {
    return "READY_EXACT_DEALFLOW_GATE";
  }
  if (isExactProtectedDeploymentNotFound(observation)) {
    return "WAIT_FOR_VERCEL_EDGE";
  }

  if (
    observation.protectionRedirect !== null ||
    observation.protectionBypass !== null ||
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

export function classifyExactAliasRollbackContainmentObservation(
  observation,
  { priorMappingPresent },
) {
  if (typeof priorMappingPresent !== "boolean") {
    throw new Error("Alias rollback containment target is outside the bounded contract");
  }
  const propagationClassification =
    classifyExactAliasPropagationObservation(observation);
  if (priorMappingPresent) {
    return propagationClassification === "READY_EXACT_DEALFLOW_GATE"
      ? "READY_EXACT_PRIOR_MAPPING_GATE"
      : "WAIT_FOR_PRIOR_MAPPING_EDGE";
  }
  return propagationClassification === "WAIT_FOR_VERCEL_EDGE"
    ? "READY_EXACT_ALIAS_ABSENCE"
    : "WAIT_FOR_REMOVED_ALIAS_EDGE";
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
    !hasExactKeys(observation, EXACT_OBSERVATION_KEYS) ||
    !Number.isSafeInteger(observation.status) ||
    observation.status < 100 ||
    observation.status > 599 ||
    typeof observation.redirected !== "boolean" ||
    typeof observation.locationPresent !== "boolean" ||
    typeof observation.responseUrlExact !== "boolean" ||
    !SAFE_DISPOSITIONS.includes(observation.disposition) ||
    !(
      (observation.protectionRedirect === null &&
        observation.protectionBypass === null) ||
      (isExactProtectionRedirectProof(observation.protectionRedirect) &&
        isSafeBasicResponse(observation.protectionBypass))
    )
  ) {
    return null;
  }
  return {
    status: observation.status,
    redirected: observation.redirected,
    locationPresent: observation.locationPresent,
    responseUrlExact: observation.responseUrlExact,
    disposition: observation.disposition,
    protectionRedirect: observation.protectionRedirect,
    protectionBypass: observation.protectionBypass,
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

async function waitForExactAliasState({
  probe,
  verifyMapping,
  delay,
  classifyObservation,
  readyClassification,
  timeoutMs = EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
  pollIntervalMs = EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
  requestTimeoutMaximumMs = EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  now = () => performance.now(),
}) {
  if (
    typeof probe !== "function" ||
    typeof verifyMapping !== "function" ||
    typeof delay !== "function" ||
    typeof classifyObservation !== "function" ||
    typeof readyClassification !== "string" ||
    readyClassification.length === 0 ||
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
      classification = classifyObservation(observation);
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
      vercelAutomationBypassUsed: observation.protectionBypass !== null,
      protectionBypassStatus: observation.protectionBypass?.status ?? null,
      protectionBypassDisposition:
        observation.protectionBypass?.disposition ?? null,
      classification,
    }));

    if (now() >= deadline) {
      throw timeoutError(startedAt, now, observations);
    }

    if (classification === readyClassification) {
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

export async function waitForExactAliasPropagation(options) {
  return waitForExactAliasState({
    ...options,
    classifyObservation: classifyExactAliasPropagationObservation,
    readyClassification: "READY_EXACT_DEALFLOW_GATE",
  });
}

export async function waitForExactAliasRollbackContainment({
  priorMappingPresent,
  ...options
}) {
  if (typeof priorMappingPresent !== "boolean") {
    throw new Error("Alias rollback containment target is outside the bounded contract");
  }
  return waitForExactAliasState({
    ...options,
    classifyObservation: (observation) =>
      classifyExactAliasRollbackContainmentObservation(observation, {
        priorMappingPresent,
      }),
    readyClassification: priorMappingPresent
      ? "READY_EXACT_PRIOR_MAPPING_GATE"
      : "READY_EXACT_ALIAS_ABSENCE",
  });
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
