#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  VercelEnvironmentSyncError,
  synchronizeExactVercelEnvironment,
} from "./vercel-environment-sync-contract.mjs";

const projectId = "prj_isolated_staging_contract";
const organizationId = "team_isolated_staging_contract";
const token = "vercel_contract_token_never_persisted";
const environment = Object.freeze({
  PUBLIC_FLAG: "enabled",
  SECRET_VALUE: "contract-secret-never-persisted",
});
const sensitiveKeys = new Set(["SECRET_VALUE"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function response(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function exactRecord(key, value, overrides = {}) {
  return {
    id: overrides.id ?? `env_${key.toLowerCase()}`,
    key,
    value,
    type: key === "SECRET_VALUE" ? "sensitive" : "encrypted",
    target: ["production"],
    gitBranch: null,
    customEnvironmentIds: [],
    decrypted: key !== "SECRET_VALUE",
    ...overrides,
  };
}

function fakeProvider(initialRecords, writeOutcomes = []) {
  const state = new Map(initialRecords.map((record) => [record.key, { ...record }]));
  const calls = [];
  const delays = [];
  let nextWriteOutcome = 0;

  function applyWrite(url, init) {
    const body = JSON.parse(init.body);
    if (init.method === "POST") {
      assert.equal(url.searchParams.get("upsert"), "true");
      assert.ok(Array.isArray(body));
      for (const desired of body) {
        state.set(desired.key, {
          id: state.get(desired.key)?.id ?? `env_${desired.key.toLowerCase()}`,
          ...desired,
          gitBranch: null,
          decrypted: desired.type !== "sensitive",
        });
      }
      return;
    }
    assert.equal(init.method, "PATCH");
    const id = decodeURIComponent(url.pathname.split("/").at(-1));
    const existing = [...state.values()].find((record) => record.id === id);
    assert.ok(existing, `missing exact PATCH id ${id}`);
    const updatedKey = body.key ?? existing.key;
    state.delete(existing.key);
    state.set(updatedKey, {
      ...existing,
      ...body,
      id,
      key: updatedKey,
      gitBranch: null,
      decrypted: body.type !== "sensitive",
    });
  }

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({
      method: init.method,
      pathname: url.pathname,
      query: [...url.searchParams.entries()].sort(),
      body: init.body ? JSON.parse(init.body) : null,
    });
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(url.searchParams.get("teamId"), organizationId);
    if (init.method === "GET" && /\/v10\/projects\/[^/]+\/env$/.test(url.pathname)) {
      return response(200, {
        envs: [...state.values()].map((record) => ({ ...record })),
        pagination: { next: null },
      }, { "x-vercel-request-id": "req_contract_read" });
    }
    if (init.method === "GET" && /\/v1\/projects\/[^/]+\/env\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1));
      const existing = [...state.values()].find((record) => record.id === id);
      return existing
        ? response(200, existing, { "x-vercel-request-id": "req_contract_single" })
        : response(404, { error: { code: "not_found" } });
    }
    if (!["POST", "PATCH"].includes(init.method)) {
      return response(405, { error: { code: "method_not_allowed" } });
    }
    const outcome = writeOutcomes[nextWriteOutcome] ?? { status: 200, commit: true };
    nextWriteOutcome += 1;
    if (outcome.commit) applyWrite(url, init);
    if (outcome.transportFailure) throw new Error("synthetic transport failure");
    return response(
      outcome.status,
      outcome.status >= 400 ? { error: { code: outcome.code ?? "synthetic_error" } } : { created: [] },
      {
        "x-vercel-request-id": `req_contract_write_${nextWriteOutcome}`,
        ...(outcome.retryAfter === undefined ? {} : { "retry-after": String(outcome.retryAfter) }),
        ...(outcome.rateLimitReset === undefined
          ? {}
          : { "x-ratelimit-reset": String(outcome.rateLimitReset) }),
      },
    );
  };
  return {
    state,
    calls,
    delays,
    fetchImpl,
    delayImpl: async (milliseconds) => delays.push(milliseconds),
  };
}

{
  const resetAt = Math.ceil((Date.now() + 1_500) / 1_000);
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [
      { status: 429, commit: false, code: "rate_limited", rateLimitReset: resetAt },
      { status: 200, commit: true },
    ],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.rateLimitRetryCount, 1);
  assert.equal(provider.delays.length, 1);
  assert.ok(provider.delays[0] >= 500 && provider.delays[0] <= 2_500);
}

{
  const resetAt = Math.ceil((Date.now() + 120_000) / 1_000);
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [{ status: 429, commit: false, code: "rate_limited", rateLimitReset: resetAt }],
  );
  await assert.rejects(
    synchronize(provider),
    (error) => {
      assert.ok(error instanceof VercelEnvironmentSyncError);
      assert.equal(error.category, "rate_limit_retry_after_outside_bound");
      return true;
    },
  );
}

async function synchronize(provider) {
  return await synchronizePortfolio({
    provider,
    environmentPortfolio: environment,
    sensitivePortfolio: sensitiveKeys,
  });
}

