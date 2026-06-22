import { check } from "k6";
import { getRoute, think } from "./helpers.js";

export const options = {
  scenarios: {
    public_soak: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || "2h"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    route_duration: ["p(95)<1500", "p(99)<3000"]
  }
};

export default function run() {
  const response = getRoute(__ITER % 3 === 0 ? "/" : __ITER % 3 === 1 ? "/login" : "/privacy", { flow: "soak" });
  check(response, { "soak route no 5xx": (res) => res.status < 500 });
  think(1, 3);
}
