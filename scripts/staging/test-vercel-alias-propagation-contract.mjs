#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
  EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
  ExactAliasPropagationHardFailureError,
  ExactAliasPropagationTimeoutError,
  classifyExactAliasPropagationObservation,
  classifyExactAliasRollbackContainmentObservation,
  classifyExactVercelAutomationProtectionRedirect,
  proveSequentialExactApplicationGate,
  summarizeExactAliasPropagationFailure,
  waitForExactAliasPropagation,
  waitForExactAliasRollbackContainment,
} from "./vercel-alias-propagation-contract.mjs";

const exactObservation = (overrides = {}) => ({
  status: 404,
  redirected: false,
  locationPresent: false,
  protectionBypass: null,
  protectionRedirect: null,
  responseUrlExact: true,
  disposition: "VERCEL_DEPLOYMENT_NOT_FOUND",
  ...overrides,
});

const protectionRedirect = Object.freeze({
  locationOriginPath: "https://vercel.com/sso-api",
  locationQueryShapeExact: true,
  nonceFormatExact: true,
  redirectFollowed: false,
  returnUrlExact: true,
});

const protectedObservation = (bypassOverrides = {}, overrides = {}) => ({
  status: 302,
  redirected: false,
  locationPresent: true,
  protectionRedirect,
  protectionBypass: {
    status: 404,
    redirected: false,
    locationPresent: false,
    responseUrlExact: true,
    disposition: "DEALFLOW_APPLICATION_GATE",
    ...bypassOverrides,
  },
  responseUrlExact: true,
  disposition:
    "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
  ...overrides,
});

const protectedNotFoundObservation = () => protectedObservation(
  { disposition: "VERCEL_DEPLOYMENT_NOT_FOUND" },
  {
    disposition:
      "VERCEL_DEPLOYMENT_NOT_FOUND_BEHIND_VERCEL_AUTOMATION_PROTECTION",
  },
);

const endpointUrl = "https://partner.example.com/privacy";
const nonce = "a".repeat(64);
const classifiedProtectionRedirect =
  classifyExactVercelAutomationProtectionRedirect({
    endpointUrl,
    responseUrl: endpointUrl,
    status: 302,
    redirected: false,
    rawLocation:
      `https://vercel.com/sso-api?url=${encodeURIComponent(endpointUrl)}&nonce=${nonce}`,
  });
assert.deepEqual(classifiedProtectionRedirect, protectionRedirect);
for (const invalidRedirect of [
  { status: 307 },
  { redirected: true },
  { responseUrl: "https://other.example.com/privacy" },
  { rawLocation: `https://evil.example/sso-api?url=${encodeURIComponent(endpointUrl)}&nonce=${nonce}` },
  { rawLocation: `https://vercel.com/other?url=${encodeURIComponent(endpointUrl)}&nonce=${nonce}` },
  { rawLocation: `https://vercel.com/sso-api?url=${encodeURIComponent("https://other.example.com/privacy")}&nonce=${nonce}` },
  { rawLocation: `https://vercel.com/sso-api?url=${encodeURIComponent(endpointUrl)}&nonce=short` },
  { rawLocation: `https://vercel.com/sso-api?url=${encodeURIComponent(endpointUrl)}&nonce=${nonce}&extra=1` },
]) {
  assert.throws(
    () => classifyExactVercelAutomationProtectionRedirect({
      endpointUrl,
      responseUrl: endpointUrl,
      status: 302,
      redirected: false,
      rawLocation:
        `https://vercel.com/sso-api?url=${encodeURIComponent(endpointUrl)}&nonce=${nonce}`,
      ...invalidRedirect,
    }),
    /not exact/,
  );
}

assert.equal(EXACT_ALIAS_PROPAGATION_TIMEOUT_MS, 180_000);
assert.equal(EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS, 2_000);
assert.equal(EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS, 15_000);
assert.ok(EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS < EXACT_ALIAS_PROPAGATION_TIMEOUT_MS);
assert.ok(EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS < EXACT_ALIAS_PROPAGATION_TIMEOUT_MS);

