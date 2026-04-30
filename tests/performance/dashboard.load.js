import { check } from "k6";
import { getRoute, think } from "./helpers.js";

export const options = {
  scenarios: {
    dashboard_reads: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 25),
      duration: __ENV.DURATION || "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    dashboard_load_duration: ["p(95)<2000", "p(99)<4000"],
  },
};

export default function runScenario() {
  const response = getRoute("/dashboard", undefined, { flow: "dashboard" });
  check(response, {
    "dashboard is protected or loads": (res) => [200, 302, 307, 401].includes(res.status),
    "dashboard no 5xx": (res) => res.status < 500,
  });
  think();
}

