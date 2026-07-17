#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  fenceGhlMarketplaceRefreshAmbiguity,
  GhlMarketplaceRefreshAmbiguityFenceError,
  GhlMarketplaceRefreshDispositionFenceError,
  settleGhlMarketplaceRefreshProviderFailure,
} from "../src/lib/services/ghl-marketplace-runtime-service";
import { GhlMarketplaceProviderError } from "../src/lib/integrations/gohighlevel/marketplace-runtime-contract";

const TOKEN_SET_ID = "10000000-0000-4000-8000-000000000001";
const CLAIM_TOKEN = "20000000-0000-4000-8000-000000000002";
const serviceSource = fs.readFileSync(
  new URL("../src/lib/services/ghl-marketplace-runtime-service.ts", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260717013000_complete_ghl_marketplace_runtime_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.match(
  serviceSource,
  /const token = await client\.refresh\([\s\S]*?providerResponseReceived = true;[\s\S]*?assertGhlMarketplaceTokenBinding/,
  "the rotating-token response boundary must be recorded before binding, staging, or settlement",
);
assert.match(migrationSource, /mark_ghl_marketplace_token_refresh_reconnect_required_v2/);
assert.match(migrationSource, /revocation_code='ghl_refresh_reconnect_required'/);
assert.match(migrationSource, /'ghl_refresh_reconnect_required:' \|\| p_failure_code/);
assert.match(migrationSource, /release_ghl_marketplace_token_refresh_retry_v2/);
assert.match(migrationSource, /'retry_released'/);
assert.match(
  serviceSource,
  /else if \(error instanceof GhlMarketplaceProviderError\) \{[\s\S]*?await settleGhlMarketplaceRefreshProviderFailure/,
  "provider-confirmed deterministic failures must leave refreshing through an exact durable disposition",
);
assert.match(
  serviceSource,
  /if \(providerResponseReceived \|\| \(error instanceof GhlMarketplaceProviderError && error\.uncertain\)\) \{[\s\S]*?await fenceGhlMarketplaceRefreshAmbiguity/,
  "every post-provider failure and uncertain transport failure must execute the durable fence",
);

async function provePostProviderFailureIsFenced(label: string) {
  const originalFailure = new Error(label);
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return { data: "operator_required", error: null };
    },
  };

  await fenceGhlMarketplaceRefreshAmbiguity({
    client,
    tokenSetId: TOKEN_SET_ID,
    claimToken: CLAIM_TOKEN,
    expectedGeneration: 7,
    originalFailure,
  });

  assert.deepEqual(calls, [{
    name: "mark_ghl_marketplace_token_refresh_ambiguous_v2",
    params: {
      p_token_set_id: TOKEN_SET_ID,
      p_claim_token: CLAIM_TOKEN,
      p_expected_generation: 7,
    },
  }], `${label} must execute one exact durable operator-required fence`);
}

async function main() {
  await provePostProviderFailureIsFenced("token_binding_failed_after_rotating_refresh");
  await provePostProviderFailureIsFenced("credential_staging_failed_after_rotating_refresh");
  await provePostProviderFailureIsFenced("settlement_failed_after_rotating_refresh");

  const originalFailure = new Error("settlement_failed_after_rotating_refresh");
  await assert.rejects(
    () => fenceGhlMarketplaceRefreshAmbiguity({
      client: {
        async rpc() {
          return { data: "stale_claim", error: null };
        },
      },
      tokenSetId: TOKEN_SET_ID,
      claimToken: CLAIM_TOKEN,
      expectedGeneration: 7,
      originalFailure,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GhlMarketplaceRefreshAmbiguityFenceError);
      assert.equal(error.code, "ghl_marketplace_refresh_ambiguity_fence_failed");
      assert.equal(error.retryable, false);
      assert.equal(error.cause, originalFailure, "the original post-provider failure must remain causal evidence");
      return true;
    },
    "an unconfirmed ambiguity fence must fail closed and refuse ordinary retry classification",
  );

  await assert.rejects(
    () => fenceGhlMarketplaceRefreshAmbiguity({
      client: {
        async rpc() {
          return await new Promise(() => {});
        },
      },
      tokenSetId: TOKEN_SET_ID,
      claimToken: CLAIM_TOKEN,
      expectedGeneration: 7,
      originalFailure,
      timeoutMs: 5,
    }),
    (error: unknown) =>
      error instanceof GhlMarketplaceRefreshAmbiguityFenceError && error.retryable === false,
    "an unavailable ambiguity fence must be bounded and fail closed",
  );

  for (const providerFailure of [
    new GhlMarketplaceProviderError("ghl_refresh_token_invalid", 400, "request-400", false),
    new GhlMarketplaceProviderError("ghl_oauth_credential_rejected", 401, "request-401", false),
  ]) {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const outcome = await settleGhlMarketplaceRefreshProviderFailure({
      client: {
        async rpc(name, params) {
          calls.push({ name, params });
          return { data: "reconnect_required", error: null };
        },
      },
      tokenSetId: TOKEN_SET_ID,
      claimToken: CLAIM_TOKEN,
      expectedGeneration: 7,
      providerError: providerFailure,
    });
    assert.equal(outcome, "reconnect_required");
    assert.deepEqual(calls, [{
      name: "mark_ghl_marketplace_token_refresh_reconnect_required_v2",
      params: {
        p_token_set_id: TOKEN_SET_ID,
        p_claim_token: CLAIM_TOKEN,
        p_expected_generation: 7,
        p_failure_code: providerFailure.code,
      },
    }], `${providerFailure.status} must produce one terminal reconnect receipt`);
  }

  for (const providerFailure of [
    new GhlMarketplaceProviderError("ghl_oauth_rate_limited", 429, "request-429", false),
    new GhlMarketplaceProviderError("ghl_oauth_provider_unavailable", 503, "request-503", false),
  ]) {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const outcome = await settleGhlMarketplaceRefreshProviderFailure({
      client: {
        async rpc(name, params) {
          calls.push({ name, params });
          return { data: "retry_released", error: null };
        },
      },
      tokenSetId: TOKEN_SET_ID,
      claimToken: CLAIM_TOKEN,
      expectedGeneration: 7,
      providerError: providerFailure,
    });
    assert.equal(outcome, "retry_released");
    assert.equal(calls[0]?.name, "release_ghl_marketplace_token_refresh_retry_v2");
  }

  const terminalFailure = new GhlMarketplaceProviderError(
    "ghl_refresh_token_invalid",
    400,
    "request-fence-failure",
    false,
  );
  await assert.rejects(
    () => settleGhlMarketplaceRefreshProviderFailure({
      client: { async rpc() { return { data: "stale_claim", error: null }; } },
      tokenSetId: TOKEN_SET_ID,
      claimToken: CLAIM_TOKEN,
      expectedGeneration: 7,
      providerError: terminalFailure,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GhlMarketplaceRefreshDispositionFenceError);
      assert.equal(error.retryable, false);
      assert.equal(error.cause, terminalFailure);
      return true;
    },
    "an unconfirmed deterministic disposition must never become a blind retry",
  );

  console.log("GHL Marketplace rotating-refresh fencing: PASS (400/401 terminal, 429/5xx released, post-response ambiguity fenced; zero provider effects).\n");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