assert.equal(
  classifyExactAliasPropagationObservation(exactObservation()),
  "WAIT_FOR_VERCEL_EDGE",
);
assert.equal(
  classifyExactAliasPropagationObservation(
    exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" }),
  ),
  "READY_EXACT_DEALFLOW_GATE",
);
assert.equal(
  classifyExactAliasPropagationObservation(protectedObservation()),
  "READY_EXACT_DEALFLOW_GATE",
);
assert.equal(
  classifyExactAliasPropagationObservation(protectedNotFoundObservation()),
  "WAIT_FOR_VERCEL_EDGE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(exactObservation(), {
    priorMappingPresent: false,
  }),
  "READY_EXACT_ALIAS_ABSENCE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(
    exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" }),
    { priorMappingPresent: false },
  ),
  "WAIT_FOR_REMOVED_ALIAS_EDGE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(protectedObservation(), {
    priorMappingPresent: false,
  }),
  "WAIT_FOR_REMOVED_ALIAS_EDGE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(protectedNotFoundObservation(), {
    priorMappingPresent: false,
  }),
  "READY_EXACT_ALIAS_ABSENCE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(exactObservation(), {
    priorMappingPresent: true,
  }),
  "WAIT_FOR_PRIOR_MAPPING_EDGE",
);
assert.equal(
  classifyExactAliasRollbackContainmentObservation(protectedObservation(), {
    priorMappingPresent: true,
  }),
  "READY_EXACT_PRIOR_MAPPING_GATE",
);
assert.throws(
  () => classifyExactAliasRollbackContainmentObservation(exactObservation(), {
    priorMappingPresent: "false",
  }),
  /outside the bounded contract/,
);

for (const observation of [
  null,
  [],
  exactObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }),
  exactObservation({ status: 503, disposition: "DEALFLOW_APPLICATION_GATE" }),
  exactObservation({ redirected: true }),
  exactObservation({ locationPresent: true }),
  exactObservation({ responseUrlExact: false }),
  exactObservation({ disposition: "UNRECOGNIZED" }),
  { ...exactObservation(), unexpected: true },
  protectedObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }),
  protectedObservation({}, { protectionRedirect: null }),
]) {
  assert.throws(
    () => classifyExactAliasPropagationObservation(observation),
    /exact closed staging surface|unrecognized exact-URL staging response/,
  );
}

function createFakeRun(observations, options = {}) {
  let nowMs = 0;
  let mappingCalls = 0;
  const delays = [];
  const requestTimeouts = [];
  const mappingTimeouts = [];
  const queue = [...observations];
  return {
    state: {
      delays,
      requestTimeouts,
      mappingTimeouts,
      get mappingCalls() { return mappingCalls; },
    },
    run: () => waitForExactAliasPropagation({
      probe: async ({ timeoutMs }) => {
        requestTimeouts.push(timeoutMs);
        nowMs += options.probeAdvanceMs ?? 0;
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (next instanceof Error) throw next;
        return next;
      },
      verifyMapping: async ({ timeoutMs }) => {
        mappingCalls += 1;
        mappingTimeouts.push(timeoutMs);
        nowMs += options.mappingAdvanceMs ?? 0;
        if (options.mappingError) throw options.mappingError;
        return { exactCandidateMapping: true };
      },
      delay: async (delayMs) => {
        delays.push(delayMs);
        if (options.delayError) throw options.delayError;
        nowMs += delayMs;
      },
      now: () => nowMs,
      timeoutMs: options.timeoutMs,
      pollIntervalMs: options.pollIntervalMs,
      requestTimeoutMaximumMs: options.requestTimeoutMaximumMs,
    }),
  };
}

function createFakeRollbackRun(observations, priorMappingPresent, options = {}) {
  let nowMs = 0;
  let mappingCalls = 0;
  const delays = [];
  const queue = [...observations];
  return {
    state: {
      delays,
      get mappingCalls() { return mappingCalls; },
    },
    run: () => waitForExactAliasRollbackContainment({
      priorMappingPresent,
      probe: async () => {
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (next instanceof Error) throw next;
        return next;
      },
      verifyMapping: async () => {
        mappingCalls += 1;
        if (options.mappingError) throw options.mappingError;
        return { exactPriorMappingRestored: true, priorMappingPresent };
      },
      delay: async (delayMs) => {
        delays.push(delayMs);
        nowMs += delayMs;
      },
      now: () => nowMs,
      timeoutMs: options.timeoutMs,
    }),
  };
}

