create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

create or replace function public.cleanup_expired_rate_limit_buckets(p_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.rate_limit_buckets
  where reset_at < timezone('utc', now()) - p_older_than;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_rate_limit_buckets(interval) from public;
grant execute on function public.cleanup_expired_rate_limit_buckets(interval) to service_role;

select public.cleanup_expired_rate_limit_buckets(interval '24 hours');

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260430061000')
on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
