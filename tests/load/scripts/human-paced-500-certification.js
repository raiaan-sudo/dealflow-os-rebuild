import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";
import { getRoute, invalidPost, think } from "./helpers.js";

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

const peakVus = Number(__ENV.VUS || 500);
const rampUp = __ENV.RAMP_UP || "8m";
const hold = __ENV.HOLD || "10m";
const rampDown = __ENV.RAMP_DOWN || "3m";
const protectedStart = __ENV.PROTECTED_START || "1m";
const invalidStart = __ENV.INVALID_START || "2m";
const publicVus = Math.max(1, Math.floor(peakVus * 0.84));
const partnerVus = Math.max(1, Math.floor(peakVus * 0.14));

export const routeSuccessRate = new Rate("cert_route_success_rate");
export const certRouteDuration = new Trend("cert_route_duration", true);

export const options = {
  scenarios: {
    public_browsing: {
      executor: "ramping-vus",
      stages: [
        { duration: rampUp, target: publicVus },
        { duration: hold, target: publicVus },
        { duration: rampDown, target: 0 },
      ],
      exec: "publicBrowsing",
      gracefulRampDown: "30s",
    },
    partner_entry: {
      executor: "ramping-vus",
      stages: [
        { duration: rampUp, target: Math.max(20, Math.floor(peakVus * 0.15)) },
        { duration: hold, target: partnerVus },
        { duration: rampDown, target: 0 },
      ],
      exec: "partnerEntry",
      gracefulRampDown: "30s",
    },
    protected_boundaries: {
      executor: "constant-arrival-rate",
      rate: 6,
      timeUnit: "1m",
      duration: hold,
      preAllocatedVUs: 4,
      maxVUs: 10,
      startTime: protectedStart,
      exec: "protectedBoundaries",
    },
    invalid_api_rejections: {
      executor: "constant-arrival-rate",
      rate: 3,
      timeUnit: "1m",
      duration: hold,
      preAllocatedVUs: 3,
      maxVUs: 8,
      startTime: invalidStart,
      exec: "invalidApiRejections",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    cert_route_success_rate: ["rate>=0.995"],
    cert_route_duration: ["p(95)<1500", "p(99)<3000"],
  },
};

const publicRoutes = ["/", "/login", "/signup", "/privacy", "/terms"];
const partnerRoutes = ["/egenmedia", "/p/egenmedia/start"];
const protectedRoutes = ["/dashboard", "/build", "/preview", "/launch", "/admin/control-room"];

function recordExpected(response, expectedStatuses, label) {
  certRouteDuration.add(response.timings.duration);
  const ok = check(response, {
    [`${label} expected status`]: (res) => expectedStatuses.includes(res.status),
    [`${label} no 5xx`]: (res) => res.status < 500,
  });
  routeSuccessRate.add(ok);
}

export function publicBrowsing() {
  const route = publicRoutes[(__VU + __ITER) % publicRoutes.length];
  const response = getRoute(route, { flow: "human_public_browsing" });
  recordExpected(response, [200, 301, 302, 307, 308], `public ${route}`);
  think(5, 18);
}

export function partnerEntry() {
  const route = partnerRoutes[(__VU + __ITER) % partnerRoutes.length];
  const response = getRoute(route, { flow: "human_partner_entry" });
  recordExpected(response, [200, 301, 302, 307, 308], `partner ${route}`);
  think(8, 24);
}

export function protectedBoundaries() {
  const route = protectedRoutes[__ITER % protectedRoutes.length];
  const response = getRoute(route, { flow: "protected_boundary" });
  recordExpected(response, [200, 301, 302, 303, 307, 308, 401, 403], `protected ${route}`);
  sleep(1);
}

export function invalidApiRejections() {
  const paths = ["/api/lead-capture", "/api/stripe/webhook", "/api/webhooks/twilio/status"];
  const path = paths[__ITER % paths.length];
  const response = invalidPost(path, { invalid: true, audit: "human-paced-500-certification" });
  recordExpected(response, [400, 401, 403, 422, 429], `invalid ${path}`);
  sleep(1);
}
