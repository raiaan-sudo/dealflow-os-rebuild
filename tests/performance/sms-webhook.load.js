import http from "k6/http";
import { check } from "k6";
import { getBaseUrl, smsWebhookSuccessRate, think, uniqueId } from "./helpers.js";

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

export const options = {
  scenarios: {
    unsigned_twilio_noise: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || "5m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<750"],
    sms_webhook_success_rate: ["rate>0.99"],
  },
};

export default function runScenario() {
  const body = {
    MessageSid: `SM${uniqueId("unknown")}`,
    MessageStatus: "delivered",
  };
  const response = http.post(`${getBaseUrl()}/api/webhooks/twilio/status`, body, {
    tags: { endpoint: "twilio-status", flow: "webhook", test_type: "load" },
  });
  const ok = check(response, {
    "unsigned webhook rejected safely": (res) => [400, 401, 403, 429].includes(res.status),
    "webhook no 5xx": (res) => res.status < 500,
  });
  smsWebhookSuccessRate.add(ok);
  think();
}
