#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const callbackRoute = fs.readFileSync("src/app/api/integrations/meta/callback/route.ts", "utf8");

assert.match(
  callbackRoute,
  /const stateMatchesCookie = Boolean\(returnedState && storedState && returnedState === storedState\)/,
  "Meta OAuth callback must compare returned state to the httpOnly state cookie",
);

assert.match(
  callbackRoute,
  /if \(!stateMatchesCookie\) \{[\s\S]*?return redirectWithMetaError\("invalid_state"\);[\s\S]*?\}/,
  "Meta OAuth callback must fail closed before token exchange when state cookie is missing or mismatched",
);

const handlerStartIndex = callbackRoute.indexOf("export async function GET");
const mismatchGuardIndex = callbackRoute.indexOf("if (!stateMatchesCookie)", handlerStartIndex);
const tokenExchangeIndex = callbackRoute.indexOf("const { response: tokenRes", handlerStartIndex);
const tokenStoreIndex = callbackRoute.indexOf(".from(\"marketing_accounts\")");

assert.ok(handlerStartIndex > -1, "Meta callback GET handler must exist");
assert.ok(mismatchGuardIndex > -1, "state mismatch guard must exist");
assert.ok(tokenExchangeIndex > -1, "token exchange must exist");
assert.ok(tokenStoreIndex > -1, "token storage must exist");
assert.ok(
  mismatchGuardIndex < tokenExchangeIndex,
  "state mismatch guard must run before exchanging the OAuth code",
);
assert.ok(
  mismatchGuardIndex < tokenStoreIndex,
  "state mismatch guard must run before storing Meta tokens",
);

assert.doesNotMatch(
  callbackRoute,
  /signed state verified/i,
  "Meta OAuth callback must not treat signed-state-only verification as sufficient",
);

console.log("Meta OAuth state binding regression passed.");