async function synchronizePortfolio({
  provider,
  environmentPortfolio,
  sensitivePortfolio,
}) {
  return await synchronizeExactVercelEnvironment({
    projectId,
    organizationId,
    token,
    expectedProjectIdFingerprint: sha256(projectId),
    expectedOrganizationIdFingerprint: sha256(organizationId),
    environment: environmentPortfolio,
    sensitiveKeys: sensitivePortfolio,
    expectedCount: Object.keys(environmentPortfolio).length,
    providerSensitiveNames: ["FORBIDDEN_PROVIDER_TOKEN"],
    fetchImpl: provider.fetchImpl,
    delayImpl: provider.delayImpl,
    batchSize: 2,
    maxAttempts: 4,
    requestTimeoutMs: 1_000,
    maxRetryAfterMs: 60_000,
  });
}

{
  const encryptedEntries = Array.from({ length: 81 }, (_, index) => [
    `ENCRYPTED_KEY_${String(index + 1).padStart(3, "0")}`,
    `encrypted-value-${index + 1}`,
  ]);
  const sensitiveEntries = Array.from({ length: 10 }, (_, index) => [
    `SENSITIVE_KEY_${String(index + 1).padStart(3, "0")}`,
    `sensitive-value-${index + 1}`,
  ]);
  const environmentPortfolio = Object.freeze(Object.fromEntries([
    ...encryptedEntries,
    ...sensitiveEntries,
  ]));
  const sensitivePortfolio = new Set(sensitiveEntries.map(([key]) => key));
  const provider = fakeProvider(Object.entries(environmentPortfolio).map(([key, value]) => ({
    id: `env_${key.toLowerCase()}`,
    key,
    value,
    type: sensitivePortfolio.has(key) ? "sensitive" : "encrypted",
    target: ["production"],
    gitBranch: null,
    customEnvironmentIds: [],
    decrypted: !sensitivePortfolio.has(key),
  })));
  const proof = await synchronizePortfolio({
    provider,
    environmentPortfolio,
    sensitivePortfolio,
  });
  assert.equal(proof.environmentVariableCount, 91);
  assert.equal(proof.finalExactStructureCount, 91);
  assert.equal(proof.finalReadableValueDigestMatchCount, 81);
  assert.equal(proof.finalSensitiveValueWriteAcknowledgementCount, 10);
  assert.equal(proof.finalExpectedValueDispositionCount, 91);
  assert.equal(proof.finalUnexpectedEnvironmentCount, 0);
  assert.equal(proof.variables.length, 91);
  assert.equal(provider.calls.filter((call) => call.method === "PATCH").length, 10);
}

{
  const environmentPortfolio = Object.freeze({ PUBLIC_FLAG: "enabled" });
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", "stale")],
    [{ status: 503, commit: true, code: "provider_unavailable" }],
  );
  const proof = await synchronizePortfolio({
    provider,
    environmentPortfolio,
    sensitivePortfolio: new Set(),
  });
  assert.equal(proof.ambiguousWriteReadbackCommitCount, 1);
  assert.equal(proof.ambiguousWriteReadbackRetryCount, 0);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);
}

{
  const provider = fakeProvider([
    exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG),
    exactRecord("SECRET_VALUE", environment.SECRET_VALUE),
  ]);
  const proof = await synchronize(provider);
  assert.equal(proof.status, "PASS");
  assert.equal(proof.unchangedCount, 1);
  assert.equal(proof.patchedRecordCount, 1);
  assert.equal(proof.sensitiveValueRewriteCount, 1);
  assert.equal(proof.upsertedRecordCount, 0);
  assert.equal(provider.calls.filter((call) => call.method !== "GET").length, 1);
  const sensitivePatch = provider.calls.find((call) => call.method === "PATCH");
  assert.equal(Object.hasOwn(sensitivePatch.body, "key"), false);
  assert.equal(Object.hasOwn(sensitivePatch.body, "gitBranch"), false);
}

{
  const provider = fakeProvider([
    exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG),
  ]);
  const proof = await synchronize(provider);
  assert.equal(proof.initialMissingCount, 1);
  assert.equal(proof.upsertedRecordCount, 1);
  assert.equal(proof.upsertBatchCount, 1);
  const writes = provider.calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "POST");
  assert.deepEqual(writes[0].body.map((record) => record.key), ["SECRET_VALUE"]);
  assert.equal(Object.hasOwn(writes[0].body[0], "gitBranch"), false);
}

{
  const provider = fakeProvider([
    exactRecord("PUBLIC_FLAG", "provider-ciphertext", { decrypted: false }),
    exactRecord("SECRET_VALUE", environment.SECRET_VALUE),
  ]);
  const originalFetch = provider.fetchImpl;
  provider.fetchImpl = async (input, init) => {
    const url = new URL(input);
    const result = await originalFetch(input, init);
    if (
      init.method === "GET" &&
      /\/v1\/projects\/[^/]+\/env\/env_public_flag$/.test(url.pathname)
    ) {
      return response(200, exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG, {
        decrypted: true,
      }), { "x-vercel-request-id": "req_contract_decrypted_fallback" });
    }
    return result;
  };
  const proof = await synchronize(provider);
  assert.equal(proof.finalReadableValueDigestMatchCount, 1);
  assert.ok(provider.calls.some(
    (call) => call.method === "GET" && /\/env\/env_public_flag$/.test(call.pathname),
  ));
}

