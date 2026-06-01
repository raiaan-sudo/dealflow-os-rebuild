import { check } from "k6";
import { getRoute, invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    billing_safe_reads: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DURATION || "5m" }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    rate_limit_safe_rate: ["rate>0.99"]
  }
};

export default function run() {
  const paywall = getRoute("/paywall", { flow: "billing_safe" });
  check(paywall, { "paywall protected or loads": (res) => [200, 302, 307, 401].includes(res.status) });
  invalidPost("/api/stripe/webhook", { invalid: true });
  think();
}
