#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
  EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
  ExactAliasPropagationHardFailureError,
  ExactAliasPropagationTimeoutError,
  classifyExactAliasPropagationObservation,
  proveSequentialExactApplicationGate,
  summarizeExactAliasPropagationFailure,
  waitForExactAliasPropagation,
} from "./vercel-alias-propagation-contract.mjs";

const exactObservation = (overrides = {}) => ({
  status: 404,
  redirected: false,
  locationPresent: false,
  responseUrlExact: true,
  disposition: "VERCEL_DEPLOYMENT_NOT_FOUND",
  ...overrides,
});

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

const immediate = createFakeRun([
  exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" }),
]);
const immediateResult = await immediate.run();
assert.equal(immediateResult.observations.length, 1);
assert.equal(immediateResult.observations[0].classification, "READY_EXACT_DEALFLOW_GATE");
assert.equal(immediate.state.mappingCalls, 1);
assert.deepEqual(immediate.state.delays, []);
assert.deepEqual(immediate.state.mappingTimeouts, [180_000]);

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
await assert.rejects(lateProbe.run(), ExactAliasPropagationTimeoutError);
assert.equal(lateProbe.state.mappingCalls, 0);

const lateMapping = createFakeRun(
  [exactObservation({ disposition: "DEALFLOW_APPLICATION_GATE" })],
  { timeoutMs: 100, pollIntervalMs: 50, mappingAdvanceMs: 101 },
);
await assert.rejects(lateMapping.run(), ExactAliasPropagationTimeoutError);
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
  "Vercel alias propagation contract: PASS (hard deadline after probe and mapping; truthful typed failures; exact Vercel 404 transient; exact DealFlow 404 success; bounded post-wait mapping recheck; public, redirected, malformed, transport, drift, timeout, and termination paths fail closed; credentials load and transmit strictly after each preceding gate passes)",
);
