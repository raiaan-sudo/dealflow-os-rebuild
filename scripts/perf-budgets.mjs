import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lighthouse = JSON.parse(readFileSync("lighthouserc.json", "utf8"));
const assertions = lighthouse.ci?.assert?.assertions ?? {};

assert.ok(assertions["categories:performance"], "Lighthouse must keep a performance budget");
assert.ok(assertions["categories:accessibility"], "Lighthouse must keep an accessibility budget");
assert.ok(assertions["categories:best-practices"], "Lighthouse must keep a best-practices budget");
assert.ok(assertions["categories:seo"], "Lighthouse must keep an SEO budget");
assert.ok(assertions["largest-contentful-paint"], "Lighthouse must keep an LCP budget");
assert.ok(assertions["cumulative-layout-shift"], "Lighthouse must keep a CLS budget");
assert.ok(assertions["total-blocking-time"], "Lighthouse must keep a TBT budget");

console.log("Performance budget contract passed.");