const removedAliasStaleProtectedEdge = createFakeRollbackRun([
  protectedObservation(),
  protectedNotFoundObservation(),
], false);
const removedAliasContained = await removedAliasStaleProtectedEdge.run();
assert.deepEqual(
  removedAliasContained.observations.map(({ classification }) => classification),
  ["WAIT_FOR_REMOVED_ALIAS_EDGE", "READY_EXACT_ALIAS_ABSENCE"],
);
assert.deepEqual(removedAliasStaleProtectedEdge.state.delays, [2_000]);
assert.equal(removedAliasStaleProtectedEdge.state.mappingCalls, 1);
assert.equal(
  removedAliasContained.mappingProof.exactPriorMappingRestored,
  true,
);

const restoredAliasEdge = createFakeRollbackRun([
  exactObservation(),
  protectedObservation(),
], true);
const restoredAliasContained = await restoredAliasEdge.run();
assert.deepEqual(
  restoredAliasContained.observations.map(({ classification }) => classification),
  ["WAIT_FOR_PRIOR_MAPPING_EDGE", "READY_EXACT_PRIOR_MAPPING_GATE"],
);
assert.deepEqual(restoredAliasEdge.state.delays, [2_000]);
assert.equal(restoredAliasEdge.state.mappingCalls, 1);

const removedAliasTimeout = createFakeRollbackRun(
  [protectedObservation()],
  false,
  { timeoutMs: 5_000 },
);
await assert.rejects(
  removedAliasTimeout.run(),
  ExactAliasPropagationTimeoutError,
);
assert.deepEqual(removedAliasTimeout.state.delays, [2_000, 2_000, 1_000]);
assert.equal(removedAliasTimeout.state.mappingCalls, 0);

const rollbackMappingDrift = createFakeRollbackRun(
  [protectedNotFoundObservation()],
  false,
  { mappingError: new Error("simulated rollback mapping drift") },
);
await assert.rejects(
  rollbackMappingDrift.run(),
  (error) =>
    error instanceof ExactAliasPropagationHardFailureError &&
    error.phase === "MAPPING_VERIFICATION",
);
assert.equal(rollbackMappingDrift.state.mappingCalls, 1);

const rollbackPublicWindow = createFakeRollbackRun([
  exactObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }),
], false);
await assert.rejects(
  rollbackPublicWindow.run(),
  (error) =>
    error instanceof ExactAliasPropagationHardFailureError &&
    error.phase === "CLASSIFICATION",
);
assert.equal(rollbackPublicWindow.state.mappingCalls, 0);

assert.deepEqual(
  summarizeExactAliasPropagationFailure(new Error("ordinary rollback failure")),
  {
    failurePhase: "UNCLASSIFIED",
    requestAttemptCount: null,
    completedResponseCount: null,
    elapsedMs: null,
    observations: [],
    terminalObservation: null,
    redirectsFollowed: null,
    responseUrlExact: null,
    publicWindowObserved: null,
    publicWindowProofStatus: "NOT_PROVEN",
  },
);

const immediate = createFakeRun([
  exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" }),
]);
const immediateResult = await immediate.run();
assert.equal(immediateResult.observations.length, 1);
assert.equal(immediateResult.observations[0].classification, "READY_EXACT_DEALFLOW_GATE");
assert.equal(immediate.state.mappingCalls, 1);
assert.deepEqual(immediate.state.delays, []);
assert.deepEqual(immediate.state.mappingTimeouts, [15_000]);

const readyAfterSuspendedClock = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { timeoutMs: 5_000, probeAdvanceMs: 25_000 },
);
const readyAfterSuspendedClockResult = await readyAfterSuspendedClock.run();
assert.equal(readyAfterSuspendedClockResult.observations.length, 1);
assert.equal(
  readyAfterSuspendedClockResult.observations[0].classification,
  "READY_EXACT_DEALFLOW_GATE",
);
assert.equal(readyAfterSuspendedClock.state.mappingCalls, 1);
assert.deepEqual(readyAfterSuspendedClock.state.mappingTimeouts, [15_000]);
assert.deepEqual(readyAfterSuspendedClock.state.delays, []);

