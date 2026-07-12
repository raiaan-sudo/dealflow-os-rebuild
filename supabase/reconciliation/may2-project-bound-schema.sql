


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."is_current_user_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "private"."is_current_user_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_billing_subscription_webhook"("p_organization_id" "uuid", "p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_price_id" "text", "p_plan_tier" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb", "p_stripe_event_id" "text", "p_stripe_event_created" bigint) RETURNS TABLE("applied" boolean, "ignored_reason" "text", "latest_event_created" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_event_created bigint := greatest(coalesce(p_stripe_event_created, 0), 0);
  normalized_event_id text := coalesce(p_stripe_event_id, '');
  stored_event_created bigint;
begin
  if p_organization_id is null then
    raise exception 'p_organization_id is required';
  end if;

  if p_stripe_subscription_id is null or length(trim(p_stripe_subscription_id)) = 0 then
    raise exception 'p_stripe_subscription_id is required';
  end if;

  insert into public.billing_subscriptions (
    organization_id,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    metadata,
    stripe_latest_event_id,
    stripe_latest_event_created,
    updated_at
  )
  values (
    p_organization_id,
    p_user_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    coalesce(nullif(p_plan_tier, ''), 'starter'),
    coalesce(nullif(p_status, ''), 'inactive'),
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    coalesce(p_metadata, '{}'::jsonb),
    p_stripe_event_id,
    normalized_event_created,
    timezone('utc', now())
  )
  on conflict (organization_id) do update
  set user_id = excluded.user_id,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      plan_tier = excluded.plan_tier,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      metadata = excluded.metadata,
      stripe_latest_event_id = excluded.stripe_latest_event_id,
      stripe_latest_event_created = excluded.stripe_latest_event_created,
      updated_at = timezone('utc', now())
  where public.billing_subscriptions.stripe_latest_event_created < excluded.stripe_latest_event_created
     or (
       public.billing_subscriptions.stripe_latest_event_created = excluded.stripe_latest_event_created
       and coalesce(public.billing_subscriptions.stripe_latest_event_id, '') < normalized_event_id
     )
  returning stripe_latest_event_created
  into stored_event_created;

  if stored_event_created is not null then
    applied := true;
    ignored_reason := null;
    latest_event_created := stored_event_created;
    return next;
    return;
  end if;

  select stripe_latest_event_created
  into stored_event_created
  from public.billing_subscriptions
  where organization_id = p_organization_id;

  applied := false;
  ignored_reason := 'stale_event';
  latest_event_created := stored_event_created;
  return next;
end;
$$;


ALTER FUNCTION "public"."apply_billing_subscription_webhook"("p_organization_id" "uuid", "p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_price_id" "text", "p_plan_tier" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb", "p_stripe_event_id" "text", "p_stripe_event_created" bigint) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."system_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "idempotency_key" "text",
    "locked_by" "text",
    "locked_until" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "last_error_code" "text",
    "dead_lettered_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 2 NOT NULL,
    "dead_letter_reason" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "resolution_note" "text"
);

ALTER TABLE ONLY "public"."system_jobs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_jobs" IS 'Internal durable job queue. Direct anon/authenticated access is revoked; application access must go through server-only service-role helpers with tenant filters.';



COMMENT ON COLUMN "public"."system_jobs"."kind" IS 'Application job type such as funnel_generation, creative_generation, meta_sync, or lead_capture_retry.';



COMMENT ON COLUMN "public"."system_jobs"."status" IS 'Database execution status: pending, processing, completed, or failed.';



COMMENT ON COLUMN "public"."system_jobs"."payload" IS 'Job-specific input payload plus tracking metadata such as correlation ID and lifecycle status.';



COMMENT ON COLUMN "public"."system_jobs"."result" IS 'Structured result payload recorded after successful completion when available.';



CREATE OR REPLACE FUNCTION "public"."claim_next_system_job"("p_worker_id" "text", "p_lease_ms" integer DEFAULT 300000) RETURNS SETOF "public"."system_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  claimed_id uuid;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  update public.system_jobs
  set status = 'failed',
      dead_lettered_at = coalesce(dead_lettered_at, now()),
      dead_letter_reason = coalesce(dead_letter_reason, 'Maximum job attempts reached before claim.'),
      locked_by = null,
      locked_until = null,
      completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message, 'Maximum job attempts reached before claim.')
  where dead_lettered_at is null
    and status in ('pending', 'processing')
    and attempt_count >= max_attempts
    and (
      status = 'pending'
      or locked_until is null
      or locked_until <= now()
    );

  with candidate as (
    select id
    from public.system_jobs
    where (
        status = 'pending'
        or (
          status = 'processing'
          and locked_until is not null
          and locked_until <= now()
        )
      )
      and (next_run_at is null or next_run_at <= now())
      and dead_lettered_at is null
      and attempt_count < max_attempts
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.system_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      locked_until = now() + (greatest(p_lease_ms, 1000)::text || ' milliseconds')::interval,
      started_at = coalesce(started_at, now()),
      completed_at = null,
      error_message = null,
      attempt_count = attempt_count + 1
  where id in (select id from candidate)
  returning id into claimed_id;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.system_jobs
  where id = claimed_id;
end;
$$;


ALTER FUNCTION "public"."claim_next_system_job"("p_worker_id" "text", "p_lease_ms" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_system_job"("p_worker_id" "text", "p_lease_ms" integer) IS 'Internal service-role-only claim primitive used by the protected cron runner. Uses SKIP LOCKED leasing and never trusts client tenant input.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_rate_limit_buckets"("p_older_than" interval DEFAULT '24:00:00'::interval) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer;
begin
  delete from public.rate_limit_buckets
  where reset_at < timezone('utc', now()) - p_older_than;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_rate_limit_buckets"("p_older_than" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_rate_limit_bucket"("p_bucket_key" "text", "p_max_requests" integer, "p_window_ms" integer) RETURNS TABLE("allowed" boolean, "remaining" integer, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  bucket public.rate_limit_buckets%rowtype;
  now_at timestamptz := now();
  next_reset timestamptz := now() + (greatest(p_window_ms, 1000)::text || ' milliseconds')::interval;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'bucket_key is required';
  end if;

  if p_max_requests <= 0 then
    raise exception 'max_requests must be positive';
  end if;

  insert into public.rate_limit_buckets (bucket_key, request_count, reset_at)
  values (p_bucket_key, 0, next_reset)
  on conflict (bucket_key) do nothing;

  select *
  into bucket
  from public.rate_limit_buckets
  where rate_limit_buckets.bucket_key = p_bucket_key
  for update;

  if bucket.reset_at <= now_at then
    update public.rate_limit_buckets
    set request_count = 1,
        reset_at = next_reset,
        updated_at = now_at
    where rate_limit_buckets.bucket_key = p_bucket_key;

    allowed := true;
    remaining := greatest(p_max_requests - 1, 0);
    reset_at := next_reset;
    return next;
    return;
  end if;

  if bucket.request_count >= p_max_requests then
    allowed := false;
    remaining := 0;
    reset_at := bucket.reset_at;
    return next;
    return;
  end if;

  update public.rate_limit_buckets
  set request_count = bucket.request_count + 1,
      updated_at = now_at
  where rate_limit_buckets.bucket_key = p_bucket_key;

  allowed := true;
  remaining := greatest(p_max_requests - bucket.request_count - 1, 0);
  reset_at := bucket.reset_at;
  return next;
end;
$$;


ALTER FUNCTION "public"."consume_rate_limit_bucket"("p_bucket_key" "text", "p_max_requests" integer, "p_window_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text" DEFAULT NULL::"text", "p_reference_id" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("allowed" boolean, "balance" integer, "ledger_id" "uuid", "reused_existing" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_balance integer;
  next_balance integer;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'credit reason is required';
  end if;

  if p_idempotency_key is not null then
    select *
      into existing_ledger
      from public.user_credit_ledger
     where idempotency_key = p_idempotency_key
       and user_id = p_user_id
     limit 1;

    if found then
      return query select true, existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance
    into current_balance
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  if current_balance < p_amount then
    return query select false, current_balance, null::uuid, false;
    return;
  end if;

  next_balance := current_balance - p_amount;

  update public.user_credits
     set balance = next_balance,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_organization_id,
    -p_amount,
    next_balance,
    trim(p_reason),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_ledger;

  return query select true, next_balance, inserted_ledger.id, false;
end;
$$;


ALTER FUNCTION "public"."consume_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text" DEFAULT NULL::"text", "p_reference_id" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("balance" integer, "ledger_id" "uuid", "reused_existing" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_balance integer;
  next_balance integer;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'credit reason is required';
  end if;

  if p_idempotency_key is not null then
    select *
      into existing_ledger
      from public.user_credit_ledger
     where idempotency_key = p_idempotency_key
       and user_id = p_user_id
     limit 1;

    if found then
      return query select existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance
    into current_balance
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  next_balance := current_balance + p_amount;

  update public.user_credits
     set balance = next_balance,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_organization_id,
    p_amount,
    next_balance,
    trim(p_reason),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_ledger;

  return query select next_balance, inserted_ledger.id, false;
end;
$$;


ALTER FUNCTION "public"."grant_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_current_user_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = org_id
      and membership.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_org_member"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_provider_usage"("p_organization_id" "uuid", "p_user_id" "uuid", "p_campaign_id" "uuid", "p_provider" "text", "p_operation" "text", "p_limit_count" integer, "p_idempotency_key" "text" DEFAULT NULL::"text", "p_estimated_cost" numeric DEFAULT NULL::numeric) RETURNS TABLE("allowed" boolean, "current_count" integer, "next_count" integer, "limit_count" integer, "usage_id" "uuid", "event_id" "uuid", "reused_existing" boolean, "event_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  today date := current_date;
  usage_row public.provider_usage_limits%rowtype;
  existing_event public.provider_usage_events%rowtype;
  new_event public.provider_usage_events%rowtype;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_limit_count <= 0 then
    raise exception 'p_limit_count must be positive';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_event
    from public.provider_usage_events
    where idempotency_key = p_idempotency_key;

    if existing_event.id is not null then
      select *
      into usage_row
      from public.provider_usage_limits
      where user_id = existing_event.user_id
        and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            coalesce(existing_event.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and provider = existing_event.provider
        and operation = existing_event.operation
        and usage_date = existing_event.usage_date;

      allowed := true;
      current_count := greatest(coalesce(usage_row.usage_count, 1) - 1, 0);
      next_count := coalesce(usage_row.usage_count, 1);
      limit_count := coalesce(usage_row.limit_count, p_limit_count);
      usage_id := usage_row.id;
      event_id := existing_event.id;
      reused_existing := true;
      event_status := existing_event.status;
      return next;
      return;
    end if;
  end if;

  begin
    insert into public.provider_usage_limits (
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      usage_date,
      usage_count,
      limit_count
    )
    values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      p_provider,
      p_operation,
      today,
      0,
      p_limit_count
    );
  exception when unique_violation then
    update public.provider_usage_limits
    set limit_count = p_limit_count,
        updated_at = now()
    where user_id = p_user_id
      and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and provider = p_provider
      and operation = p_operation
      and usage_date = today;
  end;

  select *
  into usage_row
  from public.provider_usage_limits
  where user_id = p_user_id
    and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider
    and operation = p_operation
    and usage_date = today
  for update;

  if usage_row.usage_count >= p_limit_count then
    allowed := false;
    current_count := usage_row.usage_count;
    next_count := usage_row.usage_count;
    limit_count := p_limit_count;
    usage_id := usage_row.id;
    event_id := null;
    reused_existing := false;
    event_status := null;
    return next;
    return;
  end if;

  update public.provider_usage_limits
  set usage_count = usage_row.usage_count + 1,
      limit_count = p_limit_count,
      updated_at = now()
  where id = usage_row.id;

  insert into public.provider_usage_events (
    organization_id,
    user_id,
    campaign_id,
    provider,
    operation,
    idempotency_key,
    usage_date,
    estimated_cost,
    status
  )
  values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    p_provider,
    p_operation,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    today,
    p_estimated_cost,
    'reserved'
  )
  returning * into new_event;

  allowed := true;
  current_count := usage_row.usage_count;
  next_count := usage_row.usage_count + 1;
  limit_count := p_limit_count;
  usage_id := usage_row.id;
  event_id := new_event.id;
  reused_existing := false;
  event_status := new_event.status;
  return next;
end;
$$;


ALTER FUNCTION "public"."reserve_provider_usage"("p_organization_id" "uuid", "p_user_id" "uuid", "p_campaign_id" "uuid", "p_provider" "text", "p_operation" "text", "p_limit_count" integer, "p_idempotency_key" "text", "p_estimated_cost" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creative_id" "text",
    "campaign_id" "uuid",
    "ctr" numeric,
    "cpl" numeric,
    "impressions" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."ad_performance" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone_raw" "text",
    "phone_e164" "text",
    "company_name" "text",
    "brokerage_name" "text",
    "sms_notifications_enabled" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."agent_profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_schema_metadata" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."app_schema_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "appointment_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."appointments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."audit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."autonomy_action_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "action_key" "text" NOT NULL,
    "action_title" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_market" "text",
    "execution_mode" "text" NOT NULL,
    "status" "text" DEFAULT 'executed'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "ai_explanation" "text",
    "expected_outcome" "jsonb",
    "actual_outcome" "jsonb",
    "confidence_score" numeric(4,2) DEFAULT 0 NOT NULL,
    "impact_estimate" numeric(6,2) DEFAULT 0 NOT NULL,
    "urgency" numeric(6,2) DEFAULT 0 NOT NULL,
    "guardrail_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."autonomy_action_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."autonomy_action_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_checkout_session_id" "text",
    "stripe_price_id" "text",
    "plan_tier" "text" DEFAULT 'starter'::"text" NOT NULL,
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "stripe_latest_event_id" "text",
    "stripe_latest_event_created" bigint DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY "public"."billing_subscriptions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."billing_subscriptions" IS 'Stores the authoritative Stripe subscription state used by launch billing gates.';



COMMENT ON COLUMN "public"."billing_subscriptions"."organization_id" IS 'Workspace/organization that owns the billing subscription.';



COMMENT ON COLUMN "public"."billing_subscriptions"."status" IS 'Latest Stripe subscription or checkout status used for access decisions.';



COMMENT ON COLUMN "public"."billing_subscriptions"."stripe_latest_event_id" IS 'Most recent Stripe event ID applied to this billing subscription row.';



COMMENT ON COLUMN "public"."billing_subscriptions"."stripe_latest_event_created" IS 'Most recent Stripe event created timestamp applied to this billing subscription row; older events are ignored.';



CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "legal_name" "text" NOT NULL,
    "industry" "text" DEFAULT 'real_estate'::"text" NOT NULL,
    "website" "text",
    "phone" "text",
    "primary_goal" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."business_profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "text",
    "plan" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ads" "jsonb",
    "business_name" "text",
    "funnel" "jsonb",
    "targeting" "jsonb",
    "offer" "jsonb",
    "creatives" "jsonb",
    "expected_outcomes" "jsonb",
    "strategy" "jsonb",
    "status" "text",
    "client_name" "text",
    "industry" "text",
    "location" "text",
    "budget" "text",
    "user_id" "text",
    "publish_state" "text" DEFAULT 'draft'::"text" NOT NULL,
    "public_slug" "text",
    "staged_snapshot" "jsonb",
    "staged_at" timestamp with time zone,
    "published_snapshot" "jsonb",
    "published_at" timestamp with time zone,
    "launch_status" "text",
    "lead_loop_verified" boolean DEFAULT false,
    "organization_id" "uuid",
    CONSTRAINT "campaign_plans_publish_state_check" CHECK (("publish_state" = ANY (ARRAY['draft'::"text", 'staged'::"text", 'published'::"text"])))
);

ALTER TABLE ONLY "public"."campaign_plans" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_plans"."publish_state" IS 'Public funnel lifecycle state for staged and published campaign previews.';



COMMENT ON COLUMN "public"."campaign_plans"."public_slug" IS 'Public funnel slug used for /f/[slug] lookup. May be projected from campaign_plans.plan when present.';



COMMENT ON COLUMN "public"."campaign_plans"."staged_snapshot" IS 'Immutable campaign snapshot captured when a public funnel is staged.';



COMMENT ON COLUMN "public"."campaign_plans"."published_snapshot" IS 'Immutable campaign snapshot served by public /f/[slug] routes.';



COMMENT ON COLUMN "public"."campaign_plans"."launch_status" IS 'Derived launch status projection from campaign_plans.plan for fast filtering and consistency checks.';



COMMENT ON COLUMN "public"."campaign_plans"."lead_loop_verified" IS 'Derived lead loop verification flag from campaign_plans.plan for dashboard and monitoring queries.';



COMMENT ON COLUMN "public"."campaign_plans"."organization_id" IS 'Workspace that owns the campaign plan; used by billing, Meta launch, and operator visibility.';



CREATE TABLE IF NOT EXISTS "public"."campaign_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "marketing_account_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "spend" numeric(12,2) DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "leads" integer DEFAULT 0 NOT NULL,
    "booked_jobs" integer DEFAULT 0 NOT NULL,
    "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."campaign_snapshots" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creative_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "campaign_id" "uuid",
    "creative_id" "text",
    "copy_id" "text",
    "asset_type" "text",
    "format" "text",
    "generation_method" "text",
    "status" "text",
    "provider_name" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "file_url" "text",
    "provider_asset_id" "text",
    "thumbnail_url" "text",
    "type" "text"
);

ALTER TABLE ONLY "public"."creative_assets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."creative_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "import_type" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "inserted_rows" integer DEFAULT 0 NOT NULL,
    "failed_rows" integer DEFAULT 0 NOT NULL,
    "error_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."data_imports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "appointment_id" "uuid",
    "title" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "deal_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "stage" "text" DEFAULT 'new'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "estimated_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "closed_value" numeric(12,2),
    "commission_revenue" numeric(12,2),
    "market_id" "uuid",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."deals" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "artifact_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "generated_by" "uuid",
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."generated_artifacts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "score" integer NOT NULL,
    "summary" "text",
    "recorded_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "health_scores_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);

ALTER TABLE ONLY "public"."health_scores" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."insights" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "author_user_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."internal_notes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "service_type_id" "uuid",
    "assigned_user_id" "uuid",
    "title" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."jobs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contacted_at" timestamp with time zone,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'contacted'::"text", 'bad_lead'::"text", 'failed'::"text", 'unassigned'::"text"])))
);

