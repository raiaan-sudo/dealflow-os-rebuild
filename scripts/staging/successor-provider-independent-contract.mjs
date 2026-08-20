import { createHash } from "node:crypto";

export const SUCCESSOR_SCHEMA_VERSION = "20260720010000";

export const SUCCESSOR_GHL_SERVICE_ONLY_TABLES = Object.freeze([
  "ghl_marketplace_oauth_states",
  "ghl_marketplace_authorities",
  "ghl_marketplace_lifecycle_events",
  "ghl_marketplace_token_sets",
  "ghl_marketplace_token_events",
  "ghl_marketplace_location_token_exchanges",
  "ghl_marketplace_realtor_user_operations",
]);

export const SUCCESSOR_STRIPE_SERVICE_ONLY_TABLES = Object.freeze([
  "stripe_checkout_payment_lifecycle",
  "stripe_charge_financial_lifecycle",
  "stripe_refund_lifecycle",
  "stripe_dispute_lifecycle",
]);

export const SUCCESSOR_POST_AUDIT_SERVICE_ONLY_TABLES = Object.freeze([
  "account_deletion_resource_manifest",
  "account_deletion_tombstones",
  "support_delivery_lifecycle_events",
  "support_delivery_lifecycle_state",
  "ghl_funnel_publications",
  "ghl_funnel_publication_receipts",
  "ghl_embed_auth_exchanges",
]);

export const SUCCESSOR_SERVICE_ONLY_TABLES = Object.freeze([
  ...SUCCESSOR_GHL_SERVICE_ONLY_TABLES,
  ...SUCCESSOR_STRIPE_SERVICE_ONLY_TABLES,
  ...SUCCESSOR_POST_AUDIT_SERVICE_ONLY_TABLES,
]);

const EXPECTED_SYNTHETIC_COUNTS = Object.freeze({
  ghl_marketplace_oauth_states: 0,
  ghl_marketplace_authorities: 0,
  ghl_marketplace_lifecycle_events: 0,
  ghl_marketplace_token_sets: 0,
  ghl_marketplace_token_events: 0,
  ghl_marketplace_location_token_exchanges: 0,
  ghl_marketplace_realtor_user_operations: 0,
  stripe_checkout_payment_lifecycle: 1,
  stripe_charge_financial_lifecycle: 0,
  stripe_refund_lifecycle: 0,
  stripe_dispute_lifecycle: 0,
  account_deletion_resource_manifest: 0,
  account_deletion_tombstones: 0,
  support_delivery_lifecycle_events: 0,
  support_delivery_lifecycle_state: 0,
  ghl_funnel_publications: 0,
  ghl_funnel_publication_receipts: 0,
  ghl_embed_auth_exchanges: 0,
});
const PRESERVED_SYNTHETIC_GHL_COUNTS = Object.freeze({
  ghl_marketplace_oauth_states: 7,
  ghl_marketplace_authorities: 1,
  ghl_marketplace_lifecycle_events: 0,
  ghl_marketplace_token_sets: 2,
  ghl_marketplace_token_events: 2,
  ghl_marketplace_location_token_exchanges: 1,
  ghl_marketplace_realtor_user_operations: 0,
  ghl_marketplace_encrypted_credentials: 4,
});
const SERVICE_ROLE_DIRECT_READ_DENIED_TABLES = new Set([
  "ghl_embed_auth_exchanges",
]);

function firstRow(value) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function exactHeadCount(client, table) {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error || !Number.isInteger(result.count)) {
    throw new Error(`Successor service-only ${table} count was unavailable`);
  }
  return result.count;
}

