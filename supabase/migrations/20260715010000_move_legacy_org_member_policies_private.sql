-- public.is_org_member(uuid) is intentionally not executable by API roles.
-- Eighteen legacy member-access policies still called that public helper,
-- which made otherwise-authorized authenticated reads fail with SQLSTATE
-- 42501. Move the complete legacy portfolio to the hardened private helper
-- instead of re-exposing a schema-visible membership RPC.

do $dealflow_legacy_policy_precondition$
declare
  target record;
  policy_record record;
  authenticated_oid oid;
begin
  if to_regprocedure('private.is_current_user_org_member(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'private_org_membership_helper_missing';
  end if;

  if to_regprocedure('public.is_org_member(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'legacy_public_org_membership_helper_missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.is_org_member(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.is_org_member(uuid)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '55000',
      message = 'legacy_public_org_membership_helper_exposed';
  end if;

  if not has_schema_privilege('authenticated', 'private', 'USAGE')
    or not has_function_privilege(
      'authenticated',
      'private.is_current_user_org_member(uuid)',
      'EXECUTE'
    ) then
    raise exception using
      errcode = '55000',
      message = 'private_org_membership_helper_unavailable';
  end if;

  select oid into authenticated_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';

  if authenticated_oid is null then
    raise exception using
      errcode = '55000',
      message = 'authenticated_role_missing';
  end if;

  for target in
    select *
    from (values
      ('appointments', 'appointments_member_access'),
      ('audit_logs', 'audit_logs_member_access'),
      ('autonomy_action_logs', 'autonomy_action_logs_member_access'),
      ('business_profiles', 'business_profiles_member_access'),
      ('campaign_snapshots', 'campaign_snapshots_member_access'),
      ('data_imports', 'data_imports_member_access'),
      ('deals', 'deals_member_access'),
      ('generated_artifacts', 'generated_artifacts_member_access'),
      ('health_scores', 'health_scores_member_access'),
      ('insights', 'insights_member_access'),
      ('internal_notes', 'internal_notes_member_access'),
      ('jobs', 'jobs_member_access'),
      ('markets', 'markets_member_access'),
      ('organization_autonomy_settings', 'org_autonomy_settings_member_access'),
      ('organization_admin_states', 'organization_admin_states_member_access'),
      ('recommendations', 'recommendations_member_access'),
      ('service_areas', 'service_areas_member_access'),
      ('service_types', 'service_types_member_access')
    ) as expected(table_name, policy_name)
  loop
    select
      policy.polcmd,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as with_check_expression
    into policy_record
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = target.table_name
      and policy.polname = target.policy_name;

    if policy_record is null then
      raise exception using
        errcode = '55000',
        message = format(
          'legacy_org_membership_policy_missing:%s.%s',
          target.table_name,
          target.policy_name
        );
    end if;

    if policy_record.polcmd <> '*'
      or policy_record.polpermissive is distinct from true
      or policy_record.using_expression not in (
        'is_org_member(organization_id)',
        'private.is_current_user_org_member(organization_id)'
      )
      or policy_record.with_check_expression not in (
        'is_org_member(organization_id)',
        'private.is_current_user_org_member(organization_id)'
      )
      or policy_record.polroles not in (
        array[0::oid],
        array[authenticated_oid]
      ) then
      raise exception using
        errcode = '55000',
        message = format(
          'legacy_org_membership_policy_shape_mismatch:%s.%s',
          target.table_name,
          target.policy_name
        );
    end if;
  end loop;
end;
$dealflow_legacy_policy_precondition$;

alter policy appointments_member_access on public.appointments
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy audit_logs_member_access on public.audit_logs
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy autonomy_action_logs_member_access on public.autonomy_action_logs
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy business_profiles_member_access on public.business_profiles
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy campaign_snapshots_member_access on public.campaign_snapshots
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy data_imports_member_access on public.data_imports
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy deals_member_access on public.deals
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy generated_artifacts_member_access on public.generated_artifacts
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy health_scores_member_access on public.health_scores
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy insights_member_access on public.insights
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy internal_notes_member_access on public.internal_notes
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy jobs_member_access on public.jobs
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy markets_member_access on public.markets
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy org_autonomy_settings_member_access on public.organization_autonomy_settings
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy organization_admin_states_member_access on public.organization_admin_states
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy recommendations_member_access on public.recommendations
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy service_areas_member_access on public.service_areas
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));
alter policy service_types_member_access on public.service_types
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));

do $dealflow_legacy_policy_postcondition$
declare
  authenticated_oid oid;
  repaired_policy_count integer;
begin
  select oid into authenticated_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';

  select count(*)::integer
  into repaired_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join (values
    ('appointments', 'appointments_member_access'),
    ('audit_logs', 'audit_logs_member_access'),
    ('autonomy_action_logs', 'autonomy_action_logs_member_access'),
    ('business_profiles', 'business_profiles_member_access'),
    ('campaign_snapshots', 'campaign_snapshots_member_access'),
    ('data_imports', 'data_imports_member_access'),
    ('deals', 'deals_member_access'),
    ('generated_artifacts', 'generated_artifacts_member_access'),
    ('health_scores', 'health_scores_member_access'),
    ('insights', 'insights_member_access'),
    ('internal_notes', 'internal_notes_member_access'),
    ('jobs', 'jobs_member_access'),
    ('markets', 'markets_member_access'),
    ('organization_autonomy_settings', 'org_autonomy_settings_member_access'),
    ('organization_admin_states', 'organization_admin_states_member_access'),
    ('recommendations', 'recommendations_member_access'),
    ('service_areas', 'service_areas_member_access'),
    ('service_types', 'service_types_member_access')
  ) as expected(table_name, policy_name)
    on expected.table_name = relation.relname
   and expected.policy_name = policy.polname
  where namespace.nspname = 'public'
    and policy.polcmd = '*'
    and policy.polpermissive
    and policy.polroles = array[authenticated_oid]
    and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      = 'private.is_current_user_org_member(organization_id)'
    and pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      = 'private.is_current_user_org_member(organization_id)';

  if repaired_policy_count <> 18 then
    raise exception using
      errcode = '55000',
      message = format(
        'private_org_membership_policy_portfolio_incomplete:%s/18',
        repaired_policy_count
      );
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where position(
      'is_org_member(' in coalesce(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        ''
      )
    ) > 0
      or position(
        'is_org_member(' in coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        )
      ) > 0
  ) then
    raise exception using
      errcode = '55000',
      message = 'legacy_public_org_membership_policy_reference_remains';
  end if;

  if has_function_privilege(
    'anon',
    'public.is_org_member(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.is_org_member(uuid)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '55000',
      message = 'legacy_public_org_membership_helper_reexposed';
  end if;
end;
$dealflow_legacy_policy_postcondition$;