const protectedImmediate = createFakeRun([protectedObservation()]);
const protectedImmediateResult = await protectedImmediate.run();
assert.equal(protectedImmediateResult.observations.length, 1);
assert.equal(
  protectedImmediateResult.observations[0].classification,
  "READY_EXACT_DEALFLOW_GATE",
);
assert.equal(
  protectedImmediateResult.observations[0].disposition,
  "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
);
assert.equal(protectedImmediateResult.observations[0].vercelAutomationBypassUsed, true);
assert.equal(protectedImmediateResult.observations[0].protectionBypassStatus, 404);
assert.equal(
  protectedImmediateResult.observations[0].protectionBypassDisposition,
  "DEALFLOW_APPLICATION_GATE",
);
assert.equal(protectedImmediate.state.mappingCalls, 1);
assert.deepEqual(protectedImmediate.state.delays, []);

const protectedPublicBypass = createFakeRun([
  protectedObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }, {
    disposition: "VERCEL_AUTOMATION_PROTECTION",
  }),
]);
let protectedPublicBypassError;
try {
  await protectedPublicBypass.run();
} catch (error) {
  protectedPublicBypassError = error;
}
assert.ok(protectedPublicBypassError instanceof ExactAliasPropagationHardFailureError);
assert.equal(protectedPublicBypassError.phase, "CLASSIFICATION");
assert.equal(protectedPublicBypassError.safeTerminalObservation.status, 302);
assert.equal(
  protectedPublicBypassError.safeTerminalObservation.protectionBypass.status,
  200,
);
assert.equal(protectedPublicBypass.state.mappingCalls, 0);
assert.equal(
  summarizeExactAliasPropagationFailure(protectedPublicBypassError)
    .publicWindowObserved,
  false,
);

const eventual = createFakeRun([
  exactObservation(),
  exactObservation(),
  exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" }),
]);
const eventualResult = await eventual.run();
assert.deepEqual(
  eventualResult.observations.map(({ classification }) => classification),
  ["WAIT_FOR_VERCEL_EDGE", "WAIT_FOR_VERCEL_EDGE", "READY_EXACT_DEALFLOW_GATE"],
);
assert.deepEqual(eventual.state.delays, [2_000, 2_000]);
assert.equal(eventual.state.mappingCalls, 1);

const persistent = createFakeRun([exactObservation()], { timeoutMs: 5_000 });
let timeoutError;
try {
  await persistent.run();
} catch (error) {
  timeoutError = error;
}
assert.ok(timeoutError instanceof ExactAliasPropagationTimeoutError);
assert.equal(timeoutError.elapsedMs, 5_000);
assert.equal(timeoutError.safeObservations.length, 3);
assert.deepEqual(persistent.state.delays, [2_000, 2_000, 1_000]);
assert.deepEqual(persistent.state.requestTimeouts, [5_000, 3_000, 1_000]);
assert.equal(persistent.state.mappingCalls, 0);

for (const unsafeObservation of [
  exactObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }),
  exactObservation({ status: 503, disposition: "DEALFLOW_APPLICATION_GATE" }),
  exactObservation({ status: 500, disposition: "UNRECOGNIZED" }),
  exactObservation({ redirected: true }),
  exactObservation({ locationPresent: true }),
  exactObservation({ responseUrlExact: false }),
]) {
  const unsafe = createFakeRun([unsafeObservation]);
  await assert.rejects(unsafe.run(), /exact closed staging surface/);
  assert.equal(unsafe.state.mappingCalls, 0);
  assert.deepEqual(unsafe.state.delays, []);
}

