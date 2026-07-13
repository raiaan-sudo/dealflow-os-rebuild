-- Give continuous reporting a fair, bounded claim lane. The general FIFO queue
-- remains authoritative for every other job kind; this service-role-only claim
-- prevents a 300-campaign reporting workload from starving behind creatives or
-- lead effects (and vice versa).

create or replace function public.claim_next_system_job_kind_v1(
  p_kind text,
  p_worker_id text,
  p_lease_ms integer,
  p_protocol_version integer
) returns setof public.system_jobs
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claimed_id uuid;
begin
  if p_protocol_version is distinct from 1 then
    raise exception using errcode = '22023', message = 'system_job_kind_claim_protocol_unsupported';
  end if;
  if p_kind is distinct from 'meta_reporting_sync' then
    raise exception using errcode = '22023', message = 'system_job_kind_claim_not_allowed';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using errcode = '22023', message = 'system_job_kind_worker_required';
  end if;

  update public.system_jobs
  set status = 'failed',
      dead_lettered_at = coalesce(dead_lettered_at, now()),
      dead_letter_reason = coalesce(dead_letter_reason, 'Maximum reporting attempts reached before claim.'),
      locked_by = null,
      locked_until = null,
      lease_token = null,
      lease_heartbeat_at = null,
      completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message, 'Maximum reporting attempts reached before claim.')
  where kind = p_kind
    and dead_lettered_at is null
    and status in ('pending', 'processing')
    and attempt_count >= max_attempts
    and (status = 'pending' or locked_until is null or locked_until <= now());

  with candidate as (
    select id
    from public.system_jobs
    where kind = p_kind
      and (
        status = 'pending'
        or (status = 'processing' and locked_until is not null and locked_until <= now())
      )
      and (next_run_at is null or next_run_at <= now())
      and dead_lettered_at is null
      and attempt_count < max_attempts
    order by coalesce(next_run_at, created_at) asc, created_at asc, id asc
    for update skip locked
    limit 1
  )
  update public.system_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      locked_until = now() + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
      lease_token = gen_random_uuid(),
      lease_generation = lease_generation + 1,
      lease_heartbeat_at = now(),
      started_at = coalesce(started_at, now()),
      completed_at = null,
      error_message = null,
      attempt_count = attempt_count + 1
  where id in (select id from candidate)
  returning id into claimed_id;

  if claimed_id is null then return; end if;
  return query select * from public.system_jobs where id = claimed_id;
end;
$$;

revoke execute on function public.claim_next_system_job_kind_v1(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_system_job_kind_v1(text, text, integer, integer)
  to service_role;

insert into public.app_schema_metadata(key, value)
values ('schema_version', '20260713020000')
on conflict (key) do update
set value = excluded.value, updated_at = timezone('utc', now());

do $$
begin
  if to_regprocedure('public.claim_next_system_job_kind_v1(text,text,integer,integer)') is null then
    raise exception '20260713020000 postcondition failed: reporting kind claim is missing';
  end if;
  if has_function_privilege('anon', 'public.claim_next_system_job_kind_v1(text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_next_system_job_kind_v1(text,text,integer,integer)', 'EXECUTE') then
    raise exception '20260713020000 postcondition failed: reporting kind claim leaked';
  end if;
end;
$$;
