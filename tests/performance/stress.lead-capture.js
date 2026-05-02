import { submitLead, requireLeadWriteSafety, think } from "./helpers.js";

export const options = {
  scenarios: {
    beyond_expected_load: {
      executor: "ramping-vus",
      stages: [
        { duration: "10m", target: Number(__ENV.VUS || 250) },
        { duration: __ENV.DURATION || "30m", target: Number(__ENV.VUS || 250) },
        { duration: "5m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    lead_submit_duration: ["p(95)<1500", "p(99)<3000"],
    lead_success_rate: ["rate>0.98"],
  },
};

export function setup() {
  requireLeadWriteSafety();
  __ENV.K6_TEST_TYPE = "stress";
}

export default function runScenario() {
  submitLead();
  think(0.25, 1);
}

