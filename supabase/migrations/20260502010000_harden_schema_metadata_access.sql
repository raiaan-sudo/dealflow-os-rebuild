alter table public.app_schema_metadata enable row level security;

revoke all on table public.app_schema_metadata from public, anon, authenticated;
grant select, insert, update, delete on table public.app_schema_metadata to service_role;

revoke execute on function public.cleanup_expired_rate_limit_buckets(interval) from public, anon, authenticated;
grant execute on function public.cleanup_expired_rate_limit_buckets(interval) to service_role;

do $$
begin
  if to_regprocedure('public.is_org_member(uuid)') is not null then
    revoke execute on function public.is_org_member(uuid) from public, anon, authenticated;
    grant execute on function public.is_org_member(uuid) to service_role;
  end if;
end $$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260502010000')
on conflict (key) do update set value = excluded.value;
