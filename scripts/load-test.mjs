#!/usr/bin/env node

const scenario = process.argv[2] ?? "routes";
const rawBaseUrl = process.env.LOAD_BASE_URL;
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? "20", 10);
const requests = Number.parseInt(process.env.LOAD_REQUESTS ?? "100", 10);
const maxErrorRate = Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE ?? "0.01");
const maxP95Ms = Number.parseInt(
  process.env.LOAD_MAX_P95_MS ?? (scenario === "lead-capture" ? "2500" : "1500"),
  10,
);
const maxWriteRequests = Number.parseInt(process.env.LOAD_MAX_WRITE_REQUESTS ?? "50", 10);
const ZERO_EXTERNAL_EFFECTS_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function percentile(values, pct) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index];
}

if (!rawBaseUrl) {
  fail("LOAD_BASE_URL is required. Load tests are restricted to an explicit loopback URL.");
}

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(rawBaseUrl);
} catch {
  fail("LOAD_BASE_URL must be a valid loopback URL.");
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
if (
  !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
  !loopbackHosts.has(parsedBaseUrl.hostname.toLowerCase()) ||
  parsedBaseUrl.username ||
  parsedBaseUrl.password ||
  (parsedBaseUrl.pathname !== "/" && parsedBaseUrl.pathname !== "") ||
  parsedBaseUrl.search ||
  parsedBaseUrl.hash
) {
  fail("Refusing non-loopback load target. Use http://localhost, http://127.0.0.1, or http://[::1].");
}

const baseUrl = parsedBaseUrl.origin;

async function assertZeroExternalEffects() {
  if (process.env.LOAD_ZERO_EXTERNAL_EFFECTS_ATTESTATION !== ZERO_EXTERNAL_EFFECTS_ATTESTATION) {
    fail("The exact zero-external-effects load attestation is required.");
  }

  const internalSecret = process.env.LOAD_TEST_INTERNAL_SECRET?.trim() ?? "";
  if (internalSecret.length < 32) {
    fail("LOAD_TEST_INTERNAL_SECRET must be configured with at least 32 characters.");
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/internal/zero-external-effects`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${internalSecret}`,
        Accept: "application/json",
      },
    });
  } catch {
    fail("The server-side zero-external-effects proof endpoint was unreachable.");
  }

  const payload = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    payload?.ok !== true ||
    payload?.attestation !== ZERO_EXTERNAL_EFFECTS_ATTESTATION ||
    !Array.isArray(payload?.failedControls) ||
    payload.failedControls.length !== 0
  ) {
    fail("The server did not prove the centralized zero-external-effects contract.");
  }
}

async function timedRequest(path, init, expectations = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    await response.arrayBuffer();
    const attestationMatches = Object.entries(expectations).every(
      ([header, expected]) => response.headers.get(header) === expected,
    );
    return {
      ok: response.status < 500 && attestationMatches,
      status: response.status,
      ms: performance.now() - started,
      attestationMatches,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(items, worker) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => runWorker()),
  );

  return results;
}

function printSummary(results) {
  const latencies = results.map((result) => result.ms);
  const failures = results.filter((result) => !result.ok);
  const errorRate = results.length > 0 ? failures.length / results.length : 0;
  const p95 = Math.round(percentile(latencies, 95));
  const statuses = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify(
    {
      scenario,
      baseUrl,
      requests: results.length,
      concurrency,
      failures: failures.length,
      errorRate,
      thresholds: {
        maxErrorRate,
        maxP95Ms,
      },
      statuses,
      latencyMs: {
        p50: Math.round(percentile(latencies, 50)),
        p95,
        p99: Math.round(percentile(latencies, 99)),
        max: Math.round(Math.max(...latencies)),
      },
    },
    null,
    2,
  ));

  if (errorRate > maxErrorRate) {
    console.error(`Load test failed: error rate ${errorRate.toFixed(4)} exceeded ${maxErrorRate}.`);
    process.exitCode = 1;
  }

  if (p95 > maxP95Ms) {
    console.error(`Load test failed: p95 ${p95}ms exceeded ${maxP95Ms}ms.`);
    process.exitCode = 1;
  }
}

async function runRoutesScenario() {
  await assertZeroExternalEffects();
  const slug = process.env.LOAD_TEST_FUNNEL_SLUG;
  const paths = ["/privacy", "/terms"];

  if (slug) {
    paths.push(`/f/${encodeURIComponent(slug)}`);
  }

  const items = Array.from({ length: requests }, (_, idx) => paths[idx % paths.length]);
  const results = await runPool(items, (path) => timedRequest(path));
  printSummary(results);
}

async function runLeadCaptureScenario() {
  if (process.env.LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE !== "true") {
    fail("Refusing lead-capture load proof. Set LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE=true to use the no-write synthetic endpoint path.");
  }

  if (requests > maxWriteRequests) {
    fail(`Refusing ${requests} synthetic requests. Set LOAD_MAX_WRITE_REQUESTS to an explicit higher cap.`);
  }

  const campaignId = process.env.LOAD_TEST_CAMPAIGN_ID;
  if (!campaignId) {
    fail("LOAD_TEST_CAMPAIGN_ID is required for lead-capture load tests.");
  }

  const loadTestSecret = process.env.LEAD_CAPTURE_LOAD_TEST_SECRET?.trim() ?? "";
  if (loadTestSecret.length < 32) {
    fail("LEAD_CAPTURE_LOAD_TEST_SECRET must be configured with at least 32 characters.");
  }

  const isolatedProjectRef = process.env.LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF?.trim() ?? "";
  if (isolatedProjectRef.length < 4) {
    fail("LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF is required for server-side database isolation attestation.");
  }

  await assertZeroExternalEffects();

  const items = Array.from({ length: requests }, (_, idx) => idx);
  const results = await runPool(items, (idx) =>
    timedRequest(
      "/api/lead-capture",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DealFlow-Load-Test-Secret": loadTestSecret,
        },
        body: JSON.stringify({
          name: `Load Test ${idx}`,
          campaignId,
          email: `load+${Date.now()}-${idx}@example.com`,
          phone: "",
          load_test: true,
        }),
      },
      {
        "x-dealflow-load-test": "synthetic-no-write",
        "x-dealflow-load-test-backend": "isolated-provider-off",
      },
    ),
  );
  printSummary(results);
}

if (scenario === "routes") {
  await runRoutesScenario();
} else if (scenario === "lead-capture") {
  await runLeadCaptureScenario();
} else {
  fail(`Unknown load-test scenario: ${scenario}`);
}
