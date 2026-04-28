#!/usr/bin/env node

const scenario = process.argv[2] ?? "routes";
const baseUrl = process.env.LOAD_BASE_URL;
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? "20", 10);
const requests = Number.parseInt(process.env.LOAD_REQUESTS ?? "100", 10);
const maxErrorRate = Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE ?? "0.01");
const maxP95Ms = Number.parseInt(
  process.env.LOAD_MAX_P95_MS ?? (scenario === "lead-capture" ? "2500" : "1500"),
  10,
);
const maxWriteRequests = Number.parseInt(process.env.LOAD_MAX_WRITE_REQUESTS ?? "50", 10);

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

if (!baseUrl) {
  fail("LOAD_BASE_URL is required. Use an explicit production or staging URL for load tests.");
}

async function timedRequest(path, init) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    await response.arrayBuffer();
    return {
      ok: response.status < 500,
      status: response.status,
      ms: performance.now() - started,
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
  if (process.env.LOAD_TEST_ALLOW_WRITES !== "true") {
    fail("Refusing to write leads. Set LOAD_TEST_ALLOW_WRITES=true with LOAD_TEST_CAMPAIGN_ID to run this scenario.");
  }

  if (requests > maxWriteRequests) {
    fail(`Refusing ${requests} lead writes. Set LOAD_MAX_WRITE_REQUESTS to an explicit higher cap for this QA campaign.`);
  }

  const campaignId = process.env.LOAD_TEST_CAMPAIGN_ID;
  if (!campaignId) {
    fail("LOAD_TEST_CAMPAIGN_ID is required for lead-capture load tests.");
  }

  const items = Array.from({ length: requests }, (_, idx) => idx);
  const results = await runPool(items, (idx) =>
    timedRequest("/api/lead-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Load Test ${idx}`,
        campaignId,
        email: `load+${Date.now()}-${idx}@example.com`,
        notes: "Automated load-test lead.",
      }),
    }),
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
