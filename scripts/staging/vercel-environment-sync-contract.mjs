import { createHash } from "node:crypto";

const ENVIRONMENT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,255}$/;
const ENVIRONMENT_ID_PATTERN = /^[A-Za-z0-9_:-]{1,256}$/;
const SAFE_PROVIDER_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
const EXPECTED_TARGET = Object.freeze(["production"]);
const EXPECTED_BRANCH_SCOPE = null;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 60_000;
const AMBIGUOUS_WRITE_STATUS = new Set([408, 409]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedProviderCode(payload) {
  const candidate = payload?.error?.code ?? payload?.code;
  return typeof candidate === "string" && SAFE_PROVIDER_CODE_PATTERN.test(candidate)
    ? candidate
    : "unclassified";
}

function normalizedRequestId(headers) {
  const candidate =
    headers.get("x-vercel-id") ??
    headers.get("x-vercel-request-id") ??
    headers.get("x-request-id");
  return typeof candidate === "string" && SAFE_REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : "absent";
}

function parseRetryAfterMs(raw, maxRetryAfterMs) {
  if (raw === null) return 1_000;
  let milliseconds;
  if (/^\d+$/.test(raw.trim())) {
    milliseconds = Number(raw.trim()) * 1_000;
  } else {
    const timestamp = Date.parse(raw);
    milliseconds = Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : NaN;
  }
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > maxRetryAfterMs
  ) {
    throw new VercelEnvironmentSyncError(
      "rate_limit_retry_after_outside_bound",
      { status: 429, providerCode: "unclassified", requestId: "absent" },
    );
  }
  return milliseconds;
}

function parseRateLimitDelayMs(headers, maxRetryAfterMs) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) return parseRetryAfterMs(retryAfter, maxRetryAfterMs);
  const reset = headers.get("x-ratelimit-reset");
  if (reset !== null && /^\d+$/.test(reset.trim())) {
    const resetMilliseconds = Number(reset.trim()) * 1_000;
    const milliseconds = Math.max(0, resetMilliseconds - Date.now());
    if (
      !Number.isSafeInteger(resetMilliseconds) ||
      !Number.isSafeInteger(milliseconds) ||
      milliseconds > maxRetryAfterMs
    ) {
      throw new VercelEnvironmentSyncError(
        "rate_limit_retry_after_outside_bound",
        { status: 429, providerCode: "unclassified", requestId: "absent" },
      );
    }
    return milliseconds;
  }
  return 1_000;
}

function normalizeTarget(value) {
  const target = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(target.filter((entry) => typeof entry === "string"))].sort();
}

function normalizeRecord(raw) {
  const key = raw?.key ?? raw?.name;
  const id = raw?.id;
  if (!ENVIRONMENT_KEY_PATTERN.test(String(key ?? ""))) {
    throw new Error("Vercel returned an invalid environment key");
  }
  if (!ENVIRONMENT_ID_PATTERN.test(String(id ?? ""))) {
    throw new Error(`Vercel environment ${key} has an invalid provider id`);
  }
  const decrypted = raw?.decrypted === true;
  const value = decrypted && typeof raw?.value === "string" ? raw.value : undefined;
  return {
    id: String(id),
    key: String(key),
    type: raw?.type,
    target: normalizeTarget(raw?.target),
    gitBranch: raw?.gitBranch ?? null,
    customEnvironmentIds: Array.isArray(raw?.customEnvironmentIds)
      ? [...new Set(raw.customEnvironmentIds)].sort()
      : [],
    decrypted,
    value,
  };
}

function recordsFromPayload(payload) {
  const records = Array.isArray(payload)
    ? payload
    : payload?.envs ?? payload?.environmentVariables ?? payload?.variables;
  if (!Array.isArray(records)) {
    throw new Error("Vercel did not return a structured environment inventory");
  }
  return records.map(normalizeRecord);
}

function expectedTypeFor(key, sensitiveKeys) {
  return sensitiveKeys.has(key) ? "sensitive" : "encrypted";
}

