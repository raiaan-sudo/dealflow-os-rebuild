import http from "k6/http";
import { check } from "k6";
import { authSuccessRate, getBaseUrl, think } from "./helpers.js";

export const options = {
  scenarios: {
    auth_routes: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 25),
      duration: __ENV.DURATION || "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    auth_success_rate: ["rate>0.99"],
  },
};

export default function runScenario() {
  const response = http.get(`${getBaseUrl()}/login`, {
    tags: { endpoint: "login", flow: "auth", test_type: "load" },
  });
  const ok = check(response, {
    "login route loads": (res) => [200, 302, 307].includes(res.status),
    "login route no 5xx": (res) => res.status < 500,
  });
  authSuccessRate.add(ok);
  think();
}