ALTER TABLE ONLY "public"."lead_assignments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "message" "text" NOT NULL,
    "provider_message_id" "text",
    "delivery_status" "text" DEFAULT 'recorded'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);

ALTER TABLE ONLY "public"."lead_messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_messages" IS 'Inbound and outbound lead conversation messages with provider delivery truth.';



CREATE TABLE IF NOT EXISTS "public"."lead_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "provider" "text" DEFAULT 'twilio'::"text" NOT NULL,
    "purpose" "text" NOT NULL,
    "provider_message_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_notifications_purpose_check" CHECK (("purpose" = ANY (ARRAY['new_lead_alert'::"text", 'lead_reply_template'::"text"]))),
    CONSTRAINT "lead_notifications_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'undelivered'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."lead_notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "service_type_id" "uuid",
    "assigned_user_id" "uuid",
    "marketing_account_id" "uuid",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "estimated_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "campaign_id" "uuid",
    "name" "text",
    "user_id" "uuid",
    "dedupe_hash" "text",
    "consent_metadata" "jsonb",
    "sms_opted_out_at" timestamp with time zone,
    "tenant_id" "uuid",
    "phone_raw" "text",
    "phone_e164" "text",
    "campaign_name" "text",
    "lead_type" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ad_id" "text",
    "landing_page_url" "text"
);

