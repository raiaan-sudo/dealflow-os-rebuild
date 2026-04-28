revoke all on table public.system_jobs from anon, authenticated;
revoke all on table public.system_job_logs from anon, authenticated;

revoke execute on function public.claim_next_system_job(text, integer) from anon, authenticated;
grant execute on function public.claim_next_system_job(text, integer) to service_role;

comment on table public.system_jobs is
  'Internal durable job queue. Direct anon/authenticated access is revoked; application access must go through server-only service-role helpers with tenant filters.';

comment on table public.system_job_logs is
  'Internal append-only job log. Direct anon/authenticated access is revoked; reads must go through server-only service-role helpers scoped to the owning user/job.';

comment on function public.claim_next_system_job(text, integer) is
  'Internal service-role-only claim primitive used by the protected cron runner. Uses SKIP LOCKED leasing and never trusts client tenant input.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428132000')
on conflict (key) do update
set value = excluded.value;
