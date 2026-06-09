import { check } from "k6";
import { getRoute, think } from "./helpers.js";

export const options = {
  scenarios: {
    public_pages_ramped: {
      executor: "ramping-vus",
      stages: [
        { duration: __ENV.RAMP_UP_DURATION || "5m", target: Number(__ENV.TARGET_VUS || 500) },
        { duration: __ENV.HOLD_DURATION || "10m", target: Number(__ENV.TARGET_VUS || 500) },
        { duration: __ENV.RAMP_DOWN_DURATION || "2m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    route_duration: ["p(95)<1500", "p(99)<5000"],
    route_success_rate: ["rate>0.995"],
  },
};

const routes = [
  { path: "/", weight: 4 },
  { path: "/login", weight: 2 },
  { path: "/login?mode=sign-up", weight: 2 },
  { path: "/privacy", weight: 1 },
  { path: "/terms", weight: 1 },
];

const weightedRoutes = routes.flatMap((route) => Array.from({ length: route.weight }, () => route.path));

export default function run() {
  const path = weightedRoutes[(__VU + __ITER) % weightedRoutes.length];
  const response = getRoute(path, { flow: "public_pages_ramped_certification" });
  check(response, {
    "public route expected status": (res) => [200, 301, 302, 307].includes(res.status),
  });
  think(2, 8);
}
