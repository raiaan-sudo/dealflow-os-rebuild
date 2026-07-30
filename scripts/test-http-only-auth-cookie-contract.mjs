#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const cookieOptions = read("src/lib/supabase/cookie-options.ts");
const serverClient = read("src/lib/supabase/server.ts");
const sessionRoute = read("src/app/api/auth/session/route.ts");
const mfaRoute = read("src/app/api/auth/mfa/route.ts");
const callbackRoute = read("src/app/auth/callback/route.ts");
const loginForm = read("src/components/auth/login-form.tsx");
const signOutButton = read("src/components/layout/sign-out-button.tsx");
const clientSignOut = read("src/lib/auth/client-sign-out.ts");
const mfaChallenge = read("src/components/auth/mfa-challenge-form.tsx");
const mfaSettings = read("src/components/settings/mfa-security-card.tsx");
const proxy = read("src/proxy.ts");
const qaSessionRoute = read("src/app/api/internal/qa-auth-session/route.ts");
const stagingSession = read("scripts/staging/browser-session-bundle-contract.mjs");

for (const marker of [
  "httpOnly: true",
  'sameSite: isProduction ? "none" : "lax"',
  "secure: isProduction",
  "partitioned: isProduction",
  'path: "/"',
]) {
  assert.ok(cookieOptions.includes(marker), `shared session cookie policy is missing ${marker}`);
}

assert.equal(
  existsSync("src/lib/supabase/client.ts"),
  false,
  "browser JavaScript must not retain a Supabase session-cookie client",
);
assert.match(serverClient, /cookieOptions:\s*getSupabaseAuthCookieOptions\(\)/);
assert.match(sessionRoute, /assertExactAuthOrigin\(request\)/);
assert.match(sessionRoute, /consumeRateLimitBuckets/);
assert.match(sessionRoute, /createServerSupabase\(cookieSink\)/);
assert.match(sessionRoute, /finalizeServerAuthResponse/);
assert.match(sessionRoute, /signInWithPassword/);
assert.match(sessionRoute, /auth\.signUp/);
assert.match(sessionRoute, /resetPasswordForEmail/);
assert.match(sessionRoute, /auth\.updateUser/);
assert.match(sessionRoute, /signInWithOAuth/);
assert.match(sessionRoute, /skipBrowserRedirect:\s*true/);
assert.match(sessionRoute, /auth\.signOut/);
assert.doesNotMatch(sessionRoute, /\baccess_token\b|\brefresh_token\b|console\./);

assert.match(callbackRoute, /exchangeCodeForSession\(code\)/);
assert.match(callbackRoute, /createServerSupabase\(response\)/);
assert.match(loginForm, /fetch\("\/api\/auth\/session"/);
assert.match(loginForm, /action: "sign-in"/);
assert.match(loginForm, /action: "sign-up"/);
assert.match(loginForm, /action: "request-password-reset"/);
assert.match(loginForm, /action: "update-password"/);
assert.match(loginForm, /action: "oauth"/);
assert.doesNotMatch(loginForm, /createBrowserClient|supabase\.auth|\baccess_token\b|\brefresh_token\b/);
assert.match(signOutButton, /requestConfirmedServerSignOut/);
assert.match(signOutButton, /if \(!signOutConfirmed\)/);
assert.match(signOutButton, /setError\(t\("auth\.signOutFailed"\)\)/);
assert.doesNotMatch(signOutButton, /\.finally\([\s\S]*router\.replace/);
assert.doesNotMatch(signOutButton, /supabase\.auth|createClient/);
assert.match(clientSignOut, /fetcher\("\/api\/auth\/session"/);
assert.match(clientSignOut, /if \(!response\.ok\) return false/);
assert.match(clientSignOut, /payload\.success === true/);

assert.match(mfaRoute, /createServerSupabase\(cookieSink\)/);
assert.match(mfaRoute, /finalizeServerAuthResponse/);
assert.match(mfaRoute, /assertExactAuthOrigin\(request\)/);
assert.match(mfaRoute, /mfa\.listFactors/);
assert.match(mfaRoute, /mfa\.enroll/);
assert.match(mfaRoute, /mfa\.challengeAndVerify/);
assert.match(mfaChallenge, /fetch\("\/api\/auth\/mfa"/);
assert.match(mfaSettings, /fetch\("\/api\/auth\/mfa"/);
assert.doesNotMatch(`${mfaChallenge}\n${mfaSettings}`, /createClient|supabase\.auth/);

const publicApis =
  proxy.match(/const PUBLIC_API_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
assert.match(publicApis, /"\/api\/auth\/session"/);
assert.doesNotMatch(publicApis, /"\/api\/auth\/mfa"/);
assert.match(proxy, /getAll\(\)/);
assert.match(proxy, /setAll\(cookiesToSet, headers\)/);
assert.match(qaSessionRoute, /HttpOnly; SameSite=\$\{sameSite\}\$\{secure\}\$\{partitioned\}/);
assert.match(stagingSession, /httpOnly:\s*true/);

console.log("HttpOnly Supabase authentication boundary: PASS");