const transientThenPublic = createFakeRun([
  exactObservation(),
  exactObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" }),
]);
let transientThenPublicError;
try {
  await transientThenPublic.run();
} catch (error) {
  transientThenPublicError = error;
}
assert.ok(transientThenPublicError instanceof ExactAliasPropagationHardFailureError);
assert.equal(transientThenPublicError.phase, "CLASSIFICATION");
assert.equal(transientThenPublicError.safeObservations.length, 1);
assert.equal(transientThenPublicError.safeTerminalObservation.status, 200);
assert.equal(
  transientThenPublicError.safeTerminalObservation.disposition,
  "AUTHORIZED_HTTP_200",
);
assert.deepEqual(
  summarizeExactAliasPropagationFailure(transientThenPublicError),
  {
    failurePhase: "CLASSIFICATION",
    requestAttemptCount: 2,
    completedResponseCount: 2,
    elapsedMs: 2_000,
    observations: transientThenPublicError.safeObservations,
    terminalObservation: transientThenPublicError.safeTerminalObservation,
    redirectsFollowed: false,
    responseUrlExact: true,
    publicWindowObserved: true,
    publicWindowProofStatus: "OBSERVED_UNAUTHENTICATED_HTTP_2XX",
  },
);

const terminalNoContent = createFakeRun([
  exactObservation({ status: 204, disposition: "UNRECOGNIZED" }),
]);
let terminalNoContentError;
try {
  await terminalNoContent.run();
} catch (error) {
  terminalNoContentError = error;
}
assert.equal(
  summarizeExactAliasPropagationFailure(terminalNoContentError).publicWindowObserved,
  true,
);
assert.equal(
  summarizeExactAliasPropagationFailure(terminalNoContentError).publicWindowProofStatus,
  "OBSERVED_UNAUTHENTICATED_HTTP_2XX",
);

const transport = createFakeRun([
  exactObservation(),
  new Error("simulated transport failure"),
]);
let transportError;
try {
  await transport.run();
} catch (error) {
  transportError = error;
}
assert.ok(transportError instanceof ExactAliasPropagationHardFailureError);
assert.equal(transportError.phase, "PROBE");
assert.equal(transportError.safeObservations.length, 1);
assert.equal(transportError.safeTerminalObservation, null);
assert.equal(
  summarizeExactAliasPropagationFailure(transportError).publicWindowProofStatus,
  "NOT_PROVEN",
);
assert.equal(
  summarizeExactAliasPropagationFailure(transportError).requestAttemptCount,
  2,
);
assert.equal(
  summarizeExactAliasPropagationFailure(transportError).completedResponseCount,
  1,
);
assert.deepEqual(transport.state.delays, [2_000]);
assert.equal(transport.state.mappingCalls, 0);

const malformed = createFakeRun([{ ...exactObservation(), unexpected: true }]);
let malformedError;
try {
  await malformed.run();
} catch (error) {
  malformedError = error;
}
assert.ok(malformedError instanceof ExactAliasPropagationHardFailureError);
assert.equal(malformedError.phase, "CLASSIFICATION");
assert.equal(malformedError.safeTerminalObservation, null);
assert.equal(
  summarizeExactAliasPropagationFailure(malformedError).requestAttemptCount,
  1,
);
assert.equal(
  summarizeExactAliasPropagationFailure(malformedError).completedResponseCount,
  0,
);

const mappingDrift = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { mappingError: new Error("simulated mapping drift") },
);
let mappingDriftError;
try {
  await mappingDrift.run();
} catch (error) {
  mappingDriftError = error;
}
assert.ok(mappingDriftError instanceof ExactAliasPropagationHardFailureError);
assert.equal(mappingDriftError.phase, "MAPPING_VERIFICATION");
assert.equal(mappingDriftError.safeObservations.length, 1);
assert.equal(
  summarizeExactAliasPropagationFailure(mappingDriftError).publicWindowObserved,
  null,
);
assert.equal(mappingDrift.state.mappingCalls, 1);
assert.deepEqual(mappingDrift.state.delays, []);

const terminated = createFakeRun(
  [exactObservation()],
  { delayError: new Error("simulated termination") },
);
let terminatedError;
try {
  await terminated.run();
} catch (error) {
  terminatedError = error;
}
assert.ok(terminatedError instanceof ExactAliasPropagationHardFailureError);
assert.equal(terminatedError.phase, "DELAY");
assert.equal(terminatedError.safeObservations.length, 1);
assert.equal(
  summarizeExactAliasPropagationFailure(terminatedError).publicWindowProofStatus,
  "NOT_PROVEN",
);
assert.equal(terminated.state.mappingCalls, 0);

