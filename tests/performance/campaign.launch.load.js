import http from "k6/http";
import { check } from "k6";
import { getBaseUrl, think } from "./helpers.js";

export const options = {
  scenarios: {
    campaign_launch_gate_reads: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || "5m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  if (!__ENV.TEST_AUTH_TOKEN) {
    throw new Error("campaign.launch.load.js requires TEST_AUTH_TOKEN. Do not use service-role keys.");
  }
}

export default function runScenario() {
  const campaignId = __ENV.TEST_CAMPAIGN_ID;
  const path = campaignId ? `/api/campaigns/${campaignId}/launch` : "/api/campaigns";
  const response = http.get(`${getBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_AUTH_TOKEN}` },
    tags: { endpoint: path, flow: "campaign", test_type: "load" },
  });
  check(response, {
    "campaign route no 5xx": (res) => res.status < 500,
  });
  think();
}

