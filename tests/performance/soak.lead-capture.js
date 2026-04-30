import { submitLead, requireLeadWriteSafety, think } from "./helpers.js";

export const options = {
  scenarios: {
    lead_soak: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || "2h",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    lead_submit_duration: ["p(95)<1000", "p(99)<2000"],
    lead_success_rate: ["rate>0.99"],
  },
};

export function setup() {
  requireLeadWriteSafety();
  __ENV.K6_TEST_TYPE = "soak";
}

export default function runScenario() {
  submitLead();
  think(1, 3);
}

