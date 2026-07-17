import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/app/(app)/admin/command-center/page.tsx"), "utf8");

assert.doesNotMatch(
  source,
  /Live security score/i,
  "the admin surface must not advertise a nonfunctional live security score",
);
assert.match(source, /const evidenceObservedAt = new Date\(\)\.toISOString\(\);/);
assert.match(source, /status: "Security evidence feed unavailable"/);
assert.match(source, /readinessLabel: "evidence unavailable; no score"/);
assert.match(source, /Evidence state timestamp: \$\{evidenceObservedAt\}/);
assert.match(source, /label: "Security evidence feed"/);
assert.match(source, /no score or readiness conclusion is asserted/i);

const securityAgent = /id: "friday",([\s\S]*?)\n\s*\{\n\s*id: "edith",/.exec(source)?.[1];
assert.ok(securityAgent, "the security evidence agent block must remain statically inspectable");
assert.match(securityAgent, /readiness: null/);
assert.doesNotMatch(securityAgent, /readiness:\s*\d+/);
assert.doesNotMatch(securityAgent, /\b(?:secure|security)\s*(?:score|readiness)?\s*[:=]?\s*\d+%/i);

console.log("Admin security truth contract: PASS (timestamped unavailable evidence state; no fabricated score)");
