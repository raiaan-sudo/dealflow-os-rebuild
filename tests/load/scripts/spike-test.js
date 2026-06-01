import { check } from "k6";
import { getRoute, think } from "./helpers.js";

const peak = Number(__ENV.VUS || 1000);

export const options = {
  scenarios: {
    public_spike: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: peak },
        { duration: __ENV.DURATION || "2m", target: peak },
        { duration: "30s", target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    route_duration: ["p(95)<2500", "p(99)<5000"]
  }
};

export default function run() {
  const response = getRoute(__ITER % 2 === 0 ? "/" : "/login", { flow: "spike" });
  check(response, { "spike route no 5xx": (res) => res.status < 500 });
  think(0.05, 0.25);
}
