-- The platform operator grant table is intentionally unreadable through the
-- PostgREST service role. Expose only the yes/no fact required by the signed
-- HighLevel embed authority check, without weakening the table ACL or leaking
-- grant details.

create or replace function public.has_platform_operator_grant_v1(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'platform_operator_grant_probe_service_role_required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'platform_operator_grant_probe_user_required' using errcode = '22023';
  end if;
  return exists (
    select 1
    from public.platform_operator_grants grant_row
    where grant_row.user_id = p_user_id
  );
end;
$$;

revoke all on function public.has_platform_operator_grant_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.has_platform_operator_grant_v1(uuid)
  to service_role;

do $dealflow_operator_grant_probe_postconditions$
begin
  if to_regprocedure('public.has_platform_operator_grant_v1(uuid)') is null then
    raise exception 'service-only operator grant probe is missing' using errcode = '55000';
  end if;
  if has_table_privilege('service_role', 'public.platform_operator_grants', 'select') then
    raise exception 'operator grant table became directly readable by service role' using errcode = '55000';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.has_platform_operator_grant_v1(uuid)',
    'execute'
  ) then
    raise exception 'service-only operator grant probe is not executable' using errcode = '55000';
  end if;
end;
$dealflow_operator_grant_probe_postconditions$;

comment on function public.has_platform_operator_grant_v1(uuid) is
  'Returns only whether a user has ever held a platform operator grant. Service-role execution only; grant details remain unreadable.';
