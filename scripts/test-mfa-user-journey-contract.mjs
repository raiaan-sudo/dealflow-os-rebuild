#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync("src/components/auth/login-form.tsx", "utf8");
const challenge = readFileSync("src/components/auth/mfa-challenge-form.tsx", "utf8");
const settings = readFileSync("src/components/settings/mfa-security-card.tsx", "utf8");
const settingsPage = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
const proxy = readFileSync("src/proxy.ts", "utf8");
const messages = readFileSync("src/lib/i18n/messages.ts", "utf8");
const deletion = readFileSync("src/lib/services/account-deletion-service.ts", "utf8");
const privacy = readFileSync("src/lib/services/privacy-authority-service.ts", "utf8");

const signIn = login.slice(login.indexOf('if (mode === "sign-in")'), login.indexOf("let accessKeyClaimToken"));
assert.ok(signIn.indexOf("signInWithPassword") < signIn.indexOf("getAuthenticatorAssuranceLevel"));
assert.ok(signIn.indexOf("getAuthenticatorAssuranceLevel") < signIn.indexOf("window.location.assign(nextPath)"));
assert.match(signIn, /nextLevel === "aal2"/);
assert.match(signIn, /currentLevel !== "aal2"/);
assert.match(signIn, /href\("\/mfa"\)/);

assert.match(challenge, /mfa\.listFactors\(\)/);
assert.match(challenge, /mfa\.challengeAndVerify/);
assert.match(challenge, /getSafeAuthRedirectPath/);
assert.match(challenge, /autoComplete="one-time-code"/);
assert.doesNotMatch(challenge, /console\.|localStorage|sessionStorage/);

assert.match(settings, /mfa\.enroll/);
assert.match(settings, /factorType: "totp"/);
assert.match(settings, /mfa\.challengeAndVerify/);
assert.match(settings, /status === "unverified"/);
assert.match(settings, /mfa\.unenroll/);
assert.doesNotMatch(settings, /\.totp\.secret|\.totp\.uri|console\.|localStorage|sessionStorage/);
assert.match(settingsPage, /<MfaSecurityCard \/>/);

assert.doesNotMatch(proxy.match(/const PUBLIC_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "", /"\/mfa"/);
assert.equal((messages.match(/"auth\.mfaChallengeTitle":/g) ?? []).length, 3);
assert.equal((messages.match(/"auth\.mfaRecoveryBody":/g) ?? []).length, 3);
assert.match(deletion, /currentLevel !== "aal2"/);
assert.match(privacy, /currentLevel !== "aal2"/);

console.log("MFA enrollment, challenge, localization, and high-risk gate contract: PASS");