ALTER TABLE ONLY "public"."leads" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "account_name" "text",
    "external_account_id" "text",
    "pixel_id" "text",
    "access_token_encrypted" "text",
    "connected_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "token_last_synced_at" timestamp with time zone,
    "connection_metadata" "jsonb",
    "launch_domain" "text",
    "verification_token" "text",
    "domain_verified" boolean DEFAULT false NOT NULL,
    "tracking_status" "text" DEFAULT 'not_configured'::"text" NOT NULL,
    "tracking_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tracking_last_checked_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."marketing_accounts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."marketing_accounts"."access_token_encrypted" IS 'Encrypted provider access token for workspace-level Meta OAuth.';



COMMENT ON COLUMN "public"."marketing_accounts"."connection_metadata" IS 'Provider asset discovery and selected Meta ad account/Page/pixel state.';



COMMENT ON COLUMN "public"."marketing_accounts"."launch_domain" IS 'Workspace launch domain used for Meta tracking and preflight checks.';



COMMENT ON COLUMN "public"."marketing_accounts"."verification_token" IS 'Meta domain verification token for the workspace launch domain.';



COMMENT ON COLUMN "public"."marketing_accounts"."domain_verified" IS 'Whether the workspace launch domain has been verified for Meta tracking.';



COMMENT ON COLUMN "public"."marketing_accounts"."tracking_status" IS 'Computed Meta tracking readiness status for pixel and domain verification.';



