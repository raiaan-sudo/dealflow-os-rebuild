#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REQUIRED = "20260717010000_harden_onboarding_draft_integrity.sql";
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfob_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "a1000000-0000-4000-8000-000000000001";
const USER_B = "a1000000-0000-4000-8000-000000000002";
const ORG_A = "a2000000-0000-4000-8000-000000000001";
const ORG_B = "a2000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "a3000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "a3000000-0000-4000-8000-000000000002";
const SUBMISSION_DIGEST = "b".repeat(64);
const PROVENANCE_DIGEST_A = "c".repeat(64);
const PROVENANCE_DIGEST_B = "d".repeat(64);

function installRemoteDefaults(session) {
  session.psql(`
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on functions to postgres, anon, authenticated, service_role;
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
  `);
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
    if (file === REQUIRED) {
      session.psql(`begin; set role postgres; ${source} reset role; commit;`, {
        label: `Replay ${file}`,
        timeoutMs: 180_000,
      });
    }
  }
}

function asAuthenticated(userId, sql) {
  return `set role authenticated;
    set request.jwt.claim.role = 'authenticated';
    set request.jwt.claim.sub = '${userId}';
    ${sql}
    reset role;`;
}

function saveDraft({ userId, organizationId, revision, payload = '{"market":"Toronto"}' }) {
  return asAuthenticated(userId, `select accepted_revision::text || '|' || accepted_payload_digest
    from public.save_onboarding_draft_v2(
      '${organizationId}', '${userId}', ${revision}, 1, '${payload}'::jsonb, 'market', 1
    );`);
}

function submitDraft({ userId, organizationId, campaignId, revision, draftDigest, provenanceDigest }) {
  const submission = { market: "Toronto" };
  const plan = {
    onboarding_contract: submission,
    onboarding_provenance: {
      provenanceVersion: 1,
      draftPayloadDigest: draftDigest,
      submissionInputDigest: SUBMISSION_DIGEST,
      provenanceDigest,
    },
  };
  return `set role service_role;
    set request.jwt.claim.role = 'service_role';
    select submitted_campaign_id::text || '|' || consumed_revision::text || '|' || reused_existing::text
    from public.submit_onboarding_draft_v2(
      '${organizationId}', '${userId}', ${revision}, '{"market":"Toronto"}'::jsonb,
      '${draftDigest}', '${JSON.stringify(submission)}'::jsonb, '${SUBMISSION_DIGEST}', 1,
      '${provenanceDigest}', '${campaignId}', '${JSON.stringify(plan)}'::jsonb
    );
    reset role;`;
}

