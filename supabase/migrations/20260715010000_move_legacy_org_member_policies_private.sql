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
  storage_policy_count integer;
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

  select count(*)::integer
  into storage_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy.polname in (
      'import_bucket_member_insert',
      'import_bucket_member_select',
      'import_bucket_member_update'
    );

  if storage_policy_count not in (0, 3) then
    raise exception using
      errcode = '55000',
      message = format(
        'legacy_org_membership_storage_policy_partial:%s/3',
        storage_policy_count
      );
  end if;
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

-- Storage import policies were part of the same legacy helper surface. They
-- are not public-schema policies, so the original eighteen-policy inventory
-- did not include them. Keep the bucket and folder scope unchanged while
-- moving the membership decision behind the same private helper.
do $dealflow_storage_policy_repair$
declare
  organization_expression text;
begin
  -- Hosted Supabase provides storage.foldername(text). The isolated PostgreSQL
  -- replay harness intentionally models storage.objects without installing
  -- Supabase-owned helper functions. Preserve the hosted expression whenever
  -- the helper exists, and use its first-folder equivalent only in that
  -- portable replay shape.
  organization_expression := case
    when to_regprocedure('storage.foldername(text)') is not null then
      '((storage.foldername(name))[1])::uuid'
    else
      '(case when position(''/'' in name) > 0 then split_part(name, ''/'', 1) else null end)::uuid'
  end;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy.polname = 'import_bucket_member_insert'
  ) then
    execute format(
      'alter policy import_bucket_member_insert on storage.objects to authenticated with check (bucket_id = %L::text and private.is_current_user_org_member(%s))',
      'imports',
      organization_expression
    );
    execute format(
      'alter policy import_bucket_member_select on storage.objects to authenticated using (bucket_id = %L::text and private.is_current_user_org_member(%s))',
      'imports',
      organization_expression
    );
    execute format(
      'alter policy import_bucket_member_update on storage.objects to authenticated using (bucket_id = %L::text and private.is_current_user_org_member(%s))',
      'imports',
      organization_expression
    );
  end if;
end;
$dealflow_storage_policy_repair$;

do $dealflow_legacy_policy_postcondition$
declare
  authenticated_oid oid;
  repaired_policy_count integer;
  repaired_storage_policy_count integer;
  total_storage_policy_count integer;
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

  select count(*)::integer
  into repaired_storage_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy.polpermissive
    and policy.polroles = array[authenticated_oid]
    and (
      (
        policy.polname = 'import_bucket_member_insert'
        and policy.polcmd = 'a'
        and policy.polqual is null
        and pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) in (
          '((bucket_id = ''imports''::text) AND private.is_current_user_org_member(((storage.foldername(name))[1])::uuid))',
          '((bucket_id = ''imports''::text) AND private.is_current_user_org_member((CASE WHEN (POSITION((''/'':text) IN (name)) > 0) THEN split_part(name, ''/''::text, 1) ELSE NULL::text END)::uuid))'
        )
      )
      or (
        policy.polname in ('import_bucket_member_select', 'import_bucket_member_update')
        and policy.polcmd in ('r', 'w')
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) in (
          '((bucket_id = ''imports''::text) AND private.is_current_user_org_member(((storage.foldername(name))[1])::uuid))',
          '((bucket_id = ''imports''::text) AND private.is_current_user_org_member((CASE WHEN (POSITION((''/'':text) IN (name)) > 0) THEN split_part(name, ''/''::text, 1) ELSE NULL::text END)::uuid))'
        )
        and policy.polwithcheck is null
      )
    );

  select count(*)::integer
  into total_storage_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy.polname in (
      'import_bucket_member_insert',
      'import_bucket_member_select',
      'import_bucket_member_update'
    );

  if total_storage_policy_count not in (0, 3)
    or repaired_storage_policy_count <> total_storage_policy_count then
    raise exception using
      errcode = '55000',
      message = format(
        'private_org_membership_storage_policy_portfolio_incomplete:%s/%s',
        repaired_storage_policy_count,
        total_storage_policy_count
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
