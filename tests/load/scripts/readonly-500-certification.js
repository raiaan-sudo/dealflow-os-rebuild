import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { getRoute } from "./helpers.js";

const maxVus = Number(__ENV.VUS || 500);
const rampToHalf = __ENV.RAMP_TO_HALF || "2m";
const rampToFull = __ENV.RAMP_TO_FULL || "3m";
const hold = __ENV.HOLD || "5m";
const rampDown = __ENV.RAMP_DOWN || "1m";
const minThink = Number(__ENV.MIN_THINK_SECONDS || 8);
const maxThink = Number(__ENV.MAX_THINK_SECONDS || 20);

export const routeStatusOk = new Rate("readonly_route_status_ok");
export const routeDuration = new Trend("readonly_route_duration", true);
export const unexpectedStatuses = new Counter("readonly_unexpected_statuses");

export const options = {
  scenarios: {
    realistic_readonly_500: {
      executor: "ramping-vus",
      stages: [
        { duration: rampToHalf, target: Math.ceil(maxVus / 2) },
        { duration: rampToFull, target: maxVus },
        { duration: hold, target: maxVus },
        { duration: rampDown, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    readonly_route_status_ok: ["rate>0.99"],
    readonly_route_duration: ["p(95)<2000", "p(99)<4000"],
  },
};

const routeMix = [
  { path: "/", weight: 30, expected: [200, 301, 302, 307, 308] },
  { path: "/login", weight: 20, expected: [200, 301, 302, 307, 308] },
  { path: "/signup", weight: 15, expected: [200, 301, 302, 307, 308] },
  { path: "/privacy", weight: 10, expected: [200] },
  { path: "/terms", weight: 10, expected: [200] },
  { path: "/data-deletion", weight: 5, expected: [200] },
  { path: "/robots.txt", weight: 5, expected: [200] },
  { path: "/sitemap.xml", weight: 5, expected: [200] },
];

const weightedRoutes = routeMix.flatMap((route) => Array.from({ length: route.weight }, () => route));

export default function runReadonlyCertification() {
  const route = weightedRoutes[Math.floor(Math.random() * weightedRoutes.length)];
  const response = getRoute(route.path, {
    flow: "readonly_500_certification",
    readonly: "true",
  });
  routeDuration.add(response.timings.duration);
  const ok = route.expected.includes(response.status);
  routeStatusOk.add(ok);
  if (!ok) unexpectedStatuses.add(1);
  check(response, {
    "expected read-only status": () => ok,
    "no server error": (res) => res.status < 500,
  });
  sleep(minThink + Math.random() * (maxThink - minThink));
}
