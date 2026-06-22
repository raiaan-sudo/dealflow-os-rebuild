import { check } from "k6";
import { getRoute, invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    creative_job_safe_pressure: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DURATION || "5m" }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    route_duration: ["p(95)<2000"],
    rate_limit_safe_rate: ["rate>0.99"]
  }
};

export default function run() {
  const route = getRoute("/build/creatives", { flow: "creative_studio" });
  check(route, { "creative studio protected or loads": (res) => [200, 302, 307, 401].includes(res.status) });
  invalidPost("/api/campaigns/00000000-0000-0000-0000-000000000000/generate-static-ads", { performanceAudit: true });
  think();
}
