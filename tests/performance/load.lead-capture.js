import { submitLead, requireLeadWriteSafety, think } from "./helpers.js";

export const options = {
  scenarios: {
    expected_launch_load: {
      executor: "ramping-vus",
      stages: [
        { duration: "5m", target: Number(__ENV.VUS || 50) },
        { duration: __ENV.DURATION || "20m", target: Number(__ENV.VUS || 50) },
        { duration: "3m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    lead_submit_duration: ["p(95)<750", "p(99)<1500"],
    lead_success_rate: ["rate>0.99"],
  },
};

export function setup() {
  requireLeadWriteSafety();
  __ENV.K6_TEST_TYPE = "load";
}

export default function runScenario() {
  submitLead();
  think(0.5, 1.5);
}

