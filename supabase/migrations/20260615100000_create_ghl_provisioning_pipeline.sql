-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260615100000 remote_name=create_ghl_provisioning_pipeline original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260615100000_create_ghl_provisioning_pipeline.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260615100000.preconditions.001 sha256=f6cff861a8302201fc350c41ce9c3ddaaea86a4a48892547d3f4d001a8158f74
DO $dealflow_table_guard_ad_performance$
DECLARE
  expected_table jsonb := $dealflow_table_guard_ad_performance_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_ad_performance_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_ad_performance_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"creative_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"ctr":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"m"},"cpl":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"m"},"impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_ad_performance_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_ad_performance_required$["id","creative_id","campaign_id","ctr","cpl","impressions","created_at"]$dealflow_table_guard_ad_performance_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.ad_performance') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='ad_performance'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'ad_performance' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.ad_performance'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.ad_performance'::regclass
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
      WHERE attribute_record.attrelid='public.ad_performance'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'ad_performance' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_ad_performance$;

-- dealflow:statement id=20260615100000.preconditions.002 sha256=c3c3f092cc162eafc3391f9e483181cd8d451ae50c7ac183ced9ede73a76d26c
DO $dealflow_table_guard_appointments$
DECLARE
  expected_table jsonb := $dealflow_table_guard_appointments_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_appointments_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_appointments_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"scheduled_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'scheduled'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"appointment_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"notes":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_appointments_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_appointments_required$["id","organization_id","lead_id","scheduled_at","status","appointment_type","notes","created_at","updated_at"]$dealflow_table_guard_appointments_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.appointments') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='appointments'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'appointments' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.appointments'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.appointments'::regclass
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
      WHERE attribute_record.attrelid='public.appointments'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'appointments' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_appointments$;

-- dealflow:statement id=20260615100000.preconditions.003 sha256=8271f010fe472376a8a8ee469310cc663b5fadc906e93585ee3307387c12ceb6
DO $dealflow_table_guard_audit_logs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_audit_logs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_audit_logs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_audit_logs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"actor_user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"entity_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"entity_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"action":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"details":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_audit_logs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_audit_logs_required$["id","organization_id","actor_user_id","entity_type","entity_id","action","details","created_at","updated_at"]$dealflow_table_guard_audit_logs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='audit_logs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'audit_logs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.audit_logs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.audit_logs'::regclass
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
      WHERE attribute_record.attrelid='public.audit_logs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'audit_logs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_audit_logs$;

-- dealflow:statement id=20260615100000.preconditions.004 sha256=d36951d4ec6eafcb32987706a2d4b1fc9a023e8aa7c3292b05145e7bcbd24a85
DO $dealflow_table_guard_business_profiles$
DECLARE
  expected_table jsonb := $dealflow_table_guard_business_profiles_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_business_profiles_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_business_profiles_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"legal_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"industry":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'real_estate'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"website":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"phone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"primary_goal":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_business_profiles_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_business_profiles_required$["id","organization_id","legal_name","industry","website","phone","primary_goal","created_at","updated_at"]$dealflow_table_guard_business_profiles_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.business_profiles') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='business_profiles'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'business_profiles' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.business_profiles'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.business_profiles'::regclass
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
      WHERE attribute_record.attrelid='public.business_profiles'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'business_profiles' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_business_profiles$;

-- dealflow:statement id=20260615100000.preconditions.005 sha256=e87568f8658bc9c215ccb54657d6c515fb43408e830ac1f4310e621924ac7c92
DO $dealflow_table_guard_campaign_action_suggestions$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_action_suggestions_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_action_suggestions_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_action_suggestions_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"sync_snapshot_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"meta_campaign_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"action_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"expected_impact":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'suggested'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"context":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_action_suggestions_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_action_suggestions_required$["id","organization_id","user_id","sync_snapshot_id","meta_campaign_id","action_type","title","reason","expected_impact","status","context","created_at","updated_at"]$dealflow_table_guard_campaign_action_suggestions_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_action_suggestions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_action_suggestions'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_action_suggestions' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_action_suggestions'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_action_suggestions'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_action_suggestions'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_action_suggestions' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_action_suggestions$;

-- dealflow:statement id=20260615100000.preconditions.006 sha256=0d56ad069fbcd87bac075ac195890b8096b5a58c84e481b260293f71554e0a8a
DO $dealflow_table_guard_campaign_draft_actions$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_draft_actions_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_draft_actions_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_draft_actions_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"action_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"source_reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"proposed_change":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"expected_impact":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'draft'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_draft_actions_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_draft_actions_required$["id","organization_id","user_id","campaign_id","action_type","source_reason","proposed_change","expected_impact","status","created_at","updated_at"]$dealflow_table_guard_campaign_draft_actions_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_draft_actions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_draft_actions'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_draft_actions' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_draft_actions'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_draft_actions'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_draft_actions'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_draft_actions' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_draft_actions$;

-- dealflow:statement id=20260615100000.preconditions.007 sha256=899b3a66c911b570d24d7cd89b2267fdc78f0cd3c1d57c8b29768d9a4e2c3912
DO $dealflow_table_guard_campaign_leads$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_leads_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_leads_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_leads_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"lead_capture_goal":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"capture_method":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'website_funnel'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"source_lead_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"dedupe_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"full_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"phone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"answers_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"qualification_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"qualified":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"qualification_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"attribution_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_leads_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_leads_required$["id","organization_id","campaign_id","lead_capture_goal","capture_method","source","source_lead_id","dedupe_key","full_name","email","phone","answers_json","qualification_score","qualified","qualification_json","attribution_json","metadata_json","created_at","updated_at"]$dealflow_table_guard_campaign_leads_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_leads') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_leads'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_leads' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_leads'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_leads'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_leads'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_leads' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_leads$;

-- dealflow:statement id=20260615100000.preconditions.008 sha256=1e5bc7df0e11e70a93cc0cc6d55303569445d51515b93fa6d5b18be5d15ae825
DO $dealflow_table_guard_campaign_snapshots$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_snapshots_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_snapshots_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_snapshots_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"marketing_account_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"snapshot_date":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"date","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"spend":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"m"},"impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"clicks":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"leads":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"booked_jobs":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"revenue":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"m"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_snapshots_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_snapshots_required$["id","organization_id","marketing_account_id","snapshot_date","spend","impressions","clicks","leads","booked_jobs","revenue","created_at","updated_at"]$dealflow_table_guard_campaign_snapshots_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_snapshots') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_snapshots'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_snapshots' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_snapshots'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_snapshots'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_snapshots'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_snapshots' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_snapshots$;

-- dealflow:statement id=20260615100000.preconditions.009 sha256=4e80aed611b383c76807dbc1bcda1d57215e8e294a2c4996f5d8409d6b59cd57
DO $dealflow_table_guard_data_imports$
DECLARE
  expected_table jsonb := $dealflow_table_guard_data_imports_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_data_imports_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_data_imports_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"uploaded_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"import_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"file_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"file_path":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'pending'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"total_rows":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"inserted_rows":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"failed_rows":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"error_summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_data_imports_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_data_imports_required$["id","organization_id","uploaded_by","import_type","file_name","file_path","status","total_rows","inserted_rows","failed_rows","error_summary","created_at","updated_at"]$dealflow_table_guard_data_imports_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.data_imports') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='data_imports'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'data_imports' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.data_imports'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.data_imports'::regclass
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
      WHERE attribute_record.attrelid='public.data_imports'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'data_imports' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_data_imports$;

-- dealflow:statement id=20260615100000.preconditions.010 sha256=78582ee34451c31a1f33ddf5a4d2006429cdddb3167dc024464e06f8ac8dfea1
DO $dealflow_table_guard_deals$
DECLARE
  expected_table jsonb := $dealflow_table_guard_deals_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_deals_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_deals_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"appointment_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"contact_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"deal_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'other'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"stage":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'new'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'active'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"estimated_value":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"m"},"closed_value":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"m"},"commission_revenue":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"m"},"market_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'manual'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"closed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"notes":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_deals_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_deals_required$["id","organization_id","lead_id","appointment_id","title","contact_name","deal_type","stage","status","estimated_value","closed_value","commission_revenue","market_id","source","closed_at","notes","created_at","updated_at"]$dealflow_table_guard_deals_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.deals') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='deals'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'deals' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.deals'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.deals'::regclass
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
      WHERE attribute_record.attrelid='public.deals'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'deals' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_deals$;

-- dealflow:statement id=20260615100000.preconditions.011 sha256=bc56e965d24e4cc76a65bcf36120fb5c9a344ce301fd85a18f38404bfc1f6a5a
DO $dealflow_table_guard_generated_artifacts$
DECLARE
  expected_table jsonb := $dealflow_table_guard_generated_artifacts_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_generated_artifacts_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_generated_artifacts_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"artifact_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"payload":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"generated_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'system'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_generated_artifacts_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_generated_artifacts_required$["id","organization_id","artifact_type","payload","generated_by","source","created_at","updated_at"]$dealflow_table_guard_generated_artifacts_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.generated_artifacts') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='generated_artifacts'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'generated_artifacts' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.generated_artifacts'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.generated_artifacts'::regclass
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
      WHERE attribute_record.attrelid='public.generated_artifacts'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'generated_artifacts' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_generated_artifacts$;

-- dealflow:statement id=20260615100000.preconditions.012 sha256=23470b4197658494dee47b8a2459abe3e7e49c01c7057f1c0c1ee6c52072f242
DO $dealflow_table_guard_ghl_provisioning_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_ghl_provisioning_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_ghl_provisioning_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_ghl_provisioning_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"job_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"step":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"external_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"error_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"error_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_ghl_provisioning_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_ghl_provisioning_events_required$["id","job_id","workspace_id","step","status","external_id","error_code","error_message","metadata","created_at","partner_id"]$dealflow_table_guard_ghl_provisioning_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.ghl_provisioning_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='ghl_provisioning_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'ghl_provisioning_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.ghl_provisioning_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.ghl_provisioning_events'::regclass
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
      WHERE attribute_record.attrelid='public.ghl_provisioning_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'ghl_provisioning_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_ghl_provisioning_events$;

-- dealflow:statement id=20260615100000.preconditions.013 sha256=c037c88f88b9b1c91dbf7afa5864f195fa028c360bb55de27305a2348ca4b35d
DO $dealflow_table_guard_ghl_provisioning_jobs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_ghl_provisioning_jobs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_ghl_provisioning_jobs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_ghl_provisioning_jobs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"stripe_customer_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"stripe_event_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'queued'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"attempt_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"last_completed_step":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"last_error_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"last_error_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"next_retry_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"max_attempts":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"3","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_ghl_provisioning_jobs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_ghl_provisioning_jobs_required$["id","workspace_id","user_id","stripe_customer_id","stripe_subscription_id","stripe_event_id","status","idempotency_key","attempt_count","last_completed_step","last_error_code","last_error_message","next_retry_at","metadata","created_at","updated_at","max_attempts","partner_id"]$dealflow_table_guard_ghl_provisioning_jobs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.ghl_provisioning_jobs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='ghl_provisioning_jobs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.ghl_provisioning_jobs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.ghl_provisioning_jobs'::regclass
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
      WHERE attribute_record.attrelid='public.ghl_provisioning_jobs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_ghl_provisioning_jobs$;

-- dealflow:statement id=20260615100000.preconditions.014 sha256=b0936c9d3d86875a311f09a59bf5cc412c7f8942712f0add2ac355687327bac4
DO $dealflow_table_guard_health_scores$
DECLARE
  expected_table jsonb := $dealflow_table_guard_health_scores_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_health_scores_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_health_scores_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"category":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"summary":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"recorded_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_health_scores_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_health_scores_required$["id","organization_id","category","score","summary","recorded_at","created_at","updated_at"]$dealflow_table_guard_health_scores_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.health_scores') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='health_scores'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'health_scores' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.health_scores'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.health_scores'::regclass
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
      WHERE attribute_record.attrelid='public.health_scores'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'health_scores' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_health_scores$;

-- dealflow:statement id=20260615100000.preconditions.015 sha256=90cc7cd2cc34ba13fc112bced0f1510c91208c743d39dbc6b836b9627a27ec35
DO $dealflow_table_guard_integration_oauth_states$
DECLARE
  expected_table jsonb := $dealflow_table_guard_integration_oauth_states_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_integration_oauth_states_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_integration_oauth_states_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"provider":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"nonce":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"state_hash":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"origin_host":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"return_host":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"return_to":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"expires_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"consumed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_integration_oauth_states_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_integration_oauth_states_required$["id","provider","nonce","state_hash","organization_id","user_id","campaign_id","partner_id","origin_host","return_host","return_to","metadata","expires_at","consumed_at","created_at"]$dealflow_table_guard_integration_oauth_states_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.integration_oauth_states') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='integration_oauth_states'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'integration_oauth_states' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.integration_oauth_states'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.integration_oauth_states'::regclass
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
      WHERE attribute_record.attrelid='public.integration_oauth_states'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'integration_oauth_states' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_integration_oauth_states$;

-- dealflow:statement id=20260615100000.preconditions.016 sha256=32691ed6d1ef736aaa09b38e9263f440e21449e4484e78cdf597d28a0a81439f
DO $dealflow_table_guard_internal_notes$
DECLARE
  expected_table jsonb := $dealflow_table_guard_internal_notes_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_internal_notes_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_internal_notes_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"author_user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"body":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_internal_notes_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_internal_notes_required$["id","organization_id","author_user_id","body","created_at","updated_at"]$dealflow_table_guard_internal_notes_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.internal_notes') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='internal_notes'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'internal_notes' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.internal_notes'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.internal_notes'::regclass
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
      WHERE attribute_record.attrelid='public.internal_notes'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'internal_notes' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_internal_notes$;

-- dealflow:statement id=20260615100000.preconditions.017 sha256=494b111ca7a63e26d9c7338418ff8890d3b6a6f85782fd32b90ddd5abac799f0
DO $dealflow_table_guard_jobs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_jobs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_jobs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_jobs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"service_type_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"assigned_user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"customer_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'booked'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"scheduled_for":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"revenue":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(12,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"m"},"address":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"notes":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_jobs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_jobs_required$["id","organization_id","lead_id","service_type_id","assigned_user_id","title","customer_name","status","scheduled_for","revenue","address","notes","created_at","updated_at"]$dealflow_table_guard_jobs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.jobs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='jobs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'jobs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.jobs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.jobs'::regclass
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
      WHERE attribute_record.attrelid='public.jobs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'jobs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_jobs$;

-- dealflow:statement id=20260615100000.preconditions.018 sha256=c24ae3db33bb10084f5ac42911a0c9995a45a3f5e3edc9abea2e4f0471c680aa
DO $dealflow_table_guard_lead_capture_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_lead_capture_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_lead_capture_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_lead_capture_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"event_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"capture_method":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_lead_capture_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_lead_capture_events_required$["id","organization_id","campaign_id","campaign_lead_id","event_type","capture_method","idempotency_key","metadata_json","created_at"]$dealflow_table_guard_lead_capture_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.lead_capture_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='lead_capture_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'lead_capture_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.lead_capture_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.lead_capture_events'::regclass
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
      WHERE attribute_record.attrelid='public.lead_capture_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'lead_capture_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_lead_capture_events$;

-- dealflow:statement id=20260615100000.preconditions.019 sha256=d1298119ff881e61fa5857d331d81bc3312913e1ac0a4446692a34cd877bcf14
DO $dealflow_table_guard_lead_crm_sync_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_lead_crm_sync_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_lead_crm_sync_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_lead_crm_sync_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"destination":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'gohighlevel'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"ghl_location_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"ghl_contact_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"ghl_opportunity_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'queued'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"attempt_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"last_error_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"last_error_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"next_retry_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_lead_crm_sync_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_lead_crm_sync_events_required$["id","lead_id","workspace_id","destination","ghl_location_id","ghl_contact_id","ghl_opportunity_id","status","idempotency_key","attempt_count","last_error_code","last_error_message","next_retry_at","metadata","created_at","updated_at","partner_id"]$dealflow_table_guard_lead_crm_sync_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.lead_crm_sync_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='lead_crm_sync_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'lead_crm_sync_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.lead_crm_sync_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.lead_crm_sync_events'::regclass
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
      WHERE attribute_record.attrelid='public.lead_crm_sync_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'lead_crm_sync_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_lead_crm_sync_events$;

-- dealflow:statement id=20260615100000.preconditions.020 sha256=8686f67544042e219515707332c147942d50030588fc7c1619e1135bc482500e
DO $dealflow_table_guard_lead_delivery_attempts$
DECLARE
  expected_table jsonb := $dealflow_table_guard_lead_delivery_attempts_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_lead_delivery_attempts_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_lead_delivery_attempts_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"destination":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'queued'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"attempt_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"last_error":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"sent_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_lead_delivery_attempts_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_lead_delivery_attempts_required$["id","organization_id","campaign_id","campaign_lead_id","destination","status","attempt_count","last_error","metadata_json","sent_at","created_at","updated_at"]$dealflow_table_guard_lead_delivery_attempts_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.lead_delivery_attempts') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='lead_delivery_attempts'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'lead_delivery_attempts' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.lead_delivery_attempts'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.lead_delivery_attempts'::regclass
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
      WHERE attribute_record.attrelid='public.lead_delivery_attempts'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'lead_delivery_attempts' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_lead_delivery_attempts$;

-- dealflow:statement id=20260615100000.preconditions.021 sha256=9f476fab37bbeae9f9aa3bfa65b3b56891ca421ea72da0335f11b1812c0b96ae
DO $dealflow_table_guard_lead_form_templates$
DECLARE
  expected_table jsonb := $dealflow_table_guard_lead_form_templates_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_lead_form_templates_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_lead_form_templates_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"template_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"lead_capture_goal":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"capture_method":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"form_friction_level":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"questions_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"active":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_lead_form_templates_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_lead_form_templates_required$["id","organization_id","partner_id","template_key","name","lead_capture_goal","capture_method","form_friction_level","questions_json","metadata_json","active","created_at","updated_at"]$dealflow_table_guard_lead_form_templates_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.lead_form_templates') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='lead_form_templates'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'lead_form_templates' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.lead_form_templates'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.lead_form_templates'::regclass
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
      WHERE attribute_record.attrelid='public.lead_form_templates'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'lead_form_templates' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_lead_form_templates$;

-- dealflow:statement id=20260615100000.preconditions.022 sha256=b1304f3243ccc98e665c755f3102b9d4361fc45f54df852d15c033d0966248ed
DO $dealflow_table_guard_markets$
DECLARE
  expected_table jsonb := $dealflow_table_guard_markets_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_markets_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_markets_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"city":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"region":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'active'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"priority_level":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_markets_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_markets_required$["id","organization_id","name","city","region","status","priority_level","created_at","updated_at"]$dealflow_table_guard_markets_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.markets') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='markets'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'markets' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.markets'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.markets'::regclass
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
      WHERE attribute_record.attrelid='public.markets'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'markets' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_markets$;

-- dealflow:statement id=20260615100000.preconditions.023 sha256=04604aa22f28e48ab78282932770a905adead8b791f6962eb9cf19dd92193128
DO $dealflow_table_guard_organization_admin_states$
DECLARE
  expected_table jsonb := $dealflow_table_guard_organization_admin_states_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_organization_admin_states_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_organization_admin_states_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"review_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'healthy'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_organization_admin_states_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_organization_admin_states_required$["id","organization_id","review_status","created_at","updated_at"]$dealflow_table_guard_organization_admin_states_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.organization_admin_states') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='organization_admin_states'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'organization_admin_states' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.organization_admin_states'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.organization_admin_states'::regclass
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
      WHERE attribute_record.attrelid='public.organization_admin_states'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'organization_admin_states' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_organization_admin_states$;

-- dealflow:statement id=20260615100000.preconditions.024 sha256=8a4c7ca9acfaa53118e52168ea3b3d8eedd9b158815296e36dd10a24115a8cae
DO $dealflow_table_guard_performance_tracking$
DECLARE
  expected_table jsonb := $dealflow_table_guard_performance_tracking_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_performance_tracking_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_performance_tracking_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"source_snapshot_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"spend":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"m"},"impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"clicks":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"ctr":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"m"},"leads":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"cpl":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"m"},"synced_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_performance_tracking_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_performance_tracking_required$["id","organization_id","user_id","source_snapshot_id","campaign_id","spend","impressions","clicks","ctr","leads","cpl","synced_at","created_at"]$dealflow_table_guard_performance_tracking_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.performance_tracking') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='performance_tracking'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'performance_tracking' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.performance_tracking'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.performance_tracking'::regclass
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
      WHERE attribute_record.attrelid='public.performance_tracking'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'performance_tracking' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_performance_tracking$;

-- dealflow:statement id=20260615100000.preconditions.025 sha256=91b231595906b6cd0e8fea44e51676e5acc2d83a72c52accf655de0435618cc1
DO $dealflow_table_guard_scale_monitor_runs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_scale_monitor_runs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_scale_monitor_runs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_scale_monitor_runs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"started_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'running'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"verdict":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"smoke_summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"incidents_opened":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"incidents_resolved":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"error_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_scale_monitor_runs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_scale_monitor_runs_required$["id","started_at","completed_at","status","verdict","summary","smoke_summary","incidents_opened","incidents_resolved","error_code","created_at"]$dealflow_table_guard_scale_monitor_runs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.scale_monitor_runs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='scale_monitor_runs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'scale_monitor_runs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.scale_monitor_runs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.scale_monitor_runs'::regclass
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
      WHERE attribute_record.attrelid='public.scale_monitor_runs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'scale_monitor_runs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_scale_monitor_runs$;

-- dealflow:statement id=20260615100000.preconditions.026 sha256=893ff93bbaae026163d93cb93b1c05282c9a8df6931532e397ed543fd18a78cc
DO $dealflow_table_guard_service_areas$
DECLARE
  expected_table jsonb := $dealflow_table_guard_service_areas_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_service_areas_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_service_areas_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"city":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"region":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"postal_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"country":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'USA'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_service_areas_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_service_areas_required$["id","organization_id","city","region","postal_code","country","created_at","updated_at"]$dealflow_table_guard_service_areas_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.service_areas') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='service_areas'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'service_areas' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.service_areas'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.service_areas'::regclass
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
      WHERE attribute_record.attrelid='public.service_areas'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'service_areas' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_service_areas$;

-- dealflow:statement id=20260615100000.preconditions.027 sha256=e08599c153993450e2688c4098e6d1c7b50a069eb753660cb03b0713aedfe544
DO $dealflow_table_guard_targeting_intelligence_patterns$
DECLARE
  expected_table jsonb := $dealflow_table_guard_targeting_intelligence_patterns_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_targeting_intelligence_patterns_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_targeting_intelligence_patterns_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"audience":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"location":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"targeting_pattern":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"spend":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"m"},"impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"clicks":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"ctr":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"m"},"leads":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"cpl":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"m"},"performance_tag":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'test'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"success_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"failure_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"confidence_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0.5","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"m"},"last_seen":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_targeting_intelligence_patterns_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_targeting_intelligence_patterns_required$["id","organization_id","user_id","audience","location","targeting_pattern","spend","impressions","clicks","ctr","leads","cpl","performance_tag","success_count","failure_count","confidence_score","last_seen","created_at","updated_at"]$dealflow_table_guard_targeting_intelligence_patterns_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.targeting_intelligence_patterns') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='targeting_intelligence_patterns'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'targeting_intelligence_patterns' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.targeting_intelligence_patterns'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.targeting_intelligence_patterns'::regclass
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
      WHERE attribute_record.attrelid='public.targeting_intelligence_patterns'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'targeting_intelligence_patterns' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_targeting_intelligence_patterns$;

-- dealflow:statement id=20260615100000.preconditions.028 sha256=aeae5c4e88405710ffb500728f2fa17b8aa4502382116876eca3e9363e692b3d
DO $dealflow_table_guard_workspace_ghl_users$
DECLARE
  expected_table jsonb := $dealflow_table_guard_workspace_ghl_users_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_workspace_ghl_users_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_workspace_ghl_users_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"ghl_location_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"ghl_user_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"invite_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'pending'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_workspace_ghl_users_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_workspace_ghl_users_required$["id","workspace_id","ghl_location_id","ghl_user_id","email","invite_status","metadata","created_at","updated_at","partner_id"]$dealflow_table_guard_workspace_ghl_users_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.workspace_ghl_users') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='workspace_ghl_users'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'workspace_ghl_users' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.workspace_ghl_users'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.workspace_ghl_users'::regclass
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
      WHERE attribute_record.attrelid='public.workspace_ghl_users'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'workspace_ghl_users' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_workspace_ghl_users$;

-- dealflow:statement id=20260615100000.preconditions.029 sha256=d8395faa00d2209f4b5d2ae1a6c7a0151f5ebd203ea3a7de83abcd762f168ede
DO $dealflow_column_guard_billing_subscriptions_commission_rate_snapshot$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_subscriptions_commission_rate_snapshot_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"numeric(6,4)","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":22,"relation_kind":"r","storage_strategy":"m"}$dealflow_column_guard_billing_subscriptions_commission_rate_snapshot_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.billing_subscriptions') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.billing_subscriptions'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='commission_rate_snapshot';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_subscriptions', 'commission_rate_snapshot' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_subscriptions_commission_rate_snapshot$;

-- dealflow:statement id=20260615100000.preconditions.030 sha256=5f3b48614f853efe32956f88ffcdc6acb670c9248d66fda94fd90259a45a81dc
DO $dealflow_column_guard_campaign_plans_form_friction_level$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_form_friction_level_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'high'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":31,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_form_friction_level_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='form_friction_level';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'form_friction_level' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_form_friction_level$;

-- dealflow:statement id=20260615100000.preconditions.031 sha256=9e6a4882a758a270a5a7a489336fcdb381376d9a2e74656ed4269e94a1298f75
DO $dealflow_column_guard_campaign_plans_lead_form_template_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_form_template_id_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":32,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_lead_form_template_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='lead_form_template_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_form_template_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_form_template_id$;

-- dealflow:statement id=20260615100000.preconditions.032 sha256=c8ec7bf965fa04af7a112e0e9195046a3f5d636a8ae34edb74f67d0146410c2b
DO $dealflow_column_guard_campaign_plans_meta_lead_form_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_meta_lead_form_id_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":33,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_meta_lead_form_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='meta_lead_form_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'meta_lead_form_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_meta_lead_form_id$;

-- dealflow:statement id=20260615100000.preconditions.033 sha256=4d1ebd216a520af887ac08b78cb5d9b0f9b124d4feeeb257dee1efa62d949632
DO $dealflow_column_guard_campaign_plans_funnel_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_funnel_id_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":34,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_funnel_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='funnel_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'funnel_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_funnel_id$;

-- dealflow:statement id=20260615100000.preconditions.034 sha256=e99385af49294122f29981bab1acfaa37484cb6a063f920d070726a11b360d35
DO $dealflow_column_guard_campaign_plans_privacy_policy_url$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_privacy_policy_url_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":35,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_privacy_policy_url_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='privacy_policy_url';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'privacy_policy_url' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_privacy_policy_url$;

-- dealflow:statement id=20260615100000.preconditions.035 sha256=6b9846fca76cffc62be8d00911f2759621c0bb2f3ae9b056f117b12d5597d3f6
DO $dealflow_column_guard_campaign_plans_terms_url$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_terms_url_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":36,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_terms_url_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='terms_url';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'terms_url' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_terms_url$;

-- dealflow:statement id=20260615100000.preconditions.036 sha256=59dfa583df1e179272b829d2315e40a8a8aa4a6fd2b2848248aeb5d64e142be5
DO $dealflow_column_guard_campaign_plans_sms_consent_enabled$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_sms_consent_enabled_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":37,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_campaign_plans_sms_consent_enabled_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='sms_consent_enabled';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'sms_consent_enabled' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_sms_consent_enabled$;

-- dealflow:statement id=20260615100000.preconditions.037 sha256=373effe4c42987af11e14f4403e5cfcc636768b39e79081966a6cb0cdfb87721
DO $dealflow_column_guard_campaign_plans_lead_delivery_destination$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_delivery_destination_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'dealflow_dashboard'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":38,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_lead_delivery_destination_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='lead_delivery_destination';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_delivery_destination' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_delivery_destination$;

-- dealflow:statement id=20260615100000.preconditions.038 sha256=cc2e1f1deb69496bcb7334362e6456f4561f710e30b5f3ef9f3f2f315ee6c6b9
DO $dealflow_column_guard_campaign_plans_special_ad_category$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_special_ad_category_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'HOUSING'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":39,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_special_ad_category_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='special_ad_category';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'special_ad_category' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_special_ad_category$;

-- dealflow:statement id=20260615100000.preconditions.039 sha256=3f66f5be9a28572a9c8d8535f535537b7679d372dc2a38902c4c8751fd35308d
DO $dealflow_column_guard_campaign_plans_lead_capture_status$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_capture_status_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'draft'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":40,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_lead_capture_status_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='lead_capture_status';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_capture_status' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_capture_status$;

-- dealflow:statement id=20260615100000.preconditions.040 sha256=9305179e98a6bb357ddd3792a12a13a1d1abd29e68251fac73057bbe28ab7d45
DO $dealflow_column_guard_campaign_plans_lead_capture_ready_at$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_capture_ready_at_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":41,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_campaign_plans_lead_capture_ready_at_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='lead_capture_ready_at';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_capture_ready_at' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_capture_ready_at$;