async function inspectPreservedSyntheticGhlAuthority(
  serviceClient,
  preservedGhlOwnerEmailSha256,
) {
  const counts = Object.fromEntries(await Promise.all(
    [...SUCCESSOR_GHL_SERVICE_ONLY_TABLES, "ghl_marketplace_encrypted_credentials"]
      .map(async (table) => [table, await exactHeadCount(serviceClient, table)]),
  ));
  const empty = SUCCESSOR_GHL_SERVICE_ONLY_TABLES.every(
    (table) => counts[table] === EXPECTED_SYNTHETIC_COUNTS[table],
  ) && counts.ghl_marketplace_encrypted_credentials === 0;
  if (empty) {
    return {
      profile: "EMPTY_PROVIDER_INDEPENDENT",
      counts,
      exactSyntheticAuthorityVerified: false,
      rawProviderIdentifiersPersisted: false,
      rawCredentialsPersisted: false,
    };
  }
  for (const [table, expected] of Object.entries(PRESERVED_SYNTHETIC_GHL_COUNTS)) {
    if (counts[table] !== expected) {
      throw new Error(`Preserved synthetic GHL ${table} count was not exact`);
    }
  }

  const oauthStates = assertNoError(
    await serviceClient
      .from("ghl_marketplace_oauth_states")
      .select("organization_id,initiated_by_user_id,partner_id,environment,status,expires_at,consumed_at,installation_id,location_mapping_id")
      .order("created_at", { ascending: true }),
    "read bounded preserved synthetic GHL OAuth receipts",
  );
  const authorities = assertNoError(
    await serviceClient
      .from("ghl_marketplace_authorities")
      .select("id,installation_id,organization_id,location_mapping_id,partner_id,environment,status"),
    "read preserved synthetic GHL authority",
  );
  const tokenSets = assertNoError(
    await serviceClient
      .from("ghl_marketplace_token_sets")
      .select("id,authority_id,organization_id,status"),
    "read preserved synthetic GHL token-set bindings",
  );
  const tokenEvents = assertNoError(
    await serviceClient
      .from("ghl_marketplace_token_events")
      .select("token_set_id,organization_id"),
    "read preserved synthetic GHL token-event bindings",
  );
  const exchanges = assertNoError(
    await serviceClient
      .from("ghl_marketplace_location_token_exchanges")
      .select("authority_id,organization_id,status,result_token_set_id"),
    "read preserved synthetic GHL location-token exchange",
  );
  const credentials = assertNoError(
    await serviceClient
      .from("ghl_marketplace_encrypted_credentials")
      .select("authority_id,organization_id,status"),
    "read preserved synthetic GHL credential bindings",
  );
  const userIds = [...new Set(oauthStates.map(({ initiated_by_user_id: id }) => id))];
  const users = assertNoError(
    await serviceClient.from("users").select("id,email").in("id", userIds),
    "read preserved synthetic GHL owner identity",
  );
  const authority = authorities[0];
  const tokenSetIds = new Set(tokenSets.map(({ id }) => id));
  const now = Date.now();
  const consumedStates = oauthStates.filter(({ status }) => status === "consumed");
  const pendingStates = oauthStates.filter(({ status }) => status === "pending");
  if (
    !/^[0-9a-f]{64}$/.test(preservedGhlOwnerEmailSha256 ?? "") ||
    userIds.length !== 1 ||
    users.length !== 1 ||
    sha256(users[0]?.email?.toLowerCase() ?? "") !== preservedGhlOwnerEmailSha256 ||
    authority?.status !== "active" ||
    authority?.environment !== "sandbox" ||
    authority?.partner_id !== null ||
    !authority?.organization_id ||
    consumedStates.length !== 1 ||
    pendingStates.length !== 6 ||
    oauthStates.some(({ environment, partner_id: partnerId }) =>
      environment !== "sandbox" || partnerId !== null
    ) ||
    pendingStates.some(({ expires_at: expiresAt, consumed_at: consumedAt }) =>
      Date.parse(expiresAt) > now || consumedAt !== null
    ) ||
    consumedStates.some((state) =>
      state.consumed_at == null ||
      state.organization_id !== authority.organization_id ||
      state.installation_id !== authority.installation_id ||
      state.location_mapping_id !== authority.location_mapping_id
    ) ||
    tokenSets.some((row) =>
      row.status !== "active" ||
      row.authority_id !== authority.id ||
      row.organization_id !== authority.organization_id
    ) ||
    tokenEvents.some((row) =>
      !tokenSetIds.has(row.token_set_id) || row.organization_id !== authority.organization_id
    ) ||
    exchanges.some((row) =>
      row.status !== "succeeded" ||
      row.authority_id !== authority.id ||
      row.organization_id !== authority.organization_id ||
      !tokenSetIds.has(row.result_token_set_id)
    ) ||
    credentials.some((row) =>
      row.status !== "active" ||
      row.authority_id !== authority.id ||
      row.organization_id !== authority.organization_id
    )
  ) {
    throw new Error("Preserved synthetic GHL sandbox authority did not match its exact bounded profile");
  }
  return {
    profile: "PRESERVED_ZERO_SPEND_SYNTHETIC_GHL_AUTHORITY",
    counts,
    exactSyntheticAuthorityVerified: true,
    oauthReceiptDisposition: {
      consumed: consumedStates.length,
      expiredPending: pendingStates.length,
    },
    providerMutationPerformed: false,
    customerDataAccessed: false,
    rawProviderIdentifiersPersisted: false,
    rawCredentialsPersisted: false,
  };
}

function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function exactCount(client, table, expected) {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error || result.count !== expected) {
    throw new Error(
      `Successor service-only ${table} readback expected ${expected}, received ${result.count ?? "unknown"}`,
    );
  }
  return result.count;
}