COMMENT ON COLUMN "public"."marketing_accounts"."tracking_metadata" IS 'Provider-specific tracking verification diagnostics and metadata.';



COMMENT ON COLUMN "public"."marketing_accounts"."tracking_last_checked_at" IS 'Last time Meta tracking readiness was checked.';



CREATE TABLE IF NOT EXISTS "public"."markets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "region" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "priority_level" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."markets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."markets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_launch_locks" (
    "campaign_id" "uuid" NOT NULL,
    "lock_token" "text" NOT NULL,
    "locked_by" "text",
    "locked_until" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."meta_launch_locks" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_launch_locks" OWNER TO "postgres";


COMMENT ON TABLE "public"."meta_launch_locks" IS 'Durable campaign-level launch lease preventing duplicate Meta object creation across serverless instances.';



CREATE TABLE IF NOT EXISTS "public"."organization_admin_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "review_status" "text" DEFAULT 'healthy'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."organization_admin_states" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_admin_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_autonomy_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "autonomy_mode" "text" DEFAULT 'autonomous'::"text" NOT NULL,
    "system_status" "text" DEFAULT 'running'::"text" NOT NULL,
    "max_daily_budget_change" numeric(5,2) DEFAULT 20 NOT NULL,
    "max_lead_flow_drop_tolerance" numeric(5,2) DEFAULT 10 NOT NULL,
    "protected_markets" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "min_confidence_threshold" numeric(4,2) DEFAULT 0.80 NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "failsafe_triggered_at" timestamp with time zone,
    "pause_reason" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."organization_autonomy_settings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_autonomy_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."organization_memberships" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "plan_tier" "text" DEFAULT 'pro'::"text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."organizations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "provider" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "idempotency_key" "text",
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "estimated_cost" numeric(12,4),
    "actual_cost" numeric(12,4),
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_usage_events_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'consumed'::"text", 'released'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."provider_usage_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_usage_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_usage_events" IS 'Per-operation provider budget ledger for cost backpressure, idempotency, and operator audit.';



CREATE TABLE IF NOT EXISTS "public"."provider_usage_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "provider" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "limit_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_usage_limits_count_nonnegative" CHECK (("usage_count" >= 0)),
    CONSTRAINT "provider_usage_limits_limit_positive" CHECK (("limit_count" > 0))
);

ALTER TABLE ONLY "public"."provider_usage_limits" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_usage_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_usage_limits" IS 'Durable per-user/campaign/provider usage ledger for paid generation and provider cost backpressure.';



CREATE TABLE IF NOT EXISTS "public"."rate_limit_buckets" (
    "bucket_key" "text" NOT NULL,
    "request_count" integer NOT NULL,
    "reset_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rate_limit_buckets_count_nonnegative" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."rate_limit_buckets" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limit_buckets" IS 'Durable rate-limit buckets used by public and provider-sensitive routes across Vercel instances.';



CREATE TABLE IF NOT EXISTS "public"."recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."recommendations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "city" "text" NOT NULL,
    "region" "text" NOT NULL,
    "postal_code" "text",
    "country" "text" DEFAULT 'USA'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."service_areas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'core'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."service_types" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "stripe_event_type" "text",
    "stripe_object_id" "text",
    "organization_id" "uuid",
    "stripe_subscription_id" "text",
    "status" "text",
    "processed_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payload" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "resolution_note" "text"
);

ALTER TABLE ONLY "public"."stripe_webhook_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stripe_webhook_events"."payload" IS 'Minimal Stripe event metadata captured at claim time for webhook idempotency and auditability.';



COMMENT ON COLUMN "public"."stripe_webhook_events"."updated_at" IS 'Last webhook processing state transition timestamp used to reclaim stale processing events safely.';



CREATE TABLE IF NOT EXISTS "public"."system_job_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."system_job_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_job_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_job_logs" IS 'Internal append-only job log. Direct anon/authenticated access is revoked; reads must go through server-only service-role helpers scoped to the owning user/job.';



COMMENT ON COLUMN "public"."system_job_logs"."level" IS 'Log severity level such as info, warning, or error.';



CREATE TABLE IF NOT EXISTS "public"."user_credit_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "delta" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "reason" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "text",
    "idempotency_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_credit_ledger_balance_after_nonnegative" CHECK (("balance_after" >= 0)),
    CONSTRAINT "user_credit_ledger_reason_present" CHECK (("length"(TRIM(BOTH FROM "reason")) > 0))
);

