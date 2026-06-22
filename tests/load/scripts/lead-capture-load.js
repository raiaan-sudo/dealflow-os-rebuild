import { invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    invalid_lead_capture_pressure: { executor: "constant-vus", vus: Number(__ENV.VUS || 25), duration: __ENV.DURATION || "10m" }
  },
  thresholds: {
    rate_limit_safe_rate: ["rate>0.99"],
    http_req_duration: ["p(95)<750", "p(99)<1500"]
  }
};

export default function run() {
  invalidPost("/api/lead-capture", { performanceAudit: true, invalid: true });
  think(0.1, 0.5);
}
