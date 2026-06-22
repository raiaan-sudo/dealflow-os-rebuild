import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

export const routeSuccessRate = new Rate("route_success_rate");
export const rateLimitSafeRate = new Rate("rate_limit_safe_rate");
export const routeDuration = new Trend("route_duration", true);

export function getBaseUrl() {
  const baseUrl = __ENV.BASE_URL;
  if (!baseUrl) throw new Error("BASE_URL is required.");
  if (__ENV.STRESS_TEST_MODE !== "true") throw new Error("STRESS_TEST_MODE=true is required.");
  const productionLike = /agentdealflow\.io|dealflow-os-rebuild\.vercel\.app/i.test(baseUrl) && !/staging|preview|localhost|127\.0\.0\.1/i.test(baseUrl);
  if (productionLike && __ENV.STRESS_TEST_ALLOW_PROD !== "true") {
    throw new Error("Refusing production-like BASE_URL without STRESS_TEST_ALLOW_PROD=true.");
  }
  return baseUrl.replace(/\/$/, "");
}

export function requireWriteSafety() {
  if (__ENV.STRESS_TEST_ALLOW_WRITES !== "true") throw new Error("Write tests require STRESS_TEST_ALLOW_WRITES=true.");
  if ((__ENV.SMS_MOCK_MODE ?? __ENV.TEST_SMS_MODE) !== "true" && __ENV.TEST_SMS_MODE !== "mock") {
    throw new Error("Write tests require SMS_MOCK_MODE=true or TEST_SMS_MODE=mock.");
  }
}

export function getRoute(path, tags = {}) {
  const response = http.get(`${getBaseUrl()}${path}`, {
    tags: { endpoint: path, ...tags },
  });
  routeDuration.add(response.timings.duration);
  const ok = check(response, {
    "route has no 5xx": (res) => res.status < 500,
  });
  routeSuccessRate.add(ok);
  return response;
}

export function invalidPost(path, body = {}) {
  const response = http.post(`${getBaseUrl()}${path}`, JSON.stringify(body), {
    headers: { "content-type": "application/json", "x-performance-audit": "true" },
    tags: { endpoint: path, method: "POST" },
  });
  const ok = check(response, {
    "invalid post rejected safely": (res) => [400, 401, 403, 422, 429].includes(res.status),
    "invalid post no 5xx": (res) => res.status < 500,
  });
  rateLimitSafeRate.add(ok);
  return response;
}

export function think(min = Number(__ENV.THINK_MIN_SECONDS || 0.25), max = Number(__ENV.THINK_MAX_SECONDS || 1.5)) {
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 0.25;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin;
  sleep(safeMin + Math.random() * (safeMax - safeMin));
}
