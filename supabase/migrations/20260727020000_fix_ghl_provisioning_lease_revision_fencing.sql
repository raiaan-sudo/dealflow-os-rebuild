-- Keep GHL provisioning worker leases inside the same optimistic-revision
-- contract enforced for every provisioning-run update.
--
-- The original claim/release routines advanced only the lease generation.
-- `enforce_ghl_provisioning_transition()` correctly rejects every update that
-- does not also advance `revision` by exactly one, which made the real worker
-- unable to claim any run. Claim and release now advance both independent
-- fences atomically.

create or replace function public.claim_next_ghl_provisioning_run_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provisioning_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if p_environment not in ('production', 'sandbox')
     or nullif(trim(p_worker_id), '') is null then
    raise exception 'Invalid GHL provisioning worker authority.';
  end if;

  if not exists (
    select 1
    from public.ghl_runtime_controls
    where environment = p_environment
      and provisioning_writes_enabled
  ) then
    raise exception 'GHL provisioning database kill switch is closed.';
  end if;

  with candidate as (
    select run.id
    from public.ghl_provisioning_runs run
    where run.environment = p_environment
      and run.state not in ('ready', 'operator_action_required', 'canceled')
      and (run.next_retry_at is null or run.next_retry_at <= p_now)
      and (run.locked_until is null or run.locked_until <= p_now)
    order by run.requested_at, run.id
    for update skip locked
    limit 1
  )
  update public.ghl_provisioning_runs run
  set locked_by = trim(p_worker_id),
      locked_at = p_now,
      locked_until =
        p_now
        + (
          least(greatest(p_lease_ms, 1000), 3600000)::text
          || ' milliseconds'
        )::interval,
      lease_token = gen_random_uuid(),
      lease_generation = run.lease_generation + 1,
      revision = run.revision + 1,
      updated_at = greatest(run.updated_at, p_now)
  from candidate
  where run.id = candidate.id
  returning run.id into claimed_id;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.ghl_provisioning_runs
  where id = claimed_id;
end;
$$;

create or replace function public.release_ghl_provisioning_run_claim_v1(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ghl_provisioning_runs run
  set locked_by = null,
      locked_at = null,
      locked_until = null,
      lease_token = null,
      revision = run.revision + 1,
      updated_at = greatest(run.updated_at, p_now)
  where run.id = p_run_id
    and run.locked_by = trim(p_worker_id)
    and run.lease_token = p_lease_token
    and run.lease_generation = p_lease_generation
    and run.locked_until > p_now;

  return found;
end;
$$;

revoke all on function public.claim_next_ghl_provisioning_run_v1(
  text,
  text,
  timestamptz,
  integer
) from public, anon, authenticated;
grant execute on function public.claim_next_ghl_provisioning_run_v1(
  text,
  text,
  timestamptz,
  integer
) to service_role;

revoke all on function public.release_ghl_provisioning_run_claim_v1(
  uuid,
  text,
  uuid,
  bigint,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.release_ghl_provisioning_run_claim_v1(
  uuid,
  text,
  uuid,
  bigint,
  timestamptz
) to service_role;