ALTER TABLE ONLY "public"."user_credit_ledger" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_credit_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_credit_ledger" IS 'Append-only credit movements for top-ups, paid generation consumption, and refunds.';



CREATE TABLE IF NOT EXISTS "public"."user_credits" (
    "user_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_credits_balance_nonnegative" CHECK (("balance" >= 0))
);

ALTER TABLE ONLY "public"."user_credits" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_credits" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_credits" IS 'Per-user paid generation credit balance. Balance is stored in cents-equivalent integer units.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ad_performance"
    ADD CONSTRAINT "ad_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_profiles"
    ADD CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_profiles"
    ADD CONSTRAINT "agent_profiles_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."app_schema_metadata"
    ADD CONSTRAINT "app_schema_metadata_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."autonomy_action_logs"
    ADD CONSTRAINT "autonomy_action_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_organization_unique" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_plans"
    ADD CONSTRAINT "campaign_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_snapshots"
    ADD CONSTRAINT "campaign_snapshots_marketing_account_id_snapshot_date_key" UNIQUE ("marketing_account_id", "snapshot_date");



ALTER TABLE ONLY "public"."campaign_snapshots"
    ADD CONSTRAINT "campaign_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creative_assets"
    ADD CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_artifacts"
    ADD CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_scores"
    ADD CONSTRAINT "health_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_assignments"
    ADD CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_messages"
    ADD CONSTRAINT "lead_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_notifications"
    ADD CONSTRAINT "lead_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_accounts"
    ADD CONSTRAINT "marketing_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_launch_locks"
    ADD CONSTRAINT "meta_launch_locks_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."organization_admin_states"
    ADD CONSTRAINT "organization_admin_states_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_admin_states"
    ADD CONSTRAINT "organization_admin_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_autonomy_settings"
    ADD CONSTRAINT "organization_autonomy_settings_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_autonomy_settings"
    ADD CONSTRAINT "organization_autonomy_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."provider_usage_events"
    ADD CONSTRAINT "provider_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_usage_limits"
    ADD CONSTRAINT "provider_usage_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_buckets"
    ADD CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("bucket_key");



ALTER TABLE ONLY "public"."recommendations"
    ADD CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_types"
    ADD CONSTRAINT "service_types_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."service_types"
    ADD CONSTRAINT "service_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."system_job_logs"
    ADD CONSTRAINT "system_job_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_jobs"
    ADD CONSTRAINT "system_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_credit_ledger"
    ADD CONSTRAINT "user_credit_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_credits"
    ADD CONSTRAINT "user_credits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_profiles_sms_enabled_idx" ON "public"."agent_profiles" USING "btree" ("tenant_id", "active", "sms_notifications_enabled") WHERE ("phone_e164" IS NOT NULL);



CREATE INDEX "agent_profiles_tenant_id_idx" ON "public"."agent_profiles" USING "btree" ("tenant_id");



CREATE INDEX "agent_profiles_user_id_idx" ON "public"."agent_profiles" USING "btree" ("user_id");



CREATE INDEX "billing_subscriptions_latest_event_idx" ON "public"."billing_subscriptions" USING "btree" ("stripe_latest_event_created" DESC);



CREATE UNIQUE INDEX "billing_subscriptions_stripe_subscription_idx" ON "public"."billing_subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "billing_subscriptions_user_idx" ON "public"."billing_subscriptions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "campaign_plans_organization_idx" ON "public"."campaign_plans" USING "btree" ("organization_id", "created_at" DESC);



CREATE UNIQUE INDEX "campaign_plans_public_slug_idx" ON "public"."campaign_plans" USING "btree" ("public_slug") WHERE ("public_slug" IS NOT NULL);



CREATE INDEX "campaign_plans_publish_state_idx" ON "public"."campaign_plans" USING "btree" ("publish_state");



CREATE UNIQUE INDEX "campaign_plans_published_public_slug_unique_idx" ON "public"."campaign_plans" USING "btree" ("public_slug") WHERE (("public_slug" IS NOT NULL) AND ("publish_state" = 'published'::"text"));



CREATE UNIQUE INDEX "campaign_plans_user_id_unique" ON "public"."campaign_plans" USING "btree" ("user_id");



CREATE INDEX "idx_appointments_org" ON "public"."appointments" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_appointments_org_status" ON "public"."appointments" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_audit_logs_org" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_autonomy_logs_org_action_created" ON "public"."autonomy_action_logs" USING "btree" ("organization_id", "action_key", "created_at" DESC);



CREATE INDEX "idx_autonomy_logs_org_created" ON "public"."autonomy_action_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_autonomy_settings_org" ON "public"."organization_autonomy_settings" USING "btree" ("organization_id");



CREATE INDEX "idx_business_profiles_org" ON "public"."business_profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_campaign_snapshots_org_date" ON "public"."campaign_snapshots" USING "btree" ("organization_id", "snapshot_date" DESC);



CREATE INDEX "idx_creative_assets_provider_asset_id" ON "public"."creative_assets" USING "btree" ("provider_asset_id");



CREATE INDEX "idx_deals_market" ON "public"."deals" USING "btree" ("market_id");



CREATE INDEX "idx_deals_org" ON "public"."deals" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_deals_org_stage" ON "public"."deals" USING "btree" ("organization_id", "stage");



CREATE INDEX "idx_deals_org_status" ON "public"."deals" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_generated_artifacts_org_type_created" ON "public"."generated_artifacts" USING "btree" ("organization_id", "artifact_type", "created_at" DESC);



CREATE INDEX "idx_health_scores_org" ON "public"."health_scores" USING "btree" ("organization_id", "recorded_at" DESC);



CREATE INDEX "idx_imports_org" ON "public"."data_imports" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_insights_org_created" ON "public"."insights" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_internal_notes_org_created" ON "public"."internal_notes" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_jobs_org_created" ON "public"."jobs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_jobs_org_status" ON "public"."jobs" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_leads_org_created" ON "public"."leads" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_leads_org_status" ON "public"."leads" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_marketing_accounts_org" ON "public"."marketing_accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_markets_org" ON "public"."markets" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_org_admin_states_org" ON "public"."organization_admin_states" USING "btree" ("organization_id");



CREATE INDEX "idx_org_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_recommendations_org_created" ON "public"."recommendations" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_service_areas_org" ON "public"."service_areas" USING "btree" ("organization_id");