async function assertAuthenticatedTableDenied(client, table) {
  // PostgREST intentionally returns an empty body for denied HEAD requests. In
  // that case supabase-js can only expose `{ message: "" }`, so the SQLSTATE is
  // unavailable even though the response is a correct HTTP 403. A bounded GET
  // preserves the structured 42501 denial needed by this security oracle.
  const result = await client.from(table).select("*").limit(1);
  if (
    !result.error ||
    result.error.code !== "42501" ||
    (Array.isArray(result.data) && result.data.length !== 0)
  ) {
    throw new Error(`Successor service-only ${table} was not denied to authenticated`);
  }
  return { table, denied: true, sqlstate: "42501" };
}

async function assertServiceRoleDirectTableDenied(client, table) {
  const result = await client.from(table).select("*").limit(1);
  if (
    !result.error ||
    result.error.code !== "42501" ||
    (Array.isArray(result.data) && result.data.length !== 0)
  ) {
    throw new Error(`Successor RPC-only ${table} was readable directly by service_role`);
  }
  return { table, denied: true, sqlstate: "42501" };
}

async function assertAuthenticatedRpcDenied(client, functionName, input) {
  const result = await client.rpc(functionName, input);
  if (
    !result.error ||
    result.error.code !== "42501" ||
    (Array.isArray(result.data) && result.data.length !== 0)
  ) {
    throw new Error(`Successor service-only ${functionName} was not denied to authenticated`);
  }
  return { functionName, denied: true, sqlstate: "42501" };
}

export async function proveSyntheticCreditAndPendingStripeLifecycle({
  serviceClient,
  authenticatedClient,
  organizationId,
  userId,
  intentId,
  replayIntentId,
  clientRequestId,
  checkoutSessionId,
}) {
  const intentInput = {
    p_intent_id: intentId,
    p_organization_id: organizationId,
    p_user_id: userId,
    p_client_request_id: clientRequestId,
    p_amount_cents: 2_500,
    p_currency: "usd",
    p_stripe_customer_id: "cus_test_df_successor_credit_20260716",
  };
  const replayInput = { ...intentInput, p_intent_id: replayIntentId };
  const firstIntent = firstRow(assertNoError(
    await serviceClient.rpc("create_credit_top_up_intent_v2", intentInput),
    "create deterministic successor credit top-up intent",
  ));
  const replayIntent = firstRow(assertNoError(
    await serviceClient.rpc("create_credit_top_up_intent_v2", replayInput),
    "replay deterministic successor credit top-up intent",
  ));
  if (
    firstIntent?.intent_id !== intentId ||
    replayIntent?.intent_id !== intentId ||
    replayIntent?.client_request_id !== clientRequestId ||
    replayIntent?.organization_id !== organizationId ||
    replayIntent?.user_id !== userId ||
    replayIntent?.amount_cents !== 2_500 ||
    replayIntent?.currency !== "usd" ||
    replayIntent?.reused_existing !== true
  ) {
    throw new Error("Successor credit top-up v2 replay did not converge on one durable intent");
  }

  const boundIntent = firstRow(assertNoError(
    await serviceClient.rpc("bind_credit_top_up_checkout_v1", {
      p_intent_id: intentId,
      p_organization_id: organizationId,
      p_user_id: userId,
      p_stripe_checkout_session_id: checkoutSessionId,
    }),
    "bind deterministic successor pending checkout identity",
  ));
  if (
    boundIntent?.id !== intentId ||
    boundIntent?.stripe_checkout_session_id !== checkoutSessionId ||
    boundIntent?.status !== "checkout_created"
  ) {
    throw new Error("Successor credit top-up checkout identity was not bound exactly");
  }

  const pendingProjectionInput = {
    p_event_id: "evt_test_df_successor_credit_pending_20260716",
    p_event_type: "checkout.session.completed",
    p_event_created: 1_789_740_000,
    p_checkout_session_id: checkoutSessionId,
    p_checkout_flow: "credit_top_up",
    p_payment_state: "pending",
    p_organization_id: null,
    p_user_id: null,
    p_access_key_id: null,
    p_credit_top_up_intent_id: intentId,
    p_stripe_customer_id: intentInput.p_stripe_customer_id,
    p_stripe_payment_intent_id: null,
    p_stripe_subscription_id: null,
    p_amount_total: 2_500,
    p_currency: "usd",
  };
  const firstProjection = firstRow(assertNoError(
    await serviceClient.rpc(
      "project_stripe_checkout_payment_lifecycle_v1",
      pendingProjectionInput,
    ),
    "project deterministic successor pending Checkout event",
  ));
  const replayProjection = firstRow(assertNoError(
    await serviceClient.rpc(
      "project_stripe_checkout_payment_lifecycle_v1",
      pendingProjectionInput,
    ),
    "replay deterministic successor pending Checkout event",
  ));
  if (
    firstProjection?.current_payment_state !== "pending" ||
    replayProjection?.current_payment_state !== "pending" ||
    replayProjection?.applied !== false ||
    replayProjection?.organization_id !== organizationId ||
    replayProjection?.user_id !== userId ||
    replayProjection?.credit_top_up_intent_id !== intentId
  ) {
    throw new Error("Successor Stripe pending-payment projection was not exactly idempotent");
  }

  const creditLedger = await serviceClient
    .from("user_credit_ledger")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("idempotency_key", `stripe_credit_top_up:${intentId}`);
  if (creditLedger.error || creditLedger.count !== 0) {
    throw new Error("A pending synthetic Stripe Checkout event granted credit");
  }

  const deniedFunctions = await Promise.all([
    assertAuthenticatedRpcDenied(
      authenticatedClient,
      "create_credit_top_up_intent_v2",
      replayInput,
    ),
    assertAuthenticatedRpcDenied(
      authenticatedClient,
      "project_stripe_checkout_payment_lifecycle_v1",
      pendingProjectionInput,
    ),
  ]);

  return {
    creditTopUpIntentId: intentId,
    clientRequestId,
    checkoutSessionId,
    amountCents: 2_500,
    finalIntentStatus: "checkout_created",
    finalPaymentState: "pending",
    semanticReplayIdempotent: true,
    pendingProjectionReplayIdempotent: true,
    pendingPaymentCreditLedgerRows: 0,
    authenticatedRpcDenials: deniedFunctions,
    providerMutationPerformed: false,
    financialEffectPerformed: false,
  };
}

