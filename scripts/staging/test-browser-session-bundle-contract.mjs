#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA,
  browserCookiesForOrigin,
  isAllowedStagingTurnstileRequest,
  parseSyntheticBrowserSessionBundle,
  validateSyntheticBrowserCookieChunks,
} from "./browser-session-bundle-contract.mjs";

const projectRef = "syntheticprojectqibh";
const fingerprint = "a".repeat(64);
const nowSeconds = 2_000_000_000;
const expectedRoleEmails = { paidDirect: "synthetic@example.com" };
const encoded = `base64-${"a".repeat(3_300)}`;
const session = {
  userId: "d0000000-0000-4000-8000-000000000001",
  email: expectedRoleEmails.paidDirect,
  expiresAt: nowSeconds + 3_600,
  cookies: [
    { name: `sb-${projectRef}-auth-token.0`, value: encoded.slice(0, 3_180) },
    { name: `sb-${projectRef}-auth-token.1`, value: encoded.slice(3_180) },
  ],
};
const valid = JSON.stringify({
  schemaVersion: SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA,
  projectFingerprint: fingerprint,
  safeSuffix: "qibh",
  projectRef,
  roles: { paidDirect: session },
});
assert.equal(
  parseSyntheticBrowserSessionBundle(valid, {
    projectRef,
    projectFingerprint: fingerprint,
    safeSuffix: "qibh",
    expectedRoleEmails,
    nowSeconds,
  }).roles.paidDirect.userId,
  session.userId,
);
assert.throws(() => parseSyntheticBrowserSessionBundle("not-json", {
  projectRef,
  projectFingerprint: fingerprint,
  safeSuffix: "qibh",
  expectedRoleEmails,
  nowSeconds,
}));
assert.equal(browserCookiesForOrigin(session, "https://staging.example.com", projectRef).length, 2);
assert.equal(
  validateSyntheticBrowserCookieChunks(
    [{ name: `sb-${projectRef}-auth-token`, value: "base64-YWJj" }],
    projectRef,
  ).length,
  1,
);

for (const mutate of [
  (value) => ({ ...value, schemaVersion: "wrong" }),
  (value) => ({ ...value, projectRef: "wrongqibh" }),
  (value) => ({ ...value, projectFingerprint: "b".repeat(64) }),
  (value) => ({ ...value, safeSuffix: "wrong" }),
  (value) => ({ ...value, unexpected: true }),
  (value) => ({ ...value, roles: {} }),
  (value) => ({ ...value, roles: { ...value.roles, extra: session } }),
  (value) => ({
    ...value,
    roles: { paidDirect: { ...session, accessToken: "must-not-cross-boundary" } },
  }),
  (value) => ({ ...value, roles: { paidDirect: { ...session, expiresAt: nowSeconds + 10 } } }),
  (value) => ({ ...value, roles: { paidDirect: { ...session, email: "wrong@example.com" } } }),
  (value) => ({
    ...value,
    roles: { paidDirect: { ...session, cookies: [session.cookies[1]] } },
  }),
  (value) => ({
    ...value,
    roles: { paidDirect: { ...session, cookies: [session.cookies[0], session.cookies[0]] } },
  }),
  (value) => ({
    ...value,
    roles: { paidDirect: { ...session, cookies: [{ name: "evil", value: "base64-YWJj" }] } },
  }),
  (value) => ({
    ...value,
    roles: {
      paidDirect: {
        ...session,
        cookies: [{ name: `sb-${projectRef}-auth-token`, value: "raw-json" }],
      },
    },
  }),
  (value) => ({
    ...value,
    roles: {
      paidDirect: {
        ...session,
        cookies: [{
          name: `sb-${projectRef}-auth-token`,
          value: "base64-YWJj",
          domain: "evil.example.com",
        }],
      },
    },
  }),
]) {
  const changed = mutate(JSON.parse(valid));
  assert.throws(() => parseSyntheticBrowserSessionBundle(JSON.stringify(changed), {
    projectRef,
    projectFingerprint: fingerprint,
    safeSuffix: "qibh",
    expectedRoleEmails,
    nowSeconds,
  }));
}

assert.throws(() => browserCookiesForOrigin(session, "http://staging.example.com", projectRef));

assert.equal(
  isAllowedStagingTurnstileRequest(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    "GET",
    true,
  ),
  true,
);
assert.equal(
  isAllowedStagingTurnstileRequest(
    "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/test",
    "POST",
    true,
  ),
  true,
);
for (const [url, method, enabled] of [
  ["http://challenges.cloudflare.com/turnstile/v0/api.js", "GET", true],
  ["https://challenges.cloudflare.com:444/turnstile/v0/api.js", "GET", true],
  ["https://user:pass@challenges.cloudflare.com/turnstile/v0/api.js", "GET", true],
  ["https://challenges.cloudflare.com/turnstile/v0/siteverify", "POST", true],
  ["https://evil.challenges.cloudflare.com/turnstile/v0/api.js", "GET", true],
  ["https://challenges.cloudflare.com/turnstile/v0/api.js", "POST", true],
  ["https://challenges.cloudflare.com/turnstile/v0/api.js", "GET", false],
]) {
  assert.equal(isAllowedStagingTurnstileRequest(url, method, enabled), false);
}

process.stdout.write("PASS browser session bundle and staging Turnstile boundary contract\n");
