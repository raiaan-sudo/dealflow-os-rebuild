import { check } from "k6";
import { getRoute, think } from "./helpers.js";

export const options = {
  scenarios: {
    preview_launch_reads: { executor: "constant-vus", vus: Number(__ENV.VUS || 25), duration: __ENV.DURATION || "10m" }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    route_duration: ["p(95)<1500", "p(99)<4000"]
  }
};

const routes = ["/preview", "/launch", "/build/creatives", "/settings"];

export default function run() {
  const response = getRoute(routes[__ITER % routes.length], { flow: "preview_launch" });
  check(response, {
    "app route protected or loads": (res) => [200, 302, 307, 401].includes(res.status)
  });
  think();
}
