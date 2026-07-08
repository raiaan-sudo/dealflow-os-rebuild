import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const proxy = readFileSync("src/proxy.ts", "utf8");

for (const header of [
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only",
  "Strict-Transport-Security",
  "Referrer-Policy",
  "X-Content-Type-Options",
  "Permissions-Policy",
  "frame-ancestors",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]) {
  assert.match(proxy, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${header} must be present`);
}

assert.match(proxy, /DEFAULT_GHL_FRAME_ANCESTORS/, "GHL iframe allowlist must remain explicit");
assert.match(proxy, /CLICK_TO_SCALE_IFRAME_HOSTS/, "white-label iframe host allowlist must remain explicit");

console.log("Security header contract passed.");