function exactStructure(record, expectedType) {
  return (
    record.type === expectedType &&
    JSON.stringify(record.target) === JSON.stringify(EXPECTED_TARGET) &&
    record.gitBranch === EXPECTED_BRANCH_SCOPE &&
    record.customEnvironmentIds.length === 0
  );
}

function structuralDriftCategories(record, expectedType) {
  const categories = [];
  if (record.type !== expectedType) categories.push("type");
  if (JSON.stringify(record.target) !== JSON.stringify(EXPECTED_TARGET)) {
    categories.push("target");
  }
  if (record.gitBranch !== EXPECTED_BRANCH_SCOPE) categories.push("branch_scope");
  if (record.customEnvironmentIds.length !== 0) {
    categories.push("custom_environment_scope");
  }
  return categories;
}

function safeRequestDiagnostic(response) {
  return Object.freeze({
    status: response.status,
    providerCode: normalizedProviderCode(response.payload),
    requestId: normalizedRequestId(response.headers),
    retryAfter: response.headers.get("retry-after") ?? null,
  });
}

export class VercelEnvironmentSyncError extends Error {
  constructor(category, diagnostic = {}) {
    const status = Number.isInteger(diagnostic.status) ? diagnostic.status : 0;
    const code = SAFE_PROVIDER_CODE_PATTERN.test(diagnostic.providerCode ?? "")
      ? diagnostic.providerCode
      : "unclassified";
    const requestId = SAFE_REQUEST_ID_PATTERN.test(diagnostic.requestId ?? "")
      ? diagnostic.requestId
      : "absent";
    super(
      `Vercel environment synchronization failed: category=${category} status=${status} code=${code} request_id=${requestId}`,
    );
    this.name = "VercelEnvironmentSyncError";
    this.category = category;
    this.status = status;
    this.providerCode = code;
    this.requestId = requestId;
  }
}

