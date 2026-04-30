-- Authenticated clients must not be able to self-join arbitrary organizations.
-- Workspace bootstrap uses the server-side service-role path, so public client
-- inserts into organization_memberships are unnecessary and unsafe.
drop policy if exists organization_memberships_insert_self on public.organization_memberships;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_memberships'
      and policyname = 'organization_memberships_insert_self'
  ) then
    raise exception 'Unsafe organization_memberships_insert_self policy still exists';
  end if;
end $$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260430060000')
on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
