import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSecurity = readFileSync("scripts/check-route-security.mjs", "utf8");
const proxy = readFileSync("src/proxy.ts", "utf8");
const apiRoute = readFileSync("src/lib/api/route.ts", "utf8");

assert.match(routeSecurity, /PUBLIC_API_ROUTES|publicApiRoutes|\/api\/lead-capture|\/api\/stripe\/webhook/i, "route security inventory must include public APIs");
assert.match(proxy, /PUBLIC_API_PATHS/, "proxy must keep an explicit public API allowlist");
assert.match(proxy, /isInternalApiRequest/, "internal APIs must have separate bearer guard");
assert.match(apiRoute, /assertSameOriginRequest/, "same-origin helper must exist for browser mutations");
assert.match(apiRoute, /assertInternalSystemRequest/, "internal system helper must exist");
assert.match(apiRoute, /parseJsonBody/, "API JSON payloads must use bounded schema parsing");

console.log("API security contract passed.");