CREATE INDEX "idx_service_types_org" ON "public"."service_types" USING "btree" ("organization_id");



CREATE INDEX "lead_assignments_agent_id_idx" ON "public"."lead_assignments" USING "btree" ("agent_id");



CREATE INDEX "lead_assignments_assigned_at_idx" ON "public"."lead_assignments" USING "btree" ("assigned_at");



CREATE UNIQUE INDEX "lead_assignments_lead_id_key" ON "public"."lead_assignments" USING "btree" ("lead_id");



CREATE INDEX "lead_assignments_status_idx" ON "public"."lead_assignments" USING "btree" ("status");



CREATE INDEX "lead_assignments_tenant_id_idx" ON "public"."lead_assignments" USING "btree" ("tenant_id");



CREATE INDEX "lead_messages_lead_created_idx" ON "public"."lead_messages" USING "btree" ("lead_id", "created_at");



CREATE INDEX "lead_messages_provider_message_idx" ON "public"."lead_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "lead_messages_provider_message_unique_idx" ON "public"."lead_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "lead_notifications_agent_id_idx" ON "public"."lead_notifications" USING "btree" ("agent_id");



CREATE INDEX "lead_notifications_lead_id_idx" ON "public"."lead_notifications" USING "btree" ("lead_id");



CREATE UNIQUE INDEX "lead_notifications_once_per_lead_agent_purpose" ON "public"."lead_notifications" USING "btree" ("tenant_id", "lead_id", "agent_id", "purpose") WHERE ("agent_id" IS NOT NULL);



CREATE UNIQUE INDEX "lead_notifications_once_per_lead_unassigned_purpose" ON "public"."lead_notifications" USING "btree" ("tenant_id", "lead_id", "purpose") WHERE ("agent_id" IS NULL);



CREATE UNIQUE INDEX "lead_notifications_provider_message_id_key" ON "public"."lead_notifications" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "lead_notifications_status_idx" ON "public"."lead_notifications" USING "btree" ("status");



CREATE INDEX "lead_notifications_tenant_id_idx" ON "public"."lead_notifications" USING "btree" ("tenant_id");



CREATE INDEX "leads_ad_id_idx" ON "public"."leads" USING "btree" ("ad_id");



CREATE INDEX "leads_campaign_contact_idx" ON "public"."leads" USING "btree" ("organization_id", "campaign_id", "email", "phone");



CREATE UNIQUE INDEX "leads_dedupe_hash_unique" ON "public"."leads" USING "btree" ("dedupe_hash") WHERE ("dedupe_hash" IS NOT NULL);



CREATE INDEX "leads_phone_e164_idx" ON "public"."leads" USING "btree" ("phone_e164");



CREATE INDEX "leads_tenant_id_idx" ON "public"."leads" USING "btree" ("tenant_id");



CREATE INDEX "marketing_accounts_platform_org_idx" ON "public"."marketing_accounts" USING "btree" ("platform", "organization_id");



CREATE INDEX "meta_launch_locks_expiry_idx" ON "public"."meta_launch_locks" USING "btree" ("locked_until");



CREATE UNIQUE INDEX "provider_usage_events_idempotency_unique" ON "public"."provider_usage_events" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "provider_usage_events_scope_idx" ON "public"."provider_usage_events" USING "btree" ("organization_id", "user_id", "campaign_id", "provider", "operation", "usage_date", "status");



