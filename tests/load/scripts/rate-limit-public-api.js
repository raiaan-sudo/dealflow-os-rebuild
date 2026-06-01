import { invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    invalid_public_api_burst: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 25),
      timeUnit: "1s",
      duration: __ENV.DURATION || "1m",
      preAllocatedVUs: Number(__ENV.VUS || 50)
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    rate_limit_safe_rate: ["rate>0.99"]
  }
};

export default function run() {
  invalidPost("/api/lead-capture", { invalid: true, rateLimitAudit: true });
  think(0.01, 0.05);
}