-- dealflow:statement id=20260615100000.preconditions.041 sha256=f4cd9bcc85e2f7808e67a093944108ad935151d1e750f1501bc2de4a2ca4a9e7
DO $dealflow_column_guard_campaign_plans_lead_capture_last_error$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_capture_last_error_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":42,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_lead_capture_last_error_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_plans') IS NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_build_object(
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
      ) INTO actual_column
  FROM (
    SELECT attribute_record.*,
           row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
    FROM pg_catalog.pg_attribute attribute_record
    WHERE attribute_record.attrelid='public.campaign_plans'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='lead_capture_last_error';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_capture_last_error' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_capture_last_error$;

-- dealflow:statement id=20260615100000.preconditions.042 sha256=756b83e3f8f127cf091135887ab1af019719b2ad4412d987e85630a1ca96376e
DO $dealflow_index_guard_appointments_lead_id_idx$
BEGIN
  IF to_regclass('public.appointments_lead_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='appointments_lead_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX appointments_lead_id_idx ON public.appointments USING btree (lead_id) WHERE (lead_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'appointments_lead_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_appointments_lead_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.043 sha256=9a1af6cd3c233154f1ae0bcd5ec87330a9a3a1eef3aafd8d8b907ebe5cadf26d
DO $dealflow_index_guard_idx_appointments_org$
BEGIN
  IF to_regclass('public.idx_appointments_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_appointments_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_appointments_org ON public.appointments USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_appointments_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_appointments_org$;

-- dealflow:statement id=20260615100000.preconditions.044 sha256=adcb2271a94c6a55f480bdb4c4dafd18cca8e7488606c2d6ddd605192bde83ec
DO $dealflow_index_guard_idx_appointments_org_status$
BEGIN
  IF to_regclass('public.idx_appointments_org_status') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_appointments_org_status'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_appointments_org_status ON public.appointments USING btree (organization_id, status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_appointments_org_status' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_appointments_org_status$;

-- dealflow:statement id=20260615100000.preconditions.045 sha256=6c4a6618a096c74d8b641d43aa48c51692f88ba7d30f4b17178c8c34d50db92f
DO $dealflow_index_guard_audit_logs_actor_user_id_idx$
BEGIN
  IF to_regclass('public.audit_logs_actor_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='audit_logs_actor_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX audit_logs_actor_user_id_idx ON public.audit_logs USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'audit_logs_actor_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_audit_logs_actor_user_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.046 sha256=c0e35421ebac5555927b8a26d454c3821c12ad0c8460e3e02dc7671a0e0ba4f8
DO $dealflow_index_guard_idx_audit_logs_org$
BEGIN
  IF to_regclass('public.idx_audit_logs_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_audit_logs_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_audit_logs_org ON public.audit_logs USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_audit_logs_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_audit_logs_org$;

-- dealflow:statement id=20260615100000.preconditions.047 sha256=a61cb7ff15eaffdc891854fe716536ef4cc542811952f075dacf83143fe6d15c
DO $dealflow_index_guard_idx_business_profiles_org$
BEGIN
  IF to_regclass('public.idx_business_profiles_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_business_profiles_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_business_profiles_org ON public.business_profiles USING btree (organization_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_business_profiles_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_business_profiles_org$;

-- dealflow:statement id=20260615100000.preconditions.048 sha256=f1faa8b5382d18b4d3f7a22fbff9b304a959be3b66970216f8a5a419aaf2b503
DO $dealflow_index_guard_campaign_action_suggestions_campaign_status_idx$
BEGIN
  IF to_regclass('public.campaign_action_suggestions_campaign_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_action_suggestions_campaign_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_action_suggestions_campaign_status_idx ON public.campaign_action_suggestions USING btree (organization_id, user_id, meta_campaign_id, status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_action_suggestions_campaign_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_action_suggestions_campaign_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.049 sha256=70096e806966475ff4033f02186e12ac75514da23eefb89b1837c7c93d5f8abb
DO $dealflow_index_guard_campaign_action_suggestions_org_created_idx$
BEGIN
  IF to_regclass('public.campaign_action_suggestions_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_action_suggestions_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_action_suggestions_org_created_idx ON public.campaign_action_suggestions USING btree (organization_id, user_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_action_suggestions_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_action_suggestions_org_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.050 sha256=33337a9bdf51b9dc57cdb9c42c7bdb26c5481c6d46debd6919dfb51d3bae382b
DO $dealflow_index_guard_campaign_draft_actions_campaign_idx$
BEGIN
  IF to_regclass('public.campaign_draft_actions_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_draft_actions_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_draft_actions_campaign_idx ON public.campaign_draft_actions USING btree (organization_id, user_id, campaign_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_draft_actions_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_draft_actions_campaign_idx$;

-- dealflow:statement id=20260615100000.preconditions.051 sha256=8fc2196069a5b6fb5c3c82b22a756907d47a1db653e5e5e7bec30bc1e90d5673
DO $dealflow_index_guard_campaign_draft_actions_org_created_idx$
BEGIN
  IF to_regclass('public.campaign_draft_actions_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_draft_actions_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_draft_actions_org_created_idx ON public.campaign_draft_actions USING btree (organization_id, user_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_draft_actions_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_draft_actions_org_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.052 sha256=e1e8878e2440ce1c77912d74a07e206d208229f221afbbf7be741fe66e5c508a
DO $dealflow_index_guard_campaign_leads_campaign_created_idx$
BEGIN
  IF to_regclass('public.campaign_leads_campaign_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_leads_campaign_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_leads_campaign_created_idx ON public.campaign_leads USING btree (campaign_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_leads_campaign_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_leads_campaign_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.053 sha256=c63703a10f2bea7fccda28446c688cc347d8261727538c9e52205d792ade96ca
DO $dealflow_index_guard_campaign_leads_org_created_idx$
BEGIN
  IF to_regclass('public.campaign_leads_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_leads_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_leads_org_created_idx ON public.campaign_leads USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_leads_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_leads_org_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.054 sha256=b914ce00936b39e71b014be73ffedd01c540810d4c59935c47447bfa15f0cfb5
DO $dealflow_index_guard_campaign_leads_qualified_idx$
BEGIN
  IF to_regclass('public.campaign_leads_qualified_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_leads_qualified_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_leads_qualified_idx ON public.campaign_leads USING btree (organization_id, qualified, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_leads_qualified_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_leads_qualified_idx$;

-- dealflow:statement id=20260615100000.preconditions.055 sha256=8c128861d9c7a2485cd3a70f8a2cbb4fb3f281dbcf1529168b06b0fa7c86f800
DO $dealflow_index_guard_campaign_plans_lead_capture_idx$
BEGIN
  IF to_regclass('public.campaign_plans_lead_capture_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_plans_lead_capture_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_plans_lead_capture_idx ON public.campaign_plans USING btree (organization_id, capture_method, lead_capture_status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_plans_lead_capture_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_plans_lead_capture_idx$;

-- dealflow:statement id=20260615100000.preconditions.056 sha256=53dcc5faccbbf3ea8bd08500a27dad30c89f2d8f50342b0a2c9101afa2ae3f07
DO $dealflow_index_guard_idx_campaign_snapshots_org_date$
BEGIN
  IF to_regclass('public.idx_campaign_snapshots_org_date') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_campaign_snapshots_org_date'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_campaign_snapshots_org_date ON public.campaign_snapshots USING btree (organization_id, snapshot_date DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_campaign_snapshots_org_date' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_campaign_snapshots_org_date$;

-- dealflow:statement id=20260615100000.preconditions.057 sha256=7c0753465d0d708806dcd638b2122d9ea4d1303e976bd026a00ff60ff5234550
DO $dealflow_index_guard_data_imports_uploaded_by_idx$
BEGIN
  IF to_regclass('public.data_imports_uploaded_by_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='data_imports_uploaded_by_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX data_imports_uploaded_by_idx ON public.data_imports USING btree (uploaded_by) WHERE (uploaded_by IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'data_imports_uploaded_by_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_data_imports_uploaded_by_idx$;

-- dealflow:statement id=20260615100000.preconditions.058 sha256=8a5068fbcd4e865cff4bff09b47018531886cc609dcec72c416af8946c683926
DO $dealflow_index_guard_idx_imports_org$
BEGIN
  IF to_regclass('public.idx_imports_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_imports_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_imports_org ON public.data_imports USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_imports_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_imports_org$;

-- dealflow:statement id=20260615100000.preconditions.059 sha256=f0b227b894cc22e6f5d8a9a603e42720bca82e6fe0fbf6c727728af5cc3dcc3d
DO $dealflow_index_guard_deals_appointment_id_idx$
BEGIN
  IF to_regclass('public.deals_appointment_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='deals_appointment_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX deals_appointment_id_idx ON public.deals USING btree (appointment_id) WHERE (appointment_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'deals_appointment_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_deals_appointment_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.060 sha256=639d2015e572d3ea8ecfe961f9e702a46d90d87d3890dc47688e37e1af7428bd
DO $dealflow_index_guard_deals_lead_id_idx$
BEGIN
  IF to_regclass('public.deals_lead_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='deals_lead_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX deals_lead_id_idx ON public.deals USING btree (lead_id) WHERE (lead_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'deals_lead_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_deals_lead_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.061 sha256=d878d46cd5501f78f9b11622ad68a9a11db9d23c91780fca5ead2eff9687cd0f
DO $dealflow_index_guard_idx_deals_market$
BEGIN
  IF to_regclass('public.idx_deals_market') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_deals_market'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_deals_market ON public.deals USING btree (market_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_deals_market' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_deals_market$;

-- dealflow:statement id=20260615100000.preconditions.062 sha256=38ef08177496923d3a2d5ede758af8fa463596b6b1ad038859d73369ced21ea0
DO $dealflow_index_guard_idx_deals_org$
BEGIN
  IF to_regclass('public.idx_deals_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_deals_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_deals_org ON public.deals USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_deals_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_deals_org$;

-- dealflow:statement id=20260615100000.preconditions.063 sha256=fce75f884309d408218957216830a6e2ae3a1fddcebf05eeead9f08e1b6d53ff
DO $dealflow_index_guard_idx_deals_org_stage$
BEGIN
  IF to_regclass('public.idx_deals_org_stage') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_deals_org_stage'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_deals_org_stage ON public.deals USING btree (organization_id, stage)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_deals_org_stage' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_deals_org_stage$;

-- dealflow:statement id=20260615100000.preconditions.064 sha256=8a7a6f0f2f02fa0d6be98391a0076256578d5534c1c6c859073295dd944a5eea
DO $dealflow_index_guard_idx_deals_org_status$
BEGIN
  IF to_regclass('public.idx_deals_org_status') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_deals_org_status'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_deals_org_status ON public.deals USING btree (organization_id, status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_deals_org_status' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_deals_org_status$;

-- dealflow:statement id=20260615100000.preconditions.065 sha256=6510da5acc86321a151eb51f77d9d4aa8476aa31a3b160a84a398cecec4dd135
DO $dealflow_index_guard_generated_artifacts_generated_by_idx$
BEGIN
  IF to_regclass('public.generated_artifacts_generated_by_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='generated_artifacts_generated_by_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX generated_artifacts_generated_by_idx ON public.generated_artifacts USING btree (generated_by) WHERE (generated_by IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'generated_artifacts_generated_by_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_generated_artifacts_generated_by_idx$;

-- dealflow:statement id=20260615100000.preconditions.066 sha256=da6cf932d37884d1488ba0ef845b56cf83d90963f451011f1aaf4f888b6d8b51
DO $dealflow_index_guard_idx_generated_artifacts_org_type_created$
BEGIN
  IF to_regclass('public.idx_generated_artifacts_org_type_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_generated_artifacts_org_type_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_generated_artifacts_org_type_created ON public.generated_artifacts USING btree (organization_id, artifact_type, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_generated_artifacts_org_type_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_generated_artifacts_org_type_created$;

-- dealflow:statement id=20260615100000.preconditions.067 sha256=57b7781567c82571c9fa0aaf9e6910b1061a45697917f74edbac52e3a00d2cb3
DO $dealflow_index_guard_ghl_provisioning_events_job_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_events_job_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_events_job_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_events_job_idx ON public.ghl_provisioning_events USING btree (job_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_events_job_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_events_job_idx$;

-- dealflow:statement id=20260615100000.preconditions.068 sha256=62edeae70c1ac6caad51f6ca6988f09813e69cf1072a11fff0da265c7c3b731a
DO $dealflow_index_guard_ghl_provisioning_events_partner_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_events_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_events_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_events_partner_idx ON public.ghl_provisioning_events USING btree (partner_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_events_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_events_partner_idx$;

-- dealflow:statement id=20260615100000.preconditions.069 sha256=5f6a719e0183936ab29429ceb8507c467be3f4e6df099cf748701ab11a229794
DO $dealflow_index_guard_ghl_provisioning_events_workspace_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_events_workspace_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_events_workspace_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_events_workspace_idx ON public.ghl_provisioning_events USING btree (workspace_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_events_workspace_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_events_workspace_idx$;

-- dealflow:statement id=20260615100000.preconditions.070 sha256=a58613df67d29bb97efc3eaff91a75aa8fe0c0f0c11144a7aedf9257e268df1c
DO $dealflow_index_guard_ghl_provisioning_jobs_idempotency_unique$
BEGIN
  IF to_regclass('public.ghl_provisioning_jobs_idempotency_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_jobs_idempotency_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX ghl_provisioning_jobs_idempotency_unique ON public.ghl_provisioning_jobs USING btree (idempotency_key)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_jobs_idempotency_unique$;

-- dealflow:statement id=20260615100000.preconditions.071 sha256=770e21a8392fdbf6ef2e0ec7d08f752466262dc8f1725cf28b058d70228ae488
DO $dealflow_index_guard_ghl_provisioning_jobs_next_retry_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_jobs_next_retry_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_jobs_next_retry_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_jobs_next_retry_idx ON public.ghl_provisioning_jobs USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY[''queued''::text, ''failed''::text]))'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs_next_retry_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_jobs_next_retry_idx$;

-- dealflow:statement id=20260615100000.preconditions.072 sha256=5a472b9b4aa6c1a3fc48f4495bd9b24ab08fda8865be996c7c930ffc207ea73e
DO $dealflow_index_guard_ghl_provisioning_jobs_partner_status_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_jobs_partner_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_jobs_partner_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_jobs_partner_status_idx ON public.ghl_provisioning_jobs USING btree (partner_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs_partner_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_jobs_partner_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.073 sha256=20db70c654a948cef2a62bfd7afb0181529719c45c112668349b8cad115ffcd9
DO $dealflow_index_guard_ghl_provisioning_jobs_workspace_status_idx$
BEGIN
  IF to_regclass('public.ghl_provisioning_jobs_workspace_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='ghl_provisioning_jobs_workspace_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX ghl_provisioning_jobs_workspace_status_idx ON public.ghl_provisioning_jobs USING btree (workspace_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'ghl_provisioning_jobs_workspace_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_ghl_provisioning_jobs_workspace_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.074 sha256=fcb02a1a519022c9dfa725f79241737052af94a69863b04d2104ed4c26deecb8
DO $dealflow_index_guard_idx_health_scores_org$
BEGIN
  IF to_regclass('public.idx_health_scores_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_health_scores_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_health_scores_org ON public.health_scores USING btree (organization_id, recorded_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_health_scores_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_health_scores_org$;

-- dealflow:statement id=20260615100000.preconditions.075 sha256=c680b53c1687713207e8458bfe1ba35b3b539acfdb21fd8aaf4a65dcfc493e39
DO $dealflow_index_guard_integration_oauth_states_campaign_idx$
BEGIN
  IF to_regclass('public.integration_oauth_states_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='integration_oauth_states_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX integration_oauth_states_campaign_idx ON public.integration_oauth_states USING btree (campaign_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'integration_oauth_states_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_integration_oauth_states_campaign_idx$;

-- dealflow:statement id=20260615100000.preconditions.076 sha256=e70b4f7cb1557d2f555a719302c6cfa84710f82e0e2eeb3a1629b472e3ecd028
DO $dealflow_index_guard_integration_oauth_states_expires_at_idx$
BEGIN
  IF to_regclass('public.integration_oauth_states_expires_at_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='integration_oauth_states_expires_at_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX integration_oauth_states_expires_at_idx ON public.integration_oauth_states USING btree (expires_at)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'integration_oauth_states_expires_at_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_integration_oauth_states_expires_at_idx$;

-- dealflow:statement id=20260615100000.preconditions.077 sha256=3738eef4b4ae26e4d1e76d7dc181f034ee372a2541471802f89ca2fb237d1ea4
DO $dealflow_index_guard_integration_oauth_states_provider_nonce_idx$
BEGIN
  IF to_regclass('public.integration_oauth_states_provider_nonce_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='integration_oauth_states_provider_nonce_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX integration_oauth_states_provider_nonce_idx ON public.integration_oauth_states USING btree (provider, nonce)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'integration_oauth_states_provider_nonce_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_integration_oauth_states_provider_nonce_idx$;

-- dealflow:statement id=20260615100000.preconditions.078 sha256=9d05829e3688ff42240226118ddfb0382cdff57ef8011d9e8fa2c0e383d68916
DO $dealflow_index_guard_idx_internal_notes_org_created$
BEGIN
  IF to_regclass('public.idx_internal_notes_org_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_internal_notes_org_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_internal_notes_org_created ON public.internal_notes USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_internal_notes_org_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_internal_notes_org_created$;

-- dealflow:statement id=20260615100000.preconditions.079 sha256=b575e477cd3597b84bddacb7b9a10c9d66734796bb762426172999870d413e38
DO $dealflow_index_guard_internal_notes_author_user_id_idx$
BEGIN
  IF to_regclass('public.internal_notes_author_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='internal_notes_author_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX internal_notes_author_user_id_idx ON public.internal_notes USING btree (author_user_id) WHERE (author_user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'internal_notes_author_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_internal_notes_author_user_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.080 sha256=23bb9123a3b14350397bc35175f7e0d46f302b7e671515a18b1f7751e7dff2f9
DO $dealflow_index_guard_idx_jobs_org_created$
BEGIN
  IF to_regclass('public.idx_jobs_org_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_jobs_org_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_jobs_org_created ON public.jobs USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_jobs_org_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_jobs_org_created$;

-- dealflow:statement id=20260615100000.preconditions.081 sha256=589bcb40a6c1dd86020850508a9d207b45a211370b5629e932e8f8b73afbf149
DO $dealflow_index_guard_idx_jobs_org_status$
BEGIN
  IF to_regclass('public.idx_jobs_org_status') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_jobs_org_status'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_jobs_org_status ON public.jobs USING btree (organization_id, status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_jobs_org_status' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_jobs_org_status$;

-- dealflow:statement id=20260615100000.preconditions.082 sha256=09fe795c028e8d1924809dd20872120190d7ca00e45adeb9ce5a795e518fe667
DO $dealflow_index_guard_jobs_assigned_user_id_idx$
BEGIN
  IF to_regclass('public.jobs_assigned_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='jobs_assigned_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX jobs_assigned_user_id_idx ON public.jobs USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'jobs_assigned_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_jobs_assigned_user_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.083 sha256=abf002202fbc767256ad918e4e28317aa15441cc2e4565a05b43e672f6be1a79
DO $dealflow_index_guard_jobs_lead_id_idx$
BEGIN
  IF to_regclass('public.jobs_lead_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='jobs_lead_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX jobs_lead_id_idx ON public.jobs USING btree (lead_id) WHERE (lead_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'jobs_lead_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_jobs_lead_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.084 sha256=2d0c0e2b474f062160e505c447683cd41d0761c2e5d39cc40e77c389f4325c77
DO $dealflow_index_guard_jobs_service_type_id_idx$
BEGIN
  IF to_regclass('public.jobs_service_type_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='jobs_service_type_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX jobs_service_type_id_idx ON public.jobs USING btree (service_type_id) WHERE (service_type_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'jobs_service_type_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_jobs_service_type_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.085 sha256=cab0e0a186b19947811e1007016b3a811cca4bbc839adf670de48f4c523722b9
DO $dealflow_index_guard_lead_capture_events_campaign_created_idx$
BEGIN
  IF to_regclass('public.lead_capture_events_campaign_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_capture_events_campaign_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_capture_events_campaign_created_idx ON public.lead_capture_events USING btree (campaign_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_capture_events_campaign_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_capture_events_campaign_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.086 sha256=c450f3d236583da4f4c0abc0546388b15bfa247e124e7370bb933391f422126a
DO $dealflow_index_guard_lead_capture_events_org_created_idx$
BEGIN
  IF to_regclass('public.lead_capture_events_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_capture_events_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_capture_events_org_created_idx ON public.lead_capture_events USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_capture_events_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_capture_events_org_created_idx$;

-- dealflow:statement id=20260615100000.preconditions.087 sha256=1f90358cef62895ea1cc17f5a70fdc6d389c9e0d92713d35b9f52ea9f53f3453
DO $dealflow_index_guard_lead_crm_sync_events_idempotency_unique$
BEGIN
  IF to_regclass('public.lead_crm_sync_events_idempotency_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_crm_sync_events_idempotency_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX lead_crm_sync_events_idempotency_unique ON public.lead_crm_sync_events USING btree (idempotency_key)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_crm_sync_events_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_crm_sync_events_idempotency_unique$;

-- dealflow:statement id=20260615100000.preconditions.088 sha256=fba228d425804e74067a2748fdf84af22ddb51c7c4e42615878db6b28c69f4bf
DO $dealflow_index_guard_lead_crm_sync_events_next_retry_idx$
BEGIN
  IF to_regclass('public.lead_crm_sync_events_next_retry_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_crm_sync_events_next_retry_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_crm_sync_events_next_retry_idx ON public.lead_crm_sync_events USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY[''queued''::text, ''failed''::text]))'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_crm_sync_events_next_retry_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_crm_sync_events_next_retry_idx$;

-- dealflow:statement id=20260615100000.preconditions.089 sha256=5d0fc26a483a0ec1f7b840df4df68d8bc399ffd97863245d03f242984aacaeb5
DO $dealflow_index_guard_lead_crm_sync_events_partner_status_idx$
BEGIN
  IF to_regclass('public.lead_crm_sync_events_partner_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_crm_sync_events_partner_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_crm_sync_events_partner_status_idx ON public.lead_crm_sync_events USING btree (partner_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_crm_sync_events_partner_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_crm_sync_events_partner_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.090 sha256=565554052ab7c27b4b67b681f54f5e1cd0b841f3a883798a5a35497f33dbe620
DO $dealflow_index_guard_lead_crm_sync_events_workspace_status_idx$
BEGIN
  IF to_regclass('public.lead_crm_sync_events_workspace_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_crm_sync_events_workspace_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_crm_sync_events_workspace_status_idx ON public.lead_crm_sync_events USING btree (workspace_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_crm_sync_events_workspace_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_crm_sync_events_workspace_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.091 sha256=b129be1980536bc7a63c92e5f8b66a080b54770319dfb2fc1fd2a3ae2c81f5d3
DO $dealflow_index_guard_lead_delivery_attempts_lead_idx$
BEGIN
  IF to_regclass('public.lead_delivery_attempts_lead_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_delivery_attempts_lead_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_delivery_attempts_lead_idx ON public.lead_delivery_attempts USING btree (campaign_lead_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_delivery_attempts_lead_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_delivery_attempts_lead_idx$;

-- dealflow:statement id=20260615100000.preconditions.092 sha256=65cb15685889dbbd2e155524989f44cc377d3ec4788e8124af60ca3b9312792d
DO $dealflow_index_guard_lead_delivery_attempts_org_status_idx$
BEGIN
  IF to_regclass('public.lead_delivery_attempts_org_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_delivery_attempts_org_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_delivery_attempts_org_status_idx ON public.lead_delivery_attempts USING btree (organization_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_delivery_attempts_org_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_delivery_attempts_org_status_idx$;

-- dealflow:statement id=20260615100000.preconditions.093 sha256=494f0fd2558725b0cc86a3a7e4126133a27d23fdf2d4fd64dfb6d528bc463876
DO $dealflow_index_guard_lead_form_templates_org_goal_idx$
BEGIN
  IF to_regclass('public.lead_form_templates_org_goal_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_form_templates_org_goal_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_form_templates_org_goal_idx ON public.lead_form_templates USING btree (organization_id, lead_capture_goal, active)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_form_templates_org_goal_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_form_templates_org_goal_idx$;

-- dealflow:statement id=20260615100000.preconditions.094 sha256=a0908dd91bad039487b8f6004730a23d80f6093ccc72ad8681fb851f2469f767
DO $dealflow_index_guard_leads_assigned_user_id_idx$
BEGIN
  IF to_regclass('public.leads_assigned_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='leads_assigned_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX leads_assigned_user_id_idx ON public.leads USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'leads_assigned_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_leads_assigned_user_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.095 sha256=d21fc92f1b091ccceb717ffaf70029385ff371bbd71276011129844f563f3052
DO $dealflow_index_guard_leads_marketing_account_id_idx$
BEGIN
  IF to_regclass('public.leads_marketing_account_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='leads_marketing_account_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX leads_marketing_account_id_idx ON public.leads USING btree (marketing_account_id) WHERE (marketing_account_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'leads_marketing_account_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_leads_marketing_account_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.096 sha256=67bf4172bd53133a64ff7386d927e92c393c14cd317ee15b41c302457b1c6d23
DO $dealflow_index_guard_leads_service_type_id_idx$
BEGIN
  IF to_regclass('public.leads_service_type_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='leads_service_type_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX leads_service_type_id_idx ON public.leads USING btree (service_type_id) WHERE (service_type_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'leads_service_type_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_leads_service_type_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.097 sha256=e005343b7d5cf707870cf4cfbdc39aa66edbd13278f580b68fc44c68780bc8c2
DO $dealflow_index_guard_idx_markets_org$
BEGIN
  IF to_regclass('public.idx_markets_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_markets_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_markets_org ON public.markets USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_markets_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_markets_org$;

-- dealflow:statement id=20260615100000.preconditions.098 sha256=b05f8bfe7ea12bb7a0fe5442f36284b42616e0cc83bcbc117f9f2da41c03f2e4
DO $dealflow_index_guard_idx_org_admin_states_org$
BEGIN
  IF to_regclass('public.idx_org_admin_states_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_org_admin_states_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_org_admin_states_org ON public.organization_admin_states USING btree (organization_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_org_admin_states_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_org_admin_states_org$;

-- dealflow:statement id=20260615100000.preconditions.099 sha256=c4f6a1f375f7087f0aecaefe78acae0fe34584cfab9d50cb73ffeb6976d97483
DO $dealflow_index_guard_organizations_owner_user_id_idx$
BEGIN
  IF to_regclass('public.organizations_owner_user_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='organizations_owner_user_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX organizations_owner_user_id_idx ON public.organizations USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'organizations_owner_user_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_organizations_owner_user_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.100 sha256=dab670c7a69e1512741fc41d83e99fe75c229edaad6ee5de1df7b82b0b7619d1
DO $dealflow_index_guard_performance_tracking_campaign_synced_idx$
BEGIN
  IF to_regclass('public.performance_tracking_campaign_synced_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='performance_tracking_campaign_synced_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX performance_tracking_campaign_synced_idx ON public.performance_tracking USING btree (organization_id, user_id, campaign_id, synced_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'performance_tracking_campaign_synced_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_performance_tracking_campaign_synced_idx$;

-- dealflow:statement id=20260615100000.preconditions.101 sha256=6fe25dbb8565efa9cb8bc731472fd287497f106a5dded61df0d14f6f1405f85c
DO $dealflow_index_guard_performance_tracking_org_synced_idx$
BEGIN
  IF to_regclass('public.performance_tracking_org_synced_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='performance_tracking_org_synced_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX performance_tracking_org_synced_idx ON public.performance_tracking USING btree (organization_id, synced_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'performance_tracking_org_synced_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_performance_tracking_org_synced_idx$;

-- dealflow:statement id=20260615100000.preconditions.102 sha256=b3dcb1ca4c1759f02803d7c8ea50cb09681d4a8c04bc85808b67e09b60428cf0
DO $dealflow_index_guard_scale_monitor_runs_started_idx$
BEGIN
  IF to_regclass('public.scale_monitor_runs_started_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='scale_monitor_runs_started_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX scale_monitor_runs_started_idx ON public.scale_monitor_runs USING btree (started_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'scale_monitor_runs_started_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_scale_monitor_runs_started_idx$;

-- dealflow:statement id=20260615100000.preconditions.103 sha256=afbed08805421b6b0cf46bfd922f77478e280f979a67eb78e867be7b4af4a7d9
DO $dealflow_index_guard_idx_service_areas_org$
BEGIN
  IF to_regclass('public.idx_service_areas_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_service_areas_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_service_areas_org ON public.service_areas USING btree (organization_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_service_areas_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_service_areas_org$;

-- dealflow:statement id=20260615100000.preconditions.104 sha256=dc0afbbf8afa698c139adecc96526a64ee0e102cddbff63d864ff812677dd826
DO $dealflow_index_guard_targeting_intelligence_patterns_confidence_idx$
BEGIN
  IF to_regclass('public.targeting_intelligence_patterns_confidence_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='targeting_intelligence_patterns_confidence_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX targeting_intelligence_patterns_confidence_idx ON public.targeting_intelligence_patterns USING btree (organization_id, user_id, confidence_score DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'targeting_intelligence_patterns_confidence_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_targeting_intelligence_patterns_confidence_idx$;

-- dealflow:statement id=20260615100000.preconditions.105 sha256=3b869206078b5af869b38fac74fb35bf632cf6b0db0a40850052ad0d44e4c6a1
DO $dealflow_index_guard_targeting_intelligence_patterns_org_key_unique$
BEGIN
  IF to_regclass('public.targeting_intelligence_patterns_org_key_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='targeting_intelligence_patterns_org_key_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX targeting_intelligence_patterns_org_key_unique ON public.targeting_intelligence_patterns USING btree (organization_id, user_id, audience, location, targeting_pattern)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'targeting_intelligence_patterns_org_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_targeting_intelligence_patterns_org_key_unique$;

-- dealflow:statement id=20260615100000.preconditions.106 sha256=e0402dd2a137a2e8902e388ddc795cca0b6c2f3acfb11a2a3d8a68db364b17c0
DO $dealflow_index_guard_user_credit_ledger_organization_id_idx$
BEGIN
  IF to_regclass('public.user_credit_ledger_organization_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='user_credit_ledger_organization_id_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX user_credit_ledger_organization_id_idx ON public.user_credit_ledger USING btree (organization_id) WHERE (organization_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'user_credit_ledger_organization_id_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_user_credit_ledger_organization_id_idx$;

-- dealflow:statement id=20260615100000.preconditions.107 sha256=3051cde0cfa0af00ef3bae46a2ea39d52561099ad8465602f49ca4173b1e3948
DO $dealflow_index_guard_workspace_ghl_users_location_idx$
BEGIN
  IF to_regclass('public.workspace_ghl_users_location_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_ghl_users_location_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX workspace_ghl_users_location_idx ON public.workspace_ghl_users USING btree (ghl_location_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_ghl_users_location_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_ghl_users_location_idx$;

-- dealflow:statement id=20260615100000.preconditions.108 sha256=a3ba71acaf84aa2c28ff7df0a851c537871d7c76acdda9da387ffcdd2c59e2f6
DO $dealflow_index_guard_workspace_ghl_users_workspace_partner_email_unique$
BEGIN
  IF to_regclass('public.workspace_ghl_users_workspace_partner_email_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_ghl_users_workspace_partner_email_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX workspace_ghl_users_workspace_partner_email_unique ON public.workspace_ghl_users USING btree (workspace_id, partner_id, email)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_ghl_users_workspace_partner_email_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_ghl_users_workspace_partner_email_unique$;

-- tables
-- dealflow:statement id=20260615100000.tables.001 sha256=32fbd1292ad741a6f27af47b5134e151d46d499fb244649a3bf7dc0e3b4093bc
CREATE TABLE IF NOT EXISTS "public"."ad_performance" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "creative_id" text,
  "campaign_id" uuid,
  "ctr" numeric,
  "cpl" numeric,
  "impressions" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

-- dealflow:statement id=20260615100000.tables.002 sha256=220c164be6059991bc8f3630417e2877b10413e5068087d157d6bf51cdd317f1
CREATE TABLE IF NOT EXISTS "public"."appointments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "lead_id" uuid,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "appointment_type" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.003 sha256=6726498c4e1b5708a926a68d9567b9a5250c2bde9c8bf6b3741a59c0873328f6
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "action" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.004 sha256=460e1d46472925f1ae15f8bfee2bcae45fbcfc412716034e3edda74e51df5e4b
CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "legal_name" text NOT NULL,
  "industry" text DEFAULT 'real_estate'::text NOT NULL,
  "website" text,
  "phone" text,
  "primary_goal" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.005 sha256=cf3a06e0d5b9c8e39b6cc5dd7a75b10346dcde6dd66567dc6c13b848d98cc8c1
CREATE TABLE IF NOT EXISTS "public"."campaign_action_suggestions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "sync_snapshot_id" uuid,
  "meta_campaign_id" text NOT NULL,
  "action_type" text NOT NULL,
  "title" text NOT NULL,
  "reason" text NOT NULL,
  "expected_impact" text NOT NULL,
  "status" text DEFAULT 'suggested'::text NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.006 sha256=b4401e1acacd213d187a2df09f85200284d9fd7a692c2ea8ca7e26617a54b15e
CREATE TABLE IF NOT EXISTS "public"."campaign_draft_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "campaign_id" text NOT NULL,
  "action_type" text NOT NULL,
  "source_reason" text NOT NULL,
  "proposed_change" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_impact" text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.007 sha256=8304261127a5c9daaa6fcee13f9a8f5290f8e1b60948a23deaee3f79ba2557b3
CREATE TABLE IF NOT EXISTS "public"."campaign_leads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "lead_capture_goal" text NOT NULL,
  "capture_method" text NOT NULL,
  "source" text DEFAULT 'website_funnel'::text NOT NULL,
  "source_lead_id" text,
  "dedupe_key" text NOT NULL,
  "full_name" text,
  "email" text,
  "phone" text,
  "answers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "qualification_score" integer DEFAULT 0 NOT NULL,
  "qualified" boolean DEFAULT false NOT NULL,
  "qualification_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attribution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.008 sha256=581bf891aad70c81f3ff15d5a52ede13737ee89a14df907b80cf6f1cdec48e60
CREATE TABLE IF NOT EXISTS "public"."campaign_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "marketing_account_id" uuid NOT NULL,
  "snapshot_date" date NOT NULL,
  "spend" numeric(12,2) DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "leads" integer DEFAULT 0 NOT NULL,
  "booked_jobs" integer DEFAULT 0 NOT NULL,
  "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.009 sha256=b6ecf5c7b98428323ab5c8cfef13cc92d9043f12a131a5e108c3d95f2b3f7327
CREATE TABLE IF NOT EXISTS "public"."data_imports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "import_type" text NOT NULL,
  "file_name" text NOT NULL,
  "file_path" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "inserted_rows" integer DEFAULT 0 NOT NULL,
  "failed_rows" integer DEFAULT 0 NOT NULL,
  "error_summary" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.010 sha256=85348e9a53e60b4bd9f93925863667059151c9abc1e026daff600988621ce088
CREATE TABLE IF NOT EXISTS "public"."deals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "lead_id" uuid,
  "appointment_id" uuid,
  "title" text NOT NULL,
  "contact_name" text NOT NULL,
  "deal_type" text DEFAULT 'other'::text NOT NULL,
  "stage" text DEFAULT 'new'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "estimated_value" numeric(12,2) DEFAULT 0 NOT NULL,
  "closed_value" numeric(12,2),
  "commission_revenue" numeric(12,2),
  "market_id" uuid,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "closed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.011 sha256=e75c9044a6a910f61059a25545ff43e74387b343b0c9558e4657d4591f8c3f72
CREATE TABLE IF NOT EXISTS "public"."generated_artifacts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "artifact_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "generated_by" uuid,
  "source" text DEFAULT 'system'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.012 sha256=ebb4531cca3193df896a4d24d6bce1c4203be6dc92a5740319e1f3cedc2e0304
CREATE TABLE IF NOT EXISTS "public"."ghl_provisioning_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "step" text NOT NULL,
  "status" text NOT NULL,
  "external_id" text,
  "error_code" text,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260615100000.tables.013 sha256=5c0cfe81d5f8c280b644c116be333d753801b22c4ed191c87d2aed44b23eb0ea
CREATE TABLE IF NOT EXISTS "public"."ghl_provisioning_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_event_id" text,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "idempotency_key" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_completed_step" text,
  "last_error_code" text,
  "last_error_message" text,
  "next_retry_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260615100000.tables.014 sha256=bffdbf886ded602cfe1bee422a96972240381282c64cb76b42716cdabcc95974
CREATE TABLE IF NOT EXISTS "public"."health_scores" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "category" text NOT NULL,
  "score" integer NOT NULL,
  "summary" text,
  "recorded_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.015 sha256=167397f043e201971a5ac6d72028cf3f880e49555a8dc797f7dee63bb4d6813f
CREATE TABLE IF NOT EXISTS "public"."integration_oauth_states" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "nonce" text NOT NULL,
  "state_hash" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "campaign_id" uuid,
  "partner_id" uuid,
  "origin_host" text NOT NULL,
  "return_host" text NOT NULL,
  "return_to" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.016 sha256=d7c4cecef4fe81020ed32786d95d440a7fc193ff515dfa5b74e774cb71cc8bec
CREATE TABLE IF NOT EXISTS "public"."internal_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "author_user_id" uuid,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.017 sha256=8d0434a4422fa6c9870ad1c1b225ed50ca53bb97968e8ac79fb3e31c8255cb1f
CREATE TABLE IF NOT EXISTS "public"."jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "lead_id" uuid,
  "service_type_id" uuid,
  "assigned_user_id" uuid,
  "title" text NOT NULL,
  "customer_name" text NOT NULL,
  "status" text DEFAULT 'booked'::text NOT NULL,
  "scheduled_for" timestamp with time zone,
  "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
  "address" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.018 sha256=dfa572377a48e9d99f63ee9b3078fb94327c90fa6ab05cd3104d7f09216f2b84
CREATE TABLE IF NOT EXISTS "public"."lead_capture_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "campaign_lead_id" uuid,
  "event_type" text NOT NULL,
  "capture_method" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.019 sha256=447877bbad9b73fe870fa307130095a61dabd928f2c97a1c416db258f5d1ae66
CREATE TABLE IF NOT EXISTS "public"."lead_crm_sync_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "destination" text DEFAULT 'gohighlevel'::text NOT NULL,
  "ghl_location_id" text,
  "ghl_contact_id" text,
  "ghl_opportunity_id" text,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "idempotency_key" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error_code" text,
  "last_error_message" text,
  "next_retry_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260615100000.tables.020 sha256=ea5beedc12f042cca2847c652d6abb07f7ec5b5c857f0cd6478b665fec448b9e
CREATE TABLE IF NOT EXISTS "public"."lead_delivery_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "campaign_lead_id" uuid NOT NULL,
  "destination" text NOT NULL,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.021 sha256=33db918cf3b39d31d41dd326391c146320731714aad721a9452eaa989230391e
CREATE TABLE IF NOT EXISTS "public"."lead_form_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "partner_id" uuid,
  "template_key" text NOT NULL,
  "name" text NOT NULL,
  "lead_capture_goal" text NOT NULL,
  "capture_method" text NOT NULL,
  "form_friction_level" text NOT NULL,
  "questions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.022 sha256=2db713039b7e4ea495fbaff9ceb54a6a46d475e6c80ee46d2f2b0ab1eb21fb3e
CREATE TABLE IF NOT EXISTS "public"."markets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "city" text,
  "region" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "priority_level" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.023 sha256=a9dabaff685eed715bbc208489693b93257d2960aad03d773feb49c1f6e55b49
CREATE TABLE IF NOT EXISTS "public"."organization_admin_states" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "review_status" text DEFAULT 'healthy'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.024 sha256=71c74d3cbe55e68703f369c13ad56c03d8b41d11f28e42263661b972c281b37b
CREATE TABLE IF NOT EXISTS "public"."performance_tracking" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "source_snapshot_id" uuid,
  "campaign_id" text NOT NULL,
  "spend" numeric DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "ctr" numeric DEFAULT 0 NOT NULL,
  "leads" integer DEFAULT 0 NOT NULL,
  "cpl" numeric,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.025 sha256=40bfbba97c0b3b6d9ec27708c15b0ba16227385b69d84b02cf7b5288ba879e79
CREATE TABLE IF NOT EXISTS "public"."scale_monitor_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "status" text DEFAULT 'running'::text NOT NULL,
  "verdict" text,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "smoke_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "incidents_opened" integer DEFAULT 0 NOT NULL,
  "incidents_resolved" integer DEFAULT 0 NOT NULL,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.026 sha256=fffec49dc0228bd9c4f144f7c7b92a34b7badd40eb95d8d14a1c726aa7ecd08d
CREATE TABLE IF NOT EXISTS "public"."service_areas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "city" text NOT NULL,
  "region" text NOT NULL,
  "postal_code" text,
  "country" text DEFAULT 'USA'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260615100000.tables.027 sha256=6bca61dc44425412b5504ba1c132d248dfb00c44c6f5896567d911b152e82e67
CREATE TABLE IF NOT EXISTS "public"."targeting_intelligence_patterns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "audience" text NOT NULL,
  "location" text NOT NULL,
  "targeting_pattern" text NOT NULL,
  "spend" numeric DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "ctr" numeric DEFAULT 0 NOT NULL,
  "leads" integer DEFAULT 0 NOT NULL,
  "cpl" numeric,
  "performance_tag" text DEFAULT 'test'::text NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "confidence_score" numeric DEFAULT 0.5 NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260615100000.tables.028 sha256=1d1fc9c9947042daad4b7de2472d8275588423e320b9216492c5f39614260ee4
CREATE TABLE IF NOT EXISTS "public"."workspace_ghl_users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "ghl_location_id" text NOT NULL,
  "ghl_user_id" text,
  "email" text NOT NULL,
  "invite_status" text DEFAULT 'pending'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- columns
-- dealflow:statement id=20260615100000.columns.001 sha256=57b3ec8447cef22540bb852816d696346c107fb46980d1c9b1aa166292867239
ALTER TABLE "public"."billing_subscriptions" ADD COLUMN IF NOT EXISTS "commission_rate_snapshot" numeric(6,4);

-- dealflow:statement id=20260615100000.columns.002 sha256=2a11991987b7b7e099c12167c7412c97afb2a385e4894d7fdfb71cb2467e2212
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "form_friction_level" text DEFAULT 'high'::text NOT NULL;

-- dealflow:statement id=20260615100000.columns.003 sha256=7fd2b06d8e8bd377a6adbaf6729872e7fec41008870a03d160e982a66fc55e07
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_form_template_id" text;

-- dealflow:statement id=20260615100000.columns.004 sha256=39cb9566980f2d8bab21c4544925c9848de9f87adbeba28ed0dfd9a658f95f4d
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "meta_lead_form_id" text;

-- dealflow:statement id=20260615100000.columns.005 sha256=2e6410256514608d0fd150a3bd304d6a1824232657b7ee17eafb44800fb18b2b
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "funnel_id" text;

-- dealflow:statement id=20260615100000.columns.006 sha256=09778ff01680bb83a157ea33b0cd50e90265642f5cf652441d25efa3271d6944
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "privacy_policy_url" text;

-- dealflow:statement id=20260615100000.columns.007 sha256=0834e354783ac743b4ff8931c86b33490c65e1e52dac547616d0fea3cb51ba03
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "terms_url" text;

-- dealflow:statement id=20260615100000.columns.008 sha256=ed0e0d031ab5cc602d95b1087f2d95f69a502b63f08fa5965999bdfad0710c0e
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "sms_consent_enabled" boolean DEFAULT true NOT NULL;

-- dealflow:statement id=20260615100000.columns.009 sha256=c055d1e3be58d7616cfe70d3799622d8cd58f34e3b75b12a437c975b3adde49d
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_delivery_destination" text DEFAULT 'dealflow_dashboard'::text NOT NULL;

-- dealflow:statement id=20260615100000.columns.010 sha256=ce4b28f4463a86a00db3750d3c865918582326675e80f0caa66ae7ab83d1969d
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "special_ad_category" text DEFAULT 'HOUSING'::text NOT NULL;

-- dealflow:statement id=20260615100000.columns.011 sha256=72c271a48980608b3de1451631570b791919e199414d516e6fca4bd99ceb31bd
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_capture_status" text DEFAULT 'draft'::text NOT NULL;

-- dealflow:statement id=20260615100000.columns.012 sha256=853298a0d2a43a14269c1c3a339ccdabfcfdd83561cafb13c96f1d4c329ab351
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_capture_ready_at" timestamp with time zone;

-- dealflow:statement id=20260615100000.columns.013 sha256=e604db5d7dbd7449b0ab219267e8809785a371687ea1e6b7b56820c3eb2f0b5d
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_capture_last_error" text;

-- routines
-- dealflow:statement id=20260615100000.routines.001 sha256=c7669ede71abf9fc2d4bcfb5b393418100dee2d1d008ebe4afa4f01c921730c1
CREATE OR REPLACE FUNCTION public.consume_user_credits(p_user_id uuid, p_organization_id uuid, p_amount integer, p_reason text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(allowed boolean, balance integer, ledger_id uuid, reused_existing boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_balance integer;
  next_balance integer;
  overdraft_limit integer := 2000;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'credit reason is required';
  end if;

  if p_idempotency_key is not null then
    select *
      into existing_ledger
      from public.user_credit_ledger
     where idempotency_key = p_idempotency_key
       and user_id = p_user_id
     limit 1;

    if found then
      return query select true, existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance
    into current_balance
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  next_balance := current_balance - p_amount;

  if next_balance < -overdraft_limit then
    return query select false, current_balance, null::uuid, false;
    return;
  end if;

  update public.user_credits
     set balance = next_balance,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_organization_id,
    -p_amount,
    next_balance,
    trim(p_reason),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'overdrafted',
      next_balance < 0,
      'overdraftLimitCents',
      overdraft_limit
    )
  )
  returning * into inserted_ledger;

  return query select true, next_balance, inserted_ledger.id, false;
end;
$function$;

-- dealflow:statement id=20260615100000.routines.002 sha256=afee94307083d179a617eed494795312a39102d960d5aa391d7bac3d533c59b5
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = org_id
      and membership.user_id = auth.uid()
  );
$function$;

-- dealflow:statement id=20260615100000.routines.003 sha256=5f988154871510889cf9a8cded36d539fd8ec2c7ac7876e1622f9d2c7176e4eb
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

-- constraints
-- dealflow:statement id=20260615100000.constraints.001 sha256=0e4fc99f7fc377c282643933858c69bfd8c855a1cf06db2ab0875aa991dab69c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ad_performance'::regclass
    AND constraint_record.conname='ad_performance_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ad_performance" ADD CONSTRAINT "ad_performance_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ad_performance', 'ad_performance_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.002 sha256=b999b3f99e7581a88b944e2493dd9143b36572b8314fb347836be036fb1d9860
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.appointments'::regclass
    AND constraint_record.conname='appointments_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'appointments', 'appointments_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.003 sha256=ccf06eaf7f2751233007f73812a5b0648f105b4c8c3e6e3290b489e4f908e68e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.audit_logs'::regclass
    AND constraint_record.conname='audit_logs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'audit_logs', 'audit_logs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.004 sha256=437acb47f324d812e49a6c7f64e1bb7b3afb3baada474cbbc28bb835831e01ae
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.business_profiles'::regclass
    AND constraint_record.conname='business_profiles_organization_id_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."business_profiles" ADD CONSTRAINT "business_profiles_organization_id_key" UNIQUE (organization_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'business_profiles', 'business_profiles_organization_id_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.005 sha256=33c5d4040816305de66ba4fe6fc6f2bea9a0203ce111fc33dc19e966eab5461f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.business_profiles'::regclass
    AND constraint_record.conname='business_profiles_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."business_profiles" ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'business_profiles', 'business_profiles_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.006 sha256=c150aa65bae6038992ac622c1b96b390e7c11c37607a1652faf986e68fa4227d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.007 sha256=70b60e5707dc8b7979e66228a966906d8fcb8e33145129c3a8bfbdf798aa12ec
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.008 sha256=b0866c028562e8255c3e719dfd96119191fd9a524a86e4e54bca1e88c5d160cf
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_dedupe_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_dedupe_unique" UNIQUE (dedupe_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (dedupe_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_dedupe_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.009 sha256=86b5c63e6350fc10550c695311862f93a6a5c32745ad43ec4e1ca42921bcdf3c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.010 sha256=dcbcff7a81d41f973574d4dd1ed5c0c5de4590e5381821254fce4855477c78ff
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_snapshots'::regclass
    AND constraint_record.conname='campaign_snapshots_marketing_account_id_snapshot_date_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_snapshots" ADD CONSTRAINT "campaign_snapshots_marketing_account_id_snapshot_date_key" UNIQUE (marketing_account_id, snapshot_date);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (marketing_account_id, snapshot_date)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_snapshots', 'campaign_snapshots_marketing_account_id_snapshot_date_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.011 sha256=7c44b0dfeb565a9df948ba2b93598e66ca88094c8b701a14de687333ed378700
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_snapshots'::regclass
    AND constraint_record.conname='campaign_snapshots_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_snapshots" ADD CONSTRAINT "campaign_snapshots_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_snapshots', 'campaign_snapshots_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.012 sha256=0628c1a2babc77b609153203a58fd4188bf1b24992ac867fdd6da1bd0921f133
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.data_imports'::regclass
    AND constraint_record.conname='data_imports_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."data_imports" ADD CONSTRAINT "data_imports_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'data_imports', 'data_imports_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.013 sha256=0a7596a5e04a65c9186f30a5012b4b6b804ab2da6311925af57d570f6cee7286
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.deals'::regclass
    AND constraint_record.conname='deals_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'deals', 'deals_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.014 sha256=c8e014eefbdb93484aefeade96142f8f9cc54a480c5bc4f4a5beea8d97cdb518
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.generated_artifacts'::regclass
    AND constraint_record.conname='generated_artifacts_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."generated_artifacts" ADD CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'generated_artifacts', 'generated_artifacts_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.015 sha256=db7cbbc547c9576f5421a1348912a45f7620a5b77ecdd0646ee4fb7cdfd49ce2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_events'::regclass
    AND constraint_record.conname='ghl_provisioning_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_events" ADD CONSTRAINT "ghl_provisioning_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_events', 'ghl_provisioning_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.016 sha256=b85c7f32d41981b9c2ff13b33d2b32afa3c6fead6e48b4782ede3bda33f89005
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_jobs'::regclass
    AND constraint_record.conname='ghl_provisioning_jobs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_jobs" ADD CONSTRAINT "ghl_provisioning_jobs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_jobs', 'ghl_provisioning_jobs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.017 sha256=a1861cda31c40dc91f9fd62120daf8949d5d05f2dc00187ae981b5f4b9edaf12
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.health_scores'::regclass
    AND constraint_record.conname='health_scores_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."health_scores" ADD CONSTRAINT "health_scores_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'health_scores', 'health_scores_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.018 sha256=61b2a62d37754fa5079f52d18cdbfaa55e810661ce1dd151e0515f232fa00cab
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.019 sha256=51403bd31ae031c7da1daa5696cc9dda50362f437665a0faa96a093145d4047c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.internal_notes'::regclass
    AND constraint_record.conname='internal_notes_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."internal_notes" ADD CONSTRAINT "internal_notes_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'internal_notes', 'internal_notes_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.020 sha256=526c8346866e8af971408d2e96a8d86f9549f579a29d3dc3d4859a1e3c3a71e2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.jobs'::regclass
    AND constraint_record.conname='jobs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'jobs', 'jobs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.021 sha256=ad42cec2c89158a2e89ec863bcc1909e29b82432b7acd2a0c8d00ef5d1544d12
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_idempotency_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_idempotency_unique" UNIQUE (idempotency_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (idempotency_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.022 sha256=adf2477919be41cc22f347cdd1cfebfc3b83073892c0cd99c24562196abf438f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.023 sha256=3d03fed430ae5e7c75f07a9c6e600ba34b787645e6796f988af3dd7da5e168eb
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.024 sha256=f649d2c1fa6f40d4dbfa788cb19e849589fd82d9e8f4e8bb9fcf51e47755dbac
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.025 sha256=76a36756adf29907f508d62905210a5c426e3af74df34b9df09efbc89cb228fc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.026 sha256=8fe66a870bdb6046c476453b2c1bfaf2f40035aa2a3471430aebc051f77693fe
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_unique_org_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_unique_org_key" UNIQUE (organization_id, template_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id, template_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_unique_org_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.027 sha256=f8b922bfa4747345048c516db76e1d66f72ebb7bca3dcaae8bdfd5a40a9eaa55
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.markets'::regclass
    AND constraint_record.conname='markets_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."markets" ADD CONSTRAINT "markets_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'markets', 'markets_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.028 sha256=7567533ffadf4cc21cfbcd46db7b2c4a2c8d50ad92dbe107ef20923e9ec32731
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_admin_states'::regclass
    AND constraint_record.conname='organization_admin_states_organization_id_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_admin_states" ADD CONSTRAINT "organization_admin_states_organization_id_key" UNIQUE (organization_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_admin_states', 'organization_admin_states_organization_id_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.029 sha256=4b4753fda429c932d1a184bf982ebe9c9012f35f734ae2693c298943fb2fbad2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_admin_states'::regclass
    AND constraint_record.conname='organization_admin_states_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_admin_states" ADD CONSTRAINT "organization_admin_states_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_admin_states', 'organization_admin_states_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.030 sha256=4c5df4c6c5c2c089bdb9b110e6828271fd01e2752598e58969d490246dbff783
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.performance_tracking'::regclass
    AND constraint_record.conname='performance_tracking_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."performance_tracking" ADD CONSTRAINT "performance_tracking_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'performance_tracking', 'performance_tracking_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.031 sha256=12a168d958689b002f0fd4d57f5b8f8cbf2ca3dbac9f8d4a16b51620e66b0bba
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_runs'::regclass
    AND constraint_record.conname='scale_monitor_runs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_runs" ADD CONSTRAINT "scale_monitor_runs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_runs', 'scale_monitor_runs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.032 sha256=f6780af66c19181d47356e4443974ea9d9a97692d0dd9453365826eafafd59de
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.service_areas'::regclass
    AND constraint_record.conname='service_areas_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."service_areas" ADD CONSTRAINT "service_areas_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'service_areas', 'service_areas_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.033 sha256=38f24beec502054da41a7ecd9682228aacb3aef26b9913252e4d72d75fbed49e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.targeting_intelligence_patterns'::regclass
    AND constraint_record.conname='targeting_intelligence_patterns_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."targeting_intelligence_patterns" ADD CONSTRAINT "targeting_intelligence_patterns_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'targeting_intelligence_patterns', 'targeting_intelligence_patterns_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.034 sha256=7c1e3afd34ba1b3f89957ea67f0e930e1fe420fc005d82347d34b8bb69920df2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_users'::regclass
    AND constraint_record.conname='workspace_ghl_users_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_users" ADD CONSTRAINT "workspace_ghl_users_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_users', 'workspace_ghl_users_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.035 sha256=ede23ca45490fa7219ad5e2dfaffd663cd01cb3999f17fb35d25ef73e3520f5a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_required_text_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_required_text_check" CHECK (((length(TRIM(BOTH FROM meta_campaign_id)) > 0) AND (length(TRIM(BOTH FROM title)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length(TRIM(BOTH FROM expected_impact)) > 0)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((length(TRIM(BOTH FROM meta_campaign_id)) > 0) AND (length(TRIM(BOTH FROM title)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length(TRIM(BOTH FROM expected_impact)) > 0)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_required_text_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.036 sha256=2716385a9e5ba5b18229fe59435749a70bdbab1bf0c0e3a80ac44006b66970a1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_status_check" CHECK ((status = ANY (ARRAY['suggested'::text, 'approved'::text, 'applying'::text, 'applied'::text, 'dismissed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''suggested''::text, ''approved''::text, ''applying''::text, ''applied''::text, ''dismissed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.037 sha256=c34b9ab29292921da5fab259c9a78b625810cf9104fa671601e3cb2861707533
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_type_check" CHECK ((action_type = ANY (ARRAY['pause_low_performing_ad'::text, 'test_new_creative_angle'::text, 'increase_budget_on_winner'::text, 'adjust_targeting'::text, 'refresh_headline'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((action_type = ANY (ARRAY[''pause_low_performing_ad''::text, ''test_new_creative_angle''::text, ''increase_budget_on_winner''::text, ''adjust_targeting''::text, ''refresh_headline''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.038 sha256=c29707baddee844121f84cb83db1cc637a7c9fabe46ee46645e2a2ecfad3329d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_required_text_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_required_text_check" CHECK (((length(TRIM(BOTH FROM campaign_id)) > 0) AND (length(TRIM(BOTH FROM source_reason)) > 0) AND (length(TRIM(BOTH FROM expected_impact)) > 0)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((length(TRIM(BOTH FROM campaign_id)) > 0) AND (length(TRIM(BOTH FROM source_reason)) > 0) AND (length(TRIM(BOTH FROM expected_impact)) > 0)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_required_text_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.039 sha256=84b744e4c897ea9e8501a64a4effc49d18066343397905615af2ce69ac71d527
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_approval'::text, 'auto_prepared'::text, 'approved'::text, 'applied'::text, 'dismissed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''draft''::text, ''awaiting_approval''::text, ''auto_prepared''::text, ''approved''::text, ''applied''::text, ''dismissed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.040 sha256=1ad241760141536bfc264d98510232ab0218937480ee498ea0b451adf5812724
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_type_check" CHECK ((action_type = ANY (ARRAY['duplicate_winning_ad'::text, 'replacement_creative'::text, 'headline_test'::text, 'creative_angle_test'::text, 'campaign_clone_test'::text, 'budget_adjustment'::text, 'targeting_adjustment'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((action_type = ANY (ARRAY[''duplicate_winning_ad''::text, ''replacement_creative''::text, ''headline_test''::text, ''creative_angle_test''::text, ''campaign_clone_test''::text, ''budget_adjustment''::text, ''targeting_adjustment''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.041 sha256=f12546cfcf866b191f71f5d9334fc800877e7be7c0fef6b7cddd759f44423655
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_capture_method_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_capture_method_check" CHECK ((capture_method = ANY (ARRAY['website_funnel'::text, 'meta_instant_form'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((capture_method = ANY (ARRAY[''website_funnel''::text, ''meta_instant_form''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_capture_method_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.042 sha256=4375de4fc3a6ea082f7c7440222fa61e59c7965ac535ec14ce2e4eedf3a7156d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_lead_capture_goal_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_lead_capture_goal_check" CHECK ((lead_capture_goal = ANY (ARRAY['quality'::text, 'balanced'::text, 'volume'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lead_capture_goal = ANY (ARRAY[''quality''::text, ''balanced''::text, ''volume''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_lead_capture_goal_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.043 sha256=006b5e42e837f66b1f4fcb56895ecf30022e813d25db26e7fc96fc3f5dd563ef
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_qualification_score_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_qualification_score_check" CHECK (((qualification_score >= 0) AND (qualification_score <= 100)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((qualification_score >= 0) AND (qualification_score <= 100)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_qualification_score_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.044 sha256=fa6c56ffcefbab662f9bc70e72a55ab65014e9a76f2b66d1a5ea9601063973cc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_form_friction_level_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_form_friction_level_check" CHECK ((form_friction_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((form_friction_level = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_form_friction_level_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.045 sha256=58a079dcdd8273398321ffdb3e35e29d69ab78000124909e4548a9b5570b3393
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_lead_capture_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_lead_capture_status_check" CHECK ((lead_capture_status = ANY (ARRAY['not_configured'::text, 'draft'::text, 'ready'::text, 'blocked'::text, 'created'::text, 'live'::text, 'error'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lead_capture_status = ANY (ARRAY[''not_configured''::text, ''draft''::text, ''ready''::text, ''blocked''::text, ''created''::text, ''live''::text, ''error''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_lead_capture_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.046 sha256=362f763f2087102015c72c7c6e812ebd8a58ea0008cd3c2648c1d431bbe981c4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_lead_delivery_destination_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_lead_delivery_destination_check" CHECK ((lead_delivery_destination = ANY (ARRAY['dealflow_dashboard'::text, 'csv_export'::text, 'crm_later'::text, 'webhook_later'::text, 'operator_notification_later'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lead_delivery_destination = ANY (ARRAY[''dealflow_dashboard''::text, ''csv_export''::text, ''crm_later''::text, ''webhook_later''::text, ''operator_notification_later''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_lead_delivery_destination_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.047 sha256=e47bfb47c61d4796c00e2fb09b377f086460c7b89e406231617a468271ef9a92
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_special_ad_category_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_special_ad_category_check" CHECK ((special_ad_category = ANY (ARRAY['HOUSING'::text, 'NONE'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((special_ad_category = ANY (ARRAY[''HOUSING''::text, ''NONE''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_special_ad_category_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.048 sha256=7bd15f3aec97bee0a7e6c00da8b56f2601aae01e2e5193bb3412c957db83179b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_events'::regclass
    AND constraint_record.conname='ghl_provisioning_events_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_events" ADD CONSTRAINT "ghl_provisioning_events_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''started''::text, ''succeeded''::text, ''failed''::text, ''skipped''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_events', 'ghl_provisioning_events_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.049 sha256=040117c379760a16acb07bf9d61866621ff98174eabed93417f698631492961a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_jobs'::regclass
    AND constraint_record.conname='ghl_provisioning_jobs_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_jobs" ADD CONSTRAINT "ghl_provisioning_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'succeeded'::text, 'provisioned'::text, 'failed'::text, 'dead_letter'::text, 'skipped'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''queued''::text, ''processing''::text, ''succeeded''::text, ''provisioned''::text, ''failed''::text, ''dead_letter''::text, ''skipped''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_jobs', 'ghl_provisioning_jobs_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.050 sha256=eba0ba5c8ce9713ce3073ed3e98b5b7d3621e14274ec4a993ec46b7b32f05238
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.health_scores'::regclass
    AND constraint_record.conname='health_scores_score_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."health_scores" ADD CONSTRAINT "health_scores_score_check" CHECK (((score >= 0) AND (score <= 100)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((score >= 0) AND (score <= 100)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'health_scores', 'health_scores_score_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.051 sha256=55a6b570fbfceec9fc9360b355bc68865ca0fa446626449382b02634ef558ca7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_nonce_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_nonce_not_blank" CHECK ((length(TRIM(BOTH FROM nonce)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM nonce)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_nonce_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.052 sha256=6b9ff3d11141112e88f49fa1c3111d3d2b0ace459b22281113ec7c4f9211870d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_origin_host_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_origin_host_not_blank" CHECK ((length(TRIM(BOTH FROM origin_host)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM origin_host)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_origin_host_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.053 sha256=34ae21706688ec6073dbc50ead8de1be4d20e35aa075842488f51be29f14c778
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_provider_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_provider_check" CHECK ((provider = 'meta'::text));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((provider = ''meta''::text))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_provider_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.054 sha256=1523e6874faa7536cba66e09612890ae159d6aee033dca3c3b8e69a2cca19f05
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_return_host_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_return_host_not_blank" CHECK ((length(TRIM(BOTH FROM return_host)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM return_host)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_return_host_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.055 sha256=f4aad96e2f232d4010527e3e7795c6ee1745afa1d170f3029a12f273e6e496d2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_return_to_relative';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_return_to_relative" CHECK (((return_to ~~ '/%'::text) AND (return_to !~~ '//%'::text)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((return_to ~~ ''/%''::text) AND (return_to !~~ ''//%''::text)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_return_to_relative' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.056 sha256=085d3c12ae02df76fb08d774ac3d9c283ecca5faceaf7fb042f2516934684b0d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_state_hash_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_state_hash_not_blank" CHECK ((length(TRIM(BOTH FROM state_hash)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM state_hash)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_state_hash_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.057 sha256=dcde91e6a947a92fb323ec64bd1d158fd837bf21f93e35d8ecec2f5439a7f48f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_capture_method_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_capture_method_check" CHECK ((capture_method = ANY (ARRAY['website_funnel'::text, 'meta_instant_form'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((capture_method = ANY (ARRAY[''website_funnel''::text, ''meta_instant_form''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_capture_method_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.058 sha256=bb177c9a40da6d942f2cf18e02adf9a08772b2c0bc872f5831fc747f66e71fc7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_destination_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_destination_check" CHECK ((destination = 'gohighlevel'::text));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((destination = ''gohighlevel''::text))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_destination_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.059 sha256=5d30f44b80b42b8ee55732ae3a0b177635e4b0c0aa2266234ccab2db0d259be4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'synced'::text, 'failed'::text, 'dead_letter'::text, 'skipped'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''queued''::text, ''processing''::text, ''synced''::text, ''failed''::text, ''dead_letter''::text, ''skipped''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.060 sha256=f061f50f917fded347f0928526d5c9307074a97bd322bb8ed6c74eb212f1e119
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_attempt_count_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_attempt_count_check" CHECK ((attempt_count >= 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((attempt_count >= 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_attempt_count_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.061 sha256=693d5a014a96c5aa34b39fa61312aa9810593156b06e9f2c9a350b686633ad58
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''queued''::text, ''sent''::text, ''failed''::text, ''skipped''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.062 sha256=15581495960a84a6396dfa1e627bb792f7be930d65ad70fd0ee0b68b79a80bed
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_capture_method_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_capture_method_check" CHECK ((capture_method = ANY (ARRAY['website_funnel'::text, 'meta_instant_form'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((capture_method = ANY (ARRAY[''website_funnel''::text, ''meta_instant_form''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_capture_method_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.063 sha256=684d89db1bed34afd729fa83f5cffd7a0e70f65b71eb03da13aba3f04e8329fe
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_form_friction_level_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_form_friction_level_check" CHECK ((form_friction_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((form_friction_level = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_form_friction_level_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.064 sha256=79fc9af1c5bb8678aed67011651a8bae00455c5739690e31f6c633291b806b05
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_lead_capture_goal_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_lead_capture_goal_check" CHECK ((lead_capture_goal = ANY (ARRAY['quality'::text, 'balanced'::text, 'volume'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lead_capture_goal = ANY (ARRAY[''quality''::text, ''balanced''::text, ''volume''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_lead_capture_goal_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.065 sha256=de8858f37b71fd6e2579b195f91edcd3436a2a7e7850f07d6b8f6560e475e6f6
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.performance_tracking'::regclass
    AND constraint_record.conname='performance_tracking_campaign_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."performance_tracking" ADD CONSTRAINT "performance_tracking_campaign_not_blank" CHECK ((length(TRIM(BOTH FROM campaign_id)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM campaign_id)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'performance_tracking', 'performance_tracking_campaign_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.066 sha256=0ff2f119510b8c8cc6db92c083a67df91db3c4546f7bf4895e7ec77cf564e0e7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_runs'::regclass
    AND constraint_record.conname='scale_monitor_runs_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_runs" ADD CONSTRAINT "scale_monitor_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''running''::text, ''completed''::text, ''failed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_runs', 'scale_monitor_runs_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.067 sha256=00217122f0f4e9f02839abcd9f7e9030feeac222b9d248a62d2a91156b27621e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.targeting_intelligence_patterns'::regclass
    AND constraint_record.conname='targeting_intelligence_patterns_key_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."targeting_intelligence_patterns" ADD CONSTRAINT "targeting_intelligence_patterns_key_not_blank" CHECK (((length(TRIM(BOTH FROM audience)) > 0) AND (length(TRIM(BOTH FROM location)) > 0) AND (length(TRIM(BOTH FROM targeting_pattern)) > 0)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((length(TRIM(BOTH FROM audience)) > 0) AND (length(TRIM(BOTH FROM location)) > 0) AND (length(TRIM(BOTH FROM targeting_pattern)) > 0)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'targeting_intelligence_patterns', 'targeting_intelligence_patterns_key_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.068 sha256=b959d46f19ec2537d827f79fb793cf62c93938458e8011029174ee5e475e31e9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_users'::regclass
    AND constraint_record.conname='workspace_ghl_users_invite_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_users" ADD CONSTRAINT "workspace_ghl_users_invite_status_check" CHECK ((invite_status = ANY (ARRAY['not_invited'::text, 'invited'::text, 'active'::text, 'failed'::text, 'deferred'::text, 'pending'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((invite_status = ANY (ARRAY[''not_invited''::text, ''invited''::text, ''active''::text, ''failed''::text, ''deferred''::text, ''pending''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_users', 'workspace_ghl_users_invite_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.069 sha256=5a6c2d0cc877b75512e7b99284e7333adf292bfdc5bf9c9a63cd70ff335ff6f2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.appointments'::regclass
    AND constraint_record.conname='appointments_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'appointments', 'appointments_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.070 sha256=4d667907d3dc4129dd84f1b6ab10ec83ac97beb96b957a573b7f3f4d24472518
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.appointments'::regclass
    AND constraint_record.conname='appointments_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'appointments', 'appointments_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.071 sha256=623a84c8503bc2f48e9ea8d51940e5c6e24290363bfe193d5c64e6698788d80d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.audit_logs'::regclass
    AND constraint_record.conname='audit_logs_actor_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'audit_logs', 'audit_logs_actor_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.072 sha256=44b64b9eb31d3ededb2088bccff56092ff182cdc80608a0bf50af264a66bd0dd
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.audit_logs'::regclass
    AND constraint_record.conname='audit_logs_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'audit_logs', 'audit_logs_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.073 sha256=d87b10d00a5a79c69414e7c3fd94683ff43b8619b459db108c470f976b6145dc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.business_profiles'::regclass
    AND constraint_record.conname='business_profiles_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."business_profiles" ADD CONSTRAINT "business_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'business_profiles', 'business_profiles_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.074 sha256=615e2a435fc997ee5102857a6d6faf7a9c91c771e52d069223f3140ddec9160a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.075 sha256=48a57e2faf9b15fa6a702aaef7a7544e4fa9c13c908f59fdd63959e6957265b8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_sync_snapshot_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_sync_snapshot_id_fkey" FOREIGN KEY (sync_snapshot_id) REFERENCES campaign_sync_snapshots(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (sync_snapshot_id) REFERENCES campaign_sync_snapshots(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_sync_snapshot_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.076 sha256=d91e55e40ac5eb96b3fdab5f3ea684ffd992040851ab921ac69aeadce2dc36b7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_action_suggestions'::regclass
    AND constraint_record.conname='campaign_action_suggestions_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_action_suggestions" ADD CONSTRAINT "campaign_action_suggestions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_action_suggestions', 'campaign_action_suggestions_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.077 sha256=84983013d9442f670a1890fdb0b0de9042b433100b70d1e309072078b4b89031
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.078 sha256=aee78c8e2aad01e2cb598e0a89c1ff0d5d28eb08f00a5f1ada9098e5429aa79f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_draft_actions'::regclass
    AND constraint_record.conname='campaign_draft_actions_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_draft_actions" ADD CONSTRAINT "campaign_draft_actions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_draft_actions', 'campaign_draft_actions_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.079 sha256=7e378969be0c5f2e1463bfd11c513c686e540b65ad4354c71f575ee09212ee2e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.080 sha256=141e5685c0a7966d37f942965950ca8fd4c5ba04f2a1e578aea249498868d171
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_leads'::regclass
    AND constraint_record.conname='campaign_leads_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_leads" ADD CONSTRAINT "campaign_leads_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_leads', 'campaign_leads_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.081 sha256=16dd6e0167cdefb98f6a3ddbaef4628d95ddc15a8bdf342c31a236c54bf3ca7c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_snapshots'::regclass
    AND constraint_record.conname='campaign_snapshots_marketing_account_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_snapshots" ADD CONSTRAINT "campaign_snapshots_marketing_account_id_fkey" FOREIGN KEY (marketing_account_id) REFERENCES marketing_accounts(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (marketing_account_id) REFERENCES marketing_accounts(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_snapshots', 'campaign_snapshots_marketing_account_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.082 sha256=52f6ee1d52e5ad240f978db1f270af6baf750ea00d09ec1c8a680c7b1d2248f0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_snapshots'::regclass
    AND constraint_record.conname='campaign_snapshots_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_snapshots" ADD CONSTRAINT "campaign_snapshots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_snapshots', 'campaign_snapshots_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.083 sha256=f3f4bbbde858eebc188f93f4d744bec1a0ebdbf9abfbda1275db3ece255821dc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.data_imports'::regclass
    AND constraint_record.conname='data_imports_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."data_imports" ADD CONSTRAINT "data_imports_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'data_imports', 'data_imports_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.084 sha256=a99d8a64956625553605615ba19e2ea0690fffe16de2c8cd67c2dfa70b1e48b6
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.data_imports'::regclass
    AND constraint_record.conname='data_imports_uploaded_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."data_imports" ADD CONSTRAINT "data_imports_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'data_imports', 'data_imports_uploaded_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.085 sha256=4de5460d9be1f9129a85d493fbbf7e41103b207e6c6d2db2c75e1d7d55bdb96c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.deals'::regclass
    AND constraint_record.conname='deals_appointment_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'deals', 'deals_appointment_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.086 sha256=6fc3394bbf60b27a63d0e42c4d4f3586fdd574b9a3bee01f94670da1616f00c0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.deals'::regclass
    AND constraint_record.conname='deals_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'deals', 'deals_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.087 sha256=8202c26eb853034092bdcac53ecc7513a07ea1cea55f885afc6301d65c71c932
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.deals'::regclass
    AND constraint_record.conname='deals_market_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_market_id_fkey" FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'deals', 'deals_market_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.088 sha256=951d1a59e9c01827867579c12a309c8f46db06c25a444988c62b38dd6b82df59
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.deals'::regclass
    AND constraint_record.conname='deals_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'deals', 'deals_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.089 sha256=d31d53678cb2578a4020363035122467e74e60f6249ac39bfa94680e0d82f097
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.generated_artifacts'::regclass
    AND constraint_record.conname='generated_artifacts_generated_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."generated_artifacts" ADD CONSTRAINT "generated_artifacts_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'generated_artifacts', 'generated_artifacts_generated_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.090 sha256=1066151f16172af2b2f0ebc99045941042160dce79c5ef0b3fda2be030d3c429
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.generated_artifacts'::regclass
    AND constraint_record.conname='generated_artifacts_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."generated_artifacts" ADD CONSTRAINT "generated_artifacts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'generated_artifacts', 'generated_artifacts_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.091 sha256=e010dd46b4e83e3f2b7e7bc85cfd971b4a5606984e225f0cbbb965ef168eb017
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_events'::regclass
    AND constraint_record.conname='ghl_provisioning_events_job_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_events" ADD CONSTRAINT "ghl_provisioning_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ghl_provisioning_jobs(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (job_id) REFERENCES ghl_provisioning_jobs(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_events', 'ghl_provisioning_events_job_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.092 sha256=701b469a415528f97413e8eb14cd2e53abf3819154f1372e4012e528b7b00aa0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_events'::regclass
    AND constraint_record.conname='ghl_provisioning_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_events" ADD CONSTRAINT "ghl_provisioning_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_events', 'ghl_provisioning_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.093 sha256=33506f57fc30efb7d530a44d5e4f72ad849679694d38a58d3ec4ff9f8cfdae6c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_events'::regclass
    AND constraint_record.conname='ghl_provisioning_events_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_events" ADD CONSTRAINT "ghl_provisioning_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_events', 'ghl_provisioning_events_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.094 sha256=ed4daa704ee485b609c66e1ce32d82665680345993c43ceae43c0ae247bbf662
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_jobs'::regclass
    AND constraint_record.conname='ghl_provisioning_jobs_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_jobs" ADD CONSTRAINT "ghl_provisioning_jobs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_jobs', 'ghl_provisioning_jobs_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.095 sha256=45f5901e431c1d7e2433e3dbfc5e3fa7ca5528c38d49b1ea40a08bc3b1393c02
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_jobs'::regclass
    AND constraint_record.conname='ghl_provisioning_jobs_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_jobs" ADD CONSTRAINT "ghl_provisioning_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_jobs', 'ghl_provisioning_jobs_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.096 sha256=6374919b53b6b965f3d09f877dfa4203f8680331738c2f360b5c966ea8c866e1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.ghl_provisioning_jobs'::regclass
    AND constraint_record.conname='ghl_provisioning_jobs_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."ghl_provisioning_jobs" ADD CONSTRAINT "ghl_provisioning_jobs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'ghl_provisioning_jobs', 'ghl_provisioning_jobs_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.097 sha256=42da3fd57b61425d6fc2caadb50030ea7a59d9d845ba326dee8c16b40f317fd7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.health_scores'::regclass
    AND constraint_record.conname='health_scores_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."health_scores" ADD CONSTRAINT "health_scores_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'health_scores', 'health_scores_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.098 sha256=74901dc8e5f8ad8724c3a55c174bce95ae840b9d25d66f14ff2de49f1c695241
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.099 sha256=69ea9634bc3350fa5ab32aa19c056643d549d95cf7b85a23be2b14b859036af7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.100 sha256=0a6af9c81b5c460cb20a9e7ecad06eff5f023f1b8b5175c570c28f072e48eec9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.101 sha256=e16f3569205c9fa7b19ede7376762d0aa4086741b16a373cac7b69fa68053459
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.integration_oauth_states'::regclass
    AND constraint_record.conname='integration_oauth_states_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'integration_oauth_states', 'integration_oauth_states_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.102 sha256=597e514799b3e74a89caffa37c6e5c39175114efc93346d5f2f7835386a62c5e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.internal_notes'::regclass
    AND constraint_record.conname='internal_notes_author_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."internal_notes" ADD CONSTRAINT "internal_notes_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'internal_notes', 'internal_notes_author_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.103 sha256=a28995d4187f6b174759969b19c612d69e5d0973b3767c9657dfb95d6697449c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.internal_notes'::regclass
    AND constraint_record.conname='internal_notes_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."internal_notes" ADD CONSTRAINT "internal_notes_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'internal_notes', 'internal_notes_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.104 sha256=4736b3803fdb88bfb143a52005cb113a27e18baf5b52f7e407c677297df8a8b8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.jobs'::regclass
    AND constraint_record.conname='jobs_assigned_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_assigned_user_id_fkey" FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'jobs', 'jobs_assigned_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.105 sha256=9c2801551438ca1d5bee33d8e937fa898c222ee8ec3fde32b92c5e0460f5b53d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.jobs'::regclass
    AND constraint_record.conname='jobs_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'jobs', 'jobs_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.106 sha256=fad8cdddf66a1e2f62fc3c17e670e7786f63afdb318ffb53d62882b8ff8786e2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.jobs'::regclass
    AND constraint_record.conname='jobs_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'jobs', 'jobs_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.107 sha256=0a974899f5564aee3f11c97c7b8449d1dc06f87a16424024c92fa3d431da3e53
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.jobs'::regclass
    AND constraint_record.conname='jobs_service_type_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_service_type_id_fkey" FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'jobs', 'jobs_service_type_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.108 sha256=c9b71d63c78114cc15d162f6bda331a3149e5fd3e31450f52a742d53d7fd1cdb
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.109 sha256=624271d55f22c078cc274010a3e7f2add35c10a40751d7b3869fb2ec23816f5a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_campaign_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_campaign_lead_id_fkey" FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_campaign_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.110 sha256=7d9e753a2119df746f2d639f5374eed6bce0f2e365e8facac2664c221a8e5a14
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_capture_events'::regclass
    AND constraint_record.conname='lead_capture_events_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_capture_events" ADD CONSTRAINT "lead_capture_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_capture_events', 'lead_capture_events_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.111 sha256=62d0a5048679b70ad114e0b6cd1d0ee4e92f84203dfffb1b74625099baaf1f4d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.112 sha256=d2ac5fcf0f94047f2bf8a741bdeb12b7d9bce879525738dee8dd05673a0c3b7a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.113 sha256=8fa509ad389e0373ee3687bedfbf18d9665d7b6322517983c6af035e70708ec4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_crm_sync_events'::regclass
    AND constraint_record.conname='lead_crm_sync_events_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_crm_sync_events" ADD CONSTRAINT "lead_crm_sync_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_crm_sync_events', 'lead_crm_sync_events_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.114 sha256=4bfb718094a9d71b33f34ff9085e9592a92f06a361451af80a9d23c701cf6ad2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.115 sha256=f6f499845d435c58e1b50a413199c0239a4d28d33c745317d25f9a94c6410638
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_campaign_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_campaign_lead_id_fkey" FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_campaign_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.116 sha256=15d884aea4c33bb27afc350e9ac7f2f819deff7a6d7b36851eaf7a1c24b138da
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_delivery_attempts'::regclass
    AND constraint_record.conname='lead_delivery_attempts_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_delivery_attempts" ADD CONSTRAINT "lead_delivery_attempts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_delivery_attempts', 'lead_delivery_attempts_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.117 sha256=e879f4355f1f0c8fd2b07c23fd26803c880598d4dac1e8942feeba8abf69d554
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_form_templates'::regclass
    AND constraint_record.conname='lead_form_templates_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_form_templates" ADD CONSTRAINT "lead_form_templates_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_form_templates', 'lead_form_templates_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.118 sha256=8c60134144574ff65864fc58ec25d65404d1a2b4ace68a20f7f1a32d94f9b1bb
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.markets'::regclass
    AND constraint_record.conname='markets_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."markets" ADD CONSTRAINT "markets_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'markets', 'markets_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.119 sha256=639edc6c54771789c46b70238cdaedf473dbf247c1ce885ba0cf16e455dc48a7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_admin_states'::regclass
    AND constraint_record.conname='organization_admin_states_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_admin_states" ADD CONSTRAINT "organization_admin_states_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_admin_states', 'organization_admin_states_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.120 sha256=62bed5f8e86010e168da063a729303071c59727f7978495ec24b8b8f28d72426
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.performance_tracking'::regclass
    AND constraint_record.conname='performance_tracking_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."performance_tracking" ADD CONSTRAINT "performance_tracking_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'performance_tracking', 'performance_tracking_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.121 sha256=1e80d11f91463a906008c7891b64284eb015d16c9df9b9914f0973d99c7c1b9d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.performance_tracking'::regclass
    AND constraint_record.conname='performance_tracking_source_snapshot_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."performance_tracking" ADD CONSTRAINT "performance_tracking_source_snapshot_id_fkey" FOREIGN KEY (source_snapshot_id) REFERENCES campaign_sync_snapshots(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (source_snapshot_id) REFERENCES campaign_sync_snapshots(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'performance_tracking', 'performance_tracking_source_snapshot_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.122 sha256=125e06abbacc05632d0551e67e793cd173314a5b6248b431f07f76c414794872
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.performance_tracking'::regclass
    AND constraint_record.conname='performance_tracking_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."performance_tracking" ADD CONSTRAINT "performance_tracking_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'performance_tracking', 'performance_tracking_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.123 sha256=68b3aacea0ea8de8f52849a71f94395e17920cb16e6485d982e2777bf1274a28
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.service_areas'::regclass
    AND constraint_record.conname='service_areas_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."service_areas" ADD CONSTRAINT "service_areas_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'service_areas', 'service_areas_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.124 sha256=60d93a46d20bd1a6d4964afb57f048102a0f93cf3f1d4e3b587efa762b158fe6
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.targeting_intelligence_patterns'::regclass
    AND constraint_record.conname='targeting_intelligence_patterns_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."targeting_intelligence_patterns" ADD CONSTRAINT "targeting_intelligence_patterns_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'targeting_intelligence_patterns', 'targeting_intelligence_patterns_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.125 sha256=374f1105b311c7370bc414ae60a6c2b109bed1ae01c697f99036b07c4f3e9689
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.targeting_intelligence_patterns'::regclass
    AND constraint_record.conname='targeting_intelligence_patterns_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."targeting_intelligence_patterns" ADD CONSTRAINT "targeting_intelligence_patterns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'targeting_intelligence_patterns', 'targeting_intelligence_patterns_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.126 sha256=b90bf36946a1845f2afb019a479c6dbb6c9f928cdd87504db90191f930a2ad08
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_users'::regclass
    AND constraint_record.conname='workspace_ghl_users_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_users" ADD CONSTRAINT "workspace_ghl_users_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_users', 'workspace_ghl_users_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260615100000.constraints.127 sha256=23a21f636e9a4ce40ad420c3a1f80d1802578586c801dc3d35ea26a07b0fe804
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_users'::regclass
    AND constraint_record.conname='workspace_ghl_users_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_users" ADD CONSTRAINT "workspace_ghl_users_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_users', 'workspace_ghl_users_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260615100000.indexes.001 sha256=30dbefd3b7d2157d9bfc57ad00fab29478c6fa12ad22421c6539403e2a4d0514
DROP INDEX IF EXISTS "public"."campaign_plans_user_id_unique";

-- dealflow:statement id=20260615100000.indexes.002 sha256=864e225a37abad086e68945c24868bda75ae6e312eebe0e6605580a8336421d5
DROP INDEX IF EXISTS "public"."rate_limit_buckets_bucket_key_unique";

-- dealflow:statement id=20260615100000.indexes.003 sha256=d2991f18ab268b03e331973177e1f8bc42b35583bae3a0a68338db8b3f443667
CREATE INDEX IF NOT EXISTS appointments_lead_id_idx ON public.appointments USING btree (lead_id) WHERE (lead_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.004 sha256=59cec914e9323997716637e273c3b5e67074ecb1fe00ed333aeac6012ec00625
CREATE INDEX IF NOT EXISTS idx_appointments_org ON public.appointments USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.005 sha256=dc14747dd325197d5cc74eb9dd7e1a79d8bc2314f120bfae7d13ea9ccbd8d63a
CREATE INDEX IF NOT EXISTS idx_appointments_org_status ON public.appointments USING btree (organization_id, status);

-- dealflow:statement id=20260615100000.indexes.006 sha256=ff7fba81e6a4289696f4b37747366355353734541d018e9e4ccee730deaad849
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx ON public.audit_logs USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.007 sha256=bf485750697d622f3d594146aedfaef1d20e738eb590b612012cb0e62b183fc2
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.008 sha256=22d4efd5af0a6e7c9cf695347f34dfd400eff2b7d6a14f5bc0bcce6bc80a2c47
CREATE INDEX IF NOT EXISTS idx_business_profiles_org ON public.business_profiles USING btree (organization_id);

-- dealflow:statement id=20260615100000.indexes.009 sha256=8710ba377e46378d5b808a069223e73bc726961bba5cf45b648bb9f635a7ee97
CREATE INDEX IF NOT EXISTS campaign_action_suggestions_campaign_status_idx ON public.campaign_action_suggestions USING btree (organization_id, user_id, meta_campaign_id, status);

-- dealflow:statement id=20260615100000.indexes.010 sha256=ebd2c6366939a752dbe55819e30541341c9b6443a512ef1f821c42128a074ce1
CREATE INDEX IF NOT EXISTS campaign_action_suggestions_org_created_idx ON public.campaign_action_suggestions USING btree (organization_id, user_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.011 sha256=616f31acb05dc79ee0727e4a8e6a5dda203ef000d8fb6c04bfb8b98f175755c6
CREATE INDEX IF NOT EXISTS campaign_draft_actions_campaign_idx ON public.campaign_draft_actions USING btree (organization_id, user_id, campaign_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.012 sha256=b3643b85e06723229472c4d212cd5a823b5ade66c8ba75d7eb6e66ed1f09aa64
CREATE INDEX IF NOT EXISTS campaign_draft_actions_org_created_idx ON public.campaign_draft_actions USING btree (organization_id, user_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.013 sha256=8cf0ea4c4f23bda727b6f03f1c143fe973d53a939be8b723d50ea3c9d700de66
CREATE INDEX IF NOT EXISTS campaign_leads_campaign_created_idx ON public.campaign_leads USING btree (campaign_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.014 sha256=d995dc0235e85d41c0b43c1fda196c7b4b06aa60a95c2bb96656f7c71bb6a49b
CREATE INDEX IF NOT EXISTS campaign_leads_org_created_idx ON public.campaign_leads USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.015 sha256=c0c5cef49d7d22143ee3a092b7a4c1a3398c9435d30ff316e8e1b83af855bdef
CREATE INDEX IF NOT EXISTS campaign_leads_qualified_idx ON public.campaign_leads USING btree (organization_id, qualified, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.016 sha256=ed2da235ff59e81d8606154235c186969cea6418fc4878efa195eac118ecf049
CREATE INDEX IF NOT EXISTS campaign_plans_lead_capture_idx ON public.campaign_plans USING btree (organization_id, capture_method, lead_capture_status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.017 sha256=043fd58d24cc043d90e7073f096c3e1c86d96ccd29b0465674ca2ce1c0e73c06
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_org_date ON public.campaign_snapshots USING btree (organization_id, snapshot_date DESC);

-- dealflow:statement id=20260615100000.indexes.018 sha256=6eda3cf6c405e768747f24bbbc2827ba43b157c2de5ab6c0cb1c090e8412a76b
CREATE INDEX IF NOT EXISTS data_imports_uploaded_by_idx ON public.data_imports USING btree (uploaded_by) WHERE (uploaded_by IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.019 sha256=c714c095ad723308e0f957bcd37e135f2ac511bad4f4937cc7e2c3df5723d031
CREATE INDEX IF NOT EXISTS idx_imports_org ON public.data_imports USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.020 sha256=afdc31a0cbef904539b36f2eb40ba529a2bd9659650e200a07dfdd2b770d478e
CREATE INDEX IF NOT EXISTS deals_appointment_id_idx ON public.deals USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.021 sha256=d665339496078ad84c78d1a3e60ccdee15059352d1cd3b0e6a47e468e6c0310e
CREATE INDEX IF NOT EXISTS deals_lead_id_idx ON public.deals USING btree (lead_id) WHERE (lead_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.022 sha256=561554a45ba236163e26af1ea7665c00b7021ec868a122c92abf5944166665ce
CREATE INDEX IF NOT EXISTS idx_deals_market ON public.deals USING btree (market_id);

-- dealflow:statement id=20260615100000.indexes.023 sha256=0b019c87db7f6ec60980868848df9b85179c5b0f2bd20f8aaa5d6b14c6befaa5
CREATE INDEX IF NOT EXISTS idx_deals_org ON public.deals USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.024 sha256=9c5b9b4a0f02edc54f9cb5f966f14b367b9ba1e4145b250c425658ed558435c9
CREATE INDEX IF NOT EXISTS idx_deals_org_stage ON public.deals USING btree (organization_id, stage);

-- dealflow:statement id=20260615100000.indexes.025 sha256=6ffa0f293235530c6ed4444489a0f327e8c05140110dd9f2302fbbf549e12238
CREATE INDEX IF NOT EXISTS idx_deals_org_status ON public.deals USING btree (organization_id, status);

-- dealflow:statement id=20260615100000.indexes.026 sha256=d93d7a53c9b43a4888d83c9fb88ff7fbce0f0f853a315b8924623963f53f1e4c
CREATE INDEX IF NOT EXISTS generated_artifacts_generated_by_idx ON public.generated_artifacts USING btree (generated_by) WHERE (generated_by IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.027 sha256=b5482b42c05dcbda91dedb2c8ec8d16443f5a743e6d8d0f05cf82206dc11d2cc
CREATE INDEX IF NOT EXISTS idx_generated_artifacts_org_type_created ON public.generated_artifacts USING btree (organization_id, artifact_type, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.028 sha256=9c5e1d1a2a93569d5378826ef0732662c2b95f6a2f8d362a576074ea12db8761
CREATE INDEX IF NOT EXISTS ghl_provisioning_events_job_idx ON public.ghl_provisioning_events USING btree (job_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.029 sha256=9ccf5088bac51a09d56b0e8dae2dd2c240d7bc918fdaa93f9a24f339f73e4454
CREATE INDEX IF NOT EXISTS ghl_provisioning_events_partner_idx ON public.ghl_provisioning_events USING btree (partner_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.030 sha256=3948d2b678c70683921766d616d79599617ba54f7ff39a3f3894ddc57e3ea9e3
CREATE INDEX IF NOT EXISTS ghl_provisioning_events_workspace_idx ON public.ghl_provisioning_events USING btree (workspace_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.031 sha256=68cea006150af31f11ca435f0643ea61b1c1e024bd46c43aaee806fe01b833ce
CREATE UNIQUE INDEX IF NOT EXISTS ghl_provisioning_jobs_idempotency_unique ON public.ghl_provisioning_jobs USING btree (idempotency_key);

-- dealflow:statement id=20260615100000.indexes.032 sha256=abf92dcea55bb8318aec4f5f783baf1aac98744b810e4ba6c78a18eb6d55ab08
CREATE INDEX IF NOT EXISTS ghl_provisioning_jobs_next_retry_idx ON public.ghl_provisioning_jobs USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY['queued'::text, 'failed'::text]));

-- dealflow:statement id=20260615100000.indexes.033 sha256=67b8101cd9bacb1fe110caa92c42ae3d6e254662ae990271d6ccf79a9dbb0bbb
CREATE INDEX IF NOT EXISTS ghl_provisioning_jobs_partner_status_idx ON public.ghl_provisioning_jobs USING btree (partner_id, status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.034 sha256=d9f9a37e506c713fb88b3803c7190bef2e9dad5583ee81d70cbe6803c51421e3
CREATE INDEX IF NOT EXISTS ghl_provisioning_jobs_workspace_status_idx ON public.ghl_provisioning_jobs USING btree (workspace_id, status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.035 sha256=183fe6dd390c0b69aa48781b4274ded3be8c93b01d8092785142edd2190528a9
CREATE INDEX IF NOT EXISTS idx_health_scores_org ON public.health_scores USING btree (organization_id, recorded_at DESC);

-- dealflow:statement id=20260615100000.indexes.036 sha256=d0dcca53cf5e402496e17e7d488a35c4820af1b7a3082c1069ad8c1075849a64
CREATE INDEX IF NOT EXISTS integration_oauth_states_campaign_idx ON public.integration_oauth_states USING btree (campaign_id);

-- dealflow:statement id=20260615100000.indexes.037 sha256=930c7f9398498948b2551bd77401805be7aaadefffccb89c45188867114d1d2a
CREATE INDEX IF NOT EXISTS integration_oauth_states_expires_at_idx ON public.integration_oauth_states USING btree (expires_at);

-- dealflow:statement id=20260615100000.indexes.038 sha256=b1f7fc2fa3be2b7a35eefcde37509614b2955745e3d96bb9ffef06d1a6a7587c
CREATE UNIQUE INDEX IF NOT EXISTS integration_oauth_states_provider_nonce_idx ON public.integration_oauth_states USING btree (provider, nonce);

-- dealflow:statement id=20260615100000.indexes.039 sha256=646b60d8a0b1d6d5507898828ed14fe6e571310f6c2c7738ac147e7cb332aee1
CREATE INDEX IF NOT EXISTS idx_internal_notes_org_created ON public.internal_notes USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.040 sha256=2366ccc424f62546f9ec72693751bb419a731dc12afe2bb8423743aa888c695d
CREATE INDEX IF NOT EXISTS internal_notes_author_user_id_idx ON public.internal_notes USING btree (author_user_id) WHERE (author_user_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.041 sha256=a0a165bbd858d8e62e7c21153340752439b812918b94ac4e53560f2764bc8b86
CREATE INDEX IF NOT EXISTS idx_jobs_org_created ON public.jobs USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.042 sha256=7207aa509316985291a138c473bdaef2fa8240b5f1bbaf618e6a9735d64785aa
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON public.jobs USING btree (organization_id, status);

-- dealflow:statement id=20260615100000.indexes.043 sha256=1f1c49a99719e1dbcbc93ad2dbdc45b3181f1ca8f946ea7e8a106e7b30f8e14c
CREATE INDEX IF NOT EXISTS jobs_assigned_user_id_idx ON public.jobs USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.044 sha256=44958689d11bb9fe790b093e85a5c7d1adc0c485890fca12cbbbf599053ccd1b
CREATE INDEX IF NOT EXISTS jobs_lead_id_idx ON public.jobs USING btree (lead_id) WHERE (lead_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.045 sha256=4bc60441814a9ef9e6ffc65a8cb115cc7af1c141188777a247da9c1bdae30c02
CREATE INDEX IF NOT EXISTS jobs_service_type_id_idx ON public.jobs USING btree (service_type_id) WHERE (service_type_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.046 sha256=515675325f9c71985aac6ebeb8beaa5a4813c8e690e0379cd67c6d477b5c1c01
CREATE INDEX IF NOT EXISTS lead_capture_events_campaign_created_idx ON public.lead_capture_events USING btree (campaign_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.047 sha256=6309effc981aa46198d409bbf78d9e5ee0b0d5ab0e86694365aee836179592b4
CREATE INDEX IF NOT EXISTS lead_capture_events_org_created_idx ON public.lead_capture_events USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.048 sha256=a0a724de4822a1975bddb21fdb3407da47f6deb555f45517d7ea2e35017dd532
CREATE UNIQUE INDEX IF NOT EXISTS lead_crm_sync_events_idempotency_unique ON public.lead_crm_sync_events USING btree (idempotency_key);

-- dealflow:statement id=20260615100000.indexes.049 sha256=65c7589aeb257c366e50d84b3351e3dea3de798cb25e0416d2ed83f26c6605a3
CREATE INDEX IF NOT EXISTS lead_crm_sync_events_next_retry_idx ON public.lead_crm_sync_events USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY['queued'::text, 'failed'::text]));

-- dealflow:statement id=20260615100000.indexes.050 sha256=be9e1fb67a5b4ffa271e7afe90863605ab818b7a13cd3fc68d88715879e6caf3
CREATE INDEX IF NOT EXISTS lead_crm_sync_events_partner_status_idx ON public.lead_crm_sync_events USING btree (partner_id, status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.051 sha256=5da2f625e431b97b64e7ccf32365edeb165f9c4923639e88858f3e378d80187e
CREATE INDEX IF NOT EXISTS lead_crm_sync_events_workspace_status_idx ON public.lead_crm_sync_events USING btree (workspace_id, status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.052 sha256=3eea8167b7bef8edcec6fcf250488ef4bc46a54b93c3f78c988bb88cadc6e183
CREATE INDEX IF NOT EXISTS lead_delivery_attempts_lead_idx ON public.lead_delivery_attempts USING btree (campaign_lead_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.053 sha256=9d73258432a4e261ab1aed5172e533778ee832d8ea5ee8e1c6d48f7141eaf496
CREATE INDEX IF NOT EXISTS lead_delivery_attempts_org_status_idx ON public.lead_delivery_attempts USING btree (organization_id, status, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.054 sha256=e2c17c1b0b750a0331a8657cc908ef630b0fdc278ae7c11ef452ea44cefa9f68
CREATE INDEX IF NOT EXISTS lead_form_templates_org_goal_idx ON public.lead_form_templates USING btree (organization_id, lead_capture_goal, active);

-- dealflow:statement id=20260615100000.indexes.055 sha256=b7bec3644b27e87c5762e0c6ef841b4a9db42352e89571aa43fbe458010d0898
CREATE INDEX IF NOT EXISTS leads_assigned_user_id_idx ON public.leads USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.056 sha256=b0ded25c678aeb72bc09883cf6f46d5070921ba4de77da1f852d7d95a9204a8b
CREATE INDEX IF NOT EXISTS leads_marketing_account_id_idx ON public.leads USING btree (marketing_account_id) WHERE (marketing_account_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.057 sha256=b240098c4e40ee359974d0081ff9d7ac04f52862c0a61d15a571206ee4f16163
CREATE INDEX IF NOT EXISTS leads_service_type_id_idx ON public.leads USING btree (service_type_id) WHERE (service_type_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.058 sha256=3d702872fb36771c460a4c255c55637aacd2b6d325b310f1ae2493437e015bf0
CREATE INDEX IF NOT EXISTS idx_markets_org ON public.markets USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260615100000.indexes.059 sha256=a4a193026d57d9036faeb3f5973bc63cae5e8988b0bc8007b7e616cb03cf9875
CREATE INDEX IF NOT EXISTS idx_org_admin_states_org ON public.organization_admin_states USING btree (organization_id);

-- dealflow:statement id=20260615100000.indexes.060 sha256=148774acb964fbc39d61c4081fcff5e97fbeb1ad40489d6dc457425e4ffc8eab
CREATE INDEX IF NOT EXISTS organizations_owner_user_id_idx ON public.organizations USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.061 sha256=69f8fba997b453df4b8ffb0efbc766190ad95874442a21d21e74e70c694208f7
CREATE INDEX IF NOT EXISTS performance_tracking_campaign_synced_idx ON public.performance_tracking USING btree (organization_id, user_id, campaign_id, synced_at DESC);

-- dealflow:statement id=20260615100000.indexes.062 sha256=f20be08442cc093762d9561e067fe88637bcf897ea8c802839300ed2a7618f78
CREATE INDEX IF NOT EXISTS performance_tracking_org_synced_idx ON public.performance_tracking USING btree (organization_id, synced_at DESC);

-- dealflow:statement id=20260615100000.indexes.063 sha256=c2507b92a226e96678a84eff23c0bea1899b958dd456656abfbe875fd5c289eb
CREATE INDEX IF NOT EXISTS scale_monitor_runs_started_idx ON public.scale_monitor_runs USING btree (started_at DESC);

-- dealflow:statement id=20260615100000.indexes.064 sha256=d436d65a2ac58677fe2e7bc6a7f83944639965765fe13106d108a6276783e58f
CREATE INDEX IF NOT EXISTS idx_service_areas_org ON public.service_areas USING btree (organization_id);

-- dealflow:statement id=20260615100000.indexes.065 sha256=ba38c150f0e60255a3c09c4bb43a93b1a252e7ecd7b8eab084f72fb50312870a
CREATE INDEX IF NOT EXISTS targeting_intelligence_patterns_confidence_idx ON public.targeting_intelligence_patterns USING btree (organization_id, user_id, confidence_score DESC);

-- dealflow:statement id=20260615100000.indexes.066 sha256=7297c02367da183cdaa052a829512b6584086b7b795dfd5a0f75c9bade2b4ec4
CREATE UNIQUE INDEX IF NOT EXISTS targeting_intelligence_patterns_org_key_unique ON public.targeting_intelligence_patterns USING btree (organization_id, user_id, audience, location, targeting_pattern);

-- dealflow:statement id=20260615100000.indexes.067 sha256=8baa3e1a13d4b7c202d937eb3daa78f2a08aeac76b62874f611666e927322d35
CREATE INDEX IF NOT EXISTS user_credit_ledger_organization_id_idx ON public.user_credit_ledger USING btree (organization_id) WHERE (organization_id IS NOT NULL);

-- dealflow:statement id=20260615100000.indexes.068 sha256=599bfeaf76cf3ab9e8906cdd255e8ef0bd4d48c0e6caad7ba8dca680ee919e8c
CREATE INDEX IF NOT EXISTS workspace_ghl_users_location_idx ON public.workspace_ghl_users USING btree (ghl_location_id);

-- dealflow:statement id=20260615100000.indexes.069 sha256=1d87ca69a5d18d4b52c646f5b1636bac53d98147320a7c1be833434598ef86fc
CREATE UNIQUE INDEX IF NOT EXISTS workspace_ghl_users_workspace_partner_email_unique ON public.workspace_ghl_users USING btree (workspace_id, partner_id, email);

-- controls
-- dealflow:statement id=20260615100000.controls.001 sha256=5517722646adf9add5d38675d423238c410283824de533a4f094079d33ebea06
DROP POLICY IF EXISTS "ad_performance_deny_all" ON "public"."ad_performance";

-- dealflow:statement id=20260615100000.controls.002 sha256=e544e0f1918b0613e90c5e54182f8c4be61da0e13d7ed5a4f977a15673af6f23
CREATE POLICY "ad_performance_deny_all" ON "public"."ad_performance"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

-- dealflow:statement id=20260615100000.controls.003 sha256=2bd84f4b222321db851c747051e4c5ef34e83f634b98ec9581ed40715152c2fd
DROP POLICY IF EXISTS "agent_profiles_service_role_all" ON "public"."agent_profiles";

-- dealflow:statement id=20260615100000.controls.004 sha256=27430ef643dfdbc35cb3dd64dd91c01b5ef4de0872cedbea9d7a81d031444c55
CREATE POLICY "agent_profiles_service_role_all" ON "public"."agent_profiles"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.005 sha256=f47783157eb40f0b52dfbe912d91b90fae1ecd6cf454d916c56bc40ef4264ad5
DROP POLICY IF EXISTS "app_schema_metadata_service_role_all" ON "public"."app_schema_metadata";

-- dealflow:statement id=20260615100000.controls.006 sha256=d3932de0c6d484a1f992b18f5f53b500bafa2cc1414ac7b1f57686e734bbccd1
CREATE POLICY "app_schema_metadata_service_role_all" ON "public"."app_schema_metadata"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.007 sha256=d00278c03c6465842f7a2247366ce58172c78f351a3df469d75a1cc0265035f9
DROP POLICY IF EXISTS "appointments_member_access" ON "public"."appointments";

-- dealflow:statement id=20260615100000.controls.008 sha256=1aa6a6c4e35255276bed721ec6786c78de798f9c1de55de2371a3d510e26e21e
CREATE POLICY "appointments_member_access" ON "public"."appointments"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.009 sha256=e1cbe0f5dcf6a954c37f1cb48a9753db21c2d32dcd9c91f7f31326be18d4fef4
DROP POLICY IF EXISTS "audit_logs_member_access" ON "public"."audit_logs";

-- dealflow:statement id=20260615100000.controls.010 sha256=8013aef2492d1d5aedffcfcb59e03cacc61ec12a397f6fdc75e2adb3421b6787
CREATE POLICY "audit_logs_member_access" ON "public"."audit_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.011 sha256=4239f9f7f7cc806ffe7db23bc04f758e3382a5bddaa21b504ff719afcd900435
DROP POLICY IF EXISTS "billing_subscriptions_member_select" ON "public"."billing_subscriptions";

-- dealflow:statement id=20260615100000.controls.012 sha256=ad68a3ed03eaa1f729235fd161d13deee78bbf486626168b07c352ee0bfc6287
CREATE POLICY "billing_subscriptions_member_select" ON "public"."billing_subscriptions"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.013 sha256=3cdc264ff303500fcaeb8954871f97b45e7d967b292eefe27c3edec8a131dff0
DROP POLICY IF EXISTS "business_profiles_member_access" ON "public"."business_profiles";

-- dealflow:statement id=20260615100000.controls.014 sha256=55215ca95f32ea887f231f17edba9e078cbcc36e47b105b2e92216a750f4b8fc
CREATE POLICY "business_profiles_member_access" ON "public"."business_profiles"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.015 sha256=b3ed43a63a5fa82a7a88d2ef1a6bd60210dab57ee827e28d42f076558cbd33a9
DROP POLICY IF EXISTS "campaign_action_suggestions_member_delete" ON "public"."campaign_action_suggestions";

-- dealflow:statement id=20260615100000.controls.016 sha256=822d652129ec02b78329c1eca0283a712817618668efd0b9dae4d0c6c9983563
CREATE POLICY "campaign_action_suggestions_member_delete" ON "public"."campaign_action_suggestions"
  AS PERMISSIVE
  FOR DELETE
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.017 sha256=d78a09844dbb3165459d00823ce3458c85f9724b3c81772903c04cf4c6fdcb43
DROP POLICY IF EXISTS "campaign_action_suggestions_member_insert" ON "public"."campaign_action_suggestions";

-- dealflow:statement id=20260615100000.controls.018 sha256=d90dec68bbbabdaf368a41c8a7e601b0438d02d382e94085b20ca6ca101fde18
CREATE POLICY "campaign_action_suggestions_member_insert" ON "public"."campaign_action_suggestions"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.019 sha256=c594bc01d0bbdaaa6292d8e80058630b26981a9c1767c68d4d9286619dfe9cef
DROP POLICY IF EXISTS "campaign_action_suggestions_member_select" ON "public"."campaign_action_suggestions";

-- dealflow:statement id=20260615100000.controls.020 sha256=b551812002e63bb42ff1c4c177c7f747a1ad0bd4c13f7b855804cb866496b23f
CREATE POLICY "campaign_action_suggestions_member_select" ON "public"."campaign_action_suggestions"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.021 sha256=784f63446de149f5824260542df72a40741daf84c9b97df8353b158e38d08c0d
DROP POLICY IF EXISTS "campaign_action_suggestions_member_update" ON "public"."campaign_action_suggestions";

-- dealflow:statement id=20260615100000.controls.022 sha256=4f6dbc17011948d0f79b1362c5bdff056e7167f4db8181cdc3bf77a303e174bc
CREATE POLICY "campaign_action_suggestions_member_update" ON "public"."campaign_action_suggestions"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)))
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.023 sha256=2ce73df612da2559ecc8028d1aa500b1fbc446504b7e3ddaaae50b1e6706f79c
DROP POLICY IF EXISTS "campaign_action_suggestions_service_role_all" ON "public"."campaign_action_suggestions";

-- dealflow:statement id=20260615100000.controls.024 sha256=fb4e9c792bb7d2f5c4045a574412d8af572a99b065f3b2e8f985ad7a9c53cc0f
CREATE POLICY "campaign_action_suggestions_service_role_all" ON "public"."campaign_action_suggestions"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.025 sha256=98e43e7f9a951a4dd2acba16094d2effaa6b3bc8ed610035f9eabe0585a2bc5f
DROP POLICY IF EXISTS "campaign_draft_actions_member_insert" ON "public"."campaign_draft_actions";

-- dealflow:statement id=20260615100000.controls.026 sha256=b453317b95ffcc31fcc4afddaae8c42fb629bc50240331eda26089f736b60514
CREATE POLICY "campaign_draft_actions_member_insert" ON "public"."campaign_draft_actions"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.027 sha256=1dce6b91637213e41ff1b38a2ddb63f91c0de5f1cbe455e422e8b996e8150700
DROP POLICY IF EXISTS "campaign_draft_actions_member_select" ON "public"."campaign_draft_actions";

-- dealflow:statement id=20260615100000.controls.028 sha256=78ea1b0077c16b4d7f8f02a7f39a60fb7e5b368ab659eb9c5fc8ebc4e0816d82
CREATE POLICY "campaign_draft_actions_member_select" ON "public"."campaign_draft_actions"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.029 sha256=f91e209a4d65b6c5842f36c24b4ed8b6c1208781c6e07f7bea9d8d1f5e3bc62e
DROP POLICY IF EXISTS "campaign_draft_actions_member_update" ON "public"."campaign_draft_actions";

-- dealflow:statement id=20260615100000.controls.030 sha256=0f6f39fc16aff4b4d49a1cc15dd6b18a6624c5cd78167c6963a1ec24d447c9ec
CREATE POLICY "campaign_draft_actions_member_update" ON "public"."campaign_draft_actions"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)))
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.031 sha256=0f64ac3ebf89080d5003b6a82cba23f882f81fee8fcf162175f5e778c9bd914d
DROP POLICY IF EXISTS "campaign_draft_actions_service_role_all" ON "public"."campaign_draft_actions";

-- dealflow:statement id=20260615100000.controls.032 sha256=a2cf8d230a8eaf1d72ed580df0202dc13c8033b40c68154ceb709d60a0b31ea3
CREATE POLICY "campaign_draft_actions_service_role_all" ON "public"."campaign_draft_actions"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.033 sha256=76d4cb365ccb5a76deba2eeb37a1ec52650dcbea1fe09cfd111ef72546900a9d
DROP POLICY IF EXISTS "campaign_leads_member_select" ON "public"."campaign_leads";

-- dealflow:statement id=20260615100000.controls.034 sha256=01af7abe060e10d173b0f28659553ee6116245ea12ca3c56d281c8a3522adb12
CREATE POLICY "campaign_leads_member_select" ON "public"."campaign_leads"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.035 sha256=98998f92ee91c4b197e1997ec29a8102e40a998ac8de86c63864384e71e9799a
DROP POLICY IF EXISTS "campaign_leads_service_role_all" ON "public"."campaign_leads";

-- dealflow:statement id=20260615100000.controls.036 sha256=2081d4bf8ad3bf37aaa97e062053cbd46dc609c9b2e74cd0baef8ff031b0d3ff
CREATE POLICY "campaign_leads_service_role_all" ON "public"."campaign_leads"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.037 sha256=3c6ff6d727470df90ea131ecf0c22f2cfbeb73e7edcc6cf49ef13dbc9203fab8
DROP POLICY IF EXISTS "campaign_plans_member_access" ON "public"."campaign_plans";

-- dealflow:statement id=20260615100000.controls.038 sha256=0d9781a2eea1d7ffa8857c21f69af71cce97bf561ff0eab4975ec8e97f3c5672
CREATE POLICY "campaign_plans_member_access" ON "public"."campaign_plans"
  AS PERMISSIVE
  FOR ALL
  TO "authenticated"
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR (owner_id = (( SELECT auth.uid() AS uid))::text) OR private.is_current_user_org_member(organization_id)))
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) OR (owner_id = (( SELECT auth.uid() AS uid))::text) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.039 sha256=dfb018a8849e3e7bd511e451df6b928b20f640ecf9b36a26ade84657cebea445
DROP POLICY IF EXISTS "campaign_snapshots_member_access" ON "public"."campaign_snapshots";

-- dealflow:statement id=20260615100000.controls.040 sha256=50dd54dc57749aebe608a8d62251e865272cc965e3f9debe0146c8b32d8d10eb
CREATE POLICY "campaign_snapshots_member_access" ON "public"."campaign_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.041 sha256=575aa6a4cf497dc02121f8a7ea392d3b8aaf9d797e9626d266cc9b6d5cdf13f5
DROP POLICY IF EXISTS "creative_assets_member_access" ON "public"."creative_assets";

-- dealflow:statement id=20260615100000.controls.042 sha256=787b6f9a65ea349768d3a6c0713748879a0777d657edaae37f84d8fdaeab295a
CREATE POLICY "creative_assets_member_access" ON "public"."creative_assets"
  AS PERMISSIVE
  FOR ALL
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM campaign_plans campaign_record
  WHERE ((campaign_record.id = creative_assets.campaign_id) AND ((campaign_record.user_id = (( SELECT auth.uid() AS uid))::text) OR (campaign_record.owner_id = (( SELECT auth.uid() AS uid))::text) OR private.is_current_user_org_member(campaign_record.organization_id)))))))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM campaign_plans campaign_record
  WHERE ((campaign_record.id = creative_assets.campaign_id) AND ((campaign_record.user_id = (( SELECT auth.uid() AS uid))::text) OR (campaign_record.owner_id = (( SELECT auth.uid() AS uid))::text) OR private.is_current_user_org_member(campaign_record.organization_id)))))));

-- dealflow:statement id=20260615100000.controls.043 sha256=5c42b9435af33417cd7c9be3d9bb783c4695643e606d2ddf071d83afb9a07e53
DROP POLICY IF EXISTS "data_imports_member_access" ON "public"."data_imports";

-- dealflow:statement id=20260615100000.controls.044 sha256=7f511c39a5bfe18dcce42472e7692bb56c54dabd9bc26831fbf3c98f9629574b
CREATE POLICY "data_imports_member_access" ON "public"."data_imports"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.045 sha256=208a647cf2a23a06c5caeb6851188860fe6d60c4ff5083f245ad9a105c4aed50
DROP POLICY IF EXISTS "deals_member_access" ON "public"."deals";

-- dealflow:statement id=20260615100000.controls.046 sha256=9d723814b63cac90b3f909860707da0c2ad2554c463ade7b1e435f221846b038
CREATE POLICY "deals_member_access" ON "public"."deals"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.047 sha256=8ed089609b0b13a8004e8105e97d78eb513fe60f042bc23572e639d1166228ab
DROP POLICY IF EXISTS "generated_artifacts_member_access" ON "public"."generated_artifacts";

-- dealflow:statement id=20260615100000.controls.048 sha256=a2ff7c7143848720a94460227253a79be1691f91e30b2b54ecf5d1b16f7602e3
CREATE POLICY "generated_artifacts_member_access" ON "public"."generated_artifacts"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.049 sha256=abc0180813ed3a32b7c8e713ea4ecdc0b69890cbbe9ef6cb0041e56e2f1ecee4
DROP POLICY IF EXISTS "ghl_provisioning_events_member_select" ON "public"."ghl_provisioning_events";

-- dealflow:statement id=20260615100000.controls.050 sha256=2b5c66eb7907a0d8771514d135270bb6c6c89b0f27f820ec81f4f849dd24ce82
CREATE POLICY "ghl_provisioning_events_member_select" ON "public"."ghl_provisioning_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260615100000.controls.051 sha256=2cf8d1e6a3788b313e22f3b3b95c2feef844471b9018dcff677e98c0385b5c79
DROP POLICY IF EXISTS "ghl_provisioning_events_service_role_all" ON "public"."ghl_provisioning_events";

-- dealflow:statement id=20260615100000.controls.052 sha256=8b41b331e013f99e597d34370b3e9c450bd1556eb52a1eed234dd4c623173f00
CREATE POLICY "ghl_provisioning_events_service_role_all" ON "public"."ghl_provisioning_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260615100000.controls.053 sha256=05872da0400f7077ae002a54a5c006bfd11d00972b9a2ac2c83cbc9af3fe670d
DROP POLICY IF EXISTS "ghl_provisioning_jobs_member_select" ON "public"."ghl_provisioning_jobs";

-- dealflow:statement id=20260615100000.controls.054 sha256=6417dc3ed6db5df67e1720cfa5982007683079296d33682d8ffec44a9df3ecf1
CREATE POLICY "ghl_provisioning_jobs_member_select" ON "public"."ghl_provisioning_jobs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260615100000.controls.055 sha256=8d7c14061457ec89075d6696c9f4b6e43c8b6ddbd09de103c0e9ddc82558d706
DROP POLICY IF EXISTS "ghl_provisioning_jobs_service_role_all" ON "public"."ghl_provisioning_jobs";

-- dealflow:statement id=20260615100000.controls.056 sha256=0b95166d7d58f668c986dc95e1581f045d9d2fbed610cec348b93833a1f29dda
CREATE POLICY "ghl_provisioning_jobs_service_role_all" ON "public"."ghl_provisioning_jobs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260615100000.controls.057 sha256=237548f7c92d6514c9de42290a3fe8c75cb2b145e4eff9b1e7115da4eb48611f
DROP POLICY IF EXISTS "health_scores_member_access" ON "public"."health_scores";

-- dealflow:statement id=20260615100000.controls.058 sha256=ae8af7c78c015a8980e99708151dceb3439f98876115180d5b147a43eede95e9
CREATE POLICY "health_scores_member_access" ON "public"."health_scores"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.059 sha256=7d28e60da020f7d43600fbab8e0ca345ec9b3bebea61553d3bcdc5d35ceb14a9
DROP POLICY IF EXISTS "integration_oauth_states_service_role_all" ON "public"."integration_oauth_states";

-- dealflow:statement id=20260615100000.controls.060 sha256=337c88774566af6b5db6bbe0f13bd5121adfe4d4e98893159bcb79e2ecdc2882
CREATE POLICY "integration_oauth_states_service_role_all" ON "public"."integration_oauth_states"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260615100000.controls.061 sha256=f59fb3b54aef4b8fd2e767cd9b1117e6a6ff32fa66ed0d4064b1e9be9e000295
DROP POLICY IF EXISTS "internal_notes_member_access" ON "public"."internal_notes";

-- dealflow:statement id=20260615100000.controls.062 sha256=9b6f05bc19fa70876b459548f2eba669727fcee00d5ea5a057ea3e1607f21f74
CREATE POLICY "internal_notes_member_access" ON "public"."internal_notes"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.063 sha256=805cf02344cc97f4ced5930f81157f96601964768990c44372ffc64279273721
DROP POLICY IF EXISTS "jobs_member_access" ON "public"."jobs";

-- dealflow:statement id=20260615100000.controls.064 sha256=9c54fe6d9c5477b2e3ce137349cf58a59278bc4e65877f6d0b578e22418eda5c
CREATE POLICY "jobs_member_access" ON "public"."jobs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.065 sha256=f0753df0e1065babf74030d12a6fcd8befb0d30977a5b5f49ced5838d75a130a
DROP POLICY IF EXISTS "lead_assignments_service_role_all" ON "public"."lead_assignments";

-- dealflow:statement id=20260615100000.controls.066 sha256=c4df1c3c694dd41715bc6f3d2ccb630f769ea8da69c85a6195aa237885ead704
CREATE POLICY "lead_assignments_service_role_all" ON "public"."lead_assignments"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.067 sha256=c9e45a00b3fbe9d81729a76ac821b724b6fc71c28512b98b9df3e0740f22b223
DROP POLICY IF EXISTS "lead_capture_events_member_select" ON "public"."lead_capture_events";

-- dealflow:statement id=20260615100000.controls.068 sha256=a1ae783b6ec100289c13b9eb7fbe2498fe6da8f1a41d4951f9cdefbeb97cb316
CREATE POLICY "lead_capture_events_member_select" ON "public"."lead_capture_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.069 sha256=b6f2962170f577d71745462729143444ebbff8e6ea1931653ed62681be6f8194
DROP POLICY IF EXISTS "lead_capture_events_service_role_all" ON "public"."lead_capture_events";

-- dealflow:statement id=20260615100000.controls.070 sha256=a56d6c49b93fd2bf3829116a83d38726fb5ef6cf30dbc0797ddcc360278240bc
CREATE POLICY "lead_capture_events_service_role_all" ON "public"."lead_capture_events"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.071 sha256=5206c55eb278c18e08f94619504bc448f3e3b0dfdd9a21599d6173e1fee5df95
DROP POLICY IF EXISTS "lead_crm_sync_events_member_select" ON "public"."lead_crm_sync_events";

-- dealflow:statement id=20260615100000.controls.072 sha256=93f8dcce010deedb7f6d6821aac7af48e757b51b5b7866a4b45c284c0775a920
CREATE POLICY "lead_crm_sync_events_member_select" ON "public"."lead_crm_sync_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260615100000.controls.073 sha256=39ba5726e2bca9f91bd59868f4b3faf568ded1f6bb29104ce1e02f526fe89a3e
DROP POLICY IF EXISTS "lead_crm_sync_events_service_role_all" ON "public"."lead_crm_sync_events";

-- dealflow:statement id=20260615100000.controls.074 sha256=dcce4ee815c0bf2b80edc3900ad99b8fe886761efa90856a920de7adbd7b3be1
CREATE POLICY "lead_crm_sync_events_service_role_all" ON "public"."lead_crm_sync_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260615100000.controls.075 sha256=7dfd7e448bb8bdfb63cb82dc6a1b304bbb5759686db11b0c2e816650f41dd854
DROP POLICY IF EXISTS "lead_delivery_attempts_member_select" ON "public"."lead_delivery_attempts";

-- dealflow:statement id=20260615100000.controls.076 sha256=d298260072c10cf3ace6c10c4b513652d335a628bd58df9e78e42557e9dae5b5
CREATE POLICY "lead_delivery_attempts_member_select" ON "public"."lead_delivery_attempts"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.077 sha256=5aaa140338db95e64692d47533edc32cf9c0c01c6baa5f22252fc19ec9740e67
DROP POLICY IF EXISTS "lead_delivery_attempts_service_role_all" ON "public"."lead_delivery_attempts";

-- dealflow:statement id=20260615100000.controls.078 sha256=5ce39dfaeb3df9929707e8c4baa386015dd5320738e8800872baf065ac106193
CREATE POLICY "lead_delivery_attempts_service_role_all" ON "public"."lead_delivery_attempts"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.079 sha256=a0c3c52e66871e58f1a7571ecfd9bbb024537a376cb57e6b51e5329556bd4b7e
DROP POLICY IF EXISTS "lead_form_templates_member_select" ON "public"."lead_form_templates";

-- dealflow:statement id=20260615100000.controls.080 sha256=15854f1f1acc2085fb164c21ef9f3fde24c4d946fe74a815b56c72c9d84df346
CREATE POLICY "lead_form_templates_member_select" ON "public"."lead_form_templates"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((organization_id IS NULL) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.081 sha256=801f70dee267d6fad090563860abaf6dfd23417037b6661a1e310c4fe85799a5
DROP POLICY IF EXISTS "lead_form_templates_service_role_all" ON "public"."lead_form_templates";

-- dealflow:statement id=20260615100000.controls.082 sha256=e402b73df63ad0a005fb50a2887b34aab1b4f7b22f2b1a975665595a069d2943
CREATE POLICY "lead_form_templates_service_role_all" ON "public"."lead_form_templates"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.083 sha256=6b4d30f311d0b787ff58c95851c1fcd2684897b5d0392a3297b3933330f710aa
DROP POLICY IF EXISTS "lead_messages_member_access" ON "public"."lead_messages";

-- dealflow:statement id=20260615100000.controls.084 sha256=3dd1965c9e420d2bd4b67510f18fe9a3282677f437bb0e878d796f8a835c3b15
CREATE POLICY "lead_messages_member_access" ON "public"."lead_messages"
  AS PERMISSIVE
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM leads lead_record
  WHERE ((lead_record.id = lead_messages.lead_id) AND ((lead_record.user_id = ( SELECT auth.uid() AS uid)) OR (lead_record.assigned_user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(lead_record.organization_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM leads lead_record
  WHERE ((lead_record.id = lead_messages.lead_id) AND ((lead_record.user_id = ( SELECT auth.uid() AS uid)) OR (lead_record.assigned_user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(lead_record.organization_id))))));

-- dealflow:statement id=20260615100000.controls.085 sha256=232f994c9b5befaf1656885a97eb7ceabfbdca2e72e9c25309cf021d882f3111
DROP POLICY IF EXISTS "lead_notifications_service_role_all" ON "public"."lead_notifications";

-- dealflow:statement id=20260615100000.controls.086 sha256=241bc21af7547a18e98fdd6eda597e0fcad5116d28938ceb230ffbb76a467249
CREATE POLICY "lead_notifications_service_role_all" ON "public"."lead_notifications"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.087 sha256=ae3523c0c0be5d6d57def22ae1f897d1b5ebdfbfda185dff0454dce4552223e0
DROP POLICY IF EXISTS "leads_member_access" ON "public"."leads";

-- dealflow:statement id=20260615100000.controls.088 sha256=4540c31379c5a70715f7f196b3c91f0f6ff9a476698f07008978536b8143f031
CREATE POLICY "leads_member_access" ON "public"."leads"
  AS PERMISSIVE
  FOR ALL
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (assigned_user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (assigned_user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.089 sha256=3db1dd903c8060315bbc8403c1c1c4b1fafaacf1a55c4db4462312e7bf47f3bf
DROP POLICY IF EXISTS "markets_member_access" ON "public"."markets";

-- dealflow:statement id=20260615100000.controls.090 sha256=1eeeba0ccc389707d96665eabcc3bab4a8c84d116f1b1cd3933a6a9414c79719
CREATE POLICY "markets_member_access" ON "public"."markets"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.091 sha256=b904114bb52aff5145d7b73d44744a4aafa526b9711fefb33e27768d1707bd2e
DROP POLICY IF EXISTS "meta_launch_locks_member_select" ON "public"."meta_launch_locks";

-- dealflow:statement id=20260615100000.controls.092 sha256=93dfaf77c35718995d586337171083687d504ceb0f8355187ac43e67f0d1ddc9
CREATE POLICY "meta_launch_locks_member_select" ON "public"."meta_launch_locks"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM campaign_plans campaign_record
  WHERE ((campaign_record.id = meta_launch_locks.campaign_id) AND ((campaign_record.user_id = (( SELECT auth.uid() AS uid))::text) OR (campaign_record.owner_id = (( SELECT auth.uid() AS uid))::text) OR private.is_current_user_org_member(campaign_record.organization_id))))));

-- dealflow:statement id=20260615100000.controls.093 sha256=7bcd9b6b6ee18bb873777cecfc73daa7c6317d4ec7b2e9a21f57a6a804ad6f26
DROP POLICY IF EXISTS "organization_admin_states_member_access" ON "public"."organization_admin_states";

-- dealflow:statement id=20260615100000.controls.094 sha256=0048d1669218994ab66b051c232a2a6179aeeda5771a46c0893dcc288311711c
CREATE POLICY "organization_admin_states_member_access" ON "public"."organization_admin_states"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.095 sha256=ed0074db22e435cb3f255254f60d84aced58015312ce0102b8dc761db5b46899
DROP POLICY IF EXISTS "organization_memberships_select_member" ON "public"."organization_memberships";

-- dealflow:statement id=20260615100000.controls.096 sha256=6ee2de9f42cf09f4e11fe34e50991f729826033a3ed890ea52ba2698e2c6e9dd
CREATE POLICY "organization_memberships_select_member" ON "public"."organization_memberships"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.097 sha256=b64641a292d5dcfe65228c6180f87e409f05168b865e2ff13ed5459eb79a2e29
DROP POLICY IF EXISTS "organizations_select_member" ON "public"."organizations";

-- dealflow:statement id=20260615100000.controls.098 sha256=d009503520fcb5d0bb65f41026f5726cdfc23a93bc2662accb29f2a8554b48bf
CREATE POLICY "organizations_select_member" ON "public"."organizations"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((owner_user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(id)));

-- dealflow:statement id=20260615100000.controls.099 sha256=2f8ea2be793b69b42aead09ac6cc6d454d19f24f3bf4a3a3b57e063e7fda5191
DROP POLICY IF EXISTS "organizations_update_owner" ON "public"."organizations";

-- dealflow:statement id=20260615100000.controls.100 sha256=0ebfd0f4d12323536d256eb93cf87ebb3770c93bd2473d41255510dd0da0f5fe
CREATE POLICY "organizations_update_owner" ON "public"."organizations"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((owner_user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_user_id = ( SELECT auth.uid() AS uid)));

-- dealflow:statement id=20260615100000.controls.101 sha256=ede4a722099fec97dc890bcb083cffa3c9f5956f923964e2198b2a0454a7182c
DROP POLICY IF EXISTS "performance_tracking_member_insert" ON "public"."performance_tracking";

-- dealflow:statement id=20260615100000.controls.102 sha256=8a73b8677a3e5f161276f0302915296214d55d7ede440e542e84e2d416f4b0da
CREATE POLICY "performance_tracking_member_insert" ON "public"."performance_tracking"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.103 sha256=663541d5f61cfc6da62c53a4400a47d165fa8e0bf356ad46b4f8c0daa3135e20
DROP POLICY IF EXISTS "performance_tracking_member_select" ON "public"."performance_tracking";

-- dealflow:statement id=20260615100000.controls.104 sha256=c2ca1b5dac9382947685d481c3dd101d179635ac4689ebdb302b3dabd5784e11
CREATE POLICY "performance_tracking_member_select" ON "public"."performance_tracking"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.105 sha256=9ca16a29c86f4a0dfce3c16efc5b4f24122a46b7f9f7bdb0e097773b52edd2fa
DROP POLICY IF EXISTS "performance_tracking_service_role_all" ON "public"."performance_tracking";

-- dealflow:statement id=20260615100000.controls.106 sha256=dda2f9d131296204e5007379a7aba5aa24c001b728499f7f7e4e8449f9bfaa9e
CREATE POLICY "performance_tracking_service_role_all" ON "public"."performance_tracking"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.107 sha256=ff848527ffcdf6a15a04d9dac890d5c71c15357987c5418fb07a553921a65e77
DROP POLICY IF EXISTS "scale_monitor_runs_service_role_all" ON "public"."scale_monitor_runs";

-- dealflow:statement id=20260615100000.controls.108 sha256=a6d5f1364a73989120d0806e8700db7f2cb9040ab6593e36d236d7f01cac4279
CREATE POLICY "scale_monitor_runs_service_role_all" ON "public"."scale_monitor_runs"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.109 sha256=052fe42050ca3a2b3167d444fad6ff8610d72dba10a15831ba8531fcee28d7f6
DROP POLICY IF EXISTS "service_areas_member_access" ON "public"."service_areas";

-- dealflow:statement id=20260615100000.controls.110 sha256=5df2192bc11824ec1944f43c7774ffcf285b8f4f5c3e897a5fbdf8019f691f61
CREATE POLICY "service_areas_member_access" ON "public"."service_areas"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260615100000.controls.111 sha256=c11b5f04026324300fcd3cdbdae1bbd4cd1777d2d64f047d73d47a6008abd560
DROP POLICY IF EXISTS "system_job_logs_member_select" ON "public"."system_job_logs";

-- dealflow:statement id=20260615100000.controls.112 sha256=710378e28f2c8978c0fdd3d6daae2a2424e9b401b7d1d986537a4548ee1a09f1
CREATE POLICY "system_job_logs_member_select" ON "public"."system_job_logs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM system_jobs job_record
  WHERE ((job_record.id = system_job_logs.job_id) AND ((job_record.user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(job_record.organization_id))))));

-- dealflow:statement id=20260615100000.controls.113 sha256=908f48e85a1d467f29e4375ed521688fb0522d053da9d44e95669750b2ee2c30
DROP POLICY IF EXISTS "system_jobs_member_access" ON "public"."system_jobs";

-- dealflow:statement id=20260615100000.controls.114 sha256=a28133bc819e7118ac8d0c249595a8f3fa1ff2bad3993fa856d883c24f19d14b
CREATE POLICY "system_jobs_member_access" ON "public"."system_jobs"
  AS PERMISSIVE
  FOR ALL
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.115 sha256=a50f65465995cd2c42950183d79dd7c20ef1f69b56618f4d397007d99c0e6ac1
DROP POLICY IF EXISTS "targeting_intelligence_patterns_member_insert" ON "public"."targeting_intelligence_patterns";

-- dealflow:statement id=20260615100000.controls.116 sha256=2240c3debdc826362bcf83f5ba2d7a42a6623c9e6db9afc45a9ba5699d89ec39
CREATE POLICY "targeting_intelligence_patterns_member_insert" ON "public"."targeting_intelligence_patterns"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.117 sha256=a7674a33e4fd44c6b51809dd9847aa6be591a90405b3230f2b61961f4b9a4c7b
DROP POLICY IF EXISTS "targeting_intelligence_patterns_member_select" ON "public"."targeting_intelligence_patterns";

-- dealflow:statement id=20260615100000.controls.118 sha256=6571d6c94dd7a9ddfeeb048919072b6b9af2c35f4a775b94c6f26f5cee7490ea
CREATE POLICY "targeting_intelligence_patterns_member_select" ON "public"."targeting_intelligence_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.119 sha256=ee2110471fd76fecbbebf4b9e27543b3ae93a1e0d3205c5d10abbdd703c8fb67
DROP POLICY IF EXISTS "targeting_intelligence_patterns_member_update" ON "public"."targeting_intelligence_patterns";

-- dealflow:statement id=20260615100000.controls.120 sha256=3c418df5a927def86f4924d9c99a5c226a3985a0302d1fd8846c6b3319e19292
CREATE POLICY "targeting_intelligence_patterns_member_update" ON "public"."targeting_intelligence_patterns"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)))
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260615100000.controls.121 sha256=ab935b5f28cea405bbc3c6c9bc9c98a7b309278f30441dffc32378e3cdaefe2a
DROP POLICY IF EXISTS "targeting_intelligence_patterns_service_role_all" ON "public"."targeting_intelligence_patterns";

-- dealflow:statement id=20260615100000.controls.122 sha256=4e68f6958df320c8e02fef61b9175fa27ae75518d0474bcb9b2e648edbbe0bf3
CREATE POLICY "targeting_intelligence_patterns_service_role_all" ON "public"."targeting_intelligence_patterns"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260615100000.controls.123 sha256=02a6ba8f8390c615743052d7d3e2f72b1868096f483e52d06a8e01ba5e3d607e
DROP POLICY IF EXISTS "user_credit_ledger_member_select" ON "public"."user_credit_ledger";

-- dealflow:statement id=20260615100000.controls.124 sha256=c344e1d9d189ea4ae1eaebc1adb50092cc97bc52dd83f766d8dee02cac1ae0de
CREATE POLICY "user_credit_ledger_member_select" ON "public"."user_credit_ledger"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- dealflow:statement id=20260615100000.controls.125 sha256=aef1fc143cefd12551c54d913e478bce79352854ffbf832685f036658a0dae2c
DROP POLICY IF EXISTS "user_credits_member_select" ON "public"."user_credits";

-- dealflow:statement id=20260615100000.controls.126 sha256=36161a9b8f4dc62a2447bc84cec262130919c13f2e859aae4f509e052958a17f
CREATE POLICY "user_credits_member_select" ON "public"."user_credits"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- dealflow:statement id=20260615100000.controls.127 sha256=2bebcade12fb02dcd48ca4452c04bf573b4325f4b8c87df5c9c3815f6260de0e
DROP POLICY IF EXISTS "users_select_self" ON "public"."users";

-- dealflow:statement id=20260615100000.controls.128 sha256=5ba9d3e0dfe2ba1a737575a038ce1171b7fa21a7f402b641e1661a329dd0e7bf
CREATE POLICY "users_select_self" ON "public"."users"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)));

-- dealflow:statement id=20260615100000.controls.129 sha256=d1cafef445d654e82a9deba4c9a936a23b6b932488c769ea7f338666f126a063
DROP POLICY IF EXISTS "users_update_self" ON "public"."users";

-- dealflow:statement id=20260615100000.controls.130 sha256=ed01d41f9a1493725f06f479c53217c48a00f1c7ea92567a20e52e7299c58c6f
CREATE POLICY "users_update_self" ON "public"."users"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

-- dealflow:statement id=20260615100000.controls.131 sha256=13a0f868bc2a8302efd2a72087b4123a8b6f62bfe541036f6c12e4b4bf4e96f9
DROP POLICY IF EXISTS "workspace_ghl_users_member_select" ON "public"."workspace_ghl_users";

-- dealflow:statement id=20260615100000.controls.132 sha256=cc0c01f250f157df7b17031aad11ff33b9baf6804af2fafab31259d4c18cfecc
CREATE POLICY "workspace_ghl_users_member_select" ON "public"."workspace_ghl_users"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260615100000.controls.133 sha256=526691e00d08ec2df408257b00e1e9773295521acdb4be7a5f92b6b7a3447f6e
DROP POLICY IF EXISTS "workspace_ghl_users_service_role_all" ON "public"."workspace_ghl_users";

-- dealflow:statement id=20260615100000.controls.134 sha256=ffa1a643dbc2660680856d3bb60c15f579a88b39844525469f2eb84b0bfe6716
CREATE POLICY "workspace_ghl_users_service_role_all" ON "public"."workspace_ghl_users"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260615100000.controls.135 sha256=65760e405f48734c3c117117a9a5e872d8d85dd41dda263c3a59bca361abbf64
DROP TRIGGER IF EXISTS "set_appointments_updated_at" ON "public"."appointments";

-- dealflow:statement id=20260615100000.controls.136 sha256=5b7b399218c4a310fec59ab8ff6e407ff0e8334db0a7fcfd5b91ef6e7ac5f813
CREATE TRIGGER set_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.137 sha256=d8f53bfc8109e1e6e279829f156da4dc0a5d955c9940051a8fc02773bfc75332
DROP TRIGGER IF EXISTS "set_audit_logs_updated_at" ON "public"."audit_logs";

-- dealflow:statement id=20260615100000.controls.138 sha256=aecb4ed39fb55b18088d613e7a76ec747f96e320e88af2d2a1921b6ab8a9e08a
CREATE TRIGGER set_audit_logs_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.139 sha256=1e14c0c9de1093c95c279dfb43e5ce44032b7c9be45a00194980d15c57dff178
DROP TRIGGER IF EXISTS "set_business_profiles_updated_at" ON "public"."business_profiles";

-- dealflow:statement id=20260615100000.controls.140 sha256=96490a4da1563d50590248a6c72dc6cf5a190524ae848657db66c87e85bd5ef6
CREATE TRIGGER set_business_profiles_updated_at BEFORE UPDATE ON public.business_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.141 sha256=66c79675de7fb623512f29a57423b81c24e7d324821aebc688dc255dbddc37d3
DROP TRIGGER IF EXISTS "set_campaign_snapshots_updated_at" ON "public"."campaign_snapshots";

-- dealflow:statement id=20260615100000.controls.142 sha256=ecf34424c7c7d167d161d1f5505577d18155e65a99f9ab17b46a916067726263
CREATE TRIGGER set_campaign_snapshots_updated_at BEFORE UPDATE ON public.campaign_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.143 sha256=8a1d4b7db17c7d09fc6c90f55663f49f08664a8d99b65c40a33fb8157fc70c27
DROP TRIGGER IF EXISTS "set_data_imports_updated_at" ON "public"."data_imports";

-- dealflow:statement id=20260615100000.controls.144 sha256=a10ad52440e7ea89b2ca511844fc36e4166ea84f2cef0f1ce4e61dfd4efc8606
CREATE TRIGGER set_data_imports_updated_at BEFORE UPDATE ON public.data_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.145 sha256=6ef7b2a5627efe64e232d6084bdcf05adf59d1d44eeadd87394cd6e7ea8abd3c
DROP TRIGGER IF EXISTS "set_deals_updated_at" ON "public"."deals";

-- dealflow:statement id=20260615100000.controls.146 sha256=b8a10c505b61345de11a70350d5b549a9f40319d698361e501dc18455079d250
CREATE TRIGGER set_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.147 sha256=827d36ed095d69997cdef8e2c7c40d259fa51ae4a83e4f80925efd61e43ee388
DROP TRIGGER IF EXISTS "set_generated_artifacts_updated_at" ON "public"."generated_artifacts";

-- dealflow:statement id=20260615100000.controls.148 sha256=50f3f1ab00d5bf8167dac57b4dcc92762fbd2febe01f0947acadfedf9f3e497c
CREATE TRIGGER set_generated_artifacts_updated_at BEFORE UPDATE ON public.generated_artifacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.149 sha256=aed4d3dab6dd8a288cd6aa101bdf21049ab7750a70465112f7acbf991697fb6d
DROP TRIGGER IF EXISTS "set_health_scores_updated_at" ON "public"."health_scores";

-- dealflow:statement id=20260615100000.controls.150 sha256=07e0fb972c76ec112b30fd6550cb758129007a3164a85922715a72ae9cb1027d
CREATE TRIGGER set_health_scores_updated_at BEFORE UPDATE ON public.health_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.151 sha256=9aa0561eb7aee53e59fdf0cb6f0f3d3d34c36824f0b66415de307c19eb910208
DROP TRIGGER IF EXISTS "set_internal_notes_updated_at" ON "public"."internal_notes";

-- dealflow:statement id=20260615100000.controls.152 sha256=eae651a7e30ffda28def4b38fd97424fa0c1f864dbe6d9557fa765c778b2ddfb
CREATE TRIGGER set_internal_notes_updated_at BEFORE UPDATE ON public.internal_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.153 sha256=ac167e3a5e994da6282e718ca39c99accc99ab16d55197be2fc558821d30b486
DROP TRIGGER IF EXISTS "set_jobs_updated_at" ON "public"."jobs";

-- dealflow:statement id=20260615100000.controls.154 sha256=adad6cfc8131e193e5bea04b6ace19b91368df6d31082fa0f8aef0a5b8cd3d9b
CREATE TRIGGER set_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.155 sha256=12f5e4e087f87f0e450f6a905d7baeb2588bef09d591f36db0aa31447e0c6e16
DROP TRIGGER IF EXISTS "set_markets_updated_at" ON "public"."markets";

-- dealflow:statement id=20260615100000.controls.156 sha256=14cfa11441dbbe21cbde98416940bafa1aeb943bd152a2d0ccde3883d0d8f001
CREATE TRIGGER set_markets_updated_at BEFORE UPDATE ON public.markets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.157 sha256=97278cd2553bc2318c4736e2863daecc57345272133ed80006ec4baf2106e982
DROP TRIGGER IF EXISTS "set_organization_admin_states_updated_at" ON "public"."organization_admin_states";

-- dealflow:statement id=20260615100000.controls.158 sha256=44f06290cdbdb81675277c68e92d5c2d768cac5f8e9a198ba094d4d1e4669f5e
CREATE TRIGGER set_organization_admin_states_updated_at BEFORE UPDATE ON public.organization_admin_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.159 sha256=2f35321032d1bedb74b05ab177d7bc0cec29e97980789fb0663cca93d1fc3bcf
DROP TRIGGER IF EXISTS "set_service_areas_updated_at" ON "public"."service_areas";

-- dealflow:statement id=20260615100000.controls.160 sha256=6a2966af4523186ab281d5997f05bcb81eb5d723cbe203416c4f419cb6c7bea1
CREATE TRIGGER set_service_areas_updated_at BEFORE UPDATE ON public.service_areas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260615100000.controls.161 sha256=646a515681a33044f1072840629188a1a664919db60686333990452426dbd6ee
ALTER TABLE "public"."ad_performance" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.162 sha256=79da3cabf2746b45c29a11dde110ef23505e1a5a5830470f4b02d7e835839bb6
ALTER TABLE "public"."ad_performance" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.163 sha256=b235117ce1da820bdaf840b34c66c466a9f1df1668c7b664b6a2e0708c8283a4
ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.164 sha256=97f4b18c323866271106649a8722b343393fa22f39659fc0e1a9f2fd1b7481a2
ALTER TABLE "public"."appointments" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.165 sha256=2cb31345e6638f94b95c63dad759d0cc174bb3778609cf0d3e8c0828f6adbebd
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.166 sha256=c79df2e1dbe4c5d96ac3ee3790fd00b02d91abb520702c076e87c6a5faad1d28
ALTER TABLE "public"."audit_logs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.167 sha256=eea62bde7458eecd028090eeb01dd0cfaa90ba177617a60dc695533fda2a1801
ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.168 sha256=315402e3ea2c512311eea1bd29ab1dc03f811c1873936a6707ae327cc59b168e
ALTER TABLE "public"."business_profiles" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.169 sha256=2d73758e3071d52e9573bbd9f60a54b2d0613e3819b5865bb635f4f0ae28b2aa
ALTER TABLE "public"."campaign_action_suggestions" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.170 sha256=00ccc5f68262795b68a44629fc8098e5f563ff6d909e4833fa230cf3980b2017
ALTER TABLE "public"."campaign_action_suggestions" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.171 sha256=aab3b82769e588aa32ae53ff7c86cae0df3d243e38ed25f59e61ab105de5bc16
ALTER TABLE "public"."campaign_draft_actions" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.172 sha256=528871e58c8b17c37c979ce0ac513782f4c01b158faf1ba3cf6b69c1809c26fb
ALTER TABLE "public"."campaign_draft_actions" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.173 sha256=8795ce3d4540adf6c498f1336f3c3be0949ae232629490b6e15bc50651f54f64
ALTER TABLE "public"."campaign_leads" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.174 sha256=4bd786a178e1d74dc4bd8e624ab0ded9d89f2d3a47cd00085ac0f22c78b1e93a
ALTER TABLE "public"."campaign_leads" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.175 sha256=f3a0edd262eedb1860057ccebffda656040f659824a05f002040fc25b9f0e801
ALTER TABLE "public"."campaign_snapshots" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.176 sha256=4a0b83b5a38d8b1d6450896560976bfa7f56d36b5b3dd3fd22ffbbce97446e16
ALTER TABLE "public"."campaign_snapshots" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.177 sha256=72dd25e0aa077671f9411433901e9c35c5ad47865195856b4a95eecf4b141c89
ALTER TABLE "public"."data_imports" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.178 sha256=c1cdbbc161a0c39a92753987e1333981f6c99c6a4db53668931432cb0d188849
ALTER TABLE "public"."data_imports" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.179 sha256=4237650cc364ec0739b8e94ddfc8c4c4c006376d1db5a42b1f4b1ff9f7f8393a
ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.180 sha256=850f58ebb3a398791ca4081fb67332e7abb419fbd864fcdfc6997b79cd1b258e
ALTER TABLE "public"."deals" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.181 sha256=685e61aff7c21949b20d842474c5db43645e1c956b1082efec30c83e28458188
ALTER TABLE "public"."generated_artifacts" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.182 sha256=c3d6dfc5a6100bc93ed0a3229ade4adfd50edcfaef7ebb14d111b8e189977ed9
ALTER TABLE "public"."generated_artifacts" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.183 sha256=9b7d50bf4c52c60457bf72441967cf12d2645af69fede5920690295ff955da58
ALTER TABLE "public"."ghl_provisioning_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.184 sha256=2b62be44d93f121bb3d550c2615d4649cd6845791dcfebac55053332d034260e
ALTER TABLE "public"."ghl_provisioning_events" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.185 sha256=26e754f182f43083e9ad5977d1ee7b1eece6950f2815489005ca284acd9dacdf
ALTER TABLE "public"."ghl_provisioning_jobs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.186 sha256=b01102572d8ce55fba42f23cf8284239b20b4005a1e082567d6f7ff812d6923e
ALTER TABLE "public"."ghl_provisioning_jobs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.187 sha256=ec5b94462502ad713cd0133b2b2e66a7e740130bfbf41e10a3f5ca5b197cf40a
ALTER TABLE "public"."health_scores" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.188 sha256=fcf35468d06bf3dfe526cd6a1ee4813dc282372971deb4584fedc1d3ebbba69f
ALTER TABLE "public"."health_scores" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.189 sha256=2af56a1bd492ba19672dfa6b11573a97dbf01a6fc1b6419603d7b9027ff2c3ca
ALTER TABLE "public"."integration_oauth_states" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.190 sha256=860db3b61003c7c36d246d7965adef17c06964c267394116e895852076f656b3
ALTER TABLE "public"."integration_oauth_states" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.191 sha256=6d3e724da641d5e9c802268e424aeb9fd34b48fc30e3686c25774b769fb6179e
ALTER TABLE "public"."internal_notes" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.192 sha256=5d4249a0cd0a9b80530ecd229eadb62f4501c92c13faedd116a3f46b5ef474a0
ALTER TABLE "public"."internal_notes" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.193 sha256=17077b4295737aeff1cce8092faa0eb53b0c4a17a48cc6edecd5b787348873d1
ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.194 sha256=e730d0ed622a0872c69848f55abe4117b6d11ffddadab0759fefb53a6636348c
ALTER TABLE "public"."jobs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.195 sha256=284a1ae779613e87b88da2baed8e14a8a63b6ac53e592354afa8c73be6076fe9
ALTER TABLE "public"."lead_capture_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.196 sha256=041ce44db1716c7c4cf6d5a939f221dd49f8f7c62c36b3352875e69a54fd0429
ALTER TABLE "public"."lead_capture_events" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.197 sha256=1d70c04a329cee7001626b6984e7f8c1df71d2631dd744a91d5258cb36390711
ALTER TABLE "public"."lead_crm_sync_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.198 sha256=e3a3eb8d9875f7e40cef1a1503c4c8eccad726ec3fe521f83b3f37d7480cb6d0
ALTER TABLE "public"."lead_crm_sync_events" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.199 sha256=5875a02d0afe86f6ceb8bd8cb3e527e2c46021001c3884b62c90dba092eaa987
ALTER TABLE "public"."lead_delivery_attempts" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.200 sha256=9fd7f4d6b842f5c67294519757ff635b2518f5c04db7afa60320668b4f9c0506
ALTER TABLE "public"."lead_delivery_attempts" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.201 sha256=4d5f922087ac6b783a2308b257dcf770fe68f94317c94963cd7a4e4196b9fe9b
ALTER TABLE "public"."lead_form_templates" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.202 sha256=cea721185bc0ee8bda64956a8aecae9d1363e4b83af23fb2fb44e886f8edf101
ALTER TABLE "public"."lead_form_templates" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.203 sha256=3f53b04458105c3bbb191a51fe0a28bf25813f853f9dd5e778ef26f4491c4e71
ALTER TABLE "public"."markets" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.204 sha256=b14666d3ba1f54a622fab02acf5c1fc547279d9b5cff02e52fc4b9386c8ed4f8
ALTER TABLE "public"."markets" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.205 sha256=dc0acc25ee3c2c1ac1b6fa192d09d83a9028f8f9877bbe2491fd6171dd0cd3af
ALTER TABLE "public"."organization_admin_states" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.206 sha256=3528229ef1ed4c8e8c08b238b219681ccdd3e3c21cc929d60a49c82898967e73
ALTER TABLE "public"."organization_admin_states" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.207 sha256=a6acf2a78ce5145b24cd3a0e61e7df3928290dd6f8b4cbda8b7b817042a78e88
ALTER TABLE "public"."performance_tracking" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.208 sha256=b8f2c3545d83acf7f4e6e2b32be40475314802937ba6a0409a42dca7db538897
ALTER TABLE "public"."performance_tracking" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.209 sha256=d6ea82bf454d82abdbc289d4a9cbe6f9150599ea5eefda380797a866938ca192
ALTER TABLE "public"."scale_monitor_runs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.210 sha256=1583b83a262225391af02eb862e4a1f5e9bfa92a212fb097b4e7b9dca725ebf0
ALTER TABLE "public"."scale_monitor_runs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.211 sha256=2e7f6f7893c6575a0e25cfc17554011bb5673425565e4284de38fd7c746f9ed0
ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.212 sha256=55942b8d6247a79b029d8965ff8bd7711212650b956cef1c23dcc1415a90767d
ALTER TABLE "public"."service_areas" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.213 sha256=94965de209e835d14c7d77b28efcc4630223c92e91a8a177aa4af9d957208f49
ALTER TABLE "public"."targeting_intelligence_patterns" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.214 sha256=8fb0b6f419e34f506a06f5298638cd7f59d9c60fbc48ee89fcf973ef22dde75b
ALTER TABLE "public"."targeting_intelligence_patterns" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.215 sha256=59a94115c6ae14cb24e91cfd23b97f8b268166644472e8afd554c1ff9c72179e
ALTER TABLE "public"."workspace_ghl_users" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260615100000.controls.216 sha256=c334a3145a910bdfc39ad73ca39d296e122d7120cd19a1440f47fbf8de546ba4
ALTER TABLE "public"."workspace_ghl_users" FORCE ROW LEVEL SECURITY;

-- grants
-- dealflow:statement id=20260615100000.grants.001 sha256=a6fb159aeb3711479d77586dbf6ad9e073a9ac43907701e421a2f79e07b74535
REVOKE ALL PRIVILEGES ON TABLE "public"."activation_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.002 sha256=c022832e3fa47bf663780bfea62e72ed418da9e2da9c629a120d75a723834b84
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."activation_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.003 sha256=19228d6bee914412b6dd21f640fe89c5efc8ed0a10ff52024a1c80b1d1bfaadd
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."activation_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.004 sha256=d03f38f58eeaa750e25dd80469a8f279279af0d69b694e50bc5406bc3049d7a9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."activation_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.005 sha256=3e06ba4e1918306e0f9e0033d8dca0c063659f4ec56de7ce7fdae02459d39496
REVOKE ALL PRIVILEGES ON TABLE "public"."ad_performance" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.006 sha256=6b05f32f83996b32eeef7f9793be67dd0e5a3a81eaebeed93744345a27d002c6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ad_performance" TO "anon";

-- dealflow:statement id=20260615100000.grants.007 sha256=9cba6ff0a2c8028190e2b29c40f3fb34a1a579eb3afaeb998f2cbd46307f1ddf
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ad_performance" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.008 sha256=a74f95fad794b5027b71ca7c06ed98923829074bf9c7780b876870bc00f3c2f5
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ad_performance" TO "service_role";

-- dealflow:statement id=20260615100000.grants.009 sha256=79017456cca520c968510efdff0a2a053b41a2b1daf998b1c57c48d062c8bbec
REVOKE ALL PRIVILEGES ON TABLE "public"."agent_profiles" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.010 sha256=5d92d48a457aa0f5984bdc8ce4e37764423a617a900e71f59780704d63da8a7d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."agent_profiles" TO "service_role";

-- dealflow:statement id=20260615100000.grants.011 sha256=ed49c97bcb6a543c330dac0541eb4cbea79606d4ee0de77bd43f2fd1c6eda6e0
REVOKE ALL PRIVILEGES ON TABLE "public"."app_schema_metadata" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.012 sha256=3f92d8a016601bdea6421d9bfc37ccd50850d8a968accada374965d281762b22
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_schema_metadata" TO "service_role";

-- dealflow:statement id=20260615100000.grants.013 sha256=638e5ac095144b9687d63d18155eb3c326e3c955f9341f5d9c54d069cb0073ad
REVOKE ALL PRIVILEGES ON TABLE "public"."appointments" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.014 sha256=69ba70230ffc09f8e06b4e4f3358f0a81a38d5cc02b9e7f26ccfc9f286fda6dc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."appointments" TO "anon";

-- dealflow:statement id=20260615100000.grants.015 sha256=6b9382c6a3cf51d2857671ce0e2ab024ed0a617af4b387a9963fc076ecb76f0d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."appointments" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.016 sha256=4cbbed9f0586273021d7a7de6bbd901ee057d57876769264cfe2b8d0bb8544cc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."appointments" TO "service_role";

-- dealflow:statement id=20260615100000.grants.017 sha256=7442d3b663c94639c08dadabbf88a40db754c60313546b374bd267abbac8d0f3
REVOKE ALL PRIVILEGES ON TABLE "public"."audit_logs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.018 sha256=7aa079c9e801c81246dab5074880105694c035e10667b3edadef5097b2cd0ecc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "anon";

-- dealflow:statement id=20260615100000.grants.019 sha256=dfa405047e23628416e935ef203c44edccda8bf72b227d7fe6242645f37b9c68
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.020 sha256=a9a71887dab3696c13ad598dad83d34762a2debbdeabf05f61f910b22fb3c097
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.021 sha256=40c4e60e9c7ff9c8db007ae48272e28c6aef043f2cab4d268f06fd6bc217c3b1
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_action_audit_logs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.022 sha256=e0255e7dbe68ac2f248ada169f652bfc28c9fce083cc247f2357dbb3b29ee68d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_action_audit_logs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.023 sha256=da94a2255061326160b1f7609c80e900a3f80da27c9f074952ca927ce8e9d4ac
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_action_audit_logs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.024 sha256=fce02f3418fc165afbce4680729d81ebe90cf76b959b4cdf163f808abcbaeabb
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_action_logs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.025 sha256=dd1b0287ae322aa68545c954f282ec53428c2c6c2538fbc14b787c342db4b54c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_action_logs" TO "anon";

-- dealflow:statement id=20260615100000.grants.026 sha256=46cea32396395f6ecb3291d14aea1ac77b33ce519aaad42def70e97d4ced0438
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_action_logs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.027 sha256=8e1b9a5d95bcd0c379192ae44314c7da3181bc5a3f1ee4a234cb47befd9db027
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_action_logs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.028 sha256=88b9abff84878d3115924a6deef68e8b002374e76555b9f61d52c4f21cc9ecb3
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_actions" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.029 sha256=b0429fa97fc202906aafbd1f388ff3c62eb5cbed7bca6bc89d76b9fb750e649b
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_actions" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.030 sha256=6432d27c2e9cd78daf926c31ea4003dd6560b7d00aafe50446b127b61f8041c4
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_actions" TO "service_role";

-- dealflow:statement id=20260615100000.grants.031 sha256=6ad89708244ec64d4c356bddd498ccf3c3b1d4ee7f6f555ab9fc04c7db73572f
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_alerts" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.032 sha256=0fd212c6a158adf790810c74d9a46ed095e3c23d4ac85a9cb71ac5eaf9fb3a1c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_alerts" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.033 sha256=fefb2af1538710eaa8a60d50d93c37e1700f760faca8692174d018c213d799cc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_alerts" TO "service_role";

-- dealflow:statement id=20260615100000.grants.034 sha256=9325b6bd9f39cc81cb729d116f3de2a46b45b54541169896dbf091d70aa13e56
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_execution_locks" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.035 sha256=dd7c273fbc744e9541450776f44db44e19c48b3d1dedcda0c0101eff34e5d5bd
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_execution_locks" TO "service_role";

-- dealflow:statement id=20260615100000.grants.036 sha256=76a7f22f360e374f19c65fe8f69caa412629f8f9610f6b8db6b6b259d8ba3cf3
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_experiments" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.037 sha256=f3c1a963fe96326ff39c84babbe3acd2325b5af064dc7ffa40e6e685794aa833
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_experiments" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.038 sha256=14ca1459f112ddec5ea8c1a777346c57354b2628415764d5ce861518f9a8e4ca
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_experiments" TO "service_role";

-- dealflow:statement id=20260615100000.grants.039 sha256=e7f8615abd40644741c362d5ac607691a2373d265110a0e01cf83c5612934c5e
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_idempotency_records" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.040 sha256=d3ccef0e4df4db664d6e4cecf24fdb96a898e7ad0153d7b8631e3fce9a264e52
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_idempotency_records" TO "service_role";

-- dealflow:statement id=20260615100000.grants.041 sha256=4e9a07e664ac41e8767cd5d869851a028533486b3dc946d59bb02b340512c6f2
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_learning_memory" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.042 sha256=b741fde20d1cc73bc4782d416bde15b3835318f43118978d9f02297a653d25fe
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_learning_memory" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.043 sha256=78464dfe575da95b4577eb46b81b68e6dc52f150a892e372a6d2abf2f469de9b
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_learning_memory" TO "service_role";

-- dealflow:statement id=20260615100000.grants.044 sha256=5f6fdaff0eea2c97bcbfaf2f464df207a5abebce36f5c395b94ebf44cf38d823
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_rollbacks" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.045 sha256=4b8525584bf981d1fc1ecd460eed1179a3d78ce1a04e4e863cf06625837ad41a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_rollbacks" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.046 sha256=2103002c905aeb50fdd9756fcb019564673bf44d14c68113759257e4656877b7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_rollbacks" TO "service_role";

-- dealflow:statement id=20260615100000.grants.047 sha256=a66c9701c360965db5dd3811f47af0caf911517ea37d530c4dd7a4c6efa5bac5
REVOKE ALL PRIVILEGES ON TABLE "public"."autonomy_runs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.048 sha256=eb9f8e04cf9ce191557470359127d75cbfa9907e53609dcdda21762ae9a331d4
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_runs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.049 sha256=acf5998d331460c0edbd1637e85265368e8971091c2f8d6f3dd04f76be4d6c39
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."autonomy_runs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.050 sha256=72d22f648199889f2fcf7d4a2f94e8e9d1359850a78079daaf8095e09a3ce273
REVOKE ALL PRIVILEGES ON TABLE "public"."billing_cancellation_intents" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.051 sha256=4b919b54b0a9db1b7f395c32df3bf86b6327dfaab8423d3104169e2e2a20c2cc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_cancellation_intents" TO "anon";

-- dealflow:statement id=20260615100000.grants.052 sha256=fbd24da6d2bcb92cf3e5318209b6a8ccc134b11a4e3665296c487d3d8c5cfbaf
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_cancellation_intents" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.053 sha256=373024b0efaec670c807abc85d209773eb410cc5dcc7c02684db8174c7de8c9c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_cancellation_intents" TO "service_role";

-- dealflow:statement id=20260615100000.grants.054 sha256=ffaf23b1ad48ebb9985b22c87e709ca91f20d032d9972f6241e29f22defa7710
REVOKE ALL PRIVILEGES ON TABLE "public"."billing_subscriptions" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.055 sha256=be3397b3a59825d43d5dd16f3388fffb208ac2ff7ef336657ed28090210b050c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_subscriptions" TO "anon";

-- dealflow:statement id=20260615100000.grants.056 sha256=39dc41928429e6abce34ae4b2c37c73871bfe611d7d44760d220839e7514f79d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_subscriptions" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.057 sha256=ae29364c04d4311bba133aa49c2542a6cd99a9525a0611d33ce506cb8a7239fe
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_subscriptions" TO "service_role";

-- dealflow:statement id=20260615100000.grants.058 sha256=a23275322592e1a414829f1a2645165991d5cd27ac88994d36bbb39d0fe82036
REVOKE ALL PRIVILEGES ON TABLE "public"."business_profiles" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.059 sha256=273e7ed21f18e9f522c5a4e9f2adfe1094389c7fe412d775c5325f240b12a041
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."business_profiles" TO "anon";

-- dealflow:statement id=20260615100000.grants.060 sha256=48f5e7701942b1e29ec46cf6f77958ef08da8dde7ab4ce508295801756e228b2
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."business_profiles" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.061 sha256=88b4c8d973f68432efba0cff796a8cc5f326a9e8892b316bdf4e5f2dc55bc170
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."business_profiles" TO "service_role";

-- dealflow:statement id=20260615100000.grants.062 sha256=1c84e271b446bcc7c56209639ae5639cb996531393a5e1721f788faf839bebd9
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_action_suggestions" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.063 sha256=0ac16ff32fbb1a2b9a47b31bbcf1a3b8347fc06b1494501d84671a170a52e8cc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_action_suggestions" TO "anon";

-- dealflow:statement id=20260615100000.grants.064 sha256=01fed30702a856773768af25baa3bc8aad5c951da125e34aaaacdcb6fe86ec19
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_action_suggestions" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.065 sha256=151b6b4995f06885f0bc95660af08316364d6641b9fff7c15bc903d2bc84f97f
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_action_suggestions" TO "service_role";

-- dealflow:statement id=20260615100000.grants.066 sha256=1cefc606cd2dab42bbd84b1f0e94a47883b4cce2d2f09ba12bb17c320efd77e6
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_autonomy_settings" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.067 sha256=a84dc2862d8a8d6f3fd193c73fdc3b29c44f93f4bd67a50c5329b0bf03b87b60
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_autonomy_settings" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.068 sha256=64fbafbabdecb5a3b9b883c1397cf2be840b1cc1111e1e9402545a2ddf6c9ccb
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_autonomy_settings" TO "service_role";

-- dealflow:statement id=20260615100000.grants.069 sha256=d4d37e26011b19d9cef4af409b4e8b8d69ebba6f05c1f60a00e754a3754c646b
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_draft_actions" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.070 sha256=8fe9e8c7f331a41d32ce77dabd814057b2e78fa03408b93357f3a82861806009
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_draft_actions" TO "anon";

-- dealflow:statement id=20260615100000.grants.071 sha256=d9b70c63e721267bd53e4b578a8d789f9686263d91544c0d2927bd1ddfba4af2
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_draft_actions" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.072 sha256=1611a8d394fc28cc900b2c53e7989f8ce74951581f34f27c979933264422ba27
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_draft_actions" TO "service_role";

-- dealflow:statement id=20260615100000.grants.073 sha256=e89ca67776d1ccf80c14d3374e1b25385a6c0f414233bed14ec99e1d0ba26c34
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_leads" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.074 sha256=6e0407cb1ac952db54e04af7cfc29cf627d9114bd1061c99950560a2c33378dc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_leads" TO "anon";

-- dealflow:statement id=20260615100000.grants.075 sha256=38dfe61decc635e9af0a9a7cb75e652462a1795eafc61581ca699e6c66fe32aa
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_leads" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.076 sha256=ce10d174f8218c22c8ddaf3e29b3e3c41e6bb5ebcd9bb8d0aec98ad04d2fd2ec
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_leads" TO "service_role";

-- dealflow:statement id=20260615100000.grants.077 sha256=bc2aaf23c7add0184a7b90808a3e944f60fe9f03e9bda140ebe3686a34d55c95
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_performance_snapshots" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.078 sha256=6bc448fc0a3b8984b3e229ee9570d60b673188522aa3117e62226a5238e33b09
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_performance_snapshots" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.079 sha256=54e9fe6baa3bb7e44391ec8e18fd7c92bd3d3b813df8c375dd4e9ec9b6c620c0
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_performance_snapshots" TO "service_role";

-- dealflow:statement id=20260615100000.grants.080 sha256=f0b950e1051351d36dcaedc879266dd05306a8a422c60487fdafc46efc24912e
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_plans" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.081 sha256=5a5f6e7de594e812eea72fd0a6654b052a2d08108b43377969ea99812ff719fc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_plans" TO "anon";

-- dealflow:statement id=20260615100000.grants.082 sha256=202a00114e7e91863902deacb4879d8915546872b4bebd0c84e42ab2e7720001
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_plans" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.083 sha256=8bd5493923ca3b158552287f8fe03bf1c8f5d6dfd0e7292ff8e68411fd60575c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_plans" TO "service_role";

-- dealflow:statement id=20260615100000.grants.084 sha256=d9557be024dfbd899013226f503f18dbfbf4cc471f99ffe3d12b2e04b40df033
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_snapshots" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.085 sha256=5d8de3aed7693fc06079dfaf6d3b38f69a1e8ab2ec5e81d1444662e9ae36e3b8
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_snapshots" TO "anon";

-- dealflow:statement id=20260615100000.grants.086 sha256=0faba24d8d06ea7a0f59cc7b7999f5485faf90bc0e983b69d010ba3aa7a5c052
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_snapshots" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.087 sha256=34d20d13b635fde1d6408db48ea333a66960279eee60bc0495b7528a0d07f296
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_snapshots" TO "service_role";

-- dealflow:statement id=20260615100000.grants.088 sha256=985a48a10340c990f32c09a40065b0ee62c685fa1b16ba101540de246ec56a49
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_sync_snapshots" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.089 sha256=1d5cd6b2c2fc6c1c562e2d58dfa90d8838254a348bf7cf5c1793e4f97788151c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_sync_snapshots" TO "anon";

-- dealflow:statement id=20260615100000.grants.090 sha256=1dad721fd5ac73d3587fa20b130ec75a9d9ad73eb372d7a324747e09857968d7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_sync_snapshots" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.091 sha256=148234c03924f9733f6f637277a2f5d06ffc0e957698f820ffcf4f2ae232b1bc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_sync_snapshots" TO "service_role";

-- dealflow:statement id=20260615100000.grants.092 sha256=cc6dd6b61672674d5de9362388c4dbc420572b93f78cd1f05598fa07741f764e
REVOKE ALL PRIVILEGES ON TABLE "public"."campaign_value_reports" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.093 sha256=ef98c20b53720fb0dc032e5ab3e9837b0e4659408086babe6fb92e3eaa0d5237
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_value_reports" TO "anon";

-- dealflow:statement id=20260615100000.grants.094 sha256=0da7d0ca83ec8262b027d7eee571263a742a34199c3458e80904df26608f97ef
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_value_reports" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.095 sha256=bdcab1d76eb99c01142642aa5ae11313146a1836f91b17c8dd59de138a9333f7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_value_reports" TO "service_role";

-- dealflow:statement id=20260615100000.grants.096 sha256=793dbff32806e4fc2278c22a6177cf08b0f706375859b107c6da7bf5538b95df
REVOKE ALL PRIVILEGES ON TABLE "public"."client_error_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.097 sha256=53f542f960fdbe9764101f95182592b93ed18ef4a0656a1785e6db5b6acce09e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_error_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.098 sha256=10f52df6e0367a9ca38e8f59903758879ddc7621ff365097d6c11ba93074972f
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_error_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.099 sha256=ac21d91950cdbeb38a66b7ca6c3be47d311d0f11bf0507013b5643a7a561fb3e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_error_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.100 sha256=1459f4d84e5e788706daa5cb532aa9d449184dac01126c7f9630a366957df1c9
REVOKE ALL PRIVILEGES ON TABLE "public"."creative_assets" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.101 sha256=c37eb37e22f6112339abbe42c30752bf3100b63705ef64d79f11b6d50a8eb289
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."creative_assets" TO "anon";

-- dealflow:statement id=20260615100000.grants.102 sha256=ec40621d675367d1e64a402e2f1c7b8151be089f2497343e5e2c911d796189e1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."creative_assets" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.103 sha256=34ae99709cc1be45bbda746f579d1699ca737b2a82224868098dbdcd96f970c0
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."creative_assets" TO "service_role";

-- dealflow:statement id=20260615100000.grants.104 sha256=5463f2f32504610189994368e292b78b8a4229826195496a2323a4a3fa005221
REVOKE ALL PRIVILEGES ON TABLE "public"."customer_autonomy_settings" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.105 sha256=096f72010a90c79acc851c41980719d79c4d41e4a7bff88ec247d66d3aacb115
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_autonomy_settings" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.106 sha256=a1f19004b0d629b1362004148d094664c153fb4adc692021e229b6fe9b9a7a3c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_autonomy_settings" TO "service_role";

-- dealflow:statement id=20260615100000.grants.107 sha256=75692c03322dc3b0d1816052b7b1025fef7a005b380cbc26c6c3a8b64a08e16f
REVOKE ALL PRIVILEGES ON TABLE "public"."customer_success_checklists" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.108 sha256=af473cae3b2e34d503900b4dfe3e2ff1f177d79eccfe240ec3aa10f634c69c8b
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_success_checklists" TO "anon";

-- dealflow:statement id=20260615100000.grants.109 sha256=61594eba31e1343ec5b73bc88572f70103580f7861e8e06ac661423498cb7eb9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_success_checklists" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.110 sha256=a6d207121a24fef35aaa5c198db120ee772ca56732b5b26c7b216450c0f7ff69
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_success_checklists" TO "service_role";

-- dealflow:statement id=20260615100000.grants.111 sha256=e0a4dd2847fb1199c6d977399f4101d5d2d558b766ac1f9c3a0a753717f7a6af
REVOKE ALL PRIVILEGES ON TABLE "public"."data_imports" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.112 sha256=3a49c4516d16af941ee22de82a3cb86d29d235fc4afb694b3c45eea7ec115382
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."data_imports" TO "anon";

-- dealflow:statement id=20260615100000.grants.113 sha256=2a12c60770fa84a04c0bee21edd4d108220586149dde97d37d39753b3d025aa3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."data_imports" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.114 sha256=9b93bc2bf4be97acc79a420a2b9ec1b3eff5bac5bafd3253ffe6e8ff8fbd18cc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."data_imports" TO "service_role";

-- dealflow:statement id=20260615100000.grants.115 sha256=6a2f4929bc4474b9180848955cf224076b9963ae9ebf68e2fe8d2f48117690fd
REVOKE ALL PRIVILEGES ON TABLE "public"."deals" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.116 sha256=501fd7290357b3ba5ed5274d8b4ef552eb21a04ab4521277a6898547c4c331a9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deals" TO "anon";

-- dealflow:statement id=20260615100000.grants.117 sha256=f764256bb9e03f42d9046618adc73fe3b9fef70463569ee15533554eb6f64cd9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deals" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.118 sha256=7f2d339498369830b01b588b155af098d0b82733e3bacc56e12447d942ba3f97
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deals" TO "service_role";

-- dealflow:statement id=20260615100000.grants.119 sha256=85c697121d4bc5da3964854331bb0013a289bff07870a8c12bef405e8fec0ccf
REVOKE ALL PRIVILEGES ON TABLE "public"."generated_artifacts" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.120 sha256=42161780226b7225fc6fc7adf9b6185f66793d01bb9b5d8034e592ee5df3eec6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."generated_artifacts" TO "anon";

-- dealflow:statement id=20260615100000.grants.121 sha256=d757bd906033086d71bb3bb6ccf7b5244dae2023bde9ec3b461ac52b61aee92c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."generated_artifacts" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.122 sha256=4b79293640503ec315825bf48ec973b60f2fd99c17d16f161afb153689cacf00
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."generated_artifacts" TO "service_role";

-- dealflow:statement id=20260615100000.grants.123 sha256=1791235639f70f507fbc86b452a188c503a9a263a777b533e9965adb1f3d4735
REVOKE ALL PRIVILEGES ON TABLE "public"."ghl_provisioning_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.124 sha256=d481536e08782b0400faee7e038fd2c059572f0237ae47d1ad5bd508ed011045
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.125 sha256=cd11c3a3243cbc2e5ddd8c3fd5e591231b1385f53fa73f40583306a3c78136c4
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.126 sha256=3dd6f0181f7779d820edc270ffd228ceef905bbf7c3a7897251b88257d2f71fa
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.127 sha256=ab953ed30624a017f5b0d2fa6075707993fa042a9417f85bb9b52034d9ca02c2
REVOKE ALL PRIVILEGES ON TABLE "public"."ghl_provisioning_jobs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.128 sha256=8e1541c811c05be87e1282a47fc62ef26c4f3454d982b7d3ad5642821f0d4635
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_jobs" TO "anon";

-- dealflow:statement id=20260615100000.grants.129 sha256=47c00b22e2ada7bd43bd1efeae3ff31240ef119596b729866b4fbaebca0b14d2
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_jobs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.130 sha256=0057540622b7a55c3d7b938898930f4122a6253f7f68bac55e3633da3c2d3dc8
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ghl_provisioning_jobs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.131 sha256=2845d7a247825e8d42c085792dc203f0bad3f34de7df5bc48f0ae48d3b226f61
REVOKE ALL PRIVILEGES ON TABLE "public"."health_scores" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.132 sha256=a674b2de15394a7f7a2f5acba026bbfe86409660f626639a6cd60ee830a69633
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_scores" TO "anon";

-- dealflow:statement id=20260615100000.grants.133 sha256=517bf2841f3262728f1c21e9d68cc04349eeec43c003d6b90b4fa0b13cc08832
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_scores" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.134 sha256=cf332a82b586dc4f7a7ac2f220305095868d15021f0a083d5786433dc727fd75
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_scores" TO "service_role";

-- dealflow:statement id=20260615100000.grants.135 sha256=f9200c10c12d70ae34d23485730408d695f4466181372fbbd1b1d75c37484e76
REVOKE ALL PRIVILEGES ON TABLE "public"."insights" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.136 sha256=cc8ada2f9a32e6728e0469f2dd2c6006b24944cfa2397629b2dd8db056a00b80
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."insights" TO "anon";

-- dealflow:statement id=20260615100000.grants.137 sha256=0291b443a8b2e372d2986645666f257909221a12c0447abce8e569868c421423
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."insights" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.138 sha256=8226c60bb7d0c37c1340ac4422de2ad5498fab0140038afa28bb712202e9b7b8
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."insights" TO "service_role";

-- dealflow:statement id=20260615100000.grants.139 sha256=6b153c567cbc226af33adb0717698596c6cb00ce500b822e94a746bb78e88e7e
REVOKE ALL PRIVILEGES ON TABLE "public"."integration_oauth_states" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.140 sha256=fa862fce36851045d39a7fc3271fc327ff13a0487cb05bcb33a44710b7d33638
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."integration_oauth_states" TO "anon";

-- dealflow:statement id=20260615100000.grants.141 sha256=eeb72c4b3600e75a214e3b5a80aa2af2193b0962520f893bbb88a40c8f795bd9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."integration_oauth_states" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.142 sha256=8aacd787dda8e42ba08dd1154011558085e9bb9bf5bfbbd1701f53e00cafcaee
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."integration_oauth_states" TO "service_role";

-- dealflow:statement id=20260615100000.grants.143 sha256=c1d5bcb5af42d28dbaa9b4fdad6c14708f9a37fc7d8a0b239967a8dea12bc3f3
REVOKE ALL PRIVILEGES ON TABLE "public"."internal_notes" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.144 sha256=c31e249769a3bbc980e2d4728523a4a9f2d76faf588eea46e5c37e2b088958fe
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."internal_notes" TO "anon";

-- dealflow:statement id=20260615100000.grants.145 sha256=e1f7421a47f95228813c762757632e5fe077aaecab5acef1c1477cd484a54e35
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."internal_notes" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.146 sha256=2614e7dbc843ee6300dbb60e36f8afefa99b46081f85ec39bb27529b94939899
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."internal_notes" TO "service_role";

-- dealflow:statement id=20260615100000.grants.147 sha256=abc99eb694361d0cb91c064727a14761ebd64f02dd9cdd1356d6cd937fd8c647
REVOKE ALL PRIVILEGES ON TABLE "public"."jobs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.148 sha256=cdfcc3d9c0be9310fb72af71be7f6a9b66f57d3370d29d11ee543c8e07f18de1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobs" TO "anon";

-- dealflow:statement id=20260615100000.grants.149 sha256=4add2ca635cb5c1f3146b2cb4948013879680f7b4e050af3e793faa434f59bba
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.150 sha256=b6a9d6a8f4e97e1637f32f20e82661439428322cf6ec4a967a8cfd7245b96555
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.151 sha256=629d84dbb5a477e8712e6ac8272768c82df16a4d301e4fe1e98b21fe02575e48
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_assignments" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.152 sha256=0d817d103bb8ac9d3d10051022e67efa5d8b9c64c71cc6b28de31845eeac510e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_assignments" TO "service_role";

-- dealflow:statement id=20260615100000.grants.153 sha256=ff19f38b4e15f02ac0885522d39b8d1aab47e56f8559e45560c03b18f295764a
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_billing_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.154 sha256=da3188d2cd6f1de4a179fd3288b01815abc3c38a148e9b1967304de7fa6729bf
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_billing_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.155 sha256=d2dfd1c2e8dbca9d8950fad794f7aaa6d5ef5795f653994bc662de808e44fbd7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_billing_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.156 sha256=5c763b4de28652742c5811ce77fae77689e11b571ab369762bb1aa5009df3fa5
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_billing_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.157 sha256=7600219e5753a8675743958b0b1db827ae69c93db052a7eebdb9142535f630d8
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_capture_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.158 sha256=03b6238d068eb59d828d6f9e53365c3aab05f5dcca862567bcee4f388eceafd0
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_capture_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.159 sha256=eb6aad74687174acbe28a9cc72ff30f0aa63d4d1335fac7e70f14334856b22c0
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_capture_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.160 sha256=457cc960ac61e74608de2d156698186d332822160ee49ee6a79f21aa318b1a91
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_capture_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.161 sha256=fd43c3dc8a1b43a113478b330dafc86811b731c2933dc19696cb90d00de3119d
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_crm_sync_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.162 sha256=47d337e95b9dce8d1f9132084ded62514b2fd1f1766c95c3aa16575899968511
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_crm_sync_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.163 sha256=335d97b2c94fe29ed6181f11f04178c540b32d8cb17205aaf8804c5cf4c2c586
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_crm_sync_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.164 sha256=8fc1cdca48515a42fcf30695b702db881945637750527fdaf3046fe072f83b1c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_crm_sync_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.165 sha256=171702a580c7161e4d1487963d32e9474039090fbd7475cf94b83cccdb6522b9
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_delivery_attempts" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.166 sha256=4b1756e8bb8d90dc1f368a2ce56cedf46ecbc70893b1a0addfd374efd13513ec
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_delivery_attempts" TO "anon";

-- dealflow:statement id=20260615100000.grants.167 sha256=1ffd831334137cbc5edd56ed2a216696981b8861dc059a2be4fbe4f6ec906eb3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_delivery_attempts" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.168 sha256=be0651b322aa6b005f6b94cc7a6e4ac9ce85c6cd1b5bf2a4128576df925bc7df
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_delivery_attempts" TO "service_role";

-- dealflow:statement id=20260615100000.grants.169 sha256=79212520e4658b3b30204054fba4810e99623172c61e3fe9deaf6dd4efcd3b29
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_form_templates" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.170 sha256=775b29f7edf1f8e7d628ef681893a7364d339108a72f23ef94693051b9918252
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_form_templates" TO "anon";

-- dealflow:statement id=20260615100000.grants.171 sha256=514d8bd73bfa2e1dee0bda7215d6791925668f762b609815e426d825b9a8316e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_form_templates" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.172 sha256=8e2ab3d6befdfebdcd0abc990ce96e2c890f4ef07524a986cbb602d8375a069a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_form_templates" TO "service_role";

-- dealflow:statement id=20260615100000.grants.173 sha256=d601888c03afb8402521894cee7e6be990029cf8d90cfb36ca619fae77253e03
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_messages" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.174 sha256=c8e1b3673dc58bdd4bfdb4a568586574bfc8bd6444583d8e77bcff7d3530bd4b
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_messages" TO "anon";

-- dealflow:statement id=20260615100000.grants.175 sha256=d882cd281377b68a0146a620eced59bb3ade606b3969d95c1cc979efd299913c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_messages" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.176 sha256=7faacb73e760429580c5d0dc709c58a3b5aa4c4693976c6e2fed0f458cb4ef04
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_messages" TO "service_role";

-- dealflow:statement id=20260615100000.grants.177 sha256=e46f7038890431ceb2872b38afebd92892a5095807b82393d26966bd27791f41
REVOKE ALL PRIVILEGES ON TABLE "public"."lead_notifications" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.178 sha256=291d8ec29ac8cdb72ca11ac1f81b15564329443b27846d778ed7461003d06ddf
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lead_notifications" TO "service_role";

-- dealflow:statement id=20260615100000.grants.179 sha256=8f4d555691cb75e33dd57eddde1c1a87cb89f1f4d4fa1020da9ca4353206d806
REVOKE ALL PRIVILEGES ON TABLE "public"."leads" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.180 sha256=0c59ef23c12dc8b17733216a19a2fb2643c7ef0bcb05c74324baf1c30237d3c7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "anon";

-- dealflow:statement id=20260615100000.grants.181 sha256=2e681916f03b9985869d6be113a26c6e82d1d330fae2e64fbe8413a3a9e00e90
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.182 sha256=362bba93b54b3587d47e96de1b2a92f5f7d211eaf6e17f35cd568547323812dd
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "service_role";

-- dealflow:statement id=20260615100000.grants.183 sha256=79df71cba5c0f999a549b3844e1b7cd295f7d88ab73067e6fde7a25e4b3d26d4
REVOKE ALL PRIVILEGES ON TABLE "public"."marketing_accounts" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.184 sha256=971e1dc2efd6ae897333128c6adb16695152e9f7554da0b22bd94003b27f3c0a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."marketing_accounts" TO "anon";

-- dealflow:statement id=20260615100000.grants.185 sha256=668e11862f21ed07dc7ec15480c272304f2deb5e2497ddab43e0e4e4837034ac
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."marketing_accounts" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.186 sha256=9d6ed3f7e07fe9bb572538e05edbd9fa695bcc462a6f01ef3542a3d6f1532c1d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."marketing_accounts" TO "service_role";

-- dealflow:statement id=20260615100000.grants.187 sha256=786fb29e9a6175c52a1cc7986a39980c475b8dc8688763b980e133ede586e060
REVOKE ALL PRIVILEGES ON TABLE "public"."markets" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.188 sha256=be211fc7aff9597d6068f7ab72d65aa1063bd758550894b408f11ccf833c789d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."markets" TO "anon";

-- dealflow:statement id=20260615100000.grants.189 sha256=eafec12e5647bde21b80a0d133843c1ddc59d614d4620c4052c5b88f759cab92
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."markets" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.190 sha256=366b15ac7db82bb461b7f7cd50a555a221027d5e5056fb71a9e0906893620805
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."markets" TO "service_role";

-- dealflow:statement id=20260615100000.grants.191 sha256=4f35f1df6d4764cd6e7ff66bfccfe43f421954a35024facd3eaaea8c6bc27dfd
REVOKE ALL PRIVILEGES ON TABLE "public"."meta_launch_locks" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.192 sha256=f4ee5b6e62fc6966670608ace63e5fddfca7650ed140937c4f6332f6e8dc85c7
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meta_launch_locks" TO "anon";

-- dealflow:statement id=20260615100000.grants.193 sha256=c5ffdb8b249723ecd118fa38819ed7b99d9a52822d821e0720946ffdab181abe
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meta_launch_locks" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.194 sha256=76b2046c19379adda88bb1d08a68d0c92b9ca8934863a2f27711f76380d6d0c2
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meta_launch_locks" TO "service_role";

-- dealflow:statement id=20260615100000.grants.195 sha256=6a1e2c4b3aed54cdc7fbfc1fd7596f1a33bd7a3e31378d281ca34a6918dbafdc
REVOKE ALL PRIVILEGES ON TABLE "public"."organization_admin_states" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.196 sha256=137ae837f819a228943f88ae7703b551e8f816a00c70eb7dca1148c7046b70be
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_admin_states" TO "anon";

-- dealflow:statement id=20260615100000.grants.197 sha256=4dd33011c874e66a327dd658cf33561f16179af0012b0f7917bfa01c26ea21ea
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_admin_states" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.198 sha256=b16bfa34ab90708dcdbe41adb1eb2ae73678eb5da892ca98f301c3ee360bb588
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_admin_states" TO "service_role";

-- dealflow:statement id=20260615100000.grants.199 sha256=3882a05fa8dea23ea9d06019831ca12eda5ff30c539ee1a57da90edda87a0d86
REVOKE ALL PRIVILEGES ON TABLE "public"."organization_autonomy_settings" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.200 sha256=e72d8c6761e1de64b8c64a29fef5ab11f9d84590e1e97c4ead694f528c124a67
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_autonomy_settings" TO "anon";

-- dealflow:statement id=20260615100000.grants.201 sha256=d32066ffbafc173882994fda39eb69511e78e9c26b9c37652522041aa5215d59
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_autonomy_settings" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.202 sha256=df336822df3130a2133e7b25b961b5d890c634efe0b0dada6c24b728cb932de6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_autonomy_settings" TO "service_role";

-- dealflow:statement id=20260615100000.grants.203 sha256=04ca44956f2c06a279b1ba4308e49f67013d10f050874790f37f6ba6f0efd894
REVOKE ALL PRIVILEGES ON TABLE "public"."organization_memberships" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.204 sha256=d15af67d64b045062fb4a92baca43bfa42b023afdf2f1dcadfec8fce1afd938d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_memberships" TO "anon";

-- dealflow:statement id=20260615100000.grants.205 sha256=098669175ce3f955164d030474105a3fc008860cf483b3ce68c5946a4ff9abff
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_memberships" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.206 sha256=91cd6217086fee175ad682db755c75f0c0b638d83e5d536a21054bec93339115
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organization_memberships" TO "service_role";

-- dealflow:statement id=20260615100000.grants.207 sha256=fc3f92b9ae35197d028181984950a385ae0ee94bed32cd04f85db7e9636e6230
REVOKE ALL PRIVILEGES ON TABLE "public"."organizations" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.208 sha256=531d2fad78520ca03165a304405fe9a8ec41c95895c57f4ef22a3f2eab3d159f
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "anon";

-- dealflow:statement id=20260615100000.grants.209 sha256=0fadebe8d1b84cb34638e9104f1cab01b9f518676bff0473a779935376737c03
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.210 sha256=804408ccf8b55ea58f11610c8d40988969b06e1bc5c672afb08e365376d35f32
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "service_role";

-- dealflow:statement id=20260615100000.grants.211 sha256=6e13ccc9c7e3ca75fb932703d56227ef34c3bda24a928d11dc8b1454f29c42d9
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_accounts" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.212 sha256=c5be20f6838ac82e6cea057f172e8c1705c2fec83751bf4f53d4303f3237daf4
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_accounts" TO "anon";

-- dealflow:statement id=20260615100000.grants.213 sha256=2a711dcb02acee7ee3cff29334655b57f0676746ef02813e840e187781c7a9b9
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_accounts" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.214 sha256=852af7002a9b545f3535bd830558ec43fd56b689309579363182be3b019614c1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_accounts" TO "service_role";

-- dealflow:statement id=20260615100000.grants.215 sha256=646ee52eff3660c4a217424aab595f928bdf3ca3b9db6b25ec174dc46dcfbc52
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_audit_logs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.216 sha256=ef164e9841f386cb69f4e3a4fa4f7e8d03bf3b8a6c5dfdca5630407ac4f4f8fe
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_audit_logs" TO "anon";

-- dealflow:statement id=20260615100000.grants.217 sha256=412a17a6c956e3a566a16f0fb8fdaa2c2bb97050f29d5ef0e0a20c230ebc9919
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_audit_logs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.218 sha256=60344480ceaa053db206e66dbd3f1724b3fa238e855a408a5ec44be2b0856334
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_audit_logs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.219 sha256=1d112d68beeebfbf5058bd8ab17707dd40a0df45c5b60b18a6d72db4a0fa0943
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_billing_attribution" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.220 sha256=b5a588dc7fd9882ecebdfe33ef6f654daa9c3308c9562090cc13cac17729c64a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_billing_attribution" TO "anon";

-- dealflow:statement id=20260615100000.grants.221 sha256=8c6c5a5dc0e67b485213f304268458792a19f1ca97e383943b8bc0e14dda8511
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_billing_attribution" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.222 sha256=9e6b0acf33adce1f897f6efec6970af87b85b9bcbcb2476fa0d903154b7f6472
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_billing_attribution" TO "service_role";

-- dealflow:statement id=20260615100000.grants.223 sha256=d4efedac1037c695f1b2bf5b93ffe0bb9d26cc0f7cb7585a92fa1afa928d72a8
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_branding" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.224 sha256=25ec82dc26efbfda74bed7d2533a9e7bc304cd5f586224ff8c6578ed908858c3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_branding" TO "anon";

-- dealflow:statement id=20260615100000.grants.225 sha256=8ab7a0d9d72eff6f2bc49216992e24d101d8429ec330d35e57ddf5fe275dfb41
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_branding" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.226 sha256=20ff6f6eef440a06eddb46a23be7ded2b08e6df8f539c340b7d98b4f8562188a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_branding" TO "service_role";

-- dealflow:statement id=20260615100000.grants.227 sha256=c46b8f867751c3a5f29553f4e47e1bd1d0a3d0a5e50d9e356d321c6e3ca08d8e
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_commission_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.228 sha256=11d7d3e307a48c338aa3a798a7dad17f4fdc6ed89e6e0ad815c6190313364da3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_commission_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.229 sha256=810cf5a91b7a7c45b2c09469c57fe6095322c30a5a23e466010a12f1600d8d70
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_commission_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.230 sha256=80749851a8d134a7185f3eaeabf5fe6cfe111e5b9185e9982f7e0b4064104329
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_commission_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.231 sha256=d35942c35b5ac5adc6340fc3b334ee6c229e8bcfa74b11946e12878e0061b232
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_configs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.232 sha256=da7366fb6d0dbbdb94f91dc34606139c0f63bb1a92c16e1874682aa90942fd91
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_configs" TO "anon";

-- dealflow:statement id=20260615100000.grants.233 sha256=065e404b7d79ec2e5032e9a5b5b972dc2f867f37ebfe54e62ae96e0844c510bb
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_configs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.234 sha256=80ece9880e799203464e1c26f5db377c983e62db77e7150a57a6b293a5499881
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_configs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.235 sha256=b2b332deb5ff603945ab50b9ee89aa30b89938d178349117f81ac2933320addf
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_domains" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.236 sha256=c81db505d4afef71a87f5a7ecc1614a9a956a1e68a2ac858224c62387837d68e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_domains" TO "anon";

-- dealflow:statement id=20260615100000.grants.237 sha256=980dbda812809b200409ef92249a9b09ec20e6ef56870b85113333b8847d101a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_domains" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.238 sha256=403fae1ba7a7a36aeb7783e5f57b2e32c7378269836a378e51c5d079f6691bf3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_domains" TO "service_role";

-- dealflow:statement id=20260615100000.grants.239 sha256=8b8287a63b5fd0c4a288c04d7bc99fea982c8ce78ac4e0046d448c370a36acec
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_feature_flags" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.240 sha256=de4779d95014543d2fbac20bc5bd2440601b56bb2f0128954c93d963b98142a6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_feature_flags" TO "anon";

-- dealflow:statement id=20260615100000.grants.241 sha256=5f3d1ef960eab8c6be845a63de051a5a4924892f28ecf88be371bdff64b8c525
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_feature_flags" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.242 sha256=b41a42f261a181d8dd94be9cd942a3c8fd3afab04d11ea759fd8258f20c8e208
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_feature_flags" TO "service_role";

-- dealflow:statement id=20260615100000.grants.243 sha256=fb50329cc07c4b3d103ffca067baf7e1044e33fede7b726a2dd07b415a53a681
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_ghl_config" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.244 sha256=cd8e464b6ee4e44d7071cc12bdd13714898262cf6381a24546660e403a1f795b
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_config" TO "anon";

-- dealflow:statement id=20260615100000.grants.245 sha256=03f9a4b1f36bfb270941d197bffd63612e81a1264c4bf244f783c24040fbb7a6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_config" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.246 sha256=609d54434469bfb7fb4be3c85014370a1a2fe215827329508567224b5fbad4fc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_config" TO "service_role";

-- dealflow:statement id=20260615100000.grants.247 sha256=a2ba4f2be3df2e27eab58699adb469e728c796e555ce8ff99145336e5f674579
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_ghl_template_config" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.248 sha256=fe58e2059356024cc0c2b4461b496786a92e469e4a27f207b0cdeceac2290573
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_template_config" TO "anon";

-- dealflow:statement id=20260615100000.grants.249 sha256=cb90bbb7af7eb8d14946a3d671e2ea3e02514990caff499e1e8b290ace6aa937
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_template_config" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.250 sha256=9d989be50baa0e7cde77447e059b86f6e387c83c397eb224d923c46f92e0db32
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_template_config" TO "service_role";

-- dealflow:statement id=20260615100000.grants.251 sha256=e6a5f02e0482227d72b045c54e21ecd2c4deb545e2160e26e7887f7bcc06b471
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_ghl_workflow_config" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.252 sha256=320222ee52f34f9f4a88b284152f8386e8f0b5c39eebd646c2e671f565b97744
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_workflow_config" TO "anon";

-- dealflow:statement id=20260615100000.grants.253 sha256=5ff499116d3433e9b51a0ff864e2fd369793ee982706ad0df914d6d4bc5bcf70
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_workflow_config" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.254 sha256=d81e8d601fb03bc990349bf90d4e7ca8d1a15c1e2e393666d5664db748e4c187
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_ghl_workflow_config" TO "service_role";

-- dealflow:statement id=20260615100000.grants.255 sha256=b0618bf8b68e623c5bbab79b5daa8427355107d70993c41fd444dc1758cda923
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_invites" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.256 sha256=8d9d7c8409a2d93b1686e1c8965650e0e477b746888f91ae4ba7e842d23f2e64
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_invites" TO "anon";

-- dealflow:statement id=20260615100000.grants.257 sha256=0a4aac799b500bd1b0477026a37abc7e2192a72363242a6634d6ff55db1af96f
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_invites" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.258 sha256=829c3c615d7241f3e8f7cdb13bea31e91dc882e3ef187d6ab4305b33c083869e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_invites" TO "service_role";

-- dealflow:statement id=20260615100000.grants.259 sha256=d6f8af237627d38e35af330db8b182ca20c15444e3fbcc1a327f00651df9336b
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_memberships" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.260 sha256=89eac20a30850d017245dcb1d4853c8920d74ba5349ef60880742348b76a51e1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_memberships" TO "anon";

-- dealflow:statement id=20260615100000.grants.261 sha256=39499b57e0034105282b8bcf2ad4bdff93cae5acc12f517d9d209e492bd2fb4a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_memberships" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.262 sha256=3fdaed667b3079c3efcc069666c466e8e080d5e92a137fa8b0b94c67d8c06b28
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_memberships" TO "service_role";

-- dealflow:statement id=20260615100000.grants.263 sha256=c1044455caf4bed855d6b1af9888f8ba225a116f799a849af91356e3cbdb8c5e
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_support_settings" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.264 sha256=b043d7a69eb06d12320681fb58b5d923d81ed11da1913d746648f0af393f5f31
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_support_settings" TO "anon";

-- dealflow:statement id=20260615100000.grants.265 sha256=51f310ce700090abafa9bb571033070aeb81c17d4e3ac4619141a88a23010041
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_support_settings" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.266 sha256=773c59e59253867211038d8b9c478eb4f29fc45b7dcd6d93553288e147efd221
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_support_settings" TO "service_role";

-- dealflow:statement id=20260615100000.grants.267 sha256=3755f4b3d4f4ccbbee1867b7de2e6b1a8dc7dc3aaa16ea6218193f9b7e1b8308
REVOKE ALL PRIVILEGES ON TABLE "public"."partner_vertical_configs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.268 sha256=29bf4645c0eae039aa79972393a6cb9b3840ef2c2e8edc5e08d31749ac17c832
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_vertical_configs" TO "anon";

-- dealflow:statement id=20260615100000.grants.269 sha256=04db93905c2d69a943bc52f365fd84aa3d42f8e5f63f8298737a7b475a4ba05e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_vertical_configs" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.270 sha256=1fd141611c917baef8b1beebe7982ea52b5f6f2d0e060c5fe0d7149b85c1c588
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partner_vertical_configs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.271 sha256=2673a9848b18e0d49807ab942816aebdbc3245c4899dc40f7d0703dbbf97d140
REVOKE ALL PRIVILEGES ON TABLE "public"."partners" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.272 sha256=243abacdf204105c21c3638a571e7ce5efd6bf28689532b12ecbce8514907d41
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partners" TO "anon";

-- dealflow:statement id=20260615100000.grants.273 sha256=ebf2301019d55d12a5d591ac15e8dbbd8e4a822a048e6f796dc150aabef31126
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partners" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.274 sha256=2ec8582f5bf81a93b4c7afc6ad356cb170cbe09f18a399e7a2d8af1d03d8d77a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."partners" TO "service_role";

-- dealflow:statement id=20260615100000.grants.275 sha256=82d240bba8fd79f97bcb465d87f4c98cc81fa767eaca1512bbde086b4df234ba
REVOKE ALL PRIVILEGES ON TABLE "public"."performance_tracking" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.276 sha256=f89d2d340642ed416ce27cf85607641ee21345445d5431f3daab02d06d51be68
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."performance_tracking" TO "anon";

-- dealflow:statement id=20260615100000.grants.277 sha256=48d80c2c790e985d1fe88e0d44fc8513f5c1030019b4592d64a389dfcf25286d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."performance_tracking" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.278 sha256=55277980ccc9d446c37c6e9944208193f1cff3122b900caffd9f19b5571312df
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."performance_tracking" TO "service_role";

-- dealflow:statement id=20260615100000.grants.279 sha256=b960f012406b81eddb609ccb3789b48a5ce8655b555e00ea901f2e15cb37ecf8
REVOKE ALL PRIVILEGES ON TABLE "public"."provider_usage_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.280 sha256=1438db6b322016f52ec77b059f4707b67e923df367398016605a695b6749a8b2
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.281 sha256=f963aa0f5bd28919e7fe184e58e55cde9830d2b325e9eaa8beaca9ee6514c2a8
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.282 sha256=73bbf69e699a31519af807caafd893cf0927e197d85b1e0a127e5c7a64dd18b0
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.283 sha256=2ad4aa85d695e3d9310df0df0f05bb17952b75f101e5d50489861a3db07bdc5b
REVOKE ALL PRIVILEGES ON TABLE "public"."provider_usage_limits" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.284 sha256=154565951aac969393de5debeb70135e4407a61ee78ad5a085f1d5754b7e9033
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_limits" TO "anon";

-- dealflow:statement id=20260615100000.grants.285 sha256=77e0c3f3dac389bc17f8015babd7c8ac5d4d017aabf32d51c9af52b2689ebebc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_limits" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.286 sha256=1993388d51b3d64fd6ca8e98b3c6e639733546e04a5f406513180863a139a5c6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."provider_usage_limits" TO "service_role";

-- dealflow:statement id=20260615100000.grants.287 sha256=bdbb87718020aea8608e64b15a7e86826ff53de764cd6fdabfee5ccd89ea0e1c
REVOKE ALL PRIVILEGES ON TABLE "public"."rate_limit_buckets" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.288 sha256=e7e63ec3cdb8db29b34d66e1d230fc0a9177f781cb505920590afbafa0c4a016
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rate_limit_buckets" TO "service_role";

-- dealflow:statement id=20260615100000.grants.289 sha256=4f4493ef4a5cd8d439da88590309630cabe164862f5311495d88786821d3c778
REVOKE ALL PRIVILEGES ON TABLE "public"."recommendations" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.290 sha256=dee2d8b6dff52aa2a296b4b591e019dec73fbe472afa54df2d1578fceda2e539
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recommendations" TO "anon";

-- dealflow:statement id=20260615100000.grants.291 sha256=440c64983701f5dedd38baf7af40c94de3e8880b5e2c652fb78c520884e85859
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recommendations" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.292 sha256=d4da47d01b4046bdda93b1d0d5672553687f229b4307519fb319be928ccfd47d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."recommendations" TO "service_role";

-- dealflow:statement id=20260615100000.grants.293 sha256=eca96de0f149905b64aecbe95b010994c563c7b8b7d9c05fc1ab669aed14dd06
REVOKE ALL PRIVILEGES ON TABLE "public"."scale_monitor_incidents" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.294 sha256=9dc6ea95a05af270382de215c0eb3d61385043987c9be5b64d29dd27f454523c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scale_monitor_incidents" TO "service_role";

-- dealflow:statement id=20260615100000.grants.295 sha256=a923e1a97c392d9b39f8541a290ee2c8fbf4910eb572eb6005d898c52056a992
REVOKE ALL PRIVILEGES ON TABLE "public"."scale_monitor_runs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.296 sha256=838ce8898646c55336acb8e7aecb74aa7e770db5faa99a4fbdd2ce855976f7bf
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scale_monitor_runs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.297 sha256=347efbc7296477b7b5eef784d65b60bea4041bee98b472c3392e297779bb4238
REVOKE ALL PRIVILEGES ON TABLE "public"."service_areas" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.298 sha256=0d8d2c11ff0b3a7d124dc33d158a40f36c2b8d7276d5cb477f05482b6bd51ef1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_areas" TO "anon";

-- dealflow:statement id=20260615100000.grants.299 sha256=784afb039cd6b54b178a057a72c328638856e1fee679ac6dc75165fd64f68bac
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_areas" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.300 sha256=101fc0435dec35888b86df44a7e7a64a85d7a4d5d2151e207929d4f8fc55b3e3
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_areas" TO "service_role";

-- dealflow:statement id=20260615100000.grants.301 sha256=0fb1d694f1254c6d8dfacbc7933fd28e238ce1d03cb96aa11a28cda842610e3f
REVOKE ALL PRIVILEGES ON TABLE "public"."service_types" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.302 sha256=d89620b302fe5d1df57e4227b0a270565b377fd9de92db93047215cf9458587a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_types" TO "anon";

-- dealflow:statement id=20260615100000.grants.303 sha256=c1b3b13582c4cd7c5cd525575b7733f423b752d6b2be785e8226425863c01289
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_types" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.304 sha256=8d1f87c2a868c5d11df7ce36fc29a0d500b9fb2e0f741beb3d24293c7af9cfe6
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."service_types" TO "service_role";

-- dealflow:statement id=20260615100000.grants.305 sha256=bb4a23ac8cba3a45b46eaa99572cb496c9394f85beac639fd7a1984969185a66
REVOKE ALL PRIVILEGES ON TABLE "public"."stripe_webhook_events" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.306 sha256=7d2daada9e01e6ad43e2e2f0bbd5288f99e4f87cbdfa6285d1a72d730988716d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stripe_webhook_events" TO "anon";

-- dealflow:statement id=20260615100000.grants.307 sha256=4ee13969c4817798bf7cc7638edbbb1478bff73792460161518882acd3f86633
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stripe_webhook_events" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.308 sha256=d3d8afe233cb77145d75765332a754707313a76fe0633cabf99e61a9efdf4ecc
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stripe_webhook_events" TO "service_role";

-- dealflow:statement id=20260615100000.grants.309 sha256=32bc452aab1a0144d1708b27b4526a6496aff26a3bf30cb5b0654a4554b008fb
REVOKE ALL PRIVILEGES ON TABLE "public"."system_job_logs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.310 sha256=33aeeb93f99f9dea7b508fc7001e75fcbf766e0e26cba7148d317ab52460d3b1
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."system_job_logs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.311 sha256=066e1fedb08eb42a665a0983ca2b6591a3ced63016c18cb695dc5953387583ae
REVOKE ALL PRIVILEGES ON TABLE "public"."system_jobs" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.312 sha256=f9873bdeb9a4b1592e8f44f4cdf0aec3f7c331c4c870146671f92a673081a4ec
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."system_jobs" TO "service_role";

-- dealflow:statement id=20260615100000.grants.313 sha256=7cf075a1dcaa2f86179026c99999e5f63f594a5498b794382a2af349ade6ee05
REVOKE ALL PRIVILEGES ON TABLE "public"."targeting_intelligence_patterns" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.314 sha256=b4625338cc9a06f7030577a8b47d9ff969736fe61bc8db2ab32df6b8018e3b95
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."targeting_intelligence_patterns" TO "anon";

-- dealflow:statement id=20260615100000.grants.315 sha256=3edd0375032232becc7c81cb4b1182fe88b3001d3d493a0527c430e055c37e52
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."targeting_intelligence_patterns" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.316 sha256=c7075d028dda3f7f8071369bfde4628e2601e90d0d48eb1167cbb4c68e35fe1e
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."targeting_intelligence_patterns" TO "service_role";

-- dealflow:statement id=20260615100000.grants.317 sha256=21b96dd136806e7d9aae414954fae4ad5508dd040f98db54248354fd0ff85f07
REVOKE ALL PRIVILEGES ON TABLE "public"."user_credit_ledger" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.318 sha256=4cd8c8f505927549aab9b03748842e3448a1b5b03c9375fcb0d26b827d25e98d
GRANT SELECT ON TABLE "public"."user_credit_ledger" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.319 sha256=9312e7ef3262b5baafd19ebff59f9bfff5717df2d7cd7dcf67f3464726a92299
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_credit_ledger" TO "service_role";

-- dealflow:statement id=20260615100000.grants.320 sha256=9ea24517a11053a4e9ab4eeb8d50ee5d61ba58393ab9f898dfc1210f540f2e73
REVOKE ALL PRIVILEGES ON TABLE "public"."user_credits" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.321 sha256=1332cc0b2e7b80ea4b98e598d0856581c81da9dd141d088be7b8fe3363831fcb
GRANT SELECT ON TABLE "public"."user_credits" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.322 sha256=060e7b61e52e565a4788acbb79c7e771e87098d9c9947a56e9543f8142c3ae29
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_credits" TO "service_role";

-- dealflow:statement id=20260615100000.grants.323 sha256=7d7d61d49951c8d456ab2c017ed2e775632c581540c85007542af6c4f0746cec
REVOKE ALL PRIVILEGES ON TABLE "public"."users" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.324 sha256=4154eab928e2592be46a614c46088ab442936a15bd689c36bdeefbbcaa500c08
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon";

-- dealflow:statement id=20260615100000.grants.325 sha256=23309adc9f94ba989a81b026a33c9fcb80dece5b38852a905df9bea38e486267
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.326 sha256=e4fbea811e0368892f63ddfc13b5c5d56b29f92a9a1afd56fd6c35fc6bca3e54
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";

-- dealflow:statement id=20260615100000.grants.327 sha256=c43e0a92adf74fc6e74a7bacb2be25380847eb16d5643af8f05defe925fedc86
REVOKE ALL PRIVILEGES ON TABLE "public"."workspace_ghl_mapping" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.328 sha256=404cfcdf240f1df7b0bd6aaac2712dd1e941a3f243102a383956e7acdefaf8b5
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_mapping" TO "anon";

-- dealflow:statement id=20260615100000.grants.329 sha256=d296d52df7f38ef16c8b5a23450e62b3e5d2c5ddd12f71e4275f078f986e5362
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_mapping" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.330 sha256=ff47c587fefe81abbc25b941fb3ba9f41bb9934aded323e00c6de0e19d61339d
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_mapping" TO "service_role";

-- dealflow:statement id=20260615100000.grants.331 sha256=7003acda072a89e1e3adeaa70ac1b431c19ec884d9f7c1b15e5f0d951c486c5d
REVOKE ALL PRIVILEGES ON TABLE "public"."workspace_ghl_users" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.332 sha256=7e09c8f6768337dee5991a7c9b5dfda7dcecad0b965ecdf8ff9acbd56a0d9fab
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_users" TO "anon";

-- dealflow:statement id=20260615100000.grants.333 sha256=2284595c72c1f8cee9f2175d651bc8b0c7d4110dea77b6d629c167c53b20a83a
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_users" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.334 sha256=a07127008e4bb3c4ad3964f545cbee38fb77a05bfb2c05043afe361312b82854
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_ghl_users" TO "service_role";

-- dealflow:statement id=20260615100000.grants.335 sha256=078b5bed6159bb28df0d683f9d7e32deab8af2a43353598edd22a050a9c58ad9
REVOKE ALL PRIVILEGES ON TABLE "public"."workspace_partner_attribution" FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.336 sha256=7aecac17dada5d4456b0a270b473aa44d4a97af56460773597497f21bc2c00f8
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_partner_attribution" TO "anon";

-- dealflow:statement id=20260615100000.grants.337 sha256=fcfa3cb9213336bbb93691dc99295ce40b8956a87e67ec6214a04b103a4b81ce
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_partner_attribution" TO "authenticated";

-- dealflow:statement id=20260615100000.grants.338 sha256=ad86d7243b69f2a73cabdcfb38e4a6d4db04e87ceee38798884dbf6b9098461c
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_partner_attribution" TO "service_role";

-- dealflow:statement id=20260615100000.grants.339 sha256=25828fe40fb4d0bde228e9bc8acec63242431479ba9c9730f7935ac3ef966ec9
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_billing_subscription_webhook"(p_organization_id uuid, p_user_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_price_id text, p_plan_tier text, p_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_cancel_at_period_end boolean, p_metadata jsonb, p_stripe_event_id text, p_stripe_event_created bigint) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.340 sha256=6377ca4371e367a6ec3830e7c4c0e79d14d4a014a0a3cf027ebc16175ef92c22
GRANT EXECUTE ON FUNCTION "public"."apply_billing_subscription_webhook"(p_organization_id uuid, p_user_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_price_id text, p_plan_tier text, p_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_cancel_at_period_end boolean, p_metadata jsonb, p_stripe_event_id text, p_stripe_event_created bigint) TO "service_role";

-- dealflow:statement id=20260615100000.grants.341 sha256=1242d7b10eef16ff8f59b9908496e7c43b7dba15afda64e550b748990fac1027
REVOKE ALL PRIVILEGES ON FUNCTION "public"."claim_next_system_job"(p_worker_id text, p_lease_ms integer) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.342 sha256=cc15114a5cd4453dd8d8d80f65c180e76cd92aa25ef674a7c02096e508df0754
GRANT EXECUTE ON FUNCTION "public"."claim_next_system_job"(p_worker_id text, p_lease_ms integer) TO "service_role";

-- dealflow:statement id=20260615100000.grants.343 sha256=6e99e987d95b5056837459a2d589217e69899493e19dc388367e5abd19082ed4
REVOKE ALL PRIVILEGES ON FUNCTION "public"."cleanup_expired_rate_limit_buckets"(p_older_than interval) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.344 sha256=0f0274c7e9f939be67fa34d63e03b07476ed8b5fbbbc149dca80a885bd1140f3
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_rate_limit_buckets"(p_older_than interval) TO "service_role";

-- dealflow:statement id=20260615100000.grants.345 sha256=0402e4bb4ccfd886fdc76781c2e8959ab0e346ad17ae9abe64f7dcb3ffc97459
REVOKE ALL PRIVILEGES ON FUNCTION "public"."consume_rate_limit_bucket"(p_bucket_key text, p_max_requests integer, p_window_ms integer) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.346 sha256=4bdba7c3faade438f134402cf4efaee4a8b0b17e3119091f85cd3a8519485fe5
GRANT EXECUTE ON FUNCTION "public"."consume_rate_limit_bucket"(p_bucket_key text, p_max_requests integer, p_window_ms integer) TO "service_role";

-- dealflow:statement id=20260615100000.grants.347 sha256=3e5bf88753c736a31d5c7263af6cbafaf34c967b6eb17c1b380e0aea12e91941
REVOKE ALL PRIVILEGES ON FUNCTION "public"."consume_user_credits"(p_user_id uuid, p_organization_id uuid, p_amount integer, p_reason text, p_reference_type text, p_reference_id text, p_idempotency_key text, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.348 sha256=115d1db9014159331d23f83f72d88f3001326bfa83afb81efd11eff64a7b3a5e
GRANT EXECUTE ON FUNCTION "public"."consume_user_credits"(p_user_id uuid, p_organization_id uuid, p_amount integer, p_reason text, p_reference_type text, p_reference_id text, p_idempotency_key text, p_metadata jsonb) TO "service_role";

-- dealflow:statement id=20260615100000.grants.349 sha256=7d9edacba39affa6a2589bdf61fbcb18bbe6760b6fa6b42c96713e52c6d3f297
REVOKE ALL PRIVILEGES ON FUNCTION "public"."grant_user_credits"(p_user_id uuid, p_organization_id uuid, p_amount integer, p_reason text, p_reference_type text, p_reference_id text, p_idempotency_key text, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.350 sha256=859a679a82a4a85144ad47b9d50b386ddb403563a0afd52e9b552075e4169ef0
GRANT EXECUTE ON FUNCTION "public"."grant_user_credits"(p_user_id uuid, p_organization_id uuid, p_amount integer, p_reason text, p_reference_type text, p_reference_id text, p_idempotency_key text, p_metadata jsonb) TO "service_role";

-- dealflow:statement id=20260615100000.grants.351 sha256=2ff2eef74d6e48f8a4a504e1435416bba766f57aa5974b15a6a67739f94824dd
REVOKE ALL PRIVILEGES ON FUNCTION "public"."is_current_user_org_member"(p_organization_id uuid) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.352 sha256=a21179f030a0de4e32998711ebf8d4861277053fa59394a375b434cd3ff2b4ae
GRANT EXECUTE ON FUNCTION "public"."is_current_user_org_member"(p_organization_id uuid) TO "service_role";

-- dealflow:statement id=20260615100000.grants.353 sha256=26ec8216cc478c148b5aab48b5b490b915f950a5ce4c091caa89f80c3fc701ae
REVOKE ALL PRIVILEGES ON FUNCTION "public"."is_current_user_partner_member"(p_partner_id uuid) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.354 sha256=e59ae08a8fd269681ec9a59394be598d13bfff851d60b4ab2d0290f554f57a4a
GRANT EXECUTE ON FUNCTION "public"."is_current_user_partner_member"(p_partner_id uuid) TO "authenticated";

-- dealflow:statement id=20260615100000.grants.355 sha256=205ae90500b7769cfbf67963e423495731b4eb53b57b8a98c47363cff0541864
GRANT EXECUTE ON FUNCTION "public"."is_current_user_partner_member"(p_partner_id uuid) TO "service_role";

-- dealflow:statement id=20260615100000.grants.356 sha256=a868b9b32c7d8d2c450d02d84026afb61cb1d8ac64716016f5957d624047c4d6
REVOKE ALL PRIVILEGES ON FUNCTION "public"."is_org_member"(org_id uuid) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.357 sha256=ec660406f5bbfe4bcedc0dfe14d7f57a282c926efc50979083e1e5d851cf8631
GRANT EXECUTE ON FUNCTION "public"."is_org_member"(org_id uuid) TO "service_role";

-- dealflow:statement id=20260615100000.grants.358 sha256=356cb939516a114a155d24175d9175a3d9742a1b920fc78e65d2cf032057d468
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reserve_provider_usage"(p_organization_id uuid, p_user_id uuid, p_campaign_id uuid, p_provider text, p_operation text, p_limit_count integer, p_idempotency_key text, p_estimated_cost numeric) FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.359 sha256=61e5232a07a0519779b60002e833730a12fa5186e259fd47c9afc5523a944297
GRANT EXECUTE ON FUNCTION "public"."reserve_provider_usage"(p_organization_id uuid, p_user_id uuid, p_campaign_id uuid, p_provider text, p_operation text, p_limit_count integer, p_idempotency_key text, p_estimated_cost numeric) TO "service_role";

-- dealflow:statement id=20260615100000.grants.360 sha256=33d17da60eb9add68a97986ff398412221383816552930bbf03abdc2beb05529
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_updated_at"() FROM PUBLIC, anon, authenticated, service_role;

-- dealflow:statement id=20260615100000.grants.361 sha256=29c1e7fc7ec728ed4b3f107747a848471358803be7b01d69d6b2fa30f6b19c6e
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;

-- dealflow:statement id=20260615100000.grants.362 sha256=bcffcd605dc699fbaa7b8d487816c2b7f5dc307653599a8bcb054a1d6c2b1529
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "anon";

-- dealflow:statement id=20260615100000.grants.363 sha256=430013125d670495b9db88ad9b43f45c00f603a29e5ba7a383d48b5d0fb8bcd6
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "authenticated";

-- dealflow:statement id=20260615100000.grants.364 sha256=1d1b5a61765f59afd5d5aa21cdfb44ac16f21b26634cf7af6e3de587cae1cc79
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

DO $dealflow_postcondition_20260615100000$
BEGIN
  IF NOT (to_regclass('public.ad_performance') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.appointments') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.audit_logs') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.business_profiles') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_action_suggestions') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_draft_actions') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_leads') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_snapshots') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.data_imports') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.deals') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.generated_artifacts') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_events') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_jobs') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.health_scores') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.integration_oauth_states') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.internal_notes') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.jobs') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 17 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_capture_events') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 18 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_crm_sync_events') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 19 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_delivery_attempts') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 20 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_form_templates') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 21 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.markets') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 22 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.organization_admin_states') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 23 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.performance_tracking') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 24 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.scale_monitor_runs') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 25 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.service_areas') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 26 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.targeting_intelligence_patterns') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 27 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_ghl_users') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 28 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_subscriptions'::regclass AND attname='commission_rate_snapshot' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 29 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='form_friction_level' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 30 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_form_template_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 31 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='meta_lead_form_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 32 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='funnel_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 33 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='privacy_policy_url' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 34 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='terms_url' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 35 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='sms_consent_enabled' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 36 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_delivery_destination' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 37 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='special_ad_category' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 38 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_capture_status' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 39 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_capture_ready_at' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 40 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_capture_last_error' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260615100000 postcondition 41 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='consume_user_credits')) THEN RAISE EXCEPTION '20260615100000 postcondition 42 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='is_org_member')) THEN RAISE EXCEPTION '20260615100000 postcondition 43 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='set_updated_at')) THEN RAISE EXCEPTION '20260615100000 postcondition 44 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ad_performance'::regclass AND conname='ad_performance_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 45 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='appointments_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 46 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 47 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.business_profiles'::regclass AND conname='business_profiles_organization_id_key')) THEN RAISE EXCEPTION '20260615100000 postcondition 48 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.business_profiles'::regclass AND conname='business_profiles_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 49 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 50 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 51 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_dedupe_unique')) THEN RAISE EXCEPTION '20260615100000 postcondition 52 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 53 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_snapshots'::regclass AND conname='campaign_snapshots_marketing_account_id_snapshot_date_key')) THEN RAISE EXCEPTION '20260615100000 postcondition 54 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_snapshots'::regclass AND conname='campaign_snapshots_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 55 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.data_imports'::regclass AND conname='data_imports_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 56 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.deals'::regclass AND conname='deals_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 57 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.generated_artifacts'::regclass AND conname='generated_artifacts_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 58 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_events'::regclass AND conname='ghl_provisioning_events_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 59 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_jobs'::regclass AND conname='ghl_provisioning_jobs_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 60 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.health_scores'::regclass AND conname='health_scores_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 61 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 62 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.internal_notes'::regclass AND conname='internal_notes_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 63 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 64 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_idempotency_unique')) THEN RAISE EXCEPTION '20260615100000 postcondition 65 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 66 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 67 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 68 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 69 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_unique_org_key')) THEN RAISE EXCEPTION '20260615100000 postcondition 70 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.markets'::regclass AND conname='markets_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 71 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_admin_states'::regclass AND conname='organization_admin_states_organization_id_key')) THEN RAISE EXCEPTION '20260615100000 postcondition 72 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_admin_states'::regclass AND conname='organization_admin_states_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 73 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.performance_tracking'::regclass AND conname='performance_tracking_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 74 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_runs'::regclass AND conname='scale_monitor_runs_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 75 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.service_areas'::regclass AND conname='service_areas_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 76 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.targeting_intelligence_patterns'::regclass AND conname='targeting_intelligence_patterns_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 77 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_users'::regclass AND conname='workspace_ghl_users_pkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 78 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_required_text_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 79 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 80 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_type_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 81 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_required_text_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 82 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 83 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_type_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 84 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_capture_method_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 85 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_lead_capture_goal_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 86 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_qualification_score_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 87 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_form_friction_level_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 88 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_lead_capture_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 89 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_lead_delivery_destination_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 90 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_special_ad_category_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 91 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_events'::regclass AND conname='ghl_provisioning_events_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 92 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_jobs'::regclass AND conname='ghl_provisioning_jobs_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 93 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.health_scores'::regclass AND conname='health_scores_score_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 94 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_nonce_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 95 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_origin_host_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 96 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_provider_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 97 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_return_host_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 98 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_return_to_relative')) THEN RAISE EXCEPTION '20260615100000 postcondition 99 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_state_hash_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 100 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_capture_method_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 101 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_destination_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 102 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 103 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_attempt_count_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 104 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 105 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_capture_method_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 106 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_form_friction_level_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 107 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_lead_capture_goal_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 108 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.performance_tracking'::regclass AND conname='performance_tracking_campaign_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 109 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_runs'::regclass AND conname='scale_monitor_runs_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 110 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.targeting_intelligence_patterns'::regclass AND conname='targeting_intelligence_patterns_key_not_blank')) THEN RAISE EXCEPTION '20260615100000 postcondition 111 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_users'::regclass AND conname='workspace_ghl_users_invite_status_check')) THEN RAISE EXCEPTION '20260615100000 postcondition 112 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='appointments_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 113 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='appointments_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 114 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_actor_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 115 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 116 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.business_profiles'::regclass AND conname='business_profiles_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 117 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 118 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_sync_snapshot_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 119 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_action_suggestions'::regclass AND conname='campaign_action_suggestions_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 120 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 121 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_draft_actions'::regclass AND conname='campaign_draft_actions_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 122 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_campaign_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 123 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_leads'::regclass AND conname='campaign_leads_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 124 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_snapshots'::regclass AND conname='campaign_snapshots_marketing_account_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 125 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_snapshots'::regclass AND conname='campaign_snapshots_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 126 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.data_imports'::regclass AND conname='data_imports_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 127 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.data_imports'::regclass AND conname='data_imports_uploaded_by_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 128 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.deals'::regclass AND conname='deals_appointment_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 129 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.deals'::regclass AND conname='deals_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 130 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.deals'::regclass AND conname='deals_market_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 131 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.deals'::regclass AND conname='deals_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 132 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.generated_artifacts'::regclass AND conname='generated_artifacts_generated_by_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 133 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.generated_artifacts'::regclass AND conname='generated_artifacts_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 134 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_events'::regclass AND conname='ghl_provisioning_events_job_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 135 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_events'::regclass AND conname='ghl_provisioning_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 136 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_events'::regclass AND conname='ghl_provisioning_events_workspace_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 137 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_jobs'::regclass AND conname='ghl_provisioning_jobs_partner_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 138 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_jobs'::regclass AND conname='ghl_provisioning_jobs_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 139 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.ghl_provisioning_jobs'::regclass AND conname='ghl_provisioning_jobs_workspace_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 140 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.health_scores'::regclass AND conname='health_scores_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 141 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_campaign_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 142 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 143 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_partner_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 144 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.integration_oauth_states'::regclass AND conname='integration_oauth_states_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 145 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.internal_notes'::regclass AND conname='internal_notes_author_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 146 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.internal_notes'::regclass AND conname='internal_notes_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 147 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_assigned_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 148 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 149 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 150 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_service_type_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 151 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_campaign_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 152 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_campaign_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 153 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_capture_events'::regclass AND conname='lead_capture_events_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 154 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 155 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 156 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_crm_sync_events'::regclass AND conname='lead_crm_sync_events_workspace_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 157 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_campaign_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 158 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_campaign_lead_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 159 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_delivery_attempts'::regclass AND conname='lead_delivery_attempts_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 160 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_form_templates'::regclass AND conname='lead_form_templates_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 161 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.markets'::regclass AND conname='markets_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 162 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_admin_states'::regclass AND conname='organization_admin_states_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 163 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.performance_tracking'::regclass AND conname='performance_tracking_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 164 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.performance_tracking'::regclass AND conname='performance_tracking_source_snapshot_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 165 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.performance_tracking'::regclass AND conname='performance_tracking_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 166 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.service_areas'::regclass AND conname='service_areas_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 167 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.targeting_intelligence_patterns'::regclass AND conname='targeting_intelligence_patterns_organization_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 168 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.targeting_intelligence_patterns'::regclass AND conname='targeting_intelligence_patterns_user_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 169 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_users'::regclass AND conname='workspace_ghl_users_partner_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 170 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_users'::regclass AND conname='workspace_ghl_users_workspace_id_fkey')) THEN RAISE EXCEPTION '20260615100000 postcondition 171 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.appointments_lead_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 172 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_appointments_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 173 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_appointments_org_status') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 174 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.audit_logs_actor_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 175 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_audit_logs_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 176 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_business_profiles_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 177 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_action_suggestions_campaign_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 178 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_action_suggestions_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 179 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_draft_actions_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 180 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_draft_actions_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 181 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_leads_campaign_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 182 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_leads_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 183 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_leads_qualified_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 184 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_plans_lead_capture_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 185 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_campaign_snapshots_org_date') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 186 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.data_imports_uploaded_by_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 187 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_imports_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 188 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.deals_appointment_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 189 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.deals_lead_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 190 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_deals_market') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 191 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_deals_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 192 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_deals_org_stage') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 193 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_deals_org_status') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 194 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.generated_artifacts_generated_by_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 195 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_generated_artifacts_org_type_created') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 196 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_events_job_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 197 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_events_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 198 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_events_workspace_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 199 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_jobs_idempotency_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 200 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_jobs_next_retry_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 201 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_jobs_partner_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 202 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.ghl_provisioning_jobs_workspace_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 203 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_health_scores_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 204 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.integration_oauth_states_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 205 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.integration_oauth_states_expires_at_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 206 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.integration_oauth_states_provider_nonce_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 207 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_internal_notes_org_created') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 208 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.internal_notes_author_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 209 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_jobs_org_created') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 210 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_jobs_org_status') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 211 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.jobs_assigned_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 212 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.jobs_lead_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 213 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.jobs_service_type_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 214 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_capture_events_campaign_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 215 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_capture_events_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 216 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_crm_sync_events_idempotency_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 217 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_crm_sync_events_next_retry_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 218 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_crm_sync_events_partner_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 219 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_crm_sync_events_workspace_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 220 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_delivery_attempts_lead_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 221 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_delivery_attempts_org_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 222 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_form_templates_org_goal_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 223 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.leads_assigned_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 224 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.leads_marketing_account_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 225 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.leads_service_type_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 226 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_markets_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 227 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_org_admin_states_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 228 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.organizations_owner_user_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 229 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.performance_tracking_campaign_synced_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 230 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.performance_tracking_org_synced_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 231 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.scale_monitor_runs_started_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 232 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_service_areas_org') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 233 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.targeting_intelligence_patterns_confidence_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 234 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.targeting_intelligence_patterns_org_key_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 235 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.user_credit_ledger_organization_id_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 236 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_ghl_users_location_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 237 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_ghl_users_workspace_partner_email_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260615100000 postcondition 238 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.ad_performance'::regclass AND polname='ad_performance_deny_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 239 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.agent_profiles'::regclass AND polname='agent_profiles_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 240 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.app_schema_metadata'::regclass AND polname='app_schema_metadata_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 241 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.appointments'::regclass AND polname='appointments_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 242 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.audit_logs'::regclass AND polname='audit_logs_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 243 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.billing_subscriptions'::regclass AND polname='billing_subscriptions_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 244 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.business_profiles'::regclass AND polname='business_profiles_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 245 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_action_suggestions'::regclass AND polname='campaign_action_suggestions_member_delete')) THEN RAISE EXCEPTION '20260615100000 postcondition 246 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_action_suggestions'::regclass AND polname='campaign_action_suggestions_member_insert')) THEN RAISE EXCEPTION '20260615100000 postcondition 247 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_action_suggestions'::regclass AND polname='campaign_action_suggestions_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 248 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_action_suggestions'::regclass AND polname='campaign_action_suggestions_member_update')) THEN RAISE EXCEPTION '20260615100000 postcondition 249 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_action_suggestions'::regclass AND polname='campaign_action_suggestions_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 250 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_draft_actions'::regclass AND polname='campaign_draft_actions_member_insert')) THEN RAISE EXCEPTION '20260615100000 postcondition 251 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_draft_actions'::regclass AND polname='campaign_draft_actions_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 252 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_draft_actions'::regclass AND polname='campaign_draft_actions_member_update')) THEN RAISE EXCEPTION '20260615100000 postcondition 253 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_draft_actions'::regclass AND polname='campaign_draft_actions_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 254 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_leads'::regclass AND polname='campaign_leads_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 255 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_leads'::regclass AND polname='campaign_leads_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 256 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_plans'::regclass AND polname='campaign_plans_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 257 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_snapshots'::regclass AND polname='campaign_snapshots_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 258 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.creative_assets'::regclass AND polname='creative_assets_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 259 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.data_imports'::regclass AND polname='data_imports_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 260 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.deals'::regclass AND polname='deals_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 261 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.generated_artifacts'::regclass AND polname='generated_artifacts_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 262 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.ghl_provisioning_events'::regclass AND polname='ghl_provisioning_events_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 263 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.ghl_provisioning_events'::regclass AND polname='ghl_provisioning_events_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 264 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.ghl_provisioning_jobs'::regclass AND polname='ghl_provisioning_jobs_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 265 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.ghl_provisioning_jobs'::regclass AND polname='ghl_provisioning_jobs_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 266 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.health_scores'::regclass AND polname='health_scores_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 267 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.integration_oauth_states'::regclass AND polname='integration_oauth_states_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 268 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.internal_notes'::regclass AND polname='internal_notes_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 269 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.jobs'::regclass AND polname='jobs_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 270 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_assignments'::regclass AND polname='lead_assignments_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 271 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_capture_events'::regclass AND polname='lead_capture_events_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 272 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_capture_events'::regclass AND polname='lead_capture_events_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 273 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_crm_sync_events'::regclass AND polname='lead_crm_sync_events_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 274 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_crm_sync_events'::regclass AND polname='lead_crm_sync_events_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 275 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_delivery_attempts'::regclass AND polname='lead_delivery_attempts_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 276 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_delivery_attempts'::regclass AND polname='lead_delivery_attempts_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 277 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_form_templates'::regclass AND polname='lead_form_templates_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 278 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_form_templates'::regclass AND polname='lead_form_templates_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 279 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_messages'::regclass AND polname='lead_messages_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 280 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_notifications'::regclass AND polname='lead_notifications_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 281 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.leads'::regclass AND polname='leads_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 282 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.markets'::regclass AND polname='markets_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 283 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.meta_launch_locks'::regclass AND polname='meta_launch_locks_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 284 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.organization_admin_states'::regclass AND polname='organization_admin_states_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 285 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.organization_memberships'::regclass AND polname='organization_memberships_select_member')) THEN RAISE EXCEPTION '20260615100000 postcondition 286 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.organizations'::regclass AND polname='organizations_select_member')) THEN RAISE EXCEPTION '20260615100000 postcondition 287 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.organizations'::regclass AND polname='organizations_update_owner')) THEN RAISE EXCEPTION '20260615100000 postcondition 288 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.performance_tracking'::regclass AND polname='performance_tracking_member_insert')) THEN RAISE EXCEPTION '20260615100000 postcondition 289 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.performance_tracking'::regclass AND polname='performance_tracking_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 290 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.performance_tracking'::regclass AND polname='performance_tracking_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 291 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.scale_monitor_runs'::regclass AND polname='scale_monitor_runs_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 292 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.service_areas'::regclass AND polname='service_areas_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 293 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.system_job_logs'::regclass AND polname='system_job_logs_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 294 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.system_jobs'::regclass AND polname='system_jobs_member_access')) THEN RAISE EXCEPTION '20260615100000 postcondition 295 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.targeting_intelligence_patterns'::regclass AND polname='targeting_intelligence_patterns_member_insert')) THEN RAISE EXCEPTION '20260615100000 postcondition 296 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.targeting_intelligence_patterns'::regclass AND polname='targeting_intelligence_patterns_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 297 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.targeting_intelligence_patterns'::regclass AND polname='targeting_intelligence_patterns_member_update')) THEN RAISE EXCEPTION '20260615100000 postcondition 298 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.targeting_intelligence_patterns'::regclass AND polname='targeting_intelligence_patterns_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 299 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.user_credit_ledger'::regclass AND polname='user_credit_ledger_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 300 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.user_credits'::regclass AND polname='user_credits_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 301 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.users'::regclass AND polname='users_select_self')) THEN RAISE EXCEPTION '20260615100000 postcondition 302 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.users'::regclass AND polname='users_update_self')) THEN RAISE EXCEPTION '20260615100000 postcondition 303 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_ghl_users'::regclass AND polname='workspace_ghl_users_member_select')) THEN RAISE EXCEPTION '20260615100000 postcondition 304 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_ghl_users'::regclass AND polname='workspace_ghl_users_service_role_all')) THEN RAISE EXCEPTION '20260615100000 postcondition 305 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.appointments'::regclass AND tgname='set_appointments_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 306 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.audit_logs'::regclass AND tgname='set_audit_logs_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 307 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.business_profiles'::regclass AND tgname='set_business_profiles_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 308 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.campaign_snapshots'::regclass AND tgname='set_campaign_snapshots_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 309 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.data_imports'::regclass AND tgname='set_data_imports_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 310 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='set_deals_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 311 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.generated_artifacts'::regclass AND tgname='set_generated_artifacts_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 312 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.health_scores'::regclass AND tgname='set_health_scores_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 313 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.internal_notes'::regclass AND tgname='set_internal_notes_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 314 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.jobs'::regclass AND tgname='set_jobs_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 315 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.markets'::regclass AND tgname='set_markets_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 316 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.organization_admin_states'::regclass AND tgname='set_organization_admin_states_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 317 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.service_areas'::regclass AND tgname='set_service_areas_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260615100000 postcondition 318 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260615100000$;
