import { submitLead, requireLeadWriteSafety, think } from "./helpers.js";

export const options = {
  scenarios: {
    lead_spike: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: Number(__ENV.VUS || 500) },
        { duration: __ENV.DURATION || "2m", target: Number(__ENV.VUS || 500) },
        { duration: "30s", target: 20 },
        { duration: "2m", target: 20 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    lead_submit_duration: ["p(95)<2500"],
  },
};

export function setup() {
  requireLeadWriteSafety();
  __ENV.K6_TEST_TYPE = "spike";
}

export default function runScenario() {
  submitLead();
  think(0.1, 0.5);
}

