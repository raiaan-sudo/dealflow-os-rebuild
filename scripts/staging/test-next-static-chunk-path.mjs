#!/usr/bin/env node

import assert from "node:assert/strict";

import { findExactNextStaticChunkPath } from "./next-static-chunk-path.mjs";

const origin = "https://dealflow-staging.example";

assert.equal(
  findExactNextStaticChunkPath(
    '<script src="/_next/static/chunks/app/privacy-abc123.js?dpl=dpl_exact"></script>',
    origin,
  ),
  "/_next/static/chunks/app/privacy-abc123.js",
);
assert.equal(
  findExactNextStaticChunkPath(
    "<link href='/_next/static/chunks/webpack-def456.js?cache=1#ignored'>",
    `${origin}/`,
  ),
  "/_next/static/chunks/webpack-def456.js",
);
assert.equal(
  findExactNextStaticChunkPath(
    '<script src="https://evil.example/_next/static/chunks/evil.js"></script>' +
      '<script src="/_next/static/chunks/good.js"></script>',
    origin,
  ),
  "/_next/static/chunks/good.js",
);
for (const html of [
  '<script src="https://evil.example/_next/static/chunks/evil.js"></script>',
  '<script src="/_next/static/chunks/not-javascript.css"></script>',
  '<script src="/_next/static/../private.js"></script>',
  '<script src="javascript:alert(1)"></script>',
  '<script src="data:text/javascript,alert(1)"></script>',
  "<html></html>",
]) {
  assert.equal(findExactNextStaticChunkPath(html, origin), null);
}
for (const invalidBase of [
  "http://dealflow-staging.example",
  "https://user:pass@dealflow-staging.example",
  "https://dealflow-staging.example:444",
  "https://dealflow-staging.example/path",
  "https://dealflow-staging.example/?query=1",
]) {
  assert.throws(() => findExactNextStaticChunkPath("", invalidBase));
}

console.log("Next.js static chunk discovery: PASS (same-origin pathname extraction, dpl query tolerance, and unsafe-source rejection)");
