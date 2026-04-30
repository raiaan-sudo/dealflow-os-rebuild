import { submitLead, requireLeadWriteSafety, think } from "./helpers.js";

export const options = {
  scenarios: {
    smoke_leads: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || "5m",
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
  __ENV.K6_TEST_TYPE = "smoke";
}

export default function runScenario() {
  submitLead();
  think();
}

