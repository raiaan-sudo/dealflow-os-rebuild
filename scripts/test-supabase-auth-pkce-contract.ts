#!/usr/bin/env tsx

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getSafeAuthRedirectPath } from "../src/lib/auth/safe-redirect";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const callbackRoute = read("src/app/auth/callback/route.ts");
const loginForm = read("src/components/auth/login-form.tsx");
const loginPage = read("src/app/(auth)/login/page.tsx");
const proxy = read("src/proxy.ts");
const sessionRoute = read("src/app/api/auth/session/route.ts");
const cookieOptions = read("src/lib/supabase/cookie-options.ts");

assert.match(callbackRoute, /createServerSupabase\(response\)/, "callback must write the exchanged session into response cookies");
assert.match(callbackRoute, /exchangeCodeForSession\(code\)/, "callback must exchange the one-time PKCE code server-side");
assert.match(callbackRoute, /AUTH_CODE_PATTERN\.test\(code\)/, "callback must reject malformed or oversized codes");
assert.match(callbackRoute, /Cache-Control", "no-store, max-age=0"/, "callback redirects must not be cached");
assert.match(callbackRoute, /"oauth", "signup", "recovery"/, "callback must allow only the supported auth flows");
assert.match(
  callbackRoute,
  /const successPath = flow === "recovery"[\s\S]*: nextPath;/,
  "OAuth and confirmed signup sessions must continue directly to the safe destination",
);
assert.doesNotMatch(callbackRoute, /console\.|error\.message|searchParams\.set\([^,]+,\s*error/, "callback must not disclose provider errors");

assert.match(proxy, /"\/auth\/callback"/, "PKCE callback must remain reachable before authentication");
assert.match(loginForm, /getAuthCallbackUrl\("oauth"/, "OAuth must return through the server callback");
assert.match(loginForm, /getAuthCallbackUrl\("signup"/, "email confirmation must return through the server callback");
assert.match(loginForm, /getAuthCallbackUrl\("recovery"/, "password recovery must return through the server callback");
assert.match(loginForm, /postServerAuth/, "interactive authentication must use the server cookie boundary");
assert.doesNotMatch(loginForm, /createBrowserClient|supabase\.auth/, "login UI must not read or write session cookies");
assert.match(sessionRoute, /signInWithOAuth/, "OAuth initiation must create its PKCE verifier server-side");
assert.match(sessionRoute, /createServerSupabase\(cookieSink\)/, "server auth must retain cookie writes for the browser response");
assert.match(cookieOptions, /httpOnly:\s*true/, "PKCE and session cookies must be HttpOnly");
assert.match(loginPage, /requestedMode === "update-password"/, "recovery callback must restore update-password UX without a URL token");
assert.doesNotMatch(loginForm, /window\.location\.hash/, "login UI must not inspect auth fragments");
assert.doesNotMatch(loginForm, /\baccess_token\b|\brefresh_token\b/, "login UI must not receive auth tokens from URLs");
assert.doesNotMatch(loginForm, /auth\.setSession\(/, "login UI must not establish a session from URL material");

const origin = "https://app.agentdealflow.io";
const fallback = "/en/onboarding?fresh=1";
assert.equal(
  getSafeAuthRedirectPath("/fr/dashboard?view=current#summary", origin, fallback),
  "/fr/dashboard?view=current#summary",
);
for (const unsafeValue of [
  null,
  "",
  "/",
  "//evil.example/path",
  "/\\evil.example/path",
  "https://evil.example/path",
  "/login?next=/dashboard",
  "/fr/login?next=/dashboard",
  "/es/login/untrusted",
  "/auth/callback?code=replay",
  "/es/auth/callback?code=replay",
  "/fr/auth/callback/replay",
]) {
  assert.equal(
    getSafeAuthRedirectPath(unsafeValue, origin, fallback),
    fallback,
    `${String(unsafeValue)} must fail closed`,
  );
}

console.log("Supabase auth PKCE contract: PASS");