function validateInputs({
  projectId,
  organizationId,
  token,
  expectedProjectIdFingerprint,
  expectedOrganizationIdFingerprint,
  environment,
  sensitiveKeys,
  preservedSensitiveNames,
  expectedCount,
  batchSize,
}) {
  if (
    typeof projectId !== "string" ||
    sha256(projectId) !== expectedProjectIdFingerprint ||
    typeof organizationId !== "string" ||
    sha256(organizationId) !== expectedOrganizationIdFingerprint
  ) {
    throw new Error("Vercel environment sync authority is not the exact isolated project");
  }
  if (typeof token !== "string" || token.length < 20) {
    throw new Error("Vercel environment sync requires an in-memory provider token");
  }
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new Error("Expected hosted environment must be an object");
  }
  const names = Object.keys(environment).sort();
  if (
    names.length !== expectedCount ||
    new Set(names).size !== names.length ||
    names.some((name) => !ENVIRONMENT_KEY_PATTERN.test(name))
  ) {
    throw new Error(`Expected hosted environment must contain exactly ${expectedCount} valid keys`);
  }
  for (const name of names) {
    const value = environment[name];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Hosted staging environment input ${name} is missing`);
    }
  }
  if (!(sensitiveKeys instanceof Set) || [...sensitiveKeys].some((key) => !names.includes(key))) {
    throw new Error("Sensitive environment key classification is invalid");
  }
  if (
    !(preservedSensitiveNames instanceof Set) ||
    [...preservedSensitiveNames].some(
      (key) =>
        !ENVIRONMENT_KEY_PATTERN.test(key) ||
        names.includes(key),
    )
  ) {
    throw new Error("Preserved sensitive environment key classification is invalid");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error("Vercel environment write batch size is outside the bounded contract");
  }
  return names;
}

function buildApiUrl(projectId, organizationId, path, query = {}) {
  const url = new URL(
    `https://api.vercel.com${path
      .replace("{projectId}", encodeURIComponent(projectId))}`,
  );
  url.searchParams.set("teamId", organizationId);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function executeRequest({
  fetchImpl,
  token,
  url,
  method,
  body,
  requestTimeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      headers: response.headers,
      payload: await readJsonResponse(response),
    };
  } catch {
    return {
      status: 0,
      headers: new Headers(),
      payload: null,
      transportFailure: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readWithBoundedRetry(context, path, query, counters) {
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    const response = await executeRequest({
      ...context,
      url: buildApiUrl(context.projectId, context.organizationId, path, query),
      method: "GET",
    });
    if (response.status >= 200 && response.status < 300) return response;
    if (response.status === 429) {
      if (attempt === context.maxAttempts) {
        throw new VercelEnvironmentSyncError(
          "rate_limit_retry_exhausted",
          safeRequestDiagnostic(response),
        );
      }
      const delayMs = parseRateLimitDelayMs(response.headers, context.maxRetryAfterMs);
      counters.rateLimitRetryCount += 1;
      await context.delayImpl(delayMs);
      continue;
    }
    if (response.status >= 400 && response.status < 500) {
      throw new VercelEnvironmentSyncError(
        "deterministic_read_4xx",
        safeRequestDiagnostic(response),
      );
    }
    if (attempt === context.maxAttempts) {
      throw new VercelEnvironmentSyncError(
        response.transportFailure ? "transport_read_retry_exhausted" : "provider_read_5xx_retry_exhausted",
        safeRequestDiagnostic(response),
      );
    }
    counters.readRetryCount += 1;
    await context.delayImpl(Math.min(1_000 * attempt, 5_000));
  }
  throw new Error("Unreachable Vercel read retry state");
}

async function readExactDecryptedValue(context, counters, record) {
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    const single = await readWithBoundedRetry(
      context,
      `/v1/projects/{projectId}/env/${encodeURIComponent(record.id)}`,
      { decrypt: "true" },
      counters,
    );
    const raw = single.payload?.env ?? single.payload;
    const value = raw?.value;
    if (raw?.decrypted === true && typeof value === "string") {
      return value;
    }
    if (attempt === context.maxAttempts) {
      throw new VercelEnvironmentSyncError("environment_value_readback_unavailable", {
        status: single.status,
        providerCode: normalizedProviderCode(single.payload),
        requestId: normalizedRequestId(single.headers),
      });
    }
    counters.semanticValueReadRetryCount += 1;
    await context.delayImpl(Math.min(500 * attempt, 2_000));
  }
  throw new Error("Unreachable Vercel decrypted-value read state");
}

async function readExactInventory(
  context,
  counters,
  sensitiveKeys,
  { readableKeys = null } = {},
) {
  if (
    readableKeys !== null &&
    (!(readableKeys instanceof Set) ||
      [...readableKeys].some((key) => !ENVIRONMENT_KEY_PATTERN.test(key)))
  ) {
    throw new Error("Vercel readable-key selection is invalid");
  }
  const response = await readWithBoundedRetry(
    context,
    "/v10/projects/{projectId}/env",
    { decrypt: "true" },
    counters,
  );
  const records = recordsFromPayload(response.payload);
  const byName = new Map();
  for (const record of records) {
    const bucket = byName.get(record.key) ?? [];
    bucket.push(record);
    byName.set(record.key, bucket);
  }
  const duplicateNames = [...byName.entries()]
    .filter(([, entries]) => entries.length !== 1)
    .map(([name]) => name)
    .sort();
  if (duplicateNames.length > 0) {
    throw new Error(`Duplicate Vercel environment keys require owner cleanup: ${duplicateNames.join(", ")}`);
  }
  for (const record of records) {
    if (sensitiveKeys.has(record.key) || record.type === "sensitive") {
      // Vercel sensitive values are intentionally non-readable once created.
      // This also covers a non-secret key whose existing provider type drifted
      // to sensitive: classify the type/value drift without trying to decrypt
      // it, then repair it through the exact-ID write path.
      record.value = undefined;
      continue;
    }
    if (readableKeys !== null && !readableKeys.has(record.key)) {
      record.value = undefined;
      continue;
    }
    if (record.value !== undefined) continue;
    record.value = await readExactDecryptedValue(context, counters, record);
  }
  return { records, byName };
}

function classifyInventory(
  inventory,
  names,
  environment,
  sensitiveKeys,
  preservedSensitiveNames,
) {
  const expectedNameSet = new Set(names);
  const unexpectedNames = inventory.records
    .map((record) => record.key)
    .filter(
      (name) =>
        !expectedNameSet.has(name) &&
        !preservedSensitiveNames.has(name),
    )
    .sort();
  if (unexpectedNames.length > 0) {
    throw new Error(
      `The isolated staging project contains unapproved environment names: ${unexpectedNames.join(", ")}`,
    );
  }
  const states = names.map((key) => {
    const record = inventory.byName.get(key)?.[0] ?? null;
    const expectedType = expectedTypeFor(key, sensitiveKeys);
    if (!record) {
      return { key, status: "missing", record: null, expectedType, drift: ["missing"] };
    }
    const drift = structuralDriftCategories(record, expectedType);
    if (sensitiveKeys.has(key)) {
      drift.push("sensitive_value_unreadable");
    } else if (
      record.type === "sensitive" ||
      record.value === undefined ||
      sha256(record.value) !== sha256(environment[key])
    ) {
      drift.push("value");
    }
    return {
      key,
      status: drift.length === 0 ? "present_exact" : `drifted_${drift.join("+")}`,
      record,
      expectedType,
      drift,
    };
  });
  return { states, unexpectedNames };
}

function assertExactPreservedSensitiveInventory(
  inventory,
  preservedSensitiveNames,
) {
  for (const key of preservedSensitiveNames) {
    const records = inventory.byName.get(key) ?? [];
    if (
      records.length !== 1 ||
      !exactStructure(records[0], "sensitive") ||
      records[0].value !== undefined
    ) {
      throw new Error(
        `The preserved sensitive Vercel environment record ${key} is not exact`,
      );
    }
  }
}

function desiredRecord(key, environment, sensitiveKeys, { patchExisting = false } = {}) {
  const sensitive = sensitiveKeys.has(key);
  return {
    ...(!patchExisting || !sensitive ? { key } : {}),
    value: environment[key],
    type: sensitive ? "sensitive" : "encrypted",
    target: [...EXPECTED_TARGET],
    customEnvironmentIds: [],
  };
}

function chunked(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function exactDesiredState(
  inventory,
  keys,
  environment,
  sensitiveKeys,
  acknowledgedSensitiveKeys,
  preservedSensitiveNames,
) {
  const expected = new Set([...keys, ...preservedSensitiveNames]);
  if (
    inventory.records.length !== expected.size ||
    inventory.records.some((record) => !expected.has(record.key))
  ) {
    return false;
  }
  const managedExact = keys.every((key) => {
    const records = inventory.byName.get(key) ?? [];
    if (records.length !== 1) return false;
    const record = records[0];
    if (!exactStructure(record, expectedTypeFor(key, sensitiveKeys))) return false;
    return sensitiveKeys.has(key)
      ? acknowledgedSensitiveKeys.has(key)
      : sha256(record.value) === sha256(environment[key]);
  });
  if (!managedExact) return false;
  return [...preservedSensitiveNames].every((key) => {
    const records = inventory.byName.get(key) ?? [];
    return (
      records.length === 1 &&
      exactStructure(records[0], "sensitive") &&
      records[0].value === undefined
    );
  });
}

async function writeWithReadback({
  context,
  path,
  query,
  method,
  body,
  committedKeys,
  names,
  environment,
  sensitiveKeys,
  counters,
}) {
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    const response = await executeRequest({
      ...context,
      url: buildApiUrl(context.projectId, context.organizationId, path, query),
      method,
      body,
    });
    if (response.status === 429) {
      if (attempt === context.maxAttempts) {
        throw new VercelEnvironmentSyncError(
          "rate_limit_retry_exhausted",
          safeRequestDiagnostic(response),
        );
      }
      const delayMs = parseRateLimitDelayMs(response.headers, context.maxRetryAfterMs);
      counters.rateLimitRetryCount += 1;
      await context.delayImpl(delayMs);
      continue;
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      !AMBIGUOUS_WRITE_STATUS.has(response.status)
    ) {
      throw new VercelEnvironmentSyncError(
        "deterministic_write_4xx",
        safeRequestDiagnostic(response),
      );
    }
    const ambiguous =
      response.transportFailure ||
      response.status >= 500 ||
      response.status === 0 ||
      AMBIGUOUS_WRITE_STATUS.has(response.status);
    const readableKeys = new Set(
      committedKeys.filter((key) => !sensitiveKeys.has(key)),
    );
    const readback = await readExactInventory(
      context,
      counters,
      sensitiveKeys,
      { readableKeys },
    );
    const providerAcknowledged =
      response.status >= 200 &&
      response.status < 300 &&
      (!Array.isArray(response.payload?.failed) || response.payload.failed.length === 0);
    const committed = committedKeys.every((key) => {
      const records = readback.byName.get(key) ?? [];
      if (records.length !== 1) return false;
      const record = records[0];
      if (!exactStructure(record, expectedTypeFor(key, sensitiveKeys))) return false;
      return sensitiveKeys.has(key)
        ? providerAcknowledged
        : sha256(record.value) === sha256(environment[key]);
    });
    if (committed) {
      if (providerAcknowledged) {
        for (const key of committedKeys) {
          if (sensitiveKeys.has(key)) context.acknowledgedSensitiveKeys.add(key);
        }
      }
      if (ambiguous) counters.ambiguousWriteReadbackCommitCount += 1;
      return;
    }
    if (response.status >= 200 && response.status < 300) {
      counters.successfulWriteReadbackRetryCount += 1;
    } else if (ambiguous) {
      counters.ambiguousWriteReadbackRetryCount += 1;
    }
    if (attempt === context.maxAttempts) {
      throw new VercelEnvironmentSyncError(
        ambiguous ? "ambiguous_write_not_committed" : "successful_write_failed_readback",
        safeRequestDiagnostic(response),
      );
    }
    await context.delayImpl(Math.min(500 * attempt, 2_000));
  }
  throw new Error("Unreachable Vercel write retry state");
}

async function deleteWithReadback({
  context,
  record,
  sensitiveKeys,
  counters,
}) {
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    const response = await executeRequest({
      ...context,
      url: buildApiUrl(
        context.projectId,
        context.organizationId,
        `/v9/projects/{projectId}/env/${encodeURIComponent(record.id)}`,
      ),
      method: "DELETE",
      body: undefined,
    });
    if (response.status === 429) {
      if (attempt === context.maxAttempts) {
        throw new VercelEnvironmentSyncError(
          "rate_limit_retry_exhausted",
          safeRequestDiagnostic(response),
        );
      }
      const delayMs = parseRateLimitDelayMs(
        response.headers,
        context.maxRetryAfterMs,
      );
      counters.rateLimitRetryCount += 1;
      await context.delayImpl(delayMs);
      continue;
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      !AMBIGUOUS_WRITE_STATUS.has(response.status)
    ) {
      throw new VercelEnvironmentSyncError(
        "deterministic_write_4xx",
        safeRequestDiagnostic(response),
      );
    }
    const ambiguous =
      response.transportFailure ||
      response.status >= 500 ||
      response.status === 0 ||
      AMBIGUOUS_WRITE_STATUS.has(response.status);
    const readback = await readExactInventory(
      context,
      counters,
      sensitiveKeys,
      { readableKeys: new Set() },
    );
    if (!readback.byName.has(record.key)) {
      if (ambiguous) counters.ambiguousWriteReadbackCommitCount += 1;
      return;
    }
    if (response.status >= 200 && response.status < 300) {
      counters.successfulWriteReadbackRetryCount += 1;
    } else if (ambiguous) {
      counters.ambiguousWriteReadbackRetryCount += 1;
    }
    if (attempt === context.maxAttempts) {
      throw new VercelEnvironmentSyncError(
        ambiguous
          ? "ambiguous_write_not_committed"
          : "successful_write_failed_readback",
        safeRequestDiagnostic(response),
      );
    }
    await context.delayImpl(Math.min(500 * attempt, 2_000));
  }
  throw new Error("Unreachable Vercel delete retry state");
}

export async function synchronizeExactVercelEnvironment({
  projectId,
  organizationId,
  token,
  expectedProjectIdFingerprint,
  expectedOrganizationIdFingerprint,
  environment,
  sensitiveKeys,
  preservedSensitiveNames = new Set(),
  expectedCount,
  providerSensitiveNames = [],
  fetchImpl = fetch,
  delayImpl = async (milliseconds) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  },
  batchSize = DEFAULT_BATCH_SIZE,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxRetryAfterMs = DEFAULT_MAX_RETRY_AFTER_MS,
}) {
  const names = validateInputs({
    projectId,
    organizationId,
    token,
    expectedProjectIdFingerprint,
    expectedOrganizationIdFingerprint,
    environment,
    sensitiveKeys,
    preservedSensitiveNames,
    expectedCount,
    batchSize,
  });
  if (
    !Array.isArray(providerSensitiveNames) ||
    providerSensitiveNames.some((key) => !ENVIRONMENT_KEY_PATTERN.test(key)) ||
    [...preservedSensitiveNames].some(
      (key) => !providerSensitiveNames.includes(key),
    )
  ) {
    throw new Error(
      "Preserved sensitive names must be exact provider credential names",
    );
  }
  if (
    typeof fetchImpl !== "function" ||
    typeof delayImpl !== "function" ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 6 ||
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1_000 ||
    requestTimeoutMs > 60_000 ||
    !Number.isSafeInteger(maxRetryAfterMs) ||
    maxRetryAfterMs < 0 ||
    maxRetryAfterMs > 60_000
  ) {
    throw new Error("Vercel environment synchronization bounds are invalid");
  }
  const counters = {
    rateLimitRetryCount: 0,
    readRetryCount: 0,
    semanticValueReadRetryCount: 0,
    ambiguousWriteReadbackCommitCount: 0,
    ambiguousWriteReadbackRetryCount: 0,
    successfulWriteReadbackRetryCount: 0,
  };
  const context = {
    projectId,
    organizationId,
    token,
    fetchImpl,
    delayImpl,
    maxAttempts,
    requestTimeoutMs,
    maxRetryAfterMs,
    acknowledgedSensitiveKeys: new Set(),
  };
  const initialInventory = await readExactInventory(context, counters, sensitiveKeys);
  assertExactPreservedSensitiveInventory(
    initialInventory,
    preservedSensitiveNames,
  );
  const initial = classifyInventory(
    initialInventory,
    names,
    environment,
    sensitiveKeys,
    preservedSensitiveNames,
  );
  const missing = initial.states.filter((state) => state.status === "missing");
  const recreateSensitiveTypeDrift = initial.states.filter(
    (state) =>
      state.record?.type === "sensitive" &&
      expectedTypeFor(state.key, sensitiveKeys) === "encrypted",
  );
  const recreateSensitiveTypeDriftKeys = new Set(
    recreateSensitiveTypeDrift.map((state) => state.key),
  );
  const patchExisting = initial.states.filter(
    (state) =>
      state.record &&
      !recreateSensitiveTypeDriftKeys.has(state.key) &&
      state.drift.some((category) =>
        category !== "value" || category === "sensitive_value_unreadable"),
  );
  const valueOnly = initial.states.filter(
    (state) => state.record && state.drift.length === 1 && state.drift[0] === "value",
  );

  for (const state of recreateSensitiveTypeDrift) {
    await deleteWithReadback({
      context,
      record: state.record,
      sensitiveKeys,
      counters,
    });
    await writeWithReadback({
      context,
      path: "/v10/projects/{projectId}/env",
      query: { upsert: "true" },
      method: "POST",
      body: [desiredRecord(state.key, environment, sensitiveKeys)],
      committedKeys: [state.key],
      names,
      environment,
      sensitiveKeys,
      counters,
    });
  }

  for (const state of patchExisting) {
    await writeWithReadback({
      context,
      path: `/v9/projects/{projectId}/env/${encodeURIComponent(state.record.id)}`,
      query: {},
      method: "PATCH",
      body: desiredRecord(state.key, environment, sensitiveKeys, { patchExisting: true }),
      committedKeys: [state.key],
      names,
      environment,
      sensitiveKeys,
      counters,
    });
  }

  const upsertStates = [...missing, ...valueOnly].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const upsertBatches = chunked(upsertStates, batchSize);
  for (const batch of upsertBatches) {
    const keys = batch.map((state) => state.key);
    await writeWithReadback({
      context,
      path: "/v10/projects/{projectId}/env",
      query: { upsert: "true" },
      method: "POST",
      body: keys.map((key) => desiredRecord(key, environment, sensitiveKeys)),
      committedKeys: keys,
      names,
      environment,
      sensitiveKeys,
      counters,
    });
  }

  const finalInventory = await readExactInventory(context, counters, sensitiveKeys);
  if (!exactDesiredState(
    finalInventory,
    names,
    environment,
    sensitiveKeys,
    context.acknowledgedSensitiveKeys,
    preservedSensitiveNames,
  )) {
    throw new Error("The isolated Vercel staging environment is not exact after synchronization");
  }
  const finalClassification = classifyInventory(
    finalInventory,
    names,
    environment,
    sensitiveKeys,
    preservedSensitiveNames,
  );
  assertExactPreservedSensitiveInventory(
    finalInventory,
    preservedSensitiveNames,
  );
  const initialByKey = new Map(initial.states.map((state) => [state.key, state.status]));
  return Object.freeze({
    status: "PASS",
    synchronizationMode: "bounded_idempotent_missing_or_drifted_only",
    target: "production_slot_of_isolated_staging_project",
    environmentVariableCount: names.length,
    environmentNameSetSha256: sha256(names.join("\n")),
    initialPresentExactCount: initial.states.filter((state) => state.status === "present_exact").length,
    initialMissingCount: missing.length,
    initialDriftedCount: initial.states.length - missing.length - initial.states.filter((state) => state.status === "present_exact").length,
    unchangedCount: initial.states.filter((state) => state.status === "present_exact").length,
    patchedRecordCount:
      patchExisting.length + recreateSensitiveTypeDrift.length,
    recreatedSensitiveTypeDriftCount: recreateSensitiveTypeDrift.length,
    sensitiveValueRewriteCount: initial.states.filter(
      (state) => state.drift.includes("sensitive_value_unreadable"),
    ).length,
    upsertedRecordCount: upsertStates.length,
    upsertBatchCount: upsertBatches.length,
    ...counters,
    finalExactStructureCount: names.filter((key) => {
      const record = finalInventory.byName.get(key)?.[0];
      return record && exactStructure(record, expectedTypeFor(key, sensitiveKeys));
    }).length,
    finalReadableValueDigestMatchCount: names.filter((key) =>
      !sensitiveKeys.has(key) &&
      sha256(finalInventory.byName.get(key)?.[0]?.value) === sha256(environment[key]),
    ).length,
    finalSensitiveValueWriteAcknowledgementCount:
      context.acknowledgedSensitiveKeys.size,
    finalExpectedValueDispositionCount: names.length,
    finalUnexpectedEnvironmentCount: finalClassification.unexpectedNames.length,
    preservedSensitiveEnvironmentCount: preservedSensitiveNames.size,
    preservedSensitiveEnvironmentNames: Object.freeze(
      [...preservedSensitiveNames].sort(),
    ),
    preservedSensitiveValuesRead: false,
    preservedSensitiveValuesWritten: false,
    exactTarget: "production",
    exactTypePortfolioProven: true,
    exactBranchScope: null,
    exactCustomEnvironmentScopeCount: 0,
    secretValuesPersistedToEvidence: false,
    valueDigestsPersistedToEvidence: false,
    providerCredentialNamesPresent: finalInventory.records.some((record) =>
      providerSensitiveNames.includes(record.key)
    ),
    variables: Object.freeze(names.map((key) => Object.freeze({
      key,
      target: "production",
      type: expectedTypeFor(key, sensitiveKeys),
      branchScope: null,
      initialStatus: initialByKey.get(key),
      finalStatus: sensitiveKeys.has(key)
        ? "present_exact_metadata_value_write_acknowledged"
        : "present_exact",
    }))),
  });
}
