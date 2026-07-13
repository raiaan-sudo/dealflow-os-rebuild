import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GHL_DESTINATION_MAX_POLL_ATTEMPTS,
  GHL_DESTINATION_POLL_INTERVAL_MS,
  shouldRetryPendingGhlDestination,
} from "../src/lib/ghl-destination-polling";
import { PRODUCT_MESSAGES } from "../src/lib/i18n/messages";

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
]) {
  assert.ok(page.includes(marker), `Launching UI is missing bounded GHL readiness behavior: ${marker}`);
}
for (const key of ["launch.ghlPreparationRunning", "launch.retryPreparation"] as const) {
  assert.ok(
    page.includes(`t("${key}")`),
    `Launching UI does not use the authoritative localized readiness message: ${key}`,
  );
  for (const locale of ["en", "fr", "es"] as const) {
    assert.ok(
      PRODUCT_MESSAGES[locale][key].trim(),
      `Launching readiness message is missing for ${locale}: ${key}`,
    );
  }
  assert.notEqual(
    PRODUCT_MESSAGES.fr[key],
    PRODUCT_MESSAGES.en[key],
    `French launching readiness message was not localized: ${key}`,
  );
  assert.notEqual(
    PRODUCT_MESSAGES.es[key],
    PRODUCT_MESSAGES.en[key],
    `Spanish launching readiness message was not localized: ${key}`,
  );
}
assert.ok(
  page.split('t("launch.ghlPreparationRunning")').length - 1 >= 2,
  "Both the polling and exhausted GHL-pending paths must use the localized preparation status",
);
assert.match(
  page,
  /catch \(caughtError\)[\s\S]{0,220}caughtError\.message === t\("launch\.ghlPreparationRunning"\)[\s\S]{0,140}\? t\("launch\.ghlPreparationRunning"\)[\s\S]{0,100}: t\("launch\.unavailable"\)/,
  "The exhausted GHL-pending path must preserve only its safe localized status",
);
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
