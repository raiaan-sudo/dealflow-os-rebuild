-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260512010000 remote_name=scope_provider_usage_idempotency original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260512010000_scope_provider_usage_idempotency.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260512010000.preconditions.001 sha256=403092765cf28de42788da9d735596b6429847aa041e2d4e263e0ff0dd3a4437
DO $dealflow_table_guard_autonomy_idempotency_records$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_idempotency_records_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_idempotency_records_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_idempotency_records_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"action_payload_hash":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'started'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"first_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"last_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"response_summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"}}$dealflow_table_guard_autonomy_idempotency_records_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_idempotency_records_required$["id","organization_id","campaign_id","idempotency_key","action_payload_hash","status","first_seen_at","last_seen_at","response_summary"]$dealflow_table_guard_autonomy_idempotency_records_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_idempotency_records') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_idempotency_records'
      AND jsonb_build_object(
        'default_partition_name', (
          SELECT default_relation.relname
          FROM pg_catalog.pg_partitioned_table partitioned_record
          JOIN pg_catalog.pg_class default_relation ON default_relation.oid=partitioned_record.partdefid
          WHERE partitioned_record.partrelid=relation_record.oid
        ),
        'default_partition_schema', (
          SELECT default_namespace.nspname
          FROM pg_catalog.pg_partitioned_table partitioned_record
          JOIN pg_catalog.pg_class default_relation ON default_relation.oid=partitioned_record.partdefid
          JOIN pg_catalog.pg_namespace default_namespace ON default_namespace.oid=default_relation.relnamespace
          WHERE partitioned_record.partrelid=relation_record.oid
        ),
        'has_rules', relation_record.relhasrules,
        'is_partition', relation_record.relispartition,
        'owner_name', pg_catalog.pg_get_userbyid(relation_record.relowner),
        'parent_schema', (
          SELECT parent_namespace.nspname
          FROM pg_catalog.pg_inherits inheritance_record
          JOIN pg_catalog.pg_class parent_relation ON parent_relation.oid=inheritance_record.inhparent
          JOIN pg_catalog.pg_namespace parent_namespace ON parent_namespace.oid=parent_relation.relnamespace
          WHERE inheritance_record.inhrelid=relation_record.oid
          ORDER BY inheritance_record.inhseqno
          LIMIT 1
        ),
        'parent_table', (
          SELECT parent_relation.relname
          FROM pg_catalog.pg_inherits inheritance_record
          JOIN pg_catalog.pg_class parent_relation ON parent_relation.oid=inheritance_record.inhparent
          WHERE inheritance_record.inhrelid=relation_record.oid
          ORDER BY inheritance_record.inhseqno
          LIMIT 1
        ),
        'partition_bound', pg_catalog.pg_get_expr(relation_record.relpartbound, relation_record.oid, false),
        'partition_key', pg_catalog.pg_get_partkeydef(relation_record.oid),
        'partition_strategy', (
          SELECT partitioned_record.partstrat::text
          FROM pg_catalog.pg_partitioned_table partitioned_record
          WHERE partitioned_record.partrelid=relation_record.oid
        ),
        'persistence', relation_record.relpersistence,
        'relation_kind', relation_record.relkind,
        'relation_options', (
          SELECT jsonb_agg(option_value ORDER BY option_value)
          FROM unnest(relation_record.reloptions) option_value
        ),
        'replica_identity', relation_record.relreplident
      ) IS NOT DISTINCT FROM expected_table
  ) THEN
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_idempotency_records' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_idempotency_records'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_idempotency_records'::regclass
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    ) column_record
    JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
    LEFT JOIN pg_catalog.pg_attrdef default_record
      ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
    LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
    LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
    WHERE NOT (expected_columns ? column_record.attname)
       OR (expected_columns -> column_record.attname) - 'ordinal_position'
          IS DISTINCT FROM (jsonb_build_object(
        'array_dimensions', column_record.attndims,
        'collation_name', collation_record.collname,
        'collation_schema', collation_namespace.nspname,
        'column_acl_present', column_record.attacl IS NOT NULL,
        'column_options', to_jsonb(column_record.attoptions),
        'compression_method', column_record.attcompression,
        'default_or_generation_expression', pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false),
        'formatted_type', pg_catalog.format_type(column_record.atttypid, column_record.atttypmod),
        'generated_kind', column_record.attgenerated,
        'has_default_or_generation', column_record.atthasdef,
        'identity_kind', column_record.attidentity,
        'inheritance_count', column_record.attinhcount,
        'locally_defined', column_record.attislocal,
        'not_null', column_record.attnotnull,
        'ordinal_position', column_record.dense_ordinal_position,
        'relation_kind', relation_record.relkind,
        'storage_strategy', column_record.attstorage
      )) - 'ordinal_position'
       OR (
         live_column_count=(SELECT count(*) FROM jsonb_object_keys(expected_columns))
         AND expected_columns -> column_record.attname -> 'ordinal_position'
             IS DISTINCT FROM to_jsonb(column_record.dense_ordinal_position)
       )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(required_columns) AS required_column(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_idempotency_records'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_idempotency_records' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_idempotency_records$;

-- dealflow:statement id=20260512010000.preconditions.002 sha256=111fa8fe2d92e28033352aff0e0acd1cf9c68f6a1f46e72157f2c0858390629a
DO $dealflow_index_guard_autonomy_idempotency_records_campaign_idx$
BEGIN
  IF to_regclass('public.autonomy_idempotency_records_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_idempotency_records_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_idempotency_records_campaign_idx ON public.autonomy_idempotency_records USING btree (organization_id, campaign_id, last_seen_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_idempotency_records_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_idempotency_records_campaign_idx$;

-- dealflow:statement id=20260512010000.preconditions.003 sha256=977090c5ba488220f7405f103c04b11fe868e790123537ec9f3f7cab2a5a9c7c
DO $dealflow_index_guard_provider_usage_events_campaign_id_idx$
BEGIN
  IF to_regclass('public.provider_usage_events_campaign_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='provider_usage_events_campaign_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX provider_usage_events_campaign_id_idx ON public.provider_usage_events USING btree (campaign_id) WHERE (campaign_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'provider_usage_events_campaign_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_provider_usage_events_campaign_id_idx$;

-- dealflow:statement id=20260512010000.preconditions.004 sha256=debe646b205efb40a000f8ef1c213320e2485aa3fd148fccbb16aa153ec6f3db
DO $dealflow_index_guard_provider_usage_events_scoped_idempotency_unique$
BEGIN
  IF to_regclass('public.provider_usage_events_scoped_idempotency_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='provider_usage_events_scoped_idempotency_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX provider_usage_events_scoped_idempotency_unique ON public.provider_usage_events USING btree (idempotency_key, organization_id, user_id, COALESCE(campaign_id, ''00000000-0000-0000-0000-000000000000''::uuid), provider, operation, usage_date) WHERE (idempotency_key IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'provider_usage_events_scoped_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_provider_usage_events_scoped_idempotency_unique$;

-- dealflow:statement id=20260512010000.preconditions.005 sha256=8020669ef134c6c025c8442b38e761c70df74512cec957fb780694f9bc0544bd
DO $dealflow_index_guard_provider_usage_events_user_id_idx$
BEGIN
  IF to_regclass('public.provider_usage_events_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='provider_usage_events_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX provider_usage_events_user_id_idx ON public.provider_usage_events USING btree (user_id) WHERE (user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'provider_usage_events_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_provider_usage_events_user_id_idx$;

-- dealflow:statement id=20260512010000.preconditions.006 sha256=9b30e3c2264436741ebe89f1250cec6057f66b7f927714d6a782d8520664b87a
DO $dealflow_index_guard_provider_usage_limits_campaign_id_idx$
BEGIN
  IF to_regclass('public.provider_usage_limits_campaign_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='provider_usage_limits_campaign_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX provider_usage_limits_campaign_id_idx ON public.provider_usage_limits USING btree (campaign_id) WHERE (campaign_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'provider_usage_limits_campaign_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_provider_usage_limits_campaign_id_idx$;

-- dealflow:statement id=20260512010000.preconditions.007 sha256=dbad618bf4b27afc7c40d73439ed522619616787ccb3e71a0bdf6db146dd82b5
DO $dealflow_index_guard_provider_usage_limits_organization_id_idx$
BEGIN
  IF to_regclass('public.provider_usage_limits_organization_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='provider_usage_limits_organization_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX provider_usage_limits_organization_id_idx ON public.provider_usage_limits USING btree (organization_id) WHERE (organization_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'provider_usage_limits_organization_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_provider_usage_limits_organization_id_idx$;

-- tables
-- dealflow:statement id=20260512010000.tables.001 sha256=f52b8ae87aa1c0abacc1b243643e5646a87b7cf5022b4d91634378f546658263
CREATE TABLE IF NOT EXISTS "public"."autonomy_idempotency_records" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "action_payload_hash" text NOT NULL,
  "status" text DEFAULT 'started'::text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "response_summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- routines
-- dealflow:statement id=20260512010000.routines.001 sha256=d02731965936155d131544f2a94a78acea1aaf9444270379e226815c348790cd
CREATE OR REPLACE FUNCTION public.reserve_provider_usage(p_organization_id uuid, p_user_id uuid, p_campaign_id uuid, p_provider text, p_operation text, p_limit_count integer, p_idempotency_key text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric)
 RETURNS TABLE(allowed boolean, current_count integer, next_count integer, limit_count integer, usage_id uuid, event_id uuid, reused_existing boolean, event_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := current_date;
  usage_row public.provider_usage_limits%rowtype;
  existing_event public.provider_usage_events%rowtype;
  new_event public.provider_usage_events%rowtype;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_limit_count <= 0 then
    raise exception 'p_limit_count must be positive';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_event
    from public.provider_usage_events
    where idempotency_key = p_idempotency_key
      and organization_id = p_organization_id
      and user_id = p_user_id
      and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and provider = p_provider
      and operation = p_operation
      and usage_date = today
    limit 1;

    if existing_event.id is not null then
      select *
      into usage_row
      from public.provider_usage_limits
      where user_id = existing_event.user_id
        and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            coalesce(existing_event.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and provider = existing_event.provider
        and operation = existing_event.operation
        and usage_date = existing_event.usage_date;

      allowed := true;
      current_count := greatest(coalesce(usage_row.usage_count, 1) - 1, 0);
      next_count := coalesce(usage_row.usage_count, 1);
      limit_count := coalesce(usage_row.limit_count, p_limit_count);
      usage_id := usage_row.id;
      event_id := existing_event.id;
      reused_existing := true;
      event_status := existing_event.status;
      return next;
      return;
    end if;
  end if;

  begin
    insert into public.provider_usage_limits (
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      usage_date,
      usage_count,
      limit_count
    )
    values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      p_provider,
      p_operation,
      today,
      0,
      p_limit_count
    );
  exception when unique_violation then
    update public.provider_usage_limits
    set limit_count = p_limit_count,
        updated_at = now()
    where user_id = p_user_id
      and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and provider = p_provider
      and operation = p_operation
      and usage_date = today;
  end;

  select *
  into usage_row
  from public.provider_usage_limits
  where user_id = p_user_id
    and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider
    and operation = p_operation
    and usage_date = today
  for update;

  if usage_row.usage_count >= p_limit_count then
    allowed := false;
    current_count := usage_row.usage_count;
    next_count := usage_row.usage_count;
    limit_count := p_limit_count;
    usage_id := usage_row.id;
    event_id := null;
    reused_existing := false;
    event_status := null;
    return next;
    return;
  end if;

  update public.provider_usage_limits
  set usage_count = usage_row.usage_count + 1,
      limit_count = p_limit_count,
      updated_at = now()
  where id = usage_row.id;

  insert into public.provider_usage_events (
    organization_id,
    user_id,
    campaign_id,
    provider,
    operation,
    idempotency_key,
    usage_date,
    estimated_cost,
    status
  )
  values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    p_provider,
    p_operation,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    today,
    p_estimated_cost,
    'reserved'
  )
  returning * into new_event;

  allowed := true;
  current_count := usage_row.usage_count;
  next_count := usage_row.usage_count + 1;
  limit_count := p_limit_count;
  usage_id := usage_row.id;
  event_id := new_event.id;
  reused_existing := false;
  event_status := new_event.status;
  return next;
end;
$function$;

-- constraints
-- dealflow:statement id=20260512010000.constraints.001 sha256=4d25a8ecabb92c65135203a34331e42837a91eeec6d84a66342bcb951c493a82
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_idempotency_records'::regclass
    AND constraint_record.conname='autonomy_idempotency_records_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_idempotency_records" ADD CONSTRAINT "autonomy_idempotency_records_key_unique" UNIQUE (idempotency_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (idempotency_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_idempotency_records', 'autonomy_idempotency_records_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260512010000.constraints.002 sha256=bc67a94568eb0b4dbc73740972ab2e2fd7fe6bb6ec582d579bdd5e94cdde9b8e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_idempotency_records'::regclass
    AND constraint_record.conname='autonomy_idempotency_records_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_idempotency_records" ADD CONSTRAINT "autonomy_idempotency_records_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_idempotency_records', 'autonomy_idempotency_records_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260512010000.constraints.003 sha256=9d7db0b096676d7147e8beff197a6eea4e36b46504ebeb756cb850d96b070c7f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_idempotency_records'::regclass
    AND constraint_record.conname='autonomy_idempotency_records_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_idempotency_records" ADD CONSTRAINT "autonomy_idempotency_records_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'applied'::text, 'blocked'::text, 'failed'::text, 'verified'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''started''::text, ''applied''::text, ''blocked''::text, ''failed''::text, ''verified''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_idempotency_records', 'autonomy_idempotency_records_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260512010000.constraints.004 sha256=14a904e004654f051cb99b59bab546275fc52a99056410e40303e3caf737fe1c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_idempotency_records'::regclass
    AND constraint_record.conname='autonomy_idempotency_records_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_idempotency_records" ADD CONSTRAINT "autonomy_idempotency_records_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_idempotency_records', 'autonomy_idempotency_records_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260512010000.constraints.005 sha256=d76899c1d928959d63e6acdaf2bc451aa22380381d830d666d9d12aa0807c117
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_idempotency_records'::regclass
    AND constraint_record.conname='autonomy_idempotency_records_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_idempotency_records" ADD CONSTRAINT "autonomy_idempotency_records_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_idempotency_records', 'autonomy_idempotency_records_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260512010000.indexes.001 sha256=fcb9b35c2a9354219973a4d950b8a3a3046db877e7484ee30be0a2ff10e06ffc
DROP INDEX IF EXISTS "public"."provider_usage_events_idempotency_unique";

-- dealflow:statement id=20260512010000.indexes.002 sha256=b219f93cf0e9d653d63a756404b06b883005111b4b196c64ec88f82b6369b13e
CREATE INDEX IF NOT EXISTS autonomy_idempotency_records_campaign_idx ON public.autonomy_idempotency_records USING btree (organization_id, campaign_id, last_seen_at DESC);

-- dealflow:statement id=20260512010000.indexes.003 sha256=0e3c680ca49f170f6f06ababae55065e6ed266547350b42e5853bdd89965451e
CREATE INDEX IF NOT EXISTS provider_usage_events_campaign_id_idx ON public.provider_usage_events USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);

-- dealflow:statement id=20260512010000.indexes.004 sha256=67911475fa46ff97f1d86b9dd515928c2c03a51cb9546dedaec1066473f9a10c
CREATE UNIQUE INDEX IF NOT EXISTS provider_usage_events_scoped_idempotency_unique ON public.provider_usage_events USING btree (idempotency_key, organization_id, user_id, COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, operation, usage_date) WHERE (idempotency_key IS NOT NULL);

-- dealflow:statement id=20260512010000.indexes.005 sha256=e7fb458c5523f41670c6bb81d0ef9250b0ab273f254fe6162e466d76d7600d94
CREATE INDEX IF NOT EXISTS provider_usage_events_user_id_idx ON public.provider_usage_events USING btree (user_id) WHERE (user_id IS NOT NULL);

-- dealflow:statement id=20260512010000.indexes.006 sha256=110771e717816a18ff4ef71e6f2aaa5aff884bf784aa38e31ac1c873ece90cbc
CREATE INDEX IF NOT EXISTS provider_usage_limits_campaign_id_idx ON public.provider_usage_limits USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);

-- dealflow:statement id=20260512010000.indexes.007 sha256=4fc9dc0080034645e5148a9d5dbf5496c5d0f41f3aad48613c6b7557b13c9091
CREATE INDEX IF NOT EXISTS provider_usage_limits_organization_id_idx ON public.provider_usage_limits USING btree (organization_id) WHERE (organization_id IS NOT NULL);

-- controls
-- dealflow:statement id=20260512010000.controls.001 sha256=ad0b0db328cd8f1fa538d530fe1070f9e2b2598634926a9f73316c47257dd036
DROP POLICY IF EXISTS "autonomy_idempotency_records_service_role_all" ON "public"."autonomy_idempotency_records";

-- dealflow:statement id=20260512010000.controls.002 sha256=6c872d04194f7a0901b4283213bd348118182c5c541c8f022833d48669c6b0ed
CREATE POLICY "autonomy_idempotency_records_service_role_all" ON "public"."autonomy_idempotency_records"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260512010000.controls.003 sha256=a5c439313ac35e87bf6c2351cde418c1808765ad74e32de000f1f25adc0b3c66
DROP POLICY IF EXISTS "provider_usage_events_member_select" ON "public"."provider_usage_events";

-- dealflow:statement id=20260512010000.controls.004 sha256=398d2bb25ee2f028529b578103c9f2c87265b4fb1dd41f2324cd34af0942e0a3
CREATE POLICY "provider_usage_events_member_select" ON "public"."provider_usage_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260512010000.controls.005 sha256=855184eba7a6b717ae4d5c6594e3a6dd0d138f4cef2bdc7db28b6f4d78655471
DROP POLICY IF EXISTS "provider_usage_limits_member_select" ON "public"."provider_usage_limits";

-- dealflow:statement id=20260512010000.controls.006 sha256=7db86ed979e97e7e397072a37257a708b8383ce5c8e9d3cdcc4a137c7d7cbaaf
CREATE POLICY "provider_usage_limits_member_select" ON "public"."provider_usage_limits"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260512010000.controls.007 sha256=8def82604e78a3caf402d1d1212ac3f35afba3a3b710577d42a5728922c5e7af
ALTER TABLE "public"."autonomy_idempotency_records" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260512010000.controls.008 sha256=6d5b3d5b7ea4849a7d873dcb92a7daa79e648629df7eade86f14c77445a75702
ALTER TABLE "public"."autonomy_idempotency_records" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260512010000$
BEGIN
  IF NOT (to_regclass('public.autonomy_idempotency_records') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='reserve_provider_usage')) THEN RAISE EXCEPTION '20260512010000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_idempotency_records'::regclass AND conname='autonomy_idempotency_records_key_unique')) THEN RAISE EXCEPTION '20260512010000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_idempotency_records'::regclass AND conname='autonomy_idempotency_records_pkey')) THEN RAISE EXCEPTION '20260512010000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_idempotency_records'::regclass AND conname='autonomy_idempotency_records_status_check')) THEN RAISE EXCEPTION '20260512010000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_idempotency_records'::regclass AND conname='autonomy_idempotency_records_campaign_id_fkey')) THEN RAISE EXCEPTION '20260512010000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_idempotency_records'::regclass AND conname='autonomy_idempotency_records_organization_id_fkey')) THEN RAISE EXCEPTION '20260512010000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_idempotency_records_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.provider_usage_events_campaign_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.provider_usage_events_scoped_idempotency_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.provider_usage_events_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.provider_usage_limits_campaign_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.provider_usage_limits_organization_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260512010000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_idempotency_records'::regclass AND polname='autonomy_idempotency_records_service_role_all')) THEN RAISE EXCEPTION '20260512010000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.provider_usage_events'::regclass AND polname='provider_usage_events_member_select')) THEN RAISE EXCEPTION '20260512010000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.provider_usage_limits'::regclass AND polname='provider_usage_limits_member_select')) THEN RAISE EXCEPTION '20260512010000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260512010000$;
