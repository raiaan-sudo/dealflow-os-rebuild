import { invalidPost, think } from "./helpers.js";

export const options = {
  scenarios: {
    invalid_webhook_pressure: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DURATION || "5m" }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    rate_limit_safe_rate: ["rate>0.99"]
  }
};

export default function run() {
  invalidPost(__ITER % 2 === 0 ? "/api/stripe/webhook" : "/api/webhooks/twilio/status", { invalid: true, performanceAudit: true });
  think();
}
