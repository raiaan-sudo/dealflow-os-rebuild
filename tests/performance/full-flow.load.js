import { check } from "k6";
import { fullFlowSuccessRate, getRoute, requireLeadWriteSafety, submitLead, think } from "./helpers.js";

export const options = {
  scenarios: {
    public_full_flow: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 25),
      duration: __ENV.DURATION || "15m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    full_flow_success_rate: ["rate>0.99"],
    lead_submit_duration: ["p(95)<1000", "p(99)<3000"],
    dashboard_load_duration: ["p(95)<2000", "p(99)<4000"],
  },
};

export function setup() {
  requireLeadWriteSafety();
}

export default function runScenario() {
  const lead = submitLead();
  const dashboard = getRoute("/dashboard", undefined, { flow: "dashboard" });
  const ok = lead.ok && dashboard.status < 500;
  check(dashboard, {
    "dashboard protected or loads": (res) => [200, 302, 307, 401].includes(res.status),
  });
  fullFlowSuccessRate.add(ok);
  think(1, 2);
}

