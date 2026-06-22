import { check } from "k6";
import { getRoute, invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    auth_smoke: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DURATION || "5m" }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    route_duration: ["p(95)<1500"],
    rate_limit_safe_rate: ["rate>0.99"]
  }
};

export default function run() {
  const login = getRoute("/login", { flow: "auth" });
  check(login, { "login loads": (res) => [200, 302, 307].includes(res.status) });
  invalidPost("/api/auth/login", { email: "invalid@example.com", password: "wrong" });
  think();
}