let createdPostgresRole = false;
try {
  assert.ok(migrations.length >= 109, "test requires the hardened onboarding migration chain");
  assert.ok(migrations.includes(REQUIRED));
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);
    session.psql(`
      insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');
      insert into public.users(id,email) values
        ('${USER_A}','onboarding-a@example.invalid'), ('${USER_B}','onboarding-b@example.invalid');
      insert into public.organizations(id,name,slug,owner_user_id) values
        ('${ORG_A}','Onboarding A','onboarding-a','${USER_A}'),
        ('${ORG_B}','Onboarding B','onboarding-b','${USER_B}');
      insert into public.organization_memberships(organization_id,user_id,role) values
        ('${ORG_A}','${USER_A}','owner'), ('${ORG_B}','${USER_B}','owner');
    `);

    const firstSave = session.psql(saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 0 }));
    const [, digestA] = firstSave.split("|");
    assert.match(firstSave, /^1\|[0-9a-f]{64}$/);
    assert.match(session.psql(saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 1 })), /^2\|/);
    session.psqlMustFail(
      saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 1 }),
      /onboarding_draft_stale_revision/i,
    );
    session.psqlMustFail(
      saveDraft({ userId: USER_A, organizationId: ORG_B, revision: 0 }),
      /onboarding_draft_actor_not_member/i,
    );

    session.psql(`update public.onboarding_drafts set expires_at=now()-interval '1 second'
      where organization_id='${ORG_A}' and user_id='${USER_A}';`);
    assert.equal(
      session.psql(asAuthenticated(USER_A, `select count(*) from public.onboarding_drafts
        where organization_id='${ORG_A}' and user_id='${USER_A}';`)),
      "0",
      "expired draft remained RLS-visible",
    );
    session.psqlMustFail(
      saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 2 }),
      /onboarding_draft_expired/i,
    );
    session.psql(asAuthenticated(USER_A, `select public.delete_onboarding_draft_v2('${ORG_A}','${USER_A}',2);`));

    const recreated = session.psql(saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 0 }));
    const [, recreatedDigest] = recreated.split("|");
    session.psqlMustFail(
      asAuthenticated(USER_A, `select * from public.submit_onboarding_draft_v2(
        '${ORG_A}','${USER_A}',1,'{"market":"Toronto"}'::jsonb,'${recreatedDigest}',
        '{"market":"Toronto"}'::jsonb,'${SUBMISSION_DIGEST}',1,'${PROVENANCE_DIGEST_A}',
        '${CAMPAIGN_A}','{}'::jsonb);`),
      /permission denied|onboarding_submit_service_role_required/i,
    );
    assert.equal(
      session.psql(submitDraft({
        userId: USER_A, organizationId: ORG_A, campaignId: CAMPAIGN_A, revision: 1,
        draftDigest: recreatedDigest, provenanceDigest: PROVENANCE_DIGEST_A,
      })),
      `${CAMPAIGN_A}|2|false`,
    );
    assert.equal(
      session.psql(saveDraft({ userId: USER_A, organizationId: ORG_A, revision: 1 })),
      `1|${recreatedDigest}`,
      "an exact lost-response replay could not recover its pre-consumption receipt",
    );
    assert.equal(
      session.psql(submitDraft({
        userId: USER_A, organizationId: ORG_A, campaignId: CAMPAIGN_A, revision: 1,
        draftDigest: recreatedDigest, provenanceDigest: PROVENANCE_DIGEST_A,
      })),
      `${CAMPAIGN_A}|2|true`,
    );
    assert.equal(session.psql(`select count(*) from public.campaign_plans where id='${CAMPAIGN_A}';`), "1");
    assert.equal(session.psql(`select count(*) from public.onboarding_drafts
      where organization_id='${ORG_A}' and user_id='${USER_A}';`), "0");
    assert.equal(session.psql(`select count(*) from public.onboarding_submission_receipts
      where organization_id='${ORG_A}' and campaign_id='${CAMPAIGN_A}';`), "1");
    session.psqlMustFail(
      submitDraft({ userId: USER_A, organizationId: ORG_A, campaignId: CAMPAIGN_A, revision: 1,
        draftDigest: recreatedDigest, provenanceDigest: PROVENANCE_DIGEST_B }),
      /onboarding_submit_consumed_collision/i,
    );

    const saveB = session.psql(saveDraft({ userId: USER_B, organizationId: ORG_B, revision: 0 }));
    const [, digestB] = saveB.split("|");
    const concurrent = await session.psqlConcurrent([
      submitDraft({ userId: USER_B, organizationId: ORG_B, campaignId: CAMPAIGN_B, revision: 1,
        draftDigest: digestB, provenanceDigest: PROVENANCE_DIGEST_B }),
      submitDraft({ userId: USER_B, organizationId: ORG_B, campaignId: CAMPAIGN_B, revision: 1,
        draftDigest: digestB, provenanceDigest: PROVENANCE_DIGEST_B }),
    ]);
    const receipts = concurrent.flatMap((output) => output.split(/\r?\n/))
      .filter((line) => line.startsWith(`${CAMPAIGN_B}|`));
    assert.equal(receipts.length, 2);
    assert.equal(receipts.filter((line) => line.endsWith("|false")).length, 1);
    assert.equal(receipts.filter((line) => line.endsWith("|true")).length, 1);
    assert.equal(session.psql(`select count(*) from public.campaign_plans where id='${CAMPAIGN_B}';`), "1");

    assert.equal(
      session.psql(asAuthenticated(USER_B, `select public.delete_onboarding_draft_v2('${ORG_B}','${USER_B}',2);`)),
      "f",
      "DELETE should be idempotent after atomic consumption",
    );
    session.psql(`insert into public.onboarding_drafts (
      organization_id,user_id,contract_version,payload,current_step,furthest_step_index,
      campaign_id,submission_status,revision,expires_at,payload_digest,submitted_at,
      submission_input_digest,provenance_version,provenance_digest
    ) values (
      '${ORG_A}','${USER_A}',1,'{}'::jsonb,'review',9,'${CAMPAIGN_A}','submitted',2,now(),
      '${recreatedDigest}',now(),'${SUBMISSION_DIGEST}',1,'${PROVENANCE_DIGEST_A}'
    );`);
    assert.equal(
      session.psql(asAuthenticated(USER_A, `select public.delete_onboarding_draft_v2('${ORG_A}','${USER_A}',2);`)),
      "f",
      "authenticated DELETE erased a consumed legacy row",
    );
    assert.equal(session.psql(`select count(*) from public.onboarding_drafts
      where organization_id='${ORG_A}' and submission_status='submitted';`), "1");
    assert.equal(session.psql(`select count(*) from public.onboarding_submission_receipts
      where organization_id='${ORG_A}' and campaign_id='${CAMPAIGN_A}';`), "1");
  });

  console.log("PASS onboarding draft integrity disposable DB: expiry, CAS, tenant fence, atomic consume, exact replay, and concurrent convergence");
} finally {
  if (createdPostgresRole) adapter.psql("drop role if exists postgres;");
}
