import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

assert.ok(existsSync("playwright.config.ts"), "Playwright config must exist for repeatable browser proof");
assert.ok(existsSync("tests/e2e/public-funnel.spec.ts"), "Public funnel E2E spec must exist");

const config = readFileSync("playwright.config.ts", "utf8");
const spec = readFileSync("tests/e2e/public-funnel.spec.ts", "utf8");

assert.match(config, /trace/, "Playwright config must collect traces");
assert.match(config, /screenshot/, "Playwright config must collect screenshots on failure");
assert.match(spec, /hamza-juma/, "public E2E must cover Hamza funnel");
assert.match(spec, /homelife-hearts-realty-inc/, "public E2E must cover Mona funnel");
assert.match(spec, /api\/client-errors/, "public E2E must guard telemetry network failures");

console.log("Browser audit harness contract passed.");