CREATE UNIQUE INDEX "provider_usage_limits_scope_unique_idx" ON "public"."provider_usage_limits" USING "btree" ("user_id", COALESCE("campaign_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "provider", "operation", "usage_date");



CREATE UNIQUE INDEX "rate_limit_buckets_bucket_key_unique" ON "public"."rate_limit_buckets" USING "btree" ("bucket_key");



CREATE INDEX "rate_limit_buckets_reset_at_idx" ON "public"."rate_limit_buckets" USING "btree" ("reset_at");



CREATE INDEX "stripe_webhook_events_organization_idx" ON "public"."stripe_webhook_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "stripe_webhook_events_subscription_idx" ON "public"."stripe_webhook_events" USING "btree" ("stripe_subscription_id", "created_at" DESC);



CREATE INDEX "stripe_webhook_events_unreviewed_failed_idx" ON "public"."stripe_webhook_events" USING "btree" ("status", "created_at" DESC) WHERE ("reviewed_at" IS NULL);



CREATE INDEX "system_job_logs_job_created_idx" ON "public"."system_job_logs" USING "btree" ("job_id", "created_at");



CREATE INDEX "system_jobs_campaign_created_idx" ON "public"."system_jobs" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "system_jobs_campaign_status_idx" ON "public"."system_jobs" USING "btree" ("campaign_id", "status", "created_at") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "system_jobs_claim_idx" ON "public"."system_jobs" USING "btree" ("status", "next_run_at", "locked_until", "created_at");



CREATE UNIQUE INDEX "system_jobs_idempotency_key_unique" ON "public"."system_jobs" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "system_jobs_kind_created_idx" ON "public"."system_jobs" USING "btree" ("kind", "created_at" DESC);



CREATE INDEX "system_jobs_org_status_kind_idx" ON "public"."system_jobs" USING "btree" ("organization_id", "status", "kind", "created_at");



CREATE INDEX "system_jobs_status_created_idx" ON "public"."system_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "system_jobs_unreviewed_issue_idx" ON "public"."system_jobs" USING "btree" ("status", "dead_lettered_at", "created_at" DESC) WHERE ("reviewed_at" IS NULL);



CREATE INDEX "system_jobs_user_created_idx" ON "public"."system_jobs" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "user_credit_ledger_idempotency_unique" ON "public"."user_credit_ledger" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "user_credit_ledger_reference_idx" ON "public"."user_credit_ledger" USING "btree" ("reference_type", "reference_id") WHERE (("reference_type" IS NOT NULL) AND ("reference_id" IS NOT NULL));



CREATE INDEX "user_credit_ledger_user_created_idx" ON "public"."user_credit_ledger" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "set_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_audit_logs_updated_at" BEFORE UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_autonomy_action_logs_updated_at" BEFORE UPDATE ON "public"."autonomy_action_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_business_profiles_updated_at" BEFORE UPDATE ON "public"."business_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_campaign_snapshots_updated_at" BEFORE UPDATE ON "public"."campaign_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_data_imports_updated_at" BEFORE UPDATE ON "public"."data_imports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_deals_updated_at" BEFORE UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_generated_artifacts_updated_at" BEFORE UPDATE ON "public"."generated_artifacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_health_scores_updated_at" BEFORE UPDATE ON "public"."health_scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_insights_updated_at" BEFORE UPDATE ON "public"."insights" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_internal_notes_updated_at" BEFORE UPDATE ON "public"."internal_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_marketing_accounts_updated_at" BEFORE UPDATE ON "public"."marketing_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_markets_updated_at" BEFORE UPDATE ON "public"."markets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_memberships_updated_at" BEFORE UPDATE ON "public"."organization_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_organization_admin_states_updated_at" BEFORE UPDATE ON "public"."organization_admin_states" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_organization_autonomy_settings_updated_at" BEFORE UPDATE ON "public"."organization_autonomy_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_recommendations_updated_at" BEFORE UPDATE ON "public"."recommendations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_areas_updated_at" BEFORE UPDATE ON "public"."service_areas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_types_updated_at" BEFORE UPDATE ON "public"."service_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."autonomy_action_logs"
    ADD CONSTRAINT "autonomy_action_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_plans"
    ADD CONSTRAINT "campaign_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_snapshots"
    ADD CONSTRAINT "campaign_snapshots_marketing_account_id_fkey" FOREIGN KEY ("marketing_account_id") REFERENCES "public"."marketing_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_snapshots"
    ADD CONSTRAINT "campaign_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_artifacts"
    ADD CONSTRAINT "generated_artifacts_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_artifacts"
    ADD CONSTRAINT "generated_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_scores"
    ADD CONSTRAINT "health_scores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_assignments"
    ADD CONSTRAINT "lead_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_assignments"
    ADD CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_messages"
    ADD CONSTRAINT "lead_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_notifications"
    ADD CONSTRAINT "lead_notifications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_notifications"
    ADD CONSTRAINT "lead_notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_marketing_account_id_fkey" FOREIGN KEY ("marketing_account_id") REFERENCES "public"."marketing_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketing_accounts"
    ADD CONSTRAINT "marketing_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."markets"
    ADD CONSTRAINT "markets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_launch_locks"
    ADD CONSTRAINT "meta_launch_locks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_admin_states"
    ADD CONSTRAINT "organization_admin_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_autonomy_settings"
    ADD CONSTRAINT "organization_autonomy_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_events"
    ADD CONSTRAINT "provider_usage_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_events"
    ADD CONSTRAINT "provider_usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_events"
    ADD CONSTRAINT "provider_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_limits"
    ADD CONSTRAINT "provider_usage_limits_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_limits"
    ADD CONSTRAINT "provider_usage_limits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_usage_limits"
    ADD CONSTRAINT "provider_usage_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recommendations"
    ADD CONSTRAINT "recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_types"
    ADD CONSTRAINT "service_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_job_logs"
    ADD CONSTRAINT "system_job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."system_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_credit_ledger"
    ADD CONSTRAINT "user_credit_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_credit_ledger"
    ADD CONSTRAINT "user_credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_credits"
    ADD CONSTRAINT "user_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ad_performance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ad_performance_deny_all" ON "public"."ad_performance" USING (false) WITH CHECK (false);



ALTER TABLE "public"."agent_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_profiles_service_role_all" ON "public"."agent_profiles" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."app_schema_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_member_access" ON "public"."appointments" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_member_access" ON "public"."audit_logs" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."autonomy_action_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "autonomy_action_logs_member_access" ON "public"."autonomy_action_logs" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."billing_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_subscriptions_member_select" ON "public"."billing_subscriptions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_profiles_member_access" ON "public"."business_profiles" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."campaign_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_plans_member_access" ON "public"."campaign_plans" TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR ("owner_id" = ("auth"."uid"())::"text") OR "private"."is_current_user_org_member"("organization_id"))) WITH CHECK ((("user_id" = ("auth"."uid"())::"text") OR ("owner_id" = ("auth"."uid"())::"text") OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."campaign_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_snapshots_member_access" ON "public"."campaign_snapshots" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."creative_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creative_assets_member_access" ON "public"."creative_assets" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."campaign_plans" "campaign_record"
  WHERE (("campaign_record"."id" = "creative_assets"."campaign_id") AND (("campaign_record"."user_id" = ("auth"."uid"())::"text") OR ("campaign_record"."owner_id" = ("auth"."uid"())::"text") OR "private"."is_current_user_org_member"("campaign_record"."organization_id"))))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."campaign_plans" "campaign_record"
  WHERE (("campaign_record"."id" = "creative_assets"."campaign_id") AND (("campaign_record"."user_id" = ("auth"."uid"())::"text") OR ("campaign_record"."owner_id" = ("auth"."uid"())::"text") OR "private"."is_current_user_org_member"("campaign_record"."organization_id")))))));