const requestCap = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { timeoutMs: 20_000 },
);
await requestCap.run();
assert.deepEqual(requestCap.state.requestTimeouts, [15_000]);

const lateProbe = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { timeoutMs: 100, pollIntervalMs: 50, probeAdvanceMs: 101 },
);
await lateProbe.run();
assert.equal(lateProbe.state.mappingCalls, 1);
assert.deepEqual(lateProbe.state.mappingTimeouts, [15_000]);

const lateMapping = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { timeoutMs: 100, pollIntervalMs: 50, mappingAdvanceMs: 101 },
);
await lateMapping.run();
assert.deepEqual(lateMapping.state.mappingTimeouts, [100]);

for (const invalidOptions of [
  { timeoutMs: 180_001 },
  { timeoutMs: 1_000, pollIntervalMs: 1_001 },
  { requestTimeoutMaximumMs: 15_001 },
]) {
  const invalid = createFakeRun(
    [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
    invalidOptions,
  );
  await assert.rejects(invalid.run(), /outside the bounded contract/);
  assert.deepEqual(invalid.state.requestTimeouts, []);
}

const exactClosedGate = exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" });
const exactAuthorizedGate = exactObservation({
  status: 200,
  disposition: "AUTHORIZED_HTTP_200",
});
const sequentialHeaders = [];
let sequentialSecretReads = 0;
const sequentialProof = await proveSequentialExactApplicationGate({
  label: "test_alias",
  request: async (headers) => {
    sequentialHeaders.push(headers);
    return sequentialHeaders.length === 1 ? exactClosedGate : exactAuthorizedGate;
  },
  getSecret: () => {
    sequentialSecretReads += 1;
    return "test-secret";
  },
  headerName: "x-test-gate",
  cookieName: "__Host-test-gate",
});
assert.equal(sequentialProof.noGate, exactClosedGate);
assert.equal(sequentialSecretReads, 1);
assert.deepEqual(sequentialHeaders, [
  {},
  { "x-test-gate": "test-secret" },
  { Cookie: "__Host-test-gate=test-secret" },
]);

let rejectedSecretReads = 0;
const rejectedHeaders = [];
await assert.rejects(
  proveSequentialExactApplicationGate({
    label: "test_alias",
    request: async (headers) => {
      rejectedHeaders.push(headers);
      return exactObservation({ status: 200, disposition: "AUTHORIZED_HTTP_200" });
    },
    getSecret: () => {
      rejectedSecretReads += 1;
      return "must-not-be-read";
    },
    headerName: "x-test-gate",
    cookieName: "__Host-test-gate",
  }),
  /closed unauthenticated application gate/,
);
assert.deepEqual(rejectedHeaders, [{}]);
assert.equal(rejectedSecretReads, 0);

const headerFailureHeaders = [];
await assert.rejects(
  proveSequentialExactApplicationGate({
    label: "test_alias",
    request: async (headers) => {
      headerFailureHeaders.push(headers);
      return headerFailureHeaders.length === 1
        ? exactClosedGate
        : exactObservation({ status: 503, disposition: "DEALFLOW_APPLICATION_GATE" });
    },
    getSecret: () => "test-secret",
    headerName: "x-test-gate",
    cookieName: "__Host-test-gate",
  }),
  /header-gated application surface/,
);
assert.deepEqual(headerFailureHeaders, [{}, { "x-test-gate": "test-secret" }]);

console.log(
  "Vercel alias propagation contract: PASS (forward and rollback hard deadlines after probe and mapping; truthful typed and ordinary failure summaries; exact Vercel 404 transient/absence; exact public 302 Vercel SSO plus no-app-gate automation bypass reaches the DealFlow gate or exact absent alias; stale protected removal edges are polled to containment; persistent protected aliases complete without following redirects; bounded post-bypass mapping recheck; public 2xx, malformed protection, redirected, transport, drift, timeout, and termination paths fail closed; raw Location query and nonce never enter safe observations)",
);
