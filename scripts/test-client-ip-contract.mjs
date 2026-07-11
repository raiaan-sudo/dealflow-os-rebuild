#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { isIP } from "node:net";

const sourcePath = path.join(process.cwd(), "src/lib/api/client-ip.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const moduleShim = { exports: {} };
const requireShim = (specifier) => {
  if (specifier === "node:net") return { isIP };
  throw new Error(`Unexpected import: ${specifier}`);
};
vm.runInContext(compiled, vm.createContext({
  exports: moduleShim.exports,
  module: moduleShim,
  require: requireShim,
  process: { env: {} },
}), { filename: "client-ip.compiled.cjs" });

const { getTrustedRequestIp, normalizeClientIp } = moduleShim.exports;
const request = (headers) => ({ headers: new Headers(headers) });

assert.equal(normalizeClientIp("203.0.113.10"), "203.0.113.10");
assert.equal(normalizeClientIp("203.0.113.10:443"), "203.0.113.10");
assert.equal(normalizeClientIp("[2001:db8::1]:443"), "2001:db8::1");
assert.equal(normalizeClientIp("2001:DB8::1"), "2001:db8::1");
assert.equal(normalizeClientIp("999.1.1.1"), null);
assert.equal(normalizeClientIp("attacker"), null);

assert.equal(
  getTrustedRequestIp(
    request({
      "x-forwarded-for": "198.51.100.99",
      "x-vercel-forwarded-for": "203.0.113.10",
    }),
    { NODE_ENV: "production", VERCEL: "1" },
  ),
  "203.0.113.10",
  "Vercel runtime must ignore attacker-controlled generic forwarding chains",
);
assert.equal(
  getTrustedRequestIp(
    request({ "x-forwarded-for": "198.51.100.99" }),
    { NODE_ENV: "production" },
  ),
  "anonymous",
  "unknown production proxies must not become trusted implicitly",
);
assert.equal(
  getTrustedRequestIp(
    request({ "x-forwarded-for": "203.0.113.10, 198.51.100.2" }),
    { NODE_ENV: "development" },
  ),
  "203.0.113.10",
);

console.log("PASS trusted client-IP contract: Vercel edge header, spoof resistance, and IP normalization");