ALTER TABLE "public"."data_imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_imports_member_access" ON "public"."data_imports" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deals_member_access" ON "public"."deals" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."generated_artifacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_artifacts_member_access" ON "public"."generated_artifacts" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."health_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "health_scores_member_access" ON "public"."health_scores" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."insights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insights_member_access" ON "public"."insights" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."internal_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_notes_member_access" ON "public"."internal_notes" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "jobs_member_access" ON "public"."jobs" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."lead_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_assignments_service_role_all" ON "public"."lead_assignments" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."lead_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_messages_member_access" ON "public"."lead_messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."leads" "lead_record"
  WHERE (("lead_record"."id" = "lead_messages"."lead_id") AND (("lead_record"."user_id" = "auth"."uid"()) OR ("lead_record"."assigned_user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("lead_record"."organization_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."leads" "lead_record"
  WHERE (("lead_record"."id" = "lead_messages"."lead_id") AND (("lead_record"."user_id" = "auth"."uid"()) OR ("lead_record"."assigned_user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("lead_record"."organization_id"))))));



ALTER TABLE "public"."lead_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_notifications_service_role_all" ON "public"."lead_notifications" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_member_access" ON "public"."leads" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("assigned_user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("assigned_user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."marketing_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketing_accounts_member_access" ON "public"."marketing_accounts" TO "authenticated" USING ("private"."is_current_user_org_member"("organization_id")) WITH CHECK ("private"."is_current_user_org_member"("organization_id"));



ALTER TABLE "public"."markets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "markets_member_access" ON "public"."markets" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."meta_launch_locks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meta_launch_locks_member_select" ON "public"."meta_launch_locks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_plans" "campaign_record"
  WHERE (("campaign_record"."id" = "meta_launch_locks"."campaign_id") AND (("campaign_record"."user_id" = ("auth"."uid"())::"text") OR ("campaign_record"."owner_id" = ("auth"."uid"())::"text") OR "private"."is_current_user_org_member"("campaign_record"."organization_id"))))));



CREATE POLICY "org_autonomy_settings_member_access" ON "public"."organization_autonomy_settings" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."organization_admin_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_admin_states_member_access" ON "public"."organization_admin_states" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."organization_autonomy_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_memberships_select_member" ON "public"."organization_memberships" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((("owner_user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("id")));



CREATE POLICY "organizations_update_owner" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."provider_usage_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_usage_events_member_select" ON "public"."provider_usage_events" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."provider_usage_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_usage_limits_member_select" ON "public"."provider_usage_limits" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."rate_limit_buckets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_limit_buckets_deny_all" ON "public"."rate_limit_buckets" USING (false) WITH CHECK (false);



ALTER TABLE "public"."recommendations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recommendations_member_access" ON "public"."recommendations" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_areas_member_access" ON "public"."service_areas" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."service_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_types_member_access" ON "public"."service_types" USING ("public"."is_org_member"("organization_id")) WITH CHECK ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stripe_webhook_events_member_select" ON "public"."stripe_webhook_events" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."system_job_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_job_logs_member_select" ON "public"."system_job_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."system_jobs" "job_record"
  WHERE (("job_record"."id" = "system_job_logs"."job_id") AND (("job_record"."user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("job_record"."organization_id"))))));



ALTER TABLE "public"."system_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_jobs_member_access" ON "public"."system_jobs" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "private"."is_current_user_org_member"("organization_id")));



ALTER TABLE "public"."user_credit_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_credit_ledger_member_select" ON "public"."user_credit_ledger" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_credits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_credits_member_select" ON "public"."user_credits" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_self" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_update_self" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "private"."is_current_user_org_member"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_current_user_org_member"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_current_user_org_member"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_billing_subscription_webhook"("p_organization_id" "uuid", "p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_price_id" "text", "p_plan_tier" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb", "p_stripe_event_id" "text", "p_stripe_event_created" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_billing_subscription_webhook"("p_organization_id" "uuid", "p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_price_id" "text", "p_plan_tier" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_metadata" "jsonb", "p_stripe_event_id" "text", "p_stripe_event_created" bigint) TO "service_role";



GRANT ALL ON TABLE "public"."system_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_next_system_job"("p_worker_id" "text", "p_lease_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_next_system_job"("p_worker_id" "text", "p_lease_ms" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_rate_limit_buckets"("p_older_than" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_rate_limit_buckets"("p_older_than" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_rate_limit_bucket"("p_bucket_key" "text", "p_max_requests" integer, "p_window_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_rate_limit_bucket"("p_bucket_key" "text", "p_max_requests" integer, "p_window_ms" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_user_credits"("p_user_id" "uuid", "p_organization_id" "uuid", "p_amount" integer, "p_reason" "text", "p_reference_type" "text", "p_reference_id" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_current_user_org_member"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_current_user_org_member"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_provider_usage"("p_organization_id" "uuid", "p_user_id" "uuid", "p_campaign_id" "uuid", "p_provider" "text", "p_operation" "text", "p_limit_count" integer, "p_idempotency_key" "text", "p_estimated_cost" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_provider_usage"("p_organization_id" "uuid", "p_user_id" "uuid", "p_campaign_id" "uuid", "p_provider" "text", "p_operation" "text", "p_limit_count" integer, "p_idempotency_key" "text", "p_estimated_cost" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."ad_performance" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance" TO "service_role";



GRANT ALL ON TABLE "public"."agent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."app_schema_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."autonomy_action_logs" TO "anon";
GRANT ALL ON TABLE "public"."autonomy_action_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."autonomy_action_logs" TO "service_role";



GRANT ALL ON TABLE "public"."billing_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_plans" TO "anon";
GRANT ALL ON TABLE "public"."campaign_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_plans" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."campaign_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."creative_assets" TO "anon";
GRANT ALL ON TABLE "public"."creative_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."creative_assets" TO "service_role";



GRANT ALL ON TABLE "public"."data_imports" TO "anon";
GRANT ALL ON TABLE "public"."data_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_imports" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."generated_artifacts" TO "anon";
GRANT ALL ON TABLE "public"."generated_artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."health_scores" TO "anon";
GRANT ALL ON TABLE "public"."health_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."health_scores" TO "service_role";



GRANT ALL ON TABLE "public"."insights" TO "anon";
GRANT ALL ON TABLE "public"."insights" TO "authenticated";
GRANT ALL ON TABLE "public"."insights" TO "service_role";



GRANT ALL ON TABLE "public"."internal_notes" TO "anon";
GRANT ALL ON TABLE "public"."internal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_notes" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."lead_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."lead_messages" TO "anon";
GRANT ALL ON TABLE "public"."lead_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_messages" TO "service_role";



GRANT ALL ON TABLE "public"."lead_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_accounts" TO "anon";
GRANT ALL ON TABLE "public"."marketing_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."markets" TO "anon";
GRANT ALL ON TABLE "public"."markets" TO "authenticated";
GRANT ALL ON TABLE "public"."markets" TO "service_role";



GRANT ALL ON TABLE "public"."meta_launch_locks" TO "anon";
GRANT ALL ON TABLE "public"."meta_launch_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_launch_locks" TO "service_role";



GRANT ALL ON TABLE "public"."organization_admin_states" TO "anon";
GRANT ALL ON TABLE "public"."organization_admin_states" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_admin_states" TO "service_role";



GRANT ALL ON TABLE "public"."organization_autonomy_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_autonomy_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_autonomy_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."provider_usage_events" TO "anon";
GRANT ALL ON TABLE "public"."provider_usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."provider_usage_limits" TO "anon";
GRANT ALL ON TABLE "public"."provider_usage_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_usage_limits" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."recommendations" TO "anon";
GRANT ALL ON TABLE "public"."recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."service_areas" TO "anon";
GRANT ALL ON TABLE "public"."service_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."service_areas" TO "service_role";



GRANT ALL ON TABLE "public"."service_types" TO "anon";
GRANT ALL ON TABLE "public"."service_types" TO "authenticated";
GRANT ALL ON TABLE "public"."service_types" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."system_job_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_credit_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."user_credit_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."user_credits" TO "service_role";
GRANT SELECT ON TABLE "public"."user_credits" TO "authenticated";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































