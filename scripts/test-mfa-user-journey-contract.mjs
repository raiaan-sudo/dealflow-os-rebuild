#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync("src/components/auth/login-form.tsx", "utf8");
const challenge = readFileSync("src/components/auth/mfa-challenge-form.tsx", "utf8");
const settings = readFileSync("src/components/settings/mfa-security-card.tsx", "utf8");
const sessionRoute = readFileSync("src/app/api/auth/session/route.ts", "utf8");
const mfaRoute = readFileSync("src/app/api/auth/mfa/route.ts", "utf8");
const settingsPage = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
const proxy = readFileSync("src/proxy.ts", "utf8");
const messages = readFileSync("src/lib/i18n/messages.ts", "utf8");
const deletion = readFileSync("src/lib/services/account-deletion-service.ts", "utf8");
const privacy = readFileSync("src/lib/services/privacy-authority-service.ts", "utf8");

const serverSignIn = sessionRoute.slice(
  sessionRoute.indexOf('if (body.action === "sign-in")'),
  sessionRoute.indexOf('if (body.action === "sign-up")'),
);
assert.ok(serverSignIn.indexOf("signInWithPassword") < serverSignIn.indexOf("getAuthenticatorAssuranceLevel"));
assert.match(serverSignIn, /nextLevel === "aal2"/);
assert.match(serverSignIn, /currentLevel !== "aal2"/);
const signIn = login.slice(login.indexOf('if (mode === "sign-in")'), login.indexOf("let accessKeyClaimToken"));
assert.match(signIn, /action: "sign-in"/);
assert.match(signIn, /signIn\.requiresMfa/);
assert.match(signIn, /href\("\/mfa"\)/);

assert.match(challenge, /fetch\("\/api\/auth\/mfa"/);
assert.match(challenge, /action: "verify"/);
assert.match(challenge, /getSafeAuthRedirectPath/);
assert.match(challenge, /autoComplete="one-time-code"/);
assert.doesNotMatch(challenge, /console\.|localStorage|sessionStorage/);

assert.match(settings, /action: "begin-enrollment"/);
assert.match(settings, /action: "verify"/);
assert.doesNotMatch(settings, /\.totp\.secret|\.totp\.uri|console\.|localStorage|sessionStorage/);
assert.match(mfaRoute, /mfa\.enroll/);
assert.match(mfaRoute, /factorType: "totp"/);
assert.match(mfaRoute, /mfa\.challengeAndVerify/);
assert.match(mfaRoute, /status === "unverified"/);
assert.match(mfaRoute, /mfa\.unenroll/);
assert.match(mfaRoute, /createServerSupabase\(cookieSink\)/);
assert.match(settingsPage, /<MfaSecurityCard \/>/);

assert.doesNotMatch(proxy.match(/const PUBLIC_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "", /"\/mfa"/);
assert.equal((messages.match(/"auth\.mfaChallengeTitle":/g) ?? []).length, 3);
assert.equal((messages.match(/"auth\.mfaRecoveryBody":/g) ?? []).length, 3);
assert.match(deletion, /currentLevel !== "aal2"/);
assert.match(privacy, /currentLevel !== "aal2"/);

console.log("MFA enrollment, challenge, localization, and high-risk gate contract: PASS");
