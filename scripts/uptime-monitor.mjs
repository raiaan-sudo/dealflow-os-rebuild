const baseUrl = process.env.UPTIME_BASE_URL || "https://www.agentdealflow.io";
const funnelSlug = process.env.UPTIME_FUNNEL_SLUG || "codex-fresh-realty-austin-tx-029b02a7";

const checks = [
  {
    name: "homepage",
    url: `${baseUrl}/`,
    method: "GET",
    expect: (response) => response.status >= 200 && response.status < 400,
  },
  {
    name: "login",
    url: `${baseUrl}/login`,
    method: "GET",
    expect: (response) => response.status >= 200 && response.status < 400,
  },
  {
    name: "public-funnel",
    url: `${baseUrl}/f/${funnelSlug}`,
    method: "GET",
    expect: (response) => response.status === 200,
  },
  {
    name: "lead-capture-endpoint",
    url: `${baseUrl}/api/lead-capture`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    expect: (response) => response.status >= 400 && response.status < 500,
  },
  {
    name: "twilio-status-callback",
    url: `${baseUrl}/api/webhooks/twilio/status`,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ MessageSid: "SM_UPTIME_PROBE", MessageStatus: "delivered" }).toString(),
    expect: (response) => response.status === 401 || response.status === 429,
  },
];

const timeoutMs = Number.parseInt(process.env.UPTIME_TIMEOUT_MS || "10000", 10);
const failures = [];
const durations = [];

function percentile(values, pct) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

for (const check of checks) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(check.url, {
      method: check.method,
      headers: check.headers,
      body: check.body,
      redirect: "follow",
      signal: controller.signal,
    });
    const ms = Math.round(performance.now() - started);
    durations.push(ms);
    const ok = check.expect(response);
    console.log(JSON.stringify({ check: check.name, ok, status: response.status, ms }));

    if (!ok) {
      failures.push(`${check.name} returned unexpected status ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ check: check.name, ok: false, error: message }));
    failures.push(`${check.name} failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (failures.length > 0) {
  throw new Error(`Uptime monitor failed: ${failures.join("; ")}`);
}

console.log(JSON.stringify({ ok: true, checks: checks.length, p95: percentile(durations, 95) }));
