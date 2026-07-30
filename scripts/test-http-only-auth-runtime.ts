#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { finalizeServerAuthResponse } from "../src/lib/auth/server-auth-response";
import { requestConfirmedServerSignOut } from "../src/lib/auth/client-sign-out";
import { assertExactAuthOrigin } from "../src/lib/auth/server-origin";
import { getSupabaseAuthCookieOptions } from "../src/lib/supabase/cookie-options";

function request(
  url: string,
  headers: Record<string, string> = {},
) {
  return new Request(url, { headers });
}

assert.doesNotThrow(() => assertExactAuthOrigin(
  request("https://www.agentdealflow.io/api/auth/session", {
    origin: "https://www.agentdealflow.io",
  }),
));
assert.doesNotThrow(() => assertExactAuthOrigin(
  request("https://www.clicktoscale.io/api/auth/session", {
    referer: "https://www.clicktoscale.io/login?embedded=1",
  }),
));
for (const candidate of [
  request("https://www.agentdealflow.io/api/auth/session"),
  request("https://www.agentdealflow.io/api/auth/session", {
    origin: "https://www.clicktoscale.io",
  }),
  request("https://www.agentdealflow.io/api/auth/session", {
    origin: "not-a-url",
  }),
]) {
  assert.throws(() => assertExactAuthOrigin(candidate), /Cross-site request rejected/);
}

const originalNodeEnv = process.env.NODE_ENV;
try {
  Object.assign(process.env, { NODE_ENV: "production" });
  const production = getSupabaseAuthCookieOptions();
  assert.equal(production.httpOnly, true);
  assert.equal(production.secure, true);
  assert.equal(production.sameSite, "none");
  assert.equal(production.partitioned, true);
  assert.throws(
    () => assertExactAuthOrigin(
      request("http://www.agentdealflow.io/api/auth/session", {
        origin: "http://www.agentdealflow.io",
      }),
    ),
    /Cross-site request rejected/,
  );

  Object.assign(process.env, { NODE_ENV: "development" });
  const development = getSupabaseAuthCookieOptions();
  assert.equal(development.httpOnly, true);
  assert.equal(development.secure, false);
  assert.equal(development.sameSite, "lax");
  assert.equal(development.partitioned, false);
} finally {
  if (originalNodeEnv === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
  } else {
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  }
}

const cookieSource = NextResponse.json({ source: true });
cookieSource.cookies.set("sb-test-auth-token", "synthetic-cookie-value", {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "none",
  partitioned: true,
});
const finalResponse = finalizeServerAuthResponse(
  NextResponse.json({ success: true }),
  cookieSource,
);
const setCookie = finalResponse.headers.get("set-cookie") ?? "";
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /Secure/i);
assert.match(setCookie, /SameSite=None/i);
assert.match(setCookie, /Partitioned/i);
assert.equal(finalResponse.headers.get("cache-control"), "private, no-store, max-age=0");
assert.equal(finalResponse.headers.get("pragma"), "no-cache");

async function testConfirmedServerSignOut() {
  const successfulSignOut = await requestConfirmedServerSignOut(async () =>
    Response.json({ success: true }),
  );
  assert.equal(successfulSignOut, true);

  for (const failedSignOut of [
    () => requestConfirmedServerSignOut(async () =>
      Response.json({ success: false }),
    ),
    () => requestConfirmedServerSignOut(async () =>
      Response.json({ success: true }, { status: 503 }),
    ),
    () => requestConfirmedServerSignOut(async () =>
      new Response("not-json", { status: 200 }),
    ),
    () => requestConfirmedServerSignOut(async () => {
      throw new Error("synthetic transport failure");
    }),
  ]) {
    assert.equal(
      await failedSignOut(),
      false,
      "logout must remain unconfirmed after every server or transport failure",
    );
  }
}

void testConfirmedServerSignOut()
  .then(() => {
    console.log("HttpOnly authentication runtime policy: PASS");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
