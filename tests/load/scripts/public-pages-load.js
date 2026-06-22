import { check } from "k6";
import { getRoute, think } from "./helpers.js";

const vus = Number(__ENV.VUS || 25);
const duration = __ENV.DURATION || "10m";

export const options = {
  scenarios: {
    public_pages: { executor: "constant-vus", vus, duration }
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    route_duration: ["p(95)<1500", "p(99)<3000"],
    route_success_rate: ["rate>0.995"]
  }
};

const routes = ["/", "/login", "/signup", "/privacy", "/terms"];

export default function run() {
  const path = routes[__ITER % routes.length];
  const response = getRoute(path, { flow: "public_pages" });
  check(response, {
    "public route expected status": (res) => [200, 301, 302, 307].includes(res.status)
  });
  think();
}
