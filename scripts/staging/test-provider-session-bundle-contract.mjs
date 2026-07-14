#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  SYNTHETIC_PROVIDER_ROLE_EMAILS,
  SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA,
  parseSyntheticProviderSessionBundle,
} from "./provider-session-bundle-contract.mjs";

const projectRef = "syntheticprojectqibh";
const projectFingerprint = "a".repeat(64);
const nowSeconds = 2_000_000_000;
const accessToken = `eyJ${"a".repeat(80)}.${"b".repeat(80)}.${"c".repeat(80)}`;
const roleEntries = Object.entries(SYNTHETIC_PROVIDER_ROLE_EMAILS).map(
  ([role, email], index) => [role, {
    userId: `d0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    email,
    accessToken,
    expiresAt: nowSeconds + 3_600,
  }],
);
const validValue = {
  schemaVersion: SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA,
  projectFingerprint,
  safeSuffix: "qibh",
  projectRef,
  roles: Object.fromEntries(roleEntries),
};
const parse = (value) => parseSyntheticProviderSessionBundle(JSON.stringify(value), {
  projectRef,
  projectFingerprint,
  safeSuffix: "qibh",
  nowSeconds,
});

assert.equal(parse(validValue).roles.paidDirect.email, SYNTHETIC_PROVIDER_ROLE_EMAILS.paidDirect);
assert.throws(() => parseSyntheticProviderSessionBundle("not-json", {
  projectRef,
  projectFingerprint,
  safeSuffix: "qibh",
  nowSeconds,
}));

for (const mutate of [
  (value) => ({ ...value, schemaVersion: "wrong" }),
  (value) => ({ ...value, projectRef: "wrongqibh" }),
  (value) => ({ ...value, projectFingerprint: "b".repeat(64) }),
  (value) => ({ ...value, safeSuffix: "wrong" }),
  (value) => ({ ...value, unexpected: true }),
  (value) => ({ ...value, roles: { paidDirect: value.roles.paidDirect } }),
  (value) => ({ ...value, roles: { ...value.roles, extra: value.roles.paidDirect } }),
  (value) => ({
    ...value,
    roles: {
      ...value.roles,
      paidDirect: { ...value.roles.paidDirect, email: "wrong@example.com" },
    },
  }),
  (value) => ({
    ...value,
    roles: {
      ...value.roles,
      paidDirect: { ...value.roles.paidDirect, userId: "not-a-uuid" },
    },
  }),
  (value) => ({
    ...value,
    roles: {
      ...value.roles,
      paidDirect: { ...value.roles.paidDirect, accessToken: "not-a-jwt" },
    },
  }),
  (value) => ({
    ...value,
    roles: {
      ...value.roles,
      paidDirect: { ...value.roles.paidDirect, expiresAt: nowSeconds + 10 },
    },
  }),
  (value) => ({
    ...value,
    roles: {
      ...value.roles,
      paidDirect: { ...value.roles.paidDirect, refreshToken: "must-not-cross-boundary" },
    },
  }),
]) {
  assert.throws(() => parse(mutate(structuredClone(validValue))));
}

process.stdout.write("PASS provider session bundle contract\n");
