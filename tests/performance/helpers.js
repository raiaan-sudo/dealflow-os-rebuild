import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

export const leadSubmitDuration = new Trend("lead_submit_duration", true);
export const leadSuccessRate = new Rate("lead_success_rate");
export const dashboardLoadDuration = new Trend("dashboard_load_duration", true);
export const authSuccessRate = new Rate("auth_success_rate");
export const smsWebhookSuccessRate = new Rate("sms_webhook_success_rate");
export const fullFlowSuccessRate = new Rate("full_flow_success_rate");
export const requestCounter = new Counter("dealflow_requests");

export function getBaseUrl() {
  const baseUrl = __ENV.BASE_URL;

  if (!baseUrl) {
    throw new Error("BASE_URL is required.");
  }

  if (__ENV.STRESS_TEST_MODE !== "true") {
    throw new Error("STRESS_TEST_MODE=true is required.");
  }

  const productionLike =
    /dealflow-os-rebuild\.vercel\.app|agentdealflow\.io|dealflow/i.test(baseUrl) &&
    !/staging|preview|localhost|127\.0\.0\.1/i.test(baseUrl);

  if (productionLike && __ENV.STRESS_TEST_ALLOW_PROD !== "true") {
    throw new Error("Refusing production-looking BASE_URL without STRESS_TEST_ALLOW_PROD=true.");
  }

  return baseUrl.replace(/\/$/, "");
}

export function requireLeadWriteSafety() {
  if (__ENV.STRESS_TEST_ALLOW_WRITES !== "true") {
    throw new Error("Lead-write tests require STRESS_TEST_ALLOW_WRITES=true.");
  }

  if ((__ENV.SMS_MOCK_MODE ?? __ENV.TEST_SMS_MODE) !== "true" && __ENV.TEST_SMS_MODE !== "mock") {
    throw new Error("Lead-write tests require SMS_MOCK_MODE=true or TEST_SMS_MODE=mock.");
  }

  if (!__ENV.TEST_CAMPAIGN_ID && !__ENV.TEST_FUNNEL_ID) {
    throw new Error("Lead-write tests require TEST_CAMPAIGN_ID or TEST_FUNNEL_ID.");
  }
}

export function uniqueId(prefix = "k6") {
  return `${prefix}_${Date.now()}_${__VU}_${__ITER}_${Math.floor(Math.random() * 1e9)}`;
}

export function fakeLeadPayload(overrides = {}) {
  const id = uniqueId("lead");
  const last4 = String((1000 + ((__VU * 97 + __ITER) % 8999))).padStart(4, "0");

  return {
    name: `Stress Lead ${id}`,
    email: `stress_${id}@example.com`,
    phone: `(555) 123-${last4}`,
    campaignId: __ENV.TEST_CAMPAIGN_ID || undefined,
    funnel_id: __ENV.TEST_FUNNEL_ID || undefined,
    campaign_name: "Stress Test Campaign",
    lead_type: "buyer",
    source: "stress_test",
    stage: "generated",
    sms_consent: true,
    form_started_at: Date.now() - 1500,
    utm_source: "k6",
    utm_medium: "stress_test",
    utm_campaign: "pre_launch",
    landing_page_url: `${getBaseUrl()}/stress-test`,
    ...overrides,
  };
}

export function submitLead(extraPayload = {}) {
  const baseUrl = getBaseUrl();
  const payload = fakeLeadPayload(extraPayload);
  const started = Date.now();
  const response = http.post(`${baseUrl}/api/lead-capture`, JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "X-Stress-Test": "true",
    },
    tags: { endpoint: "lead-capture", flow: "lead", test_type: __ENV.K6_TEST_TYPE || "unknown" },
  });
  const duration = Date.now() - started;
  const ok = check(response, {
    "lead capture status is 2xx": (res) => res.status >= 200 && res.status < 300,
    "lead capture is not server error": (res) => res.status < 500,
  });

  requestCounter.add(1);
  leadSubmitDuration.add(duration);
  leadSuccessRate.add(ok);

  return { response, ok, duration };
}

export function getRoute(path, metric = dashboardLoadDuration, tags = {}) {
  const baseUrl = getBaseUrl();
  const started = Date.now();
  const response = http.get(`${baseUrl}${path}`, {
    tags: { endpoint: path, flow: "route", test_type: __ENV.K6_TEST_TYPE || "unknown", ...tags },
  });
  metric.add(Date.now() - started);
  requestCounter.add(1);
  return response;
}

export function think(min = 0.5, max = 2) {
  sleep(min + Math.random() * (max - min));
}

