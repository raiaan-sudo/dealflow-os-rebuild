#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REQUIRED_MIGRATION = "20260716200000_harden_stripe_payment_lifecycle.sql";
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfsl_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_ID = "d1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "d2000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "d1000000-0000-4000-8000-000000000002";
const OTHER_ORGANIZATION_ID = "d2000000-0000-4000-8000-000000000002";
const ACCESS_KEY_ID = "d3000000-0000-4000-8000-000000000001";
const CREDIT_INTENT_ID = "d4000000-0000-4000-8000-000000000001";
const CREDIT_REQUEST_ID = "d5000000-0000-4000-8000-000000000001";
const SESSION_ID = "cs_subscription_lifecycle";
const ACCESS_SESSION_ID = "cs_access_lifecycle";
const CREDIT_SESSION_ID = "cs_credit_lifecycle";
const CUSTOMER_ID = "cus_subscription_lifecycle";
const CREDIT_CUSTOMER_ID = "cus_credit_lifecycle";
const PAYMENT_INTENT_ID = "pi_credit_lifecycle";

function installRemoteDefaults(session) {
  session.psql(`
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public
      grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public
      grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public
      grant all privileges on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    reset role;
    drop extension pgcrypto;
    set role postgres;
    create extension pgcrypto with schema extensions;
    create extension if not exists pg_stat_statements with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create publication supabase_realtime;
    create schema if not exists storage;
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
      unique (bucket_id, name)
    );
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent disposable database defaults" });
}

function applyAllMigrations(session) {
  for (const file of migrations) {
    let source = readFileSync(join(MIGRATIONS, file), "utf8");
    if (file === TRANSACTION_OWNER) {
      source = source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
    }
    session.psql(`begin; set role postgres; ${source} reset role; commit;`, {
      label: `Apply ${file}`,
      timeoutMs: 180_000,
    });
  }
}

function serviceRole(sql) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql} reset role;`;
}

function checkoutProjection(input) {
  return serviceRole(`select applied::text || '|' || current_payment_state
    from public.project_stripe_checkout_payment_lifecycle_v1(
      '${input.eventId}', '${input.eventType}', ${input.created}, '${input.sessionId}',
      '${input.flow}', '${input.state}',
      ${input.organizationId ? `'${input.organizationId}'` : "null"},
      ${input.userId ? `'${input.userId}'` : "null"},
      ${input.accessKeyId ? `'${input.accessKeyId}'` : "null"},
      ${input.creditIntentId ? `'${input.creditIntentId}'` : "null"},
      '${input.customerId}', '${input.paymentIntentId ?? ""}', '${input.subscriptionId ?? ""}',
      ${input.amount}, 'usd'
    );`);
}

let createdPostgresRole = false;
try {
  assert.ok(migrations.includes(REQUIRED_MIGRATION), "Stripe lifecycle migration is absent from the final chain");
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);
    assert.equal(
      session.psql("select value from public.app_schema_metadata where key='schema_version';"),
      "20260720010000",
    );
    assert.equal(
      session.psql(`select count(*) from information_schema.tables where table_schema='public'
        and table_name in ('stripe_checkout_payment_lifecycle','stripe_charge_financial_lifecycle',
          'stripe_refund_lifecycle','stripe_dispute_lifecycle');`),
      "4",
    );
    assert.equal(
      session.psql(`select count(*) from public.account_deletion_data_inventory
        where relation_name in (
          'stripe_checkout_payment_lifecycle','stripe_charge_financial_lifecycle',
          'stripe_refund_lifecycle','stripe_dispute_lifecycle'
        ) and scope_column='organization_id' and disposition='legal_retain'
          and retention_class='financial' and executor_task='purge_expired_financial_records';`),
      "4",
      "Stripe lifecycle relations are missing explicit financial-retention classifications",
    );

    session.psql(`
      insert into auth.users(id) values ('${USER_ID}'), ('${OTHER_USER_ID}');
      insert into public.users(id, email) values
        ('${USER_ID}', 'stripe-lifecycle@example.invalid'),
        ('${OTHER_USER_ID}', 'stripe-lifecycle-other@example.invalid');
      insert into public.organizations(id, name, slug, owner_user_id) values
        ('${ORGANIZATION_ID}', 'Stripe Lifecycle', 'stripe-lifecycle', '${USER_ID}'),
        ('${OTHER_ORGANIZATION_ID}', 'Stripe Lifecycle Other', 'stripe-lifecycle-other', '${OTHER_USER_ID}');
      insert into public.organization_memberships(organization_id, user_id, role) values
        ('${ORGANIZATION_ID}', '${USER_ID}', 'owner'),
        ('${OTHER_ORGANIZATION_ID}', '${OTHER_USER_ID}', 'owner');
      insert into public.billing_subscriptions(
        organization_id, user_id, stripe_customer_id, stripe_checkout_session_id, plan_tier, status
      ) values (
        '${ORGANIZATION_ID}', '${USER_ID}', '${CUSTOMER_ID}', '${SESSION_ID}', 'pro', 'checkout_started'
      );
      insert into public.billing_access_keys(
        id, key_hash, key_prefix, status, stripe_checkout_session_id, stripe_customer_id,
        plan_tier, metadata
      ) values (
        '${ACCESS_KEY_ID}', repeat('a', 64), 'df_test_access', 'pending_payment',
        '${ACCESS_SESSION_ID}', 'cus_access_lifecycle', 'pro', '{}'::jsonb
      );
    `, { label: "Seed isolated Stripe lifecycle identities" });

    session.psql(serviceRole(`select * from public.create_credit_top_up_intent_v2(
      '${CREDIT_INTENT_ID}', '${ORGANIZATION_ID}', '${USER_ID}', '${CREDIT_REQUEST_ID}',
      2500, 'usd', '${CREDIT_CUSTOMER_ID}'
    ); select * from public.bind_credit_top_up_checkout_v1(
      '${CREDIT_INTENT_ID}', '${ORGANIZATION_ID}', '${USER_ID}', '${CREDIT_SESSION_ID}'
    );`));

    const subscriptionBase = {
      sessionId: SESSION_ID, flow: "subscription", organizationId: ORGANIZATION_ID,
      userId: USER_ID, accessKeyId: null, creditIntentId: null, customerId: CUSTOMER_ID,
      paymentIntentId: "pi_subscription_lifecycle", subscriptionId: "sub_lifecycle", amount: 29700,
    };
    assert.equal(session.psql(checkoutProjection({
      ...subscriptionBase, eventId: "evt_subscription_failed", eventType: "checkout.session.async_payment_failed",
      created: 200, state: "failed",
    })), "true|failed");
    assert.equal(session.psql("select status from public.billing_subscriptions where organization_id='" + ORGANIZATION_ID + "';"), "checkout_failed");
    assert.equal(session.psql(checkoutProjection({
      ...subscriptionBase, eventId: "evt_subscription_pending", eventType: "checkout.session.completed",
      created: 100, state: "pending",
    })), "false|failed", "stale pending event changed current payment state");
    assert.equal(session.psql(checkoutProjection({
      ...subscriptionBase, eventId: "evt_subscription_success", eventType: "checkout.session.async_payment_succeeded",
      created: 150, state: "succeeded",
    })), "true|succeeded", "authoritative delayed success did not recover from an earlier failure");
    assert.equal(session.psql(checkoutProjection({
      ...subscriptionBase, eventId: "evt_subscription_expired", eventType: "checkout.session.expired",
      created: 300, state: "expired",
    })), "false|succeeded", "expired event downgraded a successful payment");

    session.psqlMustFail(checkoutProjection({
      ...subscriptionBase, organizationId: OTHER_ORGANIZATION_ID, userId: OTHER_USER_ID,
      eventId: "evt_subscription_wrong_tenant", eventType: "checkout.session.completed",
      created: 400, state: "succeeded",
    }), /tenant_mismatch|identity_collision/i, { label: "Reject wrong-tenant Checkout metadata" });

    const accessBase = {
      sessionId: ACCESS_SESSION_ID, flow: "access_key", organizationId: null, userId: null,
      accessKeyId: ACCESS_KEY_ID, creditIntentId: null, customerId: "cus_access_lifecycle",
      paymentIntentId: "pi_access_lifecycle", subscriptionId: "sub_access_lifecycle", amount: 29700,
    };
    assert.equal(session.psql(checkoutProjection({
      ...accessBase, eventId: "evt_access_failed", eventType: "checkout.session.async_payment_failed",
      created: 100, state: "failed",
    })), "true|failed");
    assert.equal(session.psql("select status from public.billing_access_keys where id='" + ACCESS_KEY_ID + "';"), "payment_failed");
    assert.equal(session.psql(checkoutProjection({
      ...accessBase, eventId: "evt_access_success", eventType: "checkout.session.async_payment_succeeded",
      created: 110, state: "succeeded",
    })), "true|succeeded");

    const creditBase = {
      sessionId: CREDIT_SESSION_ID, flow: "credit_top_up", organizationId: null, userId: null,
      accessKeyId: null, creditIntentId: CREDIT_INTENT_ID, customerId: CREDIT_CUSTOMER_ID,
      paymentIntentId: PAYMENT_INTENT_ID, subscriptionId: null, amount: 2500,
    };
    assert.equal(session.psql(checkoutProjection({
      ...creditBase, eventId: "evt_credit_pending", eventType: "checkout.session.completed",
      created: 100, state: "pending",
    })), "true|pending");
    assert.equal(session.psql("select count(*) from public.user_credit_ledger where user_id='" + USER_ID + "';"), "0", "pending payment granted credit");
    assert.equal(session.psql(checkoutProjection({
      ...creditBase, eventId: "evt_credit_failed", eventType: "checkout.session.async_payment_failed",
      created: 110, state: "failed",
    })), "true|failed");
    assert.equal(session.psql("select status from public.credit_top_up_intents where id='" + CREDIT_INTENT_ID + "';"), "payment_failed");
    assert.equal(session.psql(checkoutProjection({
      ...creditBase, eventId: "evt_credit_success", eventType: "checkout.session.async_payment_succeeded",
      created: 120, state: "succeeded",
    })), "true|succeeded");

    const completeCredit = (eventId) => serviceRole(`select ledger_id::text || '|' || reused_existing::text
      from public.complete_credit_top_up_intent_v1(
        '${CREDIT_INTENT_ID}', '${CREDIT_SESSION_ID}', '${CREDIT_CUSTOMER_ID}', '${PAYMENT_INTENT_ID}',
        '${eventId}', 2500, 'usd', '{}'::jsonb
      );`);
    const firstCredit = session.psql(completeCredit("evt_credit_success"));
    const replayCredit = session.psql(completeCredit("evt_credit_success_replay"));
    assert.match(firstCredit, /^[0-9a-f-]{36}\|false$/);
    assert.match(replayCredit, /^[0-9a-f-]{36}\|true$/);
    assert.equal(firstCredit.split("|")[0], replayCredit.split("|")[0]);
    assert.equal(session.psql("select balance from public.organization_user_credits where organization_id='" + ORGANIZATION_ID + "' and user_id='" + USER_ID + "';"), "2500");
    assert.equal(session.psql("select count(*) from public.user_credit_ledger where user_id='" + USER_ID + "';"), "1");

    const chargeRefund = (eventId, created, refunded, orgHint = "null") => serviceRole(`
      select applied::text || '|' || coalesce(organization_id::text, 'null') || '|' || operator_action_required::text
      from public.project_stripe_charge_refund_lifecycle_v1(
        '${eventId}', ${created}, 'ch_credit_lifecycle', '${PAYMENT_INTENT_ID}', '${CREDIT_CUSTOMER_ID}',
        ${orgHint}, '${CREDIT_INTENT_ID}', 2500, ${refunded}, 'usd'
      );`);
    assert.equal(session.psql(chargeRefund("evt_charge_refund", 200, 1000)), `true|${ORGANIZATION_ID}|true`);
    assert.equal(session.psql(chargeRefund("evt_charge_refund", 200, 1000)), `false|${ORGANIZATION_ID}|true`);
    assert.equal(session.psql(serviceRole(`
      select applied::text || '|' || coalesce(credit_top_up_intent_id::text, 'null')
      from public.project_stripe_refund_lifecycle_v1(
        'evt_refund_charge_only', 'refund.created', 205, 're_charge_only_lifecycle',
        'ch_credit_lifecycle', null, null, null, 1000, 'usd', 'succeeded', null
      );
    `)), `true|${CREDIT_INTENT_ID}`,
    "charge-only refund identity did not inherit the tenant-bound credit intent");
    session.psqlMustFail(chargeRefund("evt_charge_refund_regression", 210, 500), /stripe_charge_refund_regression/i, {
      label: "Reject regressing cumulative refund truth",
    });
    session.psqlMustFail(chargeRefund("evt_charge_refund_wrong_tenant", 220, 1500, `'${OTHER_ORGANIZATION_ID}'`), /tenant_ambiguity/i, {
      label: "Reject wrong-tenant refund hint",
    });
    assert.equal(session.psql("select status from public.credit_top_up_intents where id='" + CREDIT_INTENT_ID + "';"), "operator_action_required");
    assert.equal(session.psql("select balance from public.organization_user_credits where organization_id='" + ORGANIZATION_ID + "' and user_id='" + USER_ID + "';"), "2500", "refund projection mutated credits without signed clawback policy");

    const refundProjection = (eventId, eventType, created, status) => serviceRole(`
      select applied::text || '|' || operator_action_required::text
      from public.project_stripe_refund_lifecycle_v1(
        '${eventId}', '${eventType}', ${created}, 're_credit_lifecycle', 'ch_credit_lifecycle',
        '${PAYMENT_INTENT_ID}', null, '${CREDIT_INTENT_ID}', 1000, 'usd', '${status}', null
      );`);
    assert.equal(session.psql(refundProjection("evt_refund_created", "refund.created", 300, "succeeded")), "true|true");
    assert.equal(session.psql(refundProjection("evt_refund_stale", "refund.failed", 290, "failed")), "false|true");
    assert.equal(session.psql(refundProjection("evt_refund_failed", "refund.failed", 310, "failed")), "true|false");

    const disputeProjection = (eventId, eventType, created, status, orgHint = "null") => serviceRole(`
      select applied::text || '|' || operator_action_required::text
      from public.project_stripe_dispute_lifecycle_v1(
        '${eventId}', '${eventType}', ${created}, 'dp_credit_lifecycle', 'ch_credit_lifecycle',
        '${PAYMENT_INTENT_ID}', ${orgHint}, '${CREDIT_INTENT_ID}', 2500, 'usd', '${status}', 'fraudulent'
      );`);
    assert.equal(session.psql(disputeProjection("evt_dispute_created", "charge.dispute.created", 400, "needs_response")), "true|true");
    assert.equal(session.psql(disputeProjection("evt_dispute_closed", "charge.dispute.closed", 410, "won")), "true|false");
    assert.equal(session.psql(disputeProjection("evt_dispute_stale", "charge.dispute.updated", 405, "under_review")), "false|false");
    session.psqlMustFail(
      disputeProjection("evt_dispute_wrong_tenant", "charge.dispute.updated", 420, "under_review", `'${OTHER_ORGANIZATION_ID}'`),
      /tenant_ambiguity/i,
      { label: "Reject wrong-tenant dispute hint" },
    );

    session.psql(`insert into public.commercial_activations(
      organization_id,user_id,source_event_id,source_event_type,source_event_created,
      source_payment_id,source_subscription_id,amount_paid_cents,currency,metadata
    ) values (
      '${ORGANIZATION_ID}','${USER_ID}','evt_conflicting_activation','checkout.session.completed',500,
      '${PAYMENT_INTENT_ID}','sub_conflicting_activation',29700,'usd','{}'::jsonb
    );`, { label: "Seed a same-tenant cross-kind Stripe identity collision" });
    session.psqlMustFail(
      serviceRole(`select * from public.project_stripe_charge_refund_lifecycle_v1(
        'evt_cross_kind_collision', 510, 'ch_cross_kind_collision', '${PAYMENT_INTENT_ID}',
        '${CREDIT_CUSTOMER_ID}', null, '${CREDIT_INTENT_ID}', 2500, 100, 'usd'
      );`),
      /stripe_financial_transaction_kind_ambiguity/i,
      { label: "Reject same-tenant cross-kind PaymentIntent ambiguity" },
    );

    session.psqlMustFail(
      `set role authenticated; set request.jwt.claim.role='authenticated';
       select * from public.project_stripe_checkout_payment_lifecycle_v1(
         'evt_forbidden', 'checkout.session.completed', 1, '${SESSION_ID}', 'subscription', 'pending',
         '${ORGANIZATION_ID}', '${USER_ID}', null, null, '${CUSTOMER_ID}', null, null, 29700, 'usd'
       ); reset role;`,
      /permission denied|service_role_required/i,
      { label: "Reject non-service-role lifecycle projection" },
    );
  });

  console.log(`PASS Stripe lifecycle disposable DB: PostgreSQL 17.6, ${migrations.length} migrations, delayed success, replay/reordering, exact-once credit, and tenant-conflict fencing`);
} finally {
  if (createdPostgresRole) adapter.psql("drop role if exists postgres;");
}
