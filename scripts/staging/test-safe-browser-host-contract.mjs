#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN,
  assertExactHostedSafeBrowserOrigin,
} from "./safe-browser-host-contract.mjs";

assert.equal(
  assertExactHostedSafeBrowserOrigin(EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN).origin,
  EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN,
);
assert.equal(
  assertExactHostedSafeBrowserOrigin(`${EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN}/`).href,
  `${EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN}/`,
);

for (const invalid of [
  "http://dealflow-os-rebuild-selfserve-clean.vercel.app",
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app:444",
  "https://user:pass@dealflow-os-rebuild-selfserve-clean.vercel.app",
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app/login",
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app/?redirect=evil",
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app/#fragment",
  "https://evil.example.com",
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app.evil.example.com",
]) {
  assert.throws(
    () => assertExactHostedSafeBrowserOrigin(invalid),
    /not the exact isolated staging origin/,
  );
}

assert.throws(
  () => assertExactHostedSafeBrowserOrigin("not a url"),
  /base URL is invalid/,
);

process.stdout.write("PASS exact hosted safe-browser origin contract\n");