{
  const provider = fakeProvider([
    exactRecord("PUBLIC_FLAG", "stale", {
      type: "plain",
      target: ["preview"],
      gitBranch: "unsafe-branch",
      customEnvironmentIds: ["env_custom"],
    }),
    exactRecord("SECRET_VALUE", environment.SECRET_VALUE),
  ]);
  const proof = await synchronize(provider);
  assert.equal(proof.initialDriftedCount, 2);
  assert.equal(proof.patchedRecordCount, 2);
  const writes = provider.calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 2);
  const publicPatch = writes.find((call) => /\/env\/env_public_flag$/.test(call.pathname));
  assert.equal(publicPatch.method, "PATCH");
  assert.deepEqual(publicPatch.body.customEnvironmentIds, []);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [
      { status: 429, commit: false, code: "rate_limited", retryAfter: 1 },
      { status: 200, commit: true },
    ],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.rateLimitRetryCount, 1);
  assert.deepEqual(provider.delays, [1_000]);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 2);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [
      { status: 408, commit: true, code: "request_timeout" },
      { status: 200, commit: true },
    ],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.ambiguousWriteReadbackRetryCount, 1);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 2);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [
      { status: 409, commit: true, code: "conflict" },
      { status: 200, commit: true },
    ],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.ambiguousWriteReadbackRetryCount, 1);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 2);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [{ status: 503, commit: true, code: "provider_unavailable" }],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.ambiguousWriteReadbackRetryCount, 1);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 2);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [{ status: 0, commit: true, transportFailure: true }],
  );
  const proof = await synchronize(provider);
  assert.equal(proof.ambiguousWriteReadbackRetryCount, 1);
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 2);
}

{
  const provider = fakeProvider(
    [exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG)],
    [{ status: 400, commit: false, code: "invalid_target" }],
  );
  await assert.rejects(
    synchronize(provider),
    (error) => {
      assert.ok(error instanceof VercelEnvironmentSyncError);
      assert.equal(error.category, "deterministic_write_4xx");
      assert.equal(error.status, 400);
      assert.equal(error.providerCode, "invalid_target");
      assert.match(error.requestId, /^req_contract_write_/);
      return true;
    },
  );
  assert.equal(provider.calls.filter((call) => call.method === "POST").length, 1);
}

{
  const hiddenRecords = [
    exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG),
    exactRecord("SECRET_VALUE", environment.SECRET_VALUE),
  ];
  const provider = fakeProvider(hiddenRecords);
  const originalFetch = provider.fetchImpl;
  provider.fetchImpl = async (input, init) => {
    const result = await originalFetch(input, init);
    const url = new URL(input);
    if (init.method === "GET" && /\/env$/.test(url.pathname)) {
      const payload = await result.json();
      return response(result.status, {
        ...payload,
        envs: payload.envs.map(({ value: _value, ...record }) => record),
      }, { "x-vercel-request-id": "req_contract_hidden_list" });
    }
    return result;
  };
  const proof = await synchronize(provider);
  assert.equal(proof.finalReadableValueDigestMatchCount, 1);
  assert.equal(proof.finalSensitiveValueWriteAcknowledgementCount, 1);
  assert.equal(proof.finalExpectedValueDispositionCount, 2);
  assert.equal(provider.calls.filter(
    (call) => call.method === "GET" && /\/env\/env_/.test(call.pathname),
  ).length, 3);
}

{
  const provider = fakeProvider([
    exactRecord("PUBLIC_FLAG", environment.PUBLIC_FLAG),
    exactRecord("SECRET_VALUE", environment.SECRET_VALUE),
  ]);
  const proof = await synchronize(provider);
  const serialized = JSON.stringify(proof);
  for (const forbidden of [
    token,
    projectId,
    organizationId,
    environment.PUBLIC_FLAG,
    environment.SECRET_VALUE,
    sha256(environment.PUBLIC_FLAG),
    sha256(environment.SECRET_VALUE),
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(
    proof.variables.map(({ key, target, type, branchScope, finalStatus }) => ({
      key,
      target,
      type,
      branchScope,
      finalStatus,
    })),
    [
      { key: "PUBLIC_FLAG", target: "production", type: "encrypted", branchScope: null, finalStatus: "present_exact" },
      { key: "SECRET_VALUE", target: "production", type: "sensitive", branchScope: null, finalStatus: "present_exact_metadata_value_write_acknowledged" },
    ],
  );
}

console.log(
  "Vercel environment sync contract: PASS (exact metadata; decrypted:true encrypted-value readback with exact-ID fallback; sensitive-value exact-ID rewrite plus provider acknowledgement; production-safe request bodies; missing/value drift batched upsert; bounded Retry-After/X-RateLimit-Reset; deterministic 4xx; ambiguous 408/409/5xx/transport readback; secret-free exact 91/81/10 proof)",
);
