import { check } from "k6";
import { getRoute, think } from "./helpers.js";

const peak = Number(__ENV.VUS || 2000);

export const options = {
  scenarios: {
    public_breakpoint: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 100 },
        { duration: "2m", target: 500 },
        { duration: "2m", target: 1000 },
        { duration: "2m", target: peak },
        { duration: "1m", target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    route_duration: ["p(95)<5000"]
  }
};

export default function run() {
  const response = getRoute("/", { flow: "breakpoint" });
  check(response, { "breakpoint route no 5xx": (res) => res.status < 500 });
  think(0.05, 0.25);
}
