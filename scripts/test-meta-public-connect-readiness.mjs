#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const envSource = fs.readFileSync("src/lib/env.ts", "utf8");
const connectRoute = fs.readFileSync("src/app/api/integrations/meta/connect/route.ts", "utf8");
const envExample = fs.readFileSync(".env.example", "utf8");

assert.match(
  envSource,
  /const loginConfigId = process\.env\.META_LOGIN_CONFIG_ID\?\.trim\(\) \|\| null;/,
  "Meta env must read optional META_LOGIN_CONFIG_ID for Facebook Login for Business.",
);

assert.match(
  envSource,
  /loginConfigId,/,
  "Meta env must expose loginConfigId to the OAuth connect route.",
);

assert.match(
  connectRoute,
  /if \(env\.loginConfigId\) \{[\s\S]*?url\.searchParams\.set\("config_id", env\.loginConfigId\);[\s\S]*?\}/,
  "Meta connect route must send config_id when META_LOGIN_CONFIG_ID is configured.",
);

assert.match(
  connectRoute,
  /loginConfigEnabled: Boolean\(env\.loginConfigId\)/,
  "Meta connect telemetry should record only whether the config is enabled.",
);

const metadataStart = connectRoute.indexOf("metadata: {");
const idempotencyKeyStart = connectRoute.indexOf("idempotencyKey:", metadataStart);
assert.ok(metadataStart > -1 && idempotencyKeyStart > metadataStart, "Meta connect telemetry metadata block must exist.");
const metadataBlock = connectRoute.slice(metadataStart, idempotencyKeyStart);
assert.doesNotMatch(
  metadataBlock,
  /loginConfigId\s*:/,
  "Meta connect telemetry must not store or log the raw login configuration id.",
);

assert.match(
  envExample,
  /META_LOGIN_CONFIG_ID=your-facebook-login-for-business-configuration-id/,
  ".env.example must document the Meta Business Login configuration id.",
);

console.log("Meta public connect readiness regression passed.");
