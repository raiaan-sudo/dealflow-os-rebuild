import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GHL_DESTINATION_MAX_POLL_ATTEMPTS,
  GHL_DESTINATION_POLL_INTERVAL_MS,
  shouldRetryPendingGhlDestination,
} from "../src/lib/ghl-destination-polling";

assert.equal(GHL_DESTINATION_POLL_INTERVAL_MS, 2_000);
assert.equal(GHL_DESTINATION_MAX_POLL_ATTEMPTS, 90);
assert.equal(shouldRetryPendingGhlDestination({
  status: 409,
  code: "ghl_destination_pending",
  attempt: 0,
}), true);
assert.equal(shouldRetryPendingGhlDestination({
  status: 409,
  code: "ghl_destination_pending",
  attempt: 88,
}), true);
assert.equal(shouldRetryPendingGhlDestination({
  status: 409,
  code: "ghl_destination_pending",
  attempt: 89,
}), false);
for (const candidate of [
  { status: 200, code: "ghl_destination_pending", attempt: 0 },
  { status: 409, code: "ghl_destination_blocked", attempt: 0 },
  { status: 503, code: "ghl_destination_pending", attempt: 0 },
  { status: 409, code: "ghl_destination_pending", attempt: -1 },
]) {
  assert.equal(shouldRetryPendingGhlDestination(candidate), false);
}

const page = fs.readFileSync("src/app/(app)/launching/page.tsx", "utf8");
for (const marker of [
  "shouldRetryPendingGhlDestination",
  "GHL_DESTINATION_POLL_INTERVAL_MS",
  "void loadReview(attempt + 1)",
  "clearTimeout(retryTimer)",
  "GHL funnel preparation is still running",
  "Retry preparation",
]) {
  assert.ok(page.includes(marker), `Launching UI is missing bounded GHL readiness behavior: ${marker}`);
}
assert.doesNotMatch(
  page,
  /ghl_destination_pending[\s\S]{0,300}router\.(?:push|replace)/,
  "A pending GHL destination must not navigate as if launch readiness succeeded.",
);

const destinationContract = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
assert.match(
  destinationContract,
  /await prepareGhlCampaignPersonalization\([\s\S]*?resolveReadyGhlDestination/,
  "The GET readiness path must prepare before checking campaign destination readiness.",
);
assert.match(
  destinationContract,
  /"ghl_destination_pending"/,
  "The server must retain a typed pending response for bounded client polling.",
);

console.log("GHL launch readiness bounded polling contract: PASS");