export async function assertSuccessorServiceOnlySchemaReadback({
  serviceClient,
  authenticatedClient,
  preflightGhlEmbedAuthExchangeCount,
  preservedGhlOwnerEmailSha256,
}) {
  const metadata = assertNoError(
    await serviceClient
      .from("app_schema_metadata")
      .select("value")
      .eq("key", "schema_version")
      .single(),
    "read successor schema version",
  );
  if (metadata?.value !== SUCCESSOR_SCHEMA_VERSION) {
    throw new Error("Successor schema version readback is not exact");
  }

  const preservedGhlAuthority = await inspectPreservedSyntheticGhlAuthority(
    serviceClient,
    preservedGhlOwnerEmailSha256,
  );
  const serviceCounts = {};
  const serviceRoleDirectDenials = [];
  for (const table of SUCCESSOR_SERVICE_ONLY_TABLES) {
    if (SERVICE_ROLE_DIRECT_READ_DENIED_TABLES.has(table)) {
      if (preflightGhlEmbedAuthExchangeCount !== EXPECTED_SYNTHETIC_COUNTS[table]) {
        throw new Error(
          `Successor RPC-only ${table} direct PostgreSQL preflight count is not exact`,
        );
      }
      serviceCounts[table] = preflightGhlEmbedAuthExchangeCount;
      serviceRoleDirectDenials.push(
        await assertServiceRoleDirectTableDenied(serviceClient, table),
      );
      continue;
    }
    serviceCounts[table] = SUCCESSOR_GHL_SERVICE_ONLY_TABLES.includes(table)
      ? preservedGhlAuthority.counts[table]
      : await exactCount(serviceClient, table, EXPECTED_SYNTHETIC_COUNTS[table]);
  }
  const authenticatedDenials = [];
  for (const table of SUCCESSOR_SERVICE_ONLY_TABLES) {
    authenticatedDenials.push(await assertAuthenticatedTableDenied(authenticatedClient, table));
  }

  return {
    schemaVersion: SUCCESSOR_SCHEMA_VERSION,
    serviceOnlyTableCount: SUCCESSOR_SERVICE_ONLY_TABLES.length,
    ghlMarketplaceTableCount: SUCCESSOR_GHL_SERVICE_ONLY_TABLES.length,
    stripeLifecycleTableCount: SUCCESSOR_STRIPE_SERVICE_ONLY_TABLES.length,
    postAuditServiceOnlyTableCount: SUCCESSOR_POST_AUDIT_SERVICE_ONLY_TABLES.length,
    serviceCounts,
    preservedGhlAuthority,
    authenticatedDenials,
    authenticatedDenialCount: authenticatedDenials.length,
    serviceRoleDirectDenials,
    serviceRoleDirectDenialCount: serviceRoleDirectDenials.length,
    ghlEmbedAuthExchangeCountSource: "direct_postgres_preseed_read_only",
    exactSyntheticCountsVerified: true,
    providerMutationPerformed: false,
  };
}

export const SUCCESSOR_HOSTED_GATES = Object.freeze({
  optimizerMinimumSampleActiveReceiptProof:
    "BLOCKED_PROVIDER_INDEPENDENT_ACTIVE_META_RECEIPT_REQUIRED",
  ghlMarketplaceInstallLifecycle:
    "BLOCKED_EXTERNAL_GHL_SANDBOX_AUTHORITY",
  stripeSignedWebhookLifecycle:
    "BLOCKED_EXTERNAL_STRIPE_TEST_AUTHORITY",
});
