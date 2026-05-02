drop function if exists public.claim_next_system_job(text, integer);

create or replace function public.claim_next_system_job(
  p_worker_id text,
  p_lease_ms integer default 300000
)
returns setof public.system_jobs
language plpgsql
security definer
set search_path = public
as $$
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

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428124500')
on conflict (key) do update
set value = excluded.value;
