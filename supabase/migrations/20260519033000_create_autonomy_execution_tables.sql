-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260519033000 remote_name=create_autonomy_execution_tables original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260519033000_create_autonomy_execution_tables.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260519033000.preconditions.001 sha256=3f9940186cbe0ab41269dbabb1700f30c05bc13be54e15f0064903f6bc6d05ad
DO $dealflow_table_guard_autonomy_action_audit_logs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_action_audit_logs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_action_audit_logs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_action_audit_logs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"action_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"run_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"actor_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'system'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"actor_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"event_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"customer_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"internal_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"redacted_request":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"redacted_response":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"thresholds":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"before_after":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"rollback_payload":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_action_audit_logs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_action_audit_logs_required$["id","organization_id","campaign_id","action_id","run_id","actor_type","actor_id","event_type","customer_message","internal_message","redacted_request","redacted_response","thresholds","before_after","rollback_payload","idempotency_key","created_at"]$dealflow_table_guard_autonomy_action_audit_logs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_action_audit_logs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_action_audit_logs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_action_audit_logs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_action_audit_logs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_action_audit_logs'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_action_audit_logs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_action_audit_logs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_action_audit_logs$;

-- dealflow:statement id=20260519033000.preconditions.002 sha256=d673d20fe8a495c91a8bf555c2c31aa1e7a1f683d0a3366276314e1769a204a5
DO $dealflow_table_guard_autonomy_action_logs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_action_logs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_action_logs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_action_logs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"action_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"action_title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"action_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"target_market":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"execution_mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'executed'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"ai_explanation":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"expected_outcome":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"actual_outcome":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"confidence_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(4,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"m"},"impact_estimate":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(6,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"m"},"urgency":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(6,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"m"},"guardrail_summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_action_logs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_action_logs_required$["id","organization_id","action_key","action_title","action_type","target_market","execution_mode","status","reason","ai_explanation","expected_outcome","actual_outcome","confidence_score","impact_estimate","urgency","guardrail_summary","created_at","updated_at"]$dealflow_table_guard_autonomy_action_logs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_action_logs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_action_logs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_action_logs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_action_logs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_action_logs'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_action_logs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_action_logs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_action_logs$;

-- dealflow:statement id=20260519033000.preconditions.003 sha256=67e5f02e5b8e240af5073d29645c214637cb9136f4b37f84b74c13689db57d43
DO $dealflow_table_guard_autonomy_actions$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_actions_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_actions_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_actions_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"run_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"action_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"action_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"classification":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"execution_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'recommended'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"bottleneck_classification":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'monitor'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"trigger_condition":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"minimum_data_threshold":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"confidence_threshold":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"m"},"confidence_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"m"},"risk_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"m"},"expected_budget_impact_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"customer_explanation":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"x"},"internal_explanation":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"x"},"chosen_reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":20,"relation_kind":"r","storage_strategy":"x"},"rejected_alternatives":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":21,"relation_kind":"r","storage_strategy":"x"},"rollback_path":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":22,"relation_kind":"r","storage_strategy":"x"},"approval_required":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":23,"relation_kind":"r","storage_strategy":"p"},"approved_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":24,"relation_kind":"r","storage_strategy":"x"},"approved_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":25,"relation_kind":"r","storage_strategy":"p"},"rejected_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":26,"relation_kind":"r","storage_strategy":"x"},"rejected_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":27,"relation_kind":"r","storage_strategy":"p"},"rejection_reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":28,"relation_kind":"r","storage_strategy":"x"},"target_object_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":29,"relation_kind":"r","storage_strategy":"x"},"target_object_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":30,"relation_kind":"r","storage_strategy":"x"},"before_state":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":31,"relation_kind":"r","storage_strategy":"x"},"expected_after_state":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":32,"relation_kind":"r","storage_strategy":"x"},"verified_after_state":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":33,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":34,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":35,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_actions_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_actions_required$["id","organization_id","campaign_id","run_id","action_key","idempotency_key","action_type","classification","execution_type","status","bottleneck_classification","trigger_condition","minimum_data_threshold","confidence_threshold","confidence_score","risk_score","expected_budget_impact_cents","customer_explanation","internal_explanation","chosen_reason","rejected_alternatives","rollback_path","approval_required","approved_by","approved_at","rejected_by","rejected_at","rejection_reason","target_object_type","target_object_id","before_state","expected_after_state","verified_after_state","created_at","updated_at"]$dealflow_table_guard_autonomy_actions_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_actions') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_actions'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_actions' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_actions'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_actions'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_actions'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_actions' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_actions$;

-- dealflow:statement id=20260519033000.preconditions.004 sha256=f4e96f1803b9ebc1dcb27e26372af031b2a1672685fa5c87b3bee1e672e30faa
DO $dealflow_table_guard_autonomy_alerts$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_alerts_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_alerts_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_alerts_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"action_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"alert_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"alert_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"severity":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'medium'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'open'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"evidence":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"first_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"last_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"resolved_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_alerts_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_alerts_required$["id","organization_id","campaign_id","action_id","alert_key","alert_type","severity","status","title","message","evidence","first_seen_at","last_seen_at","resolved_at","created_at","updated_at"]$dealflow_table_guard_autonomy_alerts_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_alerts') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_alerts'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_alerts' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_alerts'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_alerts'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_alerts'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_alerts' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_alerts$;

-- dealflow:statement id=20260519033000.preconditions.005 sha256=595376b4f95198630629036c40b40e74a49db4510562991e763fc64b5928dde8
DO $dealflow_table_guard_autonomy_execution_locks$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_execution_locks_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_execution_locks_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_execution_locks_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"lock_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"lock_scope":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"meta_object_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"locked_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'autonomy'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"locked_until":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"released_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_execution_locks_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_execution_locks_required$["id","organization_id","campaign_id","lock_key","lock_scope","meta_object_id","idempotency_key","locked_by","locked_until","released_at","created_at"]$dealflow_table_guard_autonomy_execution_locks_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_execution_locks') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_execution_locks'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_execution_locks' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_execution_locks'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_execution_locks'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_execution_locks'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_execution_locks' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_execution_locks$;

-- dealflow:statement id=20260519033000.preconditions.006 sha256=fbd6717e6b1eea09b24bd0223820f5251957c624c22110688639c689798f6eab
DO $dealflow_table_guard_autonomy_experiments$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_experiments_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_experiments_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_experiments_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"experiment_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"experiment_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"primary_variable":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"control_payload":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"challenger_payload":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"minimum_spend_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"minimum_impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"minimum_clicks":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"minimum_leads":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"winner_criteria":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'planned'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"learned_pattern":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"started_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"ended_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_experiments_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_experiments_required$["id","organization_id","campaign_id","experiment_key","experiment_type","primary_variable","control_payload","challenger_payload","minimum_spend_cents","minimum_impressions","minimum_clicks","minimum_leads","winner_criteria","status","learned_pattern","started_at","ended_at","created_at","updated_at"]$dealflow_table_guard_autonomy_experiments_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_experiments') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_experiments'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_experiments' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_experiments'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_experiments'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_experiments'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_experiments' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_experiments$;

-- dealflow:statement id=20260519033000.preconditions.007 sha256=e71d185eee3726ef8a3c8f56bac10ec4ac1cdd24750709a0a26f45d5d0b61eea
DO $dealflow_table_guard_autonomy_learning_memory$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_learning_memory_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_learning_memory_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_learning_memory_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"experiment_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"action_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"pattern_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"pattern_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"learned_pattern":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"confidence_score":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"m"},"evidence":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_learning_memory_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_learning_memory_required$["id","organization_id","campaign_id","experiment_id","action_id","pattern_key","pattern_type","learned_pattern","confidence_score","evidence","created_at","updated_at"]$dealflow_table_guard_autonomy_learning_memory_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_learning_memory') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_learning_memory'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_learning_memory' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_learning_memory'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_learning_memory'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_learning_memory'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_learning_memory' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_learning_memory$;

-- dealflow:statement id=20260519033000.preconditions.008 sha256=9b9f2db47684f5872f5bd25d7e8ed95242abcd1ccdf092c91e2534cc76494b0f
DO $dealflow_table_guard_autonomy_rollbacks$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_rollbacks_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_rollbacks_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_rollbacks_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"action_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"rollback_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"object_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"object_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"before_state":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"expected_after_state":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"rollback_payload":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"rollback_notes":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'Rollback payload must be written before mutation; no real Meta, provider, SMS, or Stripe call should happen without rollback evidence.'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"rollback_eligible":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"payload_written_before_mutation":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'ready'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_rollbacks_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_rollbacks_required$["id","organization_id","campaign_id","action_id","rollback_key","idempotency_key","object_type","object_id","before_state","expected_after_state","rollback_payload","rollback_notes","rollback_eligible","payload_written_before_mutation","status","created_at","updated_at"]$dealflow_table_guard_autonomy_rollbacks_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_rollbacks') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_rollbacks'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_rollbacks' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_rollbacks'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_rollbacks'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_rollbacks'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_rollbacks' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_rollbacks$;

-- dealflow:statement id=20260519033000.preconditions.009 sha256=27db2bf400b7f682c5c2390e67dc1e654e415c8b6017a08a5b06eb6ad3e22f97
DO $dealflow_table_guard_autonomy_runs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_autonomy_runs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_autonomy_runs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_autonomy_runs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"run_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'dry_run'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"trigger_source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'scheduler'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"dry_run":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"measured_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"started_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"metrics":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"scoring":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"guardrail_summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"report":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"error_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_autonomy_runs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_autonomy_runs_required$["id","organization_id","campaign_id","run_key","mode","status","trigger_source","dry_run","measured_at","started_at","completed_at","metrics","scoring","guardrail_summary","report","error_code","created_at","updated_at"]$dealflow_table_guard_autonomy_runs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.autonomy_runs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='autonomy_runs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'autonomy_runs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.autonomy_runs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.autonomy_runs'::regclass
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
      WHERE attribute_record.attrelid='public.autonomy_runs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'autonomy_runs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_autonomy_runs$;

-- dealflow:statement id=20260519033000.preconditions.010 sha256=b9800a751272a0b9ec6ba5cbe201f164ff616c78bb6753e3348dad4696bf6102
DO $dealflow_table_guard_campaign_autonomy_settings$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_autonomy_settings_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_autonomy_settings_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_autonomy_settings_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'manual'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"allowed_safe_actions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"monthly_budget_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"daily_budget_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"credit_spend_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"kill_switch_enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"disabled_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"disabled_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_autonomy_settings_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_autonomy_settings_required$["id","organization_id","campaign_id","mode","allowed_safe_actions","monthly_budget_cap_cents","daily_budget_cap_cents","credit_spend_cap_cents","kill_switch_enabled","disabled_by","disabled_at","created_at","updated_at"]$dealflow_table_guard_campaign_autonomy_settings_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_autonomy_settings') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_autonomy_settings'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_autonomy_settings' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_autonomy_settings'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_autonomy_settings'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_autonomy_settings'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_autonomy_settings' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_autonomy_settings$;

-- dealflow:statement id=20260519033000.preconditions.011 sha256=55967242a2532adcd925aeef9f0db09644e6fc332a4d67f110833b12d67457e8
DO $dealflow_table_guard_customer_autonomy_settings$
DECLARE
  expected_table jsonb := $dealflow_table_guard_customer_autonomy_settings_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_customer_autonomy_settings_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_customer_autonomy_settings_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'manual'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"allowed_safe_actions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"monthly_budget_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"daily_budget_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"credit_spend_cap_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"kill_switch_enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"disabled_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"disabled_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"require_approval_for_high_impact":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"require_rollback_before_mutation":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_customer_autonomy_settings_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_customer_autonomy_settings_required$["id","organization_id","mode","allowed_safe_actions","monthly_budget_cap_cents","daily_budget_cap_cents","credit_spend_cap_cents","kill_switch_enabled","disabled_by","disabled_at","require_approval_for_high_impact","require_rollback_before_mutation","created_at","updated_at"]$dealflow_table_guard_customer_autonomy_settings_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.customer_autonomy_settings') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='customer_autonomy_settings'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'customer_autonomy_settings' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.customer_autonomy_settings'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.customer_autonomy_settings'::regclass
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
      WHERE attribute_record.attrelid='public.customer_autonomy_settings'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'customer_autonomy_settings' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_customer_autonomy_settings$;

-- dealflow:statement id=20260519033000.preconditions.012 sha256=9380b54bc73ac594b7549b48257db7bad9f891ca4b1aa960b3d653c729c19954
DO $dealflow_table_guard_organization_autonomy_settings$
DECLARE
  expected_table jsonb := $dealflow_table_guard_organization_autonomy_settings_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_organization_autonomy_settings_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_organization_autonomy_settings_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"autonomy_mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'autonomous'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"system_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'running'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"max_daily_budget_change":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"20","formatted_type":"numeric(5,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"m"},"max_lead_flow_drop_tolerance":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"10","formatted_type":"numeric(5,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"m"},"protected_markets":{"array_dimensions":1,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::text[]","formatted_type":"text[]","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"min_confidence_threshold":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0.80","formatted_type":"numeric(4,2)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"m"},"last_evaluated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"failsafe_triggered_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"pause_reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_organization_autonomy_settings_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_organization_autonomy_settings_required$["id","organization_id","autonomy_mode","system_status","max_daily_budget_change","max_lead_flow_drop_tolerance","protected_markets","min_confidence_threshold","last_evaluated_at","failsafe_triggered_at","pause_reason","created_at","updated_at"]$dealflow_table_guard_organization_autonomy_settings_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.organization_autonomy_settings') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='organization_autonomy_settings'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'organization_autonomy_settings' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.organization_autonomy_settings'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.organization_autonomy_settings'::regclass
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
      WHERE attribute_record.attrelid='public.organization_autonomy_settings'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'organization_autonomy_settings' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_organization_autonomy_settings$;

-- dealflow:statement id=20260519033000.preconditions.013 sha256=a839c25c06a3135136f3e5f7497b865a3e5ca29d951ca5b667055cb985cfca3f
DO $dealflow_index_guard_autonomy_action_audit_logs_action_idx$
BEGIN
  IF to_regclass('public.autonomy_action_audit_logs_action_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_action_audit_logs_action_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_action_audit_logs_action_idx ON public.autonomy_action_audit_logs USING btree (organization_id, campaign_id, action_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_action_audit_logs_action_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_action_audit_logs_action_idx$;

-- dealflow:statement id=20260519033000.preconditions.014 sha256=8194a1492446d3ab27ace153267da1c7e625f7d1b13096d8d83f8296e37467b7
DO $dealflow_index_guard_idx_autonomy_logs_org_action_created$
BEGIN
  IF to_regclass('public.idx_autonomy_logs_org_action_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_autonomy_logs_org_action_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_autonomy_logs_org_action_created ON public.autonomy_action_logs USING btree (organization_id, action_key, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_autonomy_logs_org_action_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_autonomy_logs_org_action_created$;

-- dealflow:statement id=20260519033000.preconditions.015 sha256=c68494721964059b6fae52ce5a35a014846df1690f676e3eafa554aa006feffb
DO $dealflow_index_guard_idx_autonomy_logs_org_created$
BEGIN
  IF to_regclass('public.idx_autonomy_logs_org_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_autonomy_logs_org_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_autonomy_logs_org_created ON public.autonomy_action_logs USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_autonomy_logs_org_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_autonomy_logs_org_created$;

-- dealflow:statement id=20260519033000.preconditions.016 sha256=1d316c983dce1b09fdce4d74f608bbafd7dac06994d3e746f7c8db611360d261
DO $dealflow_index_guard_autonomy_actions_approval_idx$
BEGIN
  IF to_regclass('public.autonomy_actions_approval_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_actions_approval_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_actions_approval_idx ON public.autonomy_actions USING btree (organization_id, approval_required, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_actions_approval_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_actions_approval_idx$;

-- dealflow:statement id=20260519033000.preconditions.017 sha256=32ed38d0b6f5ff7c6b3a24d2cdd1e287b0566f2e2b340b8ef3a10054ca7e3ce4
DO $dealflow_index_guard_autonomy_actions_org_campaign_status_idx$
BEGIN
  IF to_regclass('public.autonomy_actions_org_campaign_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_actions_org_campaign_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_actions_org_campaign_status_idx ON public.autonomy_actions USING btree (organization_id, campaign_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_actions_org_campaign_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_actions_org_campaign_status_idx$;

-- dealflow:statement id=20260519033000.preconditions.018 sha256=75c4d18f0ca0262a323902ef383cf1be2af49c3a43b80dde304d3b892d3a0f4e
DO $dealflow_index_guard_autonomy_alerts_status_idx$
BEGIN
  IF to_regclass('public.autonomy_alerts_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_alerts_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_alerts_status_idx ON public.autonomy_alerts USING btree (organization_id, status, severity, last_seen_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_alerts_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_alerts_status_idx$;

-- dealflow:statement id=20260519033000.preconditions.019 sha256=1faba1d6ebbe08c2c52c54eb5baf0d4489563e8d5ea821b9c9da807e762a817a
DO $dealflow_index_guard_autonomy_execution_locks_campaign_idx$
BEGIN
  IF to_regclass('public.autonomy_execution_locks_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_execution_locks_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_execution_locks_campaign_idx ON public.autonomy_execution_locks USING btree (organization_id, campaign_id, locked_until DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_execution_locks_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_execution_locks_campaign_idx$;

-- dealflow:statement id=20260519033000.preconditions.020 sha256=5b5aef4d29d1e7b66fe5b8294eb678664df325961e674d13b2c5dcecf36342db
DO $dealflow_index_guard_autonomy_experiments_status_idx$
BEGIN
  IF to_regclass('public.autonomy_experiments_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_experiments_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_experiments_status_idx ON public.autonomy_experiments USING btree (organization_id, campaign_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_experiments_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_experiments_status_idx$;

-- dealflow:statement id=20260519033000.preconditions.021 sha256=4aedf549c7b4b558c9864ccd563466d4db2e8bd8f98d43e2bd34ec090e5f49c8
DO $dealflow_index_guard_autonomy_learning_memory_pattern_idx$
BEGIN
  IF to_regclass('public.autonomy_learning_memory_pattern_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_learning_memory_pattern_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_learning_memory_pattern_idx ON public.autonomy_learning_memory USING btree (organization_id, campaign_id, pattern_type, confidence_score DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_learning_memory_pattern_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_learning_memory_pattern_idx$;

-- dealflow:statement id=20260519033000.preconditions.022 sha256=71f33729c9835378c2b294d4c31502038723e557063b6eed8eda2438a428aa30
DO $dealflow_index_guard_autonomy_rollbacks_status_idx$
BEGIN
  IF to_regclass('public.autonomy_rollbacks_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_rollbacks_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_rollbacks_status_idx ON public.autonomy_rollbacks USING btree (organization_id, campaign_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_rollbacks_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_rollbacks_status_idx$;

-- dealflow:statement id=20260519033000.preconditions.023 sha256=cc815aba7c90c22af2c45fd6a5117c616b3d5c69f8d2b815388c1eb8bd8d8677
DO $dealflow_index_guard_autonomy_runs_org_campaign_started_idx$
BEGIN
  IF to_regclass('public.autonomy_runs_org_campaign_started_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='autonomy_runs_org_campaign_started_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX autonomy_runs_org_campaign_started_idx ON public.autonomy_runs USING btree (organization_id, campaign_id, started_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'autonomy_runs_org_campaign_started_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_autonomy_runs_org_campaign_started_idx$;

-- dealflow:statement id=20260519033000.preconditions.024 sha256=c9d2b83093f2fa9e25f8bf7fd928792caa6d9748da0055c40b499c7f5e6855ba
DO $dealflow_index_guard_campaign_autonomy_settings_org_campaign_idx$
BEGIN
  IF to_regclass('public.campaign_autonomy_settings_org_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_autonomy_settings_org_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_autonomy_settings_org_campaign_idx ON public.campaign_autonomy_settings USING btree (organization_id, campaign_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_autonomy_settings_org_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_autonomy_settings_org_campaign_idx$;

-- dealflow:statement id=20260519033000.preconditions.025 sha256=bf43e3ef4275e46d1be14e8e04f006b4e835977a103365e02b7994fb67a949a2
DO $dealflow_index_guard_customer_autonomy_settings_org_idx$
BEGIN
  IF to_regclass('public.customer_autonomy_settings_org_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='customer_autonomy_settings_org_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX customer_autonomy_settings_org_idx ON public.customer_autonomy_settings USING btree (organization_id, updated_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'customer_autonomy_settings_org_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_customer_autonomy_settings_org_idx$;

-- dealflow:statement id=20260519033000.preconditions.026 sha256=25652e2ce48b05ba5c0dedf23f6bc7195a1d262653a6e5ba0f1c6ebe0703be59
DO $dealflow_index_guard_idx_autonomy_settings_org$
BEGIN
  IF to_regclass('public.idx_autonomy_settings_org') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_autonomy_settings_org'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_autonomy_settings_org ON public.organization_autonomy_settings USING btree (organization_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_autonomy_settings_org' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_autonomy_settings_org$;

-- tables
-- dealflow:statement id=20260519033000.tables.001 sha256=46740c9a6f80df6d3078f259d2217f7b273a8b8fd58dfb23422cfd7abcd08c07
CREATE TABLE IF NOT EXISTS "public"."autonomy_action_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "action_id" uuid,
  "run_id" uuid,
  "actor_type" text DEFAULT 'system'::text NOT NULL,
  "actor_id" text,
  "event_type" text NOT NULL,
  "customer_message" text NOT NULL,
  "internal_message" text NOT NULL,
  "redacted_request" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "redacted_response" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "before_after" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.002 sha256=add7d5d80ef29402972d1b793aefb767f36e3fa80f870ef6daa6f660f7f0a4e4
CREATE TABLE IF NOT EXISTS "public"."autonomy_action_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "action_key" text NOT NULL,
  "action_title" text NOT NULL,
  "action_type" text NOT NULL,
  "target_market" text,
  "execution_mode" text NOT NULL,
  "status" text DEFAULT 'executed'::text NOT NULL,
  "reason" text NOT NULL,
  "ai_explanation" text,
  "expected_outcome" jsonb,
  "actual_outcome" jsonb,
  "confidence_score" numeric(4,2) DEFAULT 0 NOT NULL,
  "impact_estimate" numeric(6,2) DEFAULT 0 NOT NULL,
  "urgency" numeric(6,2) DEFAULT 0 NOT NULL,
  "guardrail_summary" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260519033000.tables.003 sha256=13c11eb8a5aa4b46abf7f3e49e2012d08c031087061f463126d450b0d1a0c713
CREATE TABLE IF NOT EXISTS "public"."autonomy_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "run_id" uuid,
  "action_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "action_type" text NOT NULL,
  "classification" text NOT NULL,
  "execution_type" text NOT NULL,
  "status" text DEFAULT 'recommended'::text NOT NULL,
  "bottleneck_classification" text DEFAULT 'monitor'::text NOT NULL,
  "trigger_condition" text NOT NULL,
  "minimum_data_threshold" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence_threshold" numeric DEFAULT 0 NOT NULL,
  "confidence_score" numeric DEFAULT 0 NOT NULL,
  "risk_score" numeric DEFAULT 0 NOT NULL,
  "expected_budget_impact_cents" integer DEFAULT 0 NOT NULL,
  "customer_explanation" text NOT NULL,
  "internal_explanation" text NOT NULL,
  "chosen_reason" text NOT NULL,
  "rejected_alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rollback_path" text NOT NULL,
  "approval_required" boolean DEFAULT true NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "rejected_by" text,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text,
  "target_object_type" text,
  "target_object_id" text,
  "before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "verified_after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.004 sha256=c12d717ff02b6eca201899bf59809f04781c21bff906f0ae6adacafa3edc87f9
CREATE TABLE IF NOT EXISTS "public"."autonomy_alerts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid,
  "action_id" uuid,
  "alert_key" text NOT NULL,
  "alert_type" text NOT NULL,
  "severity" text DEFAULT 'medium'::text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.005 sha256=646f730f912dbf94dfc4d84c3e9d36bc25a649ebd1d6323037121330937de5c9
CREATE TABLE IF NOT EXISTS "public"."autonomy_execution_locks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "lock_key" text NOT NULL,
  "lock_scope" text NOT NULL,
  "meta_object_id" text,
  "idempotency_key" text NOT NULL,
  "locked_by" text DEFAULT 'autonomy'::text NOT NULL,
  "locked_until" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.006 sha256=0aceaaa21efaff41590dc2727c315e423eafea248ee0df54268312541446d3f9
CREATE TABLE IF NOT EXISTS "public"."autonomy_experiments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "experiment_key" text NOT NULL,
  "experiment_type" text NOT NULL,
  "primary_variable" text NOT NULL,
  "control_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "challenger_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "minimum_spend_cents" integer DEFAULT 0 NOT NULL,
  "minimum_impressions" integer DEFAULT 0 NOT NULL,
  "minimum_clicks" integer DEFAULT 0 NOT NULL,
  "minimum_leads" integer DEFAULT 0 NOT NULL,
  "winner_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "learned_pattern" text,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.007 sha256=400478b7f1e6efb191a7ea4817aff01c253e0ab654d8e3bd64b4fe913a52770d
CREATE TABLE IF NOT EXISTS "public"."autonomy_learning_memory" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "experiment_id" uuid,
  "action_id" uuid,
  "pattern_key" text NOT NULL,
  "pattern_type" text NOT NULL,
  "learned_pattern" text NOT NULL,
  "confidence_score" numeric DEFAULT 0 NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.008 sha256=5ec26235813cf920cc2aa11b8fce1071377750bbda9d118d2a3f3f6056b82f70
CREATE TABLE IF NOT EXISTS "public"."autonomy_rollbacks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "action_id" uuid,
  "rollback_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text,
  "before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_notes" text DEFAULT 'Rollback payload must be written before mutation; no real Meta, provider, SMS, or Stripe call should happen without rollback evidence.'::text NOT NULL,
  "rollback_eligible" boolean DEFAULT true NOT NULL,
  "payload_written_before_mutation" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'ready'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.009 sha256=be32cd07ab5b62039eee520d1e2231d543364b5fe8e63312ebef7e8fedc04328
CREATE TABLE IF NOT EXISTS "public"."autonomy_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "run_key" text NOT NULL,
  "mode" text NOT NULL,
  "status" text DEFAULT 'dry_run'::text NOT NULL,
  "trigger_source" text DEFAULT 'scheduler'::text NOT NULL,
  "dry_run" boolean DEFAULT true NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "guardrail_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.010 sha256=b7517508fbb7c481da7946453dcf2e27057a9400f230294c7723f76fc8f99ec2
CREATE TABLE IF NOT EXISTS "public"."campaign_autonomy_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "mode" text DEFAULT 'manual'::text NOT NULL,
  "allowed_safe_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "monthly_budget_cap_cents" integer,
  "daily_budget_cap_cents" integer,
  "credit_spend_cap_cents" integer,
  "kill_switch_enabled" boolean DEFAULT false NOT NULL,
  "disabled_by" text,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.011 sha256=67562867bd8eab1b75d71209c70066969996a0373408622438fa89e20ea7a8f4
CREATE TABLE IF NOT EXISTS "public"."customer_autonomy_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "mode" text DEFAULT 'manual'::text NOT NULL,
  "allowed_safe_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "monthly_budget_cap_cents" integer,
  "daily_budget_cap_cents" integer,
  "credit_spend_cap_cents" integer,
  "kill_switch_enabled" boolean DEFAULT false NOT NULL,
  "disabled_by" text,
  "disabled_at" timestamp with time zone,
  "require_approval_for_high_impact" boolean DEFAULT true NOT NULL,
  "require_rollback_before_mutation" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260519033000.tables.012 sha256=d01046363c63a5d7f8e243d9cd5ff0ebc4d72a8182467ddd076cd6c72bb7538d
CREATE TABLE IF NOT EXISTS "public"."organization_autonomy_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "autonomy_mode" text DEFAULT 'autonomous'::text NOT NULL,
  "system_status" text DEFAULT 'running'::text NOT NULL,
  "max_daily_budget_change" numeric(5,2) DEFAULT 20 NOT NULL,
  "max_lead_flow_drop_tolerance" numeric(5,2) DEFAULT 10 NOT NULL,
  "protected_markets" text[] DEFAULT '{}'::text[] NOT NULL,
  "min_confidence_threshold" numeric(4,2) DEFAULT 0.80 NOT NULL,
  "last_evaluated_at" timestamp with time zone,
  "failsafe_triggered_at" timestamp with time zone,
  "pause_reason" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- constraints
-- dealflow:statement id=20260519033000.constraints.001 sha256=a2cf9b94b199b24b0e6c414a17bade9c7bb54e0913d63b0606121451ad34797a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.002 sha256=e80cb5c6c969e541c89626fb1a92a4f28321002327df8d2217592385b75acd7b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_logs'::regclass
    AND constraint_record.conname='autonomy_action_logs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_logs" ADD CONSTRAINT "autonomy_action_logs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_logs', 'autonomy_action_logs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.003 sha256=e19a3edf2e85bf040dc76e1378344581fb516407a0bb0db76dd363b49e647582
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_idempotency_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_idempotency_unique" UNIQUE (idempotency_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (idempotency_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.004 sha256=55290a8bee929e7278a74cb19ead8545baf7769ed987ea943f3543e2b9a9911a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.005 sha256=44f773ce488ee493792665b47bb10c4c71c4a536ed9c7871519fb5b67bb20b14
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_key_unique" UNIQUE (organization_id, alert_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id, alert_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.006 sha256=3c2846daf5325656b84c9faaab3631229b4ef55d05cf95fcb98e70cd184ff6ae
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.007 sha256=e35156cfea4a53c491b70d0f57f8f64c8380836b4fb3b637eb61ea3667b944ea
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_execution_locks'::regclass
    AND constraint_record.conname='autonomy_execution_locks_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_execution_locks" ADD CONSTRAINT "autonomy_execution_locks_key_unique" UNIQUE (lock_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (lock_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_execution_locks', 'autonomy_execution_locks_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.008 sha256=7036d0031dbbde3d7c4f48a2fe5b8a698cf74d6797e174ef3c57f9c037a30c99
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_execution_locks'::regclass
    AND constraint_record.conname='autonomy_execution_locks_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_execution_locks" ADD CONSTRAINT "autonomy_execution_locks_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_execution_locks', 'autonomy_execution_locks_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.009 sha256=db67a388bd2b23c30700950943cd3a2170301dc11ae29ee8aae95e0ebd0564dc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_key_unique" UNIQUE (organization_id, campaign_id, experiment_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id, campaign_id, experiment_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.010 sha256=12a8e5a276911dce72df2c05e6117942393987ff07d754bf44fc7dc55220bcbc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.011 sha256=331501bf040b63e086ba4b50ae30cee4e3d578809a8932d0e0a3b17d7ced74c0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_key_unique" UNIQUE (organization_id, campaign_id, pattern_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id, campaign_id, pattern_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.012 sha256=a419829762474c706d8f10e3f62d01eda4711b84057f9d6a6ec90d37cf4e8db1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.013 sha256=e60332860b4cd3759e1f5a9f1bd9eb3488712e7251ae87c5af7a127c62d92b31
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_key_unique" UNIQUE (rollback_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (rollback_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.014 sha256=13f371cc41c7d4c6e4a0aa8a35654b295a875fcb4f54c276fb362a6e93c1f6e3
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.015 sha256=d611960ed2cba19635cdce323c80880c4db2b21e2b0c9a7eea5729a47a4700ce
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_key_unique" UNIQUE (run_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (run_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.016 sha256=d535532f42e5f51fccaee95480652b8ece9c61750fa6d5087bd43fb52a7eb57a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.017 sha256=91520055078efc35bcabe6aaac8a632ec8ecf252ae123fc846a67f1c4087a82e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_autonomy_settings'::regclass
    AND constraint_record.conname='campaign_autonomy_settings_campaign_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_autonomy_settings" ADD CONSTRAINT "campaign_autonomy_settings_campaign_unique" UNIQUE (organization_id, campaign_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id, campaign_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_autonomy_settings', 'campaign_autonomy_settings_campaign_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.018 sha256=b0862419ca9a84ec90a995715dbeca85d9e2b0de2d5901b7e8c837a730069651
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_autonomy_settings'::regclass
    AND constraint_record.conname='campaign_autonomy_settings_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_autonomy_settings" ADD CONSTRAINT "campaign_autonomy_settings_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_autonomy_settings', 'campaign_autonomy_settings_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.019 sha256=fd98b465246a6c557c7fad99e1757e48a8a53d93235a1751fc803680d34f96ca
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_autonomy_settings'::regclass
    AND constraint_record.conname='customer_autonomy_settings_org_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_autonomy_settings" ADD CONSTRAINT "customer_autonomy_settings_org_unique" UNIQUE (organization_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_autonomy_settings', 'customer_autonomy_settings_org_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.020 sha256=7eee9d299d5df7c283337ffe59563078bc1be97cba1ab9ddcd58d17a08399509
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_autonomy_settings'::regclass
    AND constraint_record.conname='customer_autonomy_settings_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_autonomy_settings" ADD CONSTRAINT "customer_autonomy_settings_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_autonomy_settings', 'customer_autonomy_settings_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.021 sha256=75f4f07ca1a51b8ad03862649e76feaa4ad02d5fcae5c9b7544660d72ad4f457
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_autonomy_settings'::regclass
    AND constraint_record.conname='organization_autonomy_settings_organization_id_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_autonomy_settings" ADD CONSTRAINT "organization_autonomy_settings_organization_id_key" UNIQUE (organization_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (organization_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_autonomy_settings', 'organization_autonomy_settings_organization_id_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.022 sha256=3449e1c2939f3ac7d87160aa402149655b346026ce46d2a60d3ca8d74580c201
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_autonomy_settings'::regclass
    AND constraint_record.conname='organization_autonomy_settings_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_autonomy_settings" ADD CONSTRAINT "organization_autonomy_settings_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_autonomy_settings', 'organization_autonomy_settings_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.023 sha256=69d9d8b2e60d372eddebdb70a75e39c51e0d2b68aa97a8f7fc94e0a818b87a06
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_event_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_event_check" CHECK ((length(TRIM(BOTH FROM event_type)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM event_type)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_event_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.024 sha256=98444b5e3f0d74c07b14b16036bb9235c2734ba325a73e6e7c30523008151dc6
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_classification_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_classification_check" CHECK ((classification = ANY (ARRAY['manual'::text, 'assisted'::text, 'autopilot_safe'::text, 'high_impact'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((classification = ANY (ARRAY[''manual''::text, ''assisted''::text, ''autopilot_safe''::text, ''high_impact''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_classification_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.025 sha256=e5cbc20fdd07d2e0692fb1568d446b3605f0d64c105ae31b232aabc064f91447
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_execution_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_execution_type_check" CHECK ((execution_type = ANY (ARRAY['manual_recommendation'::text, 'assisted_approval_required'::text, 'autopilot_safe_action'::text, 'high_impact_approval_required'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((execution_type = ANY (ARRAY[''manual_recommendation''::text, ''assisted_approval_required''::text, ''autopilot_safe_action''::text, ''high_impact_approval_required''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_execution_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.026 sha256=8d3ccfe6a6eb6406809c005a85b6cc6c6443a414cb7c28c458c293fef60d70db
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_status_check" CHECK ((status = ANY (ARRAY['recommended'::text, 'staged'::text, 'approved'::text, 'rejected'::text, 'eligible'::text, 'applied'::text, 'verified'::text, 'blocked'::text, 'failed'::text, 'rollback_needed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''recommended''::text, ''staged''::text, ''approved''::text, ''rejected''::text, ''eligible''::text, ''applied''::text, ''verified''::text, ''blocked''::text, ''failed''::text, ''rollback_needed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.027 sha256=93d81947bf75b344e52413ed9a40413a0b0809ea65b3932cc647ae1d00675cf4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_severity_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text, 'p0'::text, 'p1'::text, 'p2'::text, 'p3'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((severity = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text, ''critical''::text, ''p0''::text, ''p1''::text, ''p2''::text, ''p3''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_severity_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.028 sha256=6892cd6b477ac5055615b16cbe4aab53d7ef72057c40bd08c2e63a768defa381
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''open''::text, ''acknowledged''::text, ''resolved''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.029 sha256=ef4b478e11bf3f58fdccdf3580905dbab1de6972515c41b3085b93bc55425688
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_execution_locks'::regclass
    AND constraint_record.conname='autonomy_execution_locks_scope_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_execution_locks" ADD CONSTRAINT "autonomy_execution_locks_scope_check" CHECK ((lock_scope = ANY (ARRAY['campaign'::text, 'meta_campaign'::text, 'meta_ad_set'::text, 'meta_ad'::text, 'provider'::text, 'funnel'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lock_scope = ANY (ARRAY[''campaign''::text, ''meta_campaign''::text, ''meta_ad_set''::text, ''meta_ad''::text, ''provider''::text, ''funnel''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_execution_locks', 'autonomy_execution_locks_scope_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.030 sha256=9c7de4d623205ad6c4cb36b02bd3abef78cff1507eb55985c3f404f8498558d4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_one_variable_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_one_variable_check" CHECK ((length(TRIM(BOTH FROM primary_variable)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM primary_variable)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_one_variable_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.031 sha256=81c6bb2f57e93f0ab1caf957a42ea9dd0b5c52ba573f2c7338338876133b2e19
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'running'::text, 'winner'::text, 'loser'::text, 'inconclusive'::text, 'stopped'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''planned''::text, ''running''::text, ''winner''::text, ''loser''::text, ''inconclusive''::text, ''stopped''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.032 sha256=1db5ceb70223f16b5cc6f120158c56ed442292f575e17ca09e572f1ccd0c8127
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_status_check" CHECK ((status = ANY (ARRAY['ready'::text, 'not_reversible'::text, 'used'::text, 'failed'::text, 'expired'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''ready''::text, ''not_reversible''::text, ''used''::text, ''failed''::text, ''expired''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.033 sha256=0779290f0e66c4cf57d6c8400bce88a351b4983c32c3306cccb62e41792cd8a8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_mode_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_mode_check" CHECK ((mode = ANY (ARRAY['manual'::text, 'assisted'::text, 'auto'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((mode = ANY (ARRAY[''manual''::text, ''assisted''::text, ''auto''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_mode_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.034 sha256=d64317d94e931172b7e398603146c5cb76f8d3ad91231e0f7645595266f2fa8b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_status_check" CHECK ((status = ANY (ARRAY['dry_run'::text, 'evaluated'::text, 'staged'::text, 'executed'::text, 'blocked'::text, 'failed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''dry_run''::text, ''evaluated''::text, ''staged''::text, ''executed''::text, ''blocked''::text, ''failed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.035 sha256=28d629525d57ee5ac405fa67bf85fafa42e12f838136faa18c89b31e5cd7c03b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_autonomy_settings'::regclass
    AND constraint_record.conname='campaign_autonomy_settings_mode_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_autonomy_settings" ADD CONSTRAINT "campaign_autonomy_settings_mode_check" CHECK ((mode = ANY (ARRAY['manual'::text, 'assisted'::text, 'auto'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((mode = ANY (ARRAY[''manual''::text, ''assisted''::text, ''auto''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_autonomy_settings', 'campaign_autonomy_settings_mode_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.036 sha256=858d75d257361e6fbe2df34983b5b12d6a323a3bbd1408afd712d858f3254c49
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_autonomy_settings'::regclass
    AND constraint_record.conname='customer_autonomy_settings_mode_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_autonomy_settings" ADD CONSTRAINT "customer_autonomy_settings_mode_check" CHECK ((mode = ANY (ARRAY['manual'::text, 'assisted'::text, 'auto'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((mode = ANY (ARRAY[''manual''::text, ''assisted''::text, ''auto''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_autonomy_settings', 'customer_autonomy_settings_mode_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.037 sha256=cc2fb0ea6045ed7a740458b4b6a7a42c628d545e63be66b7943722fe1d568733
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_action_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_action_id_fkey" FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_action_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.038 sha256=2d2ba09467da5ce1a03ad17d74ffe36c7cf24c4dcfac6c9968dd9a62e1c22a61
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.039 sha256=4a1b7cd3554d8c29bcd56ec0b2f01d3c8ca32b0daf0b2a53b925bd72be2cf20e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.040 sha256=972f96aa5ce57c7fd485abd8874370847b71e792a2e903be96d30c3a4b762f48
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_audit_logs'::regclass
    AND constraint_record.conname='autonomy_action_audit_logs_run_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_audit_logs" ADD CONSTRAINT "autonomy_action_audit_logs_run_id_fkey" FOREIGN KEY (run_id) REFERENCES autonomy_runs(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (run_id) REFERENCES autonomy_runs(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_audit_logs', 'autonomy_action_audit_logs_run_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.041 sha256=ba507406f4865d278bac0486fe5c6e3f0675c9d4bf841245cf6afa362c8dc183
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_action_logs'::regclass
    AND constraint_record.conname='autonomy_action_logs_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_action_logs" ADD CONSTRAINT "autonomy_action_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_action_logs', 'autonomy_action_logs_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.042 sha256=305a51b173b1acf381142a98da223418454fbb50de49e3798d2eb5c5ac31b940
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.043 sha256=8a3982dbae6672ff36cd3048906f4b89e0893f776ef739b3d7cd852050809301
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.044 sha256=2ee9fdad2707abccaae5e54e928cea281357c19805fbbfe3681a7f8f6429d982
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_actions'::regclass
    AND constraint_record.conname='autonomy_actions_run_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_actions" ADD CONSTRAINT "autonomy_actions_run_id_fkey" FOREIGN KEY (run_id) REFERENCES autonomy_runs(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (run_id) REFERENCES autonomy_runs(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_actions', 'autonomy_actions_run_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.045 sha256=79cd788ce587355d1a4b68493fa0607deca290dd48dd6b273651ae3d3ddae854
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_action_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_action_id_fkey" FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_action_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.046 sha256=218a41bfc94f6aaaed59dd21a24939a6b24d4da329661024991c2bab64daf45e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.047 sha256=701126d6648062f19ccf461116c057570a172c8d8a9c4360f256cae150c98dfd
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_alerts'::regclass
    AND constraint_record.conname='autonomy_alerts_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_alerts" ADD CONSTRAINT "autonomy_alerts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_alerts', 'autonomy_alerts_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.048 sha256=d9ab639cad36f32dd5853b3ffbab1196047998c9a0de143b8dbc105c19831e0e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_execution_locks'::regclass
    AND constraint_record.conname='autonomy_execution_locks_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_execution_locks" ADD CONSTRAINT "autonomy_execution_locks_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_execution_locks', 'autonomy_execution_locks_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.049 sha256=5b9660b85d5729e4510d0f074d73a68e171e13c40cfd1c798fbc2cc369510703
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_execution_locks'::regclass
    AND constraint_record.conname='autonomy_execution_locks_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_execution_locks" ADD CONSTRAINT "autonomy_execution_locks_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_execution_locks', 'autonomy_execution_locks_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.050 sha256=6af6d3bb9219ef26721be9d35b399e3e14acb5e75a7bf36228516c82af7e07e8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.051 sha256=e5151fa8bdaf8018aca4072f656c7f52f5d96cb40943a1248c904fe908302bc3
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_experiments'::regclass
    AND constraint_record.conname='autonomy_experiments_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_experiments" ADD CONSTRAINT "autonomy_experiments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_experiments', 'autonomy_experiments_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.052 sha256=c1dc33ecd6cb6723e79ab712f54fc398716e828ada4f7ee2761575f314ee4aad
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_action_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_action_id_fkey" FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_action_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.053 sha256=10dead6785bca384daf4c2cbc1c7ab114d58fa300fe492f2f03753211bf0ea71
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.054 sha256=88c142744e75ca87637c4ed5ba02320bbe9699339fb0118f64f58e0909086d3e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_experiment_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_experiment_id_fkey" FOREIGN KEY (experiment_id) REFERENCES autonomy_experiments(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (experiment_id) REFERENCES autonomy_experiments(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_experiment_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.055 sha256=65b5078593f3a6a96601c87db82a8f964f655c9280a11cbd10cf89672a8b4a3f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_learning_memory'::regclass
    AND constraint_record.conname='autonomy_learning_memory_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_learning_memory" ADD CONSTRAINT "autonomy_learning_memory_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_learning_memory', 'autonomy_learning_memory_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.056 sha256=457ea3132e9ca77b2a1054c4fab33a45f59837071132a38e9d5f6bf73778d6d2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_action_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_action_id_fkey" FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (action_id) REFERENCES autonomy_actions(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_action_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.057 sha256=474f3f122e83211c911605008220ecd39a5b9b54f249a4b0e9189c5fef7b218a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.058 sha256=668503835ef06e27e525bef2544cb09ec42b3b620bd3739af6042e9eaaa1a256
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_rollbacks'::regclass
    AND constraint_record.conname='autonomy_rollbacks_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_rollbacks" ADD CONSTRAINT "autonomy_rollbacks_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_rollbacks', 'autonomy_rollbacks_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.059 sha256=23c9c8267e769668f07cb5df5b66e80f8f3ac764763d263f432962c8fa112b87
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.060 sha256=55e46814cea4be8eaac52c13817267df236334f91dbd5f263c3ce3c9a517cd31
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.autonomy_runs'::regclass
    AND constraint_record.conname='autonomy_runs_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."autonomy_runs" ADD CONSTRAINT "autonomy_runs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'autonomy_runs', 'autonomy_runs_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.061 sha256=18d7acc521f8b486882c71da2d2ae00f4c007b03c20e4b265434d8f2bc9768db
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_autonomy_settings'::regclass
    AND constraint_record.conname='campaign_autonomy_settings_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_autonomy_settings" ADD CONSTRAINT "campaign_autonomy_settings_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_autonomy_settings', 'campaign_autonomy_settings_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.062 sha256=d9046d064c48f5000043dc2073b29463d94102a34f5aeb6740fa9d907aae15f9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_autonomy_settings'::regclass
    AND constraint_record.conname='campaign_autonomy_settings_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_autonomy_settings" ADD CONSTRAINT "campaign_autonomy_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_autonomy_settings', 'campaign_autonomy_settings_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.063 sha256=f7ace2fa39702b76cf960081bb2d696a547cea5565af91cc8ebdf20ed31efa71
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_autonomy_settings'::regclass
    AND constraint_record.conname='customer_autonomy_settings_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_autonomy_settings" ADD CONSTRAINT "customer_autonomy_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_autonomy_settings', 'customer_autonomy_settings_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519033000.constraints.064 sha256=bc72d9704484d4abbd4105d97a19bb442fb0513a374ba49adc6321e7cddfb85b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organization_autonomy_settings'::regclass
    AND constraint_record.conname='organization_autonomy_settings_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organization_autonomy_settings" ADD CONSTRAINT "organization_autonomy_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organization_autonomy_settings', 'organization_autonomy_settings_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260519033000.indexes.001 sha256=81a6da05ea6393c7c6c67dc92c10e551c736231c09615d1a86be1b0e9ef2639e
CREATE INDEX IF NOT EXISTS autonomy_action_audit_logs_action_idx ON public.autonomy_action_audit_logs USING btree (organization_id, campaign_id, action_id, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.002 sha256=93eb69c14e640cd772a2b8828bd4a386d5fd1c4dc61b79d06173690a1faf330a
CREATE INDEX IF NOT EXISTS idx_autonomy_logs_org_action_created ON public.autonomy_action_logs USING btree (organization_id, action_key, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.003 sha256=364d9acff4ff06e8e34bc225543f185a1fcd486ec20bc969fa809a06bbcb9b59
CREATE INDEX IF NOT EXISTS idx_autonomy_logs_org_created ON public.autonomy_action_logs USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.004 sha256=ddc14b1b5b7fe0785bc7796704fb728eb41540ca20f289c4400e3d4c63219cef
CREATE INDEX IF NOT EXISTS autonomy_actions_approval_idx ON public.autonomy_actions USING btree (organization_id, approval_required, status, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.005 sha256=03220c4f76b7eccc1da055863561987d2df3b066a77e087aeda5654da0231e7e
CREATE INDEX IF NOT EXISTS autonomy_actions_org_campaign_status_idx ON public.autonomy_actions USING btree (organization_id, campaign_id, status, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.006 sha256=1618e45255a859a2d57aeb7d466304d32bf495cfbb260c9bbc1518ba8461e0d5
CREATE INDEX IF NOT EXISTS autonomy_alerts_status_idx ON public.autonomy_alerts USING btree (organization_id, status, severity, last_seen_at DESC);

-- dealflow:statement id=20260519033000.indexes.007 sha256=991579d0654c0c00bec28ba067f033e96f1931b36faceb130eb7e356441983ca
CREATE INDEX IF NOT EXISTS autonomy_execution_locks_campaign_idx ON public.autonomy_execution_locks USING btree (organization_id, campaign_id, locked_until DESC);

-- dealflow:statement id=20260519033000.indexes.008 sha256=6a3a329b007d8b29ebae98f4d81d14a1fa5c4dcf536d46d02a1af99fb24997e4
CREATE INDEX IF NOT EXISTS autonomy_experiments_status_idx ON public.autonomy_experiments USING btree (organization_id, campaign_id, status, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.009 sha256=c1e2c4ac994852ea34549a4facaff16c18c0c853bc3faec3e014cb360bd5ef90
CREATE INDEX IF NOT EXISTS autonomy_learning_memory_pattern_idx ON public.autonomy_learning_memory USING btree (organization_id, campaign_id, pattern_type, confidence_score DESC);

-- dealflow:statement id=20260519033000.indexes.010 sha256=a81225d8bf3303efd1e8f75d20154e51ffcc9e546a28eeaf04b954322340ec3d
CREATE INDEX IF NOT EXISTS autonomy_rollbacks_status_idx ON public.autonomy_rollbacks USING btree (organization_id, campaign_id, status, created_at DESC);

-- dealflow:statement id=20260519033000.indexes.011 sha256=3b686d802052fa80b35bc8dc9068189e9dafeb37a4e8805023d3fa378ff132be
CREATE INDEX IF NOT EXISTS autonomy_runs_org_campaign_started_idx ON public.autonomy_runs USING btree (organization_id, campaign_id, started_at DESC);

-- dealflow:statement id=20260519033000.indexes.012 sha256=f15174876a2d21afb032d6d0645a31c777f775c6c18a5b3952952da8f81836ad
CREATE INDEX IF NOT EXISTS campaign_autonomy_settings_org_campaign_idx ON public.campaign_autonomy_settings USING btree (organization_id, campaign_id);

-- dealflow:statement id=20260519033000.indexes.013 sha256=767da65588e3d4a31bc99dfb2ec06558e8e5368f6402456dd0dd436a65bf70fb
CREATE INDEX IF NOT EXISTS customer_autonomy_settings_org_idx ON public.customer_autonomy_settings USING btree (organization_id, updated_at DESC);

-- dealflow:statement id=20260519033000.indexes.014 sha256=2b3fc4d9fc9bfabec1b6d028d42ffe562b67c2ed377653864e97d986889b9350
CREATE INDEX IF NOT EXISTS idx_autonomy_settings_org ON public.organization_autonomy_settings USING btree (organization_id);

-- controls
-- dealflow:statement id=20260519033000.controls.001 sha256=0901fd0eea4705b6525e7f7a46af70d54709e42d97b417a03dd4b4812f1be781
DROP POLICY IF EXISTS "autonomy_action_audit_logs_member_select" ON "public"."autonomy_action_audit_logs";

-- dealflow:statement id=20260519033000.controls.002 sha256=2d76d352f16bb348319933000c27199a37df6f3c714b4e4ccb9fbb84bc045005
CREATE POLICY "autonomy_action_audit_logs_member_select" ON "public"."autonomy_action_audit_logs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.003 sha256=044ca5c25c40c0aca622331e106d212981fd7d30cac1789105e91003d56cf0d3
DROP POLICY IF EXISTS "autonomy_action_audit_logs_service_role_all" ON "public"."autonomy_action_audit_logs";

-- dealflow:statement id=20260519033000.controls.004 sha256=67a18500589f2c5d769018a031a178f575b51fdc4acf8a9174e49d16b29c6cd4
CREATE POLICY "autonomy_action_audit_logs_service_role_all" ON "public"."autonomy_action_audit_logs"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.005 sha256=0944a3388cbfd771435cf826548ae97d9a7d72a555621d5262d8b7f5b08224dc
DROP POLICY IF EXISTS "autonomy_action_logs_member_access" ON "public"."autonomy_action_logs";

-- dealflow:statement id=20260519033000.controls.006 sha256=f0ee63ee306669bcc33b15e496e615fe7dad2dbbd0c1b47480a6190cfb744bdf
CREATE POLICY "autonomy_action_logs_member_access" ON "public"."autonomy_action_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.007 sha256=a40f2d4940f3bdb0fc0636046f7e2fcb7cc68c080554ab121521ebc8062ef0f7
DROP POLICY IF EXISTS "autonomy_actions_member_select" ON "public"."autonomy_actions";

-- dealflow:statement id=20260519033000.controls.008 sha256=99c0e412e19691fbf2959419d6f15c62150f7cc297e746127a0ae396de188baf
CREATE POLICY "autonomy_actions_member_select" ON "public"."autonomy_actions"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.009 sha256=047eb8698008c99aa30d8891251d770b782967debd383f78f5fa9ad8917bc22d
DROP POLICY IF EXISTS "autonomy_actions_member_update" ON "public"."autonomy_actions";

-- dealflow:statement id=20260519033000.controls.010 sha256=564e4af87e0a9561464dd3dbc9193f0caa09904c283949b03e84689449a41d37
CREATE POLICY "autonomy_actions_member_update" ON "public"."autonomy_actions"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id))
  WITH CHECK (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.011 sha256=eadd0b699d304397f724c6365b5b88bbc2c6df8f1ea02c44598728cbd9e02b56
DROP POLICY IF EXISTS "autonomy_actions_service_role_all" ON "public"."autonomy_actions";

-- dealflow:statement id=20260519033000.controls.012 sha256=524c92e2eaa66ec09fec22184d45b22e567b911c3e0d0b7e626de5065fdc663a
CREATE POLICY "autonomy_actions_service_role_all" ON "public"."autonomy_actions"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.013 sha256=f6c3af0134e7059eb44eb37019aa9d91050a1cb51de7a0a433a70666cee76232
DROP POLICY IF EXISTS "autonomy_alerts_member_select" ON "public"."autonomy_alerts";

-- dealflow:statement id=20260519033000.controls.014 sha256=a4f2d2b14be95369d31fe6232ed4d8f0f8192bfec862523ef8b4757047fdf16e
CREATE POLICY "autonomy_alerts_member_select" ON "public"."autonomy_alerts"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.015 sha256=d6a7dd2be22ce75cc452c15720ce303846c9522388bfc37c5cb2ab454a47c9ed
DROP POLICY IF EXISTS "autonomy_alerts_service_role_all" ON "public"."autonomy_alerts";

-- dealflow:statement id=20260519033000.controls.016 sha256=038b008f3cc2987643f52859c60e83a088c76808bc135588bf66a8945898cb4a
CREATE POLICY "autonomy_alerts_service_role_all" ON "public"."autonomy_alerts"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.017 sha256=cf1ae419f27d154f9e920c00c644ed5cb686a7d7da03887c6cfb97e22fce06ea
DROP POLICY IF EXISTS "autonomy_execution_locks_service_role_all" ON "public"."autonomy_execution_locks";

-- dealflow:statement id=20260519033000.controls.018 sha256=6feea20b36b088703288e4b469460a335ed97bf90a1a4e5e6785051a07ebcc8c
CREATE POLICY "autonomy_execution_locks_service_role_all" ON "public"."autonomy_execution_locks"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.019 sha256=da9eda24f9ee5042a0ff867baab228df536b132af27693c4f420e01a2731f528
DROP POLICY IF EXISTS "autonomy_experiments_member_select" ON "public"."autonomy_experiments";

-- dealflow:statement id=20260519033000.controls.020 sha256=1587382c6f4e2deba2a52cb71a525ab0faf4479fee1993fc85b3d4829b86387f
CREATE POLICY "autonomy_experiments_member_select" ON "public"."autonomy_experiments"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.021 sha256=42d7b8f07e09860f3cebb4c7b78c2af02dfac6d63229ddc10abaac7c4c907798
DROP POLICY IF EXISTS "autonomy_experiments_member_update" ON "public"."autonomy_experiments";

-- dealflow:statement id=20260519033000.controls.022 sha256=c543b0005e6e5672fbb80e661e44c24cad3788e7e35282b125d999dd91e886c0
CREATE POLICY "autonomy_experiments_member_update" ON "public"."autonomy_experiments"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id))
  WITH CHECK (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.023 sha256=b9229e59a02ce129422ac33cbbd853225a35ab3e2a0e4bb4b8cf0cad3196b995
DROP POLICY IF EXISTS "autonomy_experiments_service_role_all" ON "public"."autonomy_experiments";

-- dealflow:statement id=20260519033000.controls.024 sha256=c78968aa3169e183e1d0fc75138b34f4ffb4ea6ed3a7f4e34cb9f3a3c549d57c
CREATE POLICY "autonomy_experiments_service_role_all" ON "public"."autonomy_experiments"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.025 sha256=8eed3492c7b76ddb50cd502178f64e4f2733df54132f66ae5c6caa3e4e6c1850
DROP POLICY IF EXISTS "autonomy_learning_memory_member_select" ON "public"."autonomy_learning_memory";

-- dealflow:statement id=20260519033000.controls.026 sha256=b5af5e8100d4671c7b933f2ef92a4d97b69af81df9055ff4cc62d94a118f60a6
CREATE POLICY "autonomy_learning_memory_member_select" ON "public"."autonomy_learning_memory"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.027 sha256=5adf400da6877c3b9174b0065e5f37db8fb45e94f4efebbd4a517d6cffae644b
DROP POLICY IF EXISTS "autonomy_learning_memory_service_role_all" ON "public"."autonomy_learning_memory";

-- dealflow:statement id=20260519033000.controls.028 sha256=5583ab00ff6b27e257bbeb47f6dd6a038a15b6ca9050248ef480e9e7be81f2e6
CREATE POLICY "autonomy_learning_memory_service_role_all" ON "public"."autonomy_learning_memory"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.029 sha256=7d986f6575da326733aba4f76c9a5212b229f327d8d32b327e27cc10c973ff47
DROP POLICY IF EXISTS "autonomy_rollbacks_member_select" ON "public"."autonomy_rollbacks";

-- dealflow:statement id=20260519033000.controls.030 sha256=cac23464de8ed2cb9bb729e6f229b4b98873f43bb03ce37c5fb772b32203ccd5
CREATE POLICY "autonomy_rollbacks_member_select" ON "public"."autonomy_rollbacks"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.031 sha256=c91faaf2da5ef1f1809527a9cac59f8c16e1702beb0ea3b6d289cd3eff2d2abd
DROP POLICY IF EXISTS "autonomy_rollbacks_service_role_all" ON "public"."autonomy_rollbacks";

-- dealflow:statement id=20260519033000.controls.032 sha256=1f28d7d8c184402464f29c5465ce4c94c5c2600e462d7b65f3bbced663172e68
CREATE POLICY "autonomy_rollbacks_service_role_all" ON "public"."autonomy_rollbacks"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.033 sha256=df762b08a0996a3a0f56b013019dfe4c3a7b126932b5400cf4f35a50980fead8
DROP POLICY IF EXISTS "autonomy_runs_member_select" ON "public"."autonomy_runs";

-- dealflow:statement id=20260519033000.controls.034 sha256=cd5ea471ec08593db6452279991e0b2a8a1a27f3b959714869dec86b58d04726
CREATE POLICY "autonomy_runs_member_select" ON "public"."autonomy_runs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.035 sha256=5e784c69e67058f8c1cc0d8f2022090487f65e35cb74f64b1062e05ce8051166
DROP POLICY IF EXISTS "autonomy_runs_service_role_all" ON "public"."autonomy_runs";

-- dealflow:statement id=20260519033000.controls.036 sha256=1030e26dc037d93f71752caccc62e60dbaf4320983d8e4149998a1bff5805445
CREATE POLICY "autonomy_runs_service_role_all" ON "public"."autonomy_runs"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.037 sha256=9c1726d5077f5a9bb63264c0747df7828512f31599d8c31f83ca71b1c927d893
DROP POLICY IF EXISTS "campaign_autonomy_settings_member_select" ON "public"."campaign_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.038 sha256=fb459dfb28336da680d3039d01f7c97fabb046f41539d7143bc3445df0e7d28a
CREATE POLICY "campaign_autonomy_settings_member_select" ON "public"."campaign_autonomy_settings"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.039 sha256=0447fcf6925de1ea996191a8492b55a45c52b38039c212c39c9110ab0cfc0b6c
DROP POLICY IF EXISTS "campaign_autonomy_settings_member_update" ON "public"."campaign_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.040 sha256=197d769618bae67683e60a7c0cfaf32f0dc0a703b1271152d6479bb5e83f039a
CREATE POLICY "campaign_autonomy_settings_member_update" ON "public"."campaign_autonomy_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id))
  WITH CHECK (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.041 sha256=8e536024bceda941d8b92171b5f5eec8636c5f8852dcd7c336c48e66802d8f6f
DROP POLICY IF EXISTS "campaign_autonomy_settings_service_role_all" ON "public"."campaign_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.042 sha256=00647f07773d4ddf72eb3188ee92b2c066b93468a2aeea566215e165ea724430
CREATE POLICY "campaign_autonomy_settings_service_role_all" ON "public"."campaign_autonomy_settings"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.043 sha256=9f3eb3ce9a9c30bcb1f0829e11bbdbfe3c301e551dcffda846909615f6167293
DROP POLICY IF EXISTS "customer_autonomy_settings_member_select" ON "public"."customer_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.044 sha256=937e8cafe613f78dbd0879c9a062ce9b3c31f5b8d7846db6ab69987f2f9bf874
CREATE POLICY "customer_autonomy_settings_member_select" ON "public"."customer_autonomy_settings"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.045 sha256=2377ea8dcc06bc75b09a334573350a971a2ec69ae242eb0ad544f3fb95365243
DROP POLICY IF EXISTS "customer_autonomy_settings_member_update" ON "public"."customer_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.046 sha256=e596f8c33861b2f640c263f646f81773e1a92a510f8987526a2936d623781a60
CREATE POLICY "customer_autonomy_settings_member_update" ON "public"."customer_autonomy_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id))
  WITH CHECK (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.047 sha256=c5b0f067e657562028d74353804687662119f0fa0280363b1fa37648e113124c
DROP POLICY IF EXISTS "customer_autonomy_settings_service_role_all" ON "public"."customer_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.048 sha256=c6a82f1e0deb622b5658c59441c9b67e20f23ad0d74a1ada97c58af882e94e93
CREATE POLICY "customer_autonomy_settings_service_role_all" ON "public"."customer_autonomy_settings"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519033000.controls.049 sha256=4e6920516101ad06f1e3dec1cb2f806c1b2bbdf4ebbb996b82aa3532adfe415c
DROP POLICY IF EXISTS "org_autonomy_settings_member_access" ON "public"."organization_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.050 sha256=cd1bcb94115b3172386146eb36a80058cc805f031e8c13aa96a0b17e5412a599
CREATE POLICY "org_autonomy_settings_member_access" ON "public"."organization_autonomy_settings"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260519033000.controls.051 sha256=bbe260bbbb2e2b17066c5147e0a057b8e072853efd1dcee5b6c077027576294c
DROP TRIGGER IF EXISTS "set_autonomy_action_logs_updated_at" ON "public"."autonomy_action_logs";

-- dealflow:statement id=20260519033000.controls.052 sha256=84d8a5a5f27c75637e6183b06159eaebaefbed4f17152a017ac8b196601005dc
CREATE TRIGGER set_autonomy_action_logs_updated_at BEFORE UPDATE ON public.autonomy_action_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260519033000.controls.053 sha256=f250090a7dde1a14e06dec81aa4b95a1666d3bb3af2e5952fa334f05eef2d9ea
DROP TRIGGER IF EXISTS "set_organization_autonomy_settings_updated_at" ON "public"."organization_autonomy_settings";

-- dealflow:statement id=20260519033000.controls.054 sha256=f125ab09023cd6da66f8b625a6b2ff1d3d8ef4059309d88abada691f3c0d8957
CREATE TRIGGER set_organization_autonomy_settings_updated_at BEFORE UPDATE ON public.organization_autonomy_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260519033000.controls.055 sha256=53c3547169b8efac73ec7aacb3d75d379720c54d3972cbfd359755bf991e4cba
ALTER TABLE "public"."autonomy_action_audit_logs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.056 sha256=04c1ba0564999cfe42f68d5389b295578887f6a4b2102e02112d4441d7912c66
ALTER TABLE "public"."autonomy_action_audit_logs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.057 sha256=4917f3e280fe787274814e7d56e0686ea6f86d758b294029c57eb6f36c7a4ddf
ALTER TABLE "public"."autonomy_action_logs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.058 sha256=906478e6fbd53363fe83ae6e1d9958bd1b3aa54f7587fbfd7a7f471bbd622306
ALTER TABLE "public"."autonomy_action_logs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.059 sha256=99228d75102e78c5f9b08d82779e2f0eec23b1fc2e788c713060a7e074e15bef
ALTER TABLE "public"."autonomy_actions" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.060 sha256=385e7099f04e89dbd2b6a22a76e8967f4c480efd686b4341d102c15641b69fb7
ALTER TABLE "public"."autonomy_actions" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.061 sha256=faae1929a61c13eb29525ff2b414d3143a805f2ef18742a68ba72b7f894c5cef
ALTER TABLE "public"."autonomy_alerts" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.062 sha256=c1e9f8a4bdbc6391cd1552a56e0632385e58f1fc41a7defe758fec924a0f69f4
ALTER TABLE "public"."autonomy_alerts" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.063 sha256=dd9003a661ad2c268c2a98c55f13d43512742add74dbacdc7df4ce9d55b3c69c
ALTER TABLE "public"."autonomy_execution_locks" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.064 sha256=019b14c8f3d279abb350d2ef59f154a7869c476f58d813a5b19db933dc178c7f
ALTER TABLE "public"."autonomy_execution_locks" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.065 sha256=846be22af18467374de663fee06df48c19880dfb084fb3daad0e40a5bd268ad8
ALTER TABLE "public"."autonomy_experiments" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.066 sha256=d60492e66191811e72cf05443c1489db0db40837ade0864a189327babd62d184
ALTER TABLE "public"."autonomy_experiments" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.067 sha256=fad73f570a978f188749ac9c275787b4ce0bd4fbe09e1ee35a35594812c42e0e
ALTER TABLE "public"."autonomy_learning_memory" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.068 sha256=4dd17e099dcfeaaa2f12f2a77aff2d1099204afea57ede752709f9bf66f3681f
ALTER TABLE "public"."autonomy_learning_memory" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.069 sha256=7c07536031f2a0f3a6bd56539c23894335d11404a0a39fc66baf9000440babb3
ALTER TABLE "public"."autonomy_rollbacks" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.070 sha256=9e29186549160fcc83a6e76409c57b71a192abdae797e3b0874574d524b84e30
ALTER TABLE "public"."autonomy_rollbacks" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.071 sha256=363538f90f44614f04e18f906db5596d2149ac4458741556e213518780a6b3bf
ALTER TABLE "public"."autonomy_runs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.072 sha256=d06529941dd9f18bf8acd7ff3889935af995536cc8480eaef47bf074902c8fd3
ALTER TABLE "public"."autonomy_runs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.073 sha256=dcf8b117eed3304d717145f04b1d09a5047d28e43feaf2677848d12c8606ad93
ALTER TABLE "public"."campaign_autonomy_settings" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.074 sha256=5df9d8dd35856e08dcac3cf16ee9076c085919e6967394fd7369b9840d769981
ALTER TABLE "public"."campaign_autonomy_settings" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.075 sha256=06cdfa2c22d0e4d8cce99bdd029ecd7c3729eead7ce3dbe0d9215acaca22489e
ALTER TABLE "public"."customer_autonomy_settings" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.076 sha256=16eadc83f8a14d243a71b0ff1a51a7a095911d7421437f5b567d91bdec5f5c95
ALTER TABLE "public"."customer_autonomy_settings" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.077 sha256=cd58ef9f6409772746143d948ba667352f99b7ed658a4a239373504d59d7eab6
ALTER TABLE "public"."organization_autonomy_settings" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519033000.controls.078 sha256=d387e4171f9e87fedec23c0a78c2cd7d1b10b10149974aa6f2b9e79930a711ab
ALTER TABLE "public"."organization_autonomy_settings" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260519033000$
BEGIN
  IF NOT (to_regclass('public.autonomy_action_audit_logs') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_action_logs') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_actions') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_alerts') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_execution_locks') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_experiments') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_learning_memory') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_rollbacks') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_runs') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_autonomy_settings') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.customer_autonomy_settings') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.organization_autonomy_settings') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_logs'::regclass AND conname='autonomy_action_logs_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_idempotency_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 17 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 18 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_execution_locks'::regclass AND conname='autonomy_execution_locks_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 19 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_execution_locks'::regclass AND conname='autonomy_execution_locks_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 20 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 21 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 22 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 23 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 24 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 25 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 26 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_key_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 27 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 28 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_autonomy_settings'::regclass AND conname='campaign_autonomy_settings_campaign_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 29 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_autonomy_settings'::regclass AND conname='campaign_autonomy_settings_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 30 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_autonomy_settings'::regclass AND conname='customer_autonomy_settings_org_unique')) THEN RAISE EXCEPTION '20260519033000 postcondition 31 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_autonomy_settings'::regclass AND conname='customer_autonomy_settings_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 32 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_autonomy_settings'::regclass AND conname='organization_autonomy_settings_organization_id_key')) THEN RAISE EXCEPTION '20260519033000 postcondition 33 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_autonomy_settings'::regclass AND conname='organization_autonomy_settings_pkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 34 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_event_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 35 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_classification_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 36 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_execution_type_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 37 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_status_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 38 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_severity_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 39 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_status_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 40 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_execution_locks'::regclass AND conname='autonomy_execution_locks_scope_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 41 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_one_variable_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 42 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_status_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 43 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_status_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 44 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_mode_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 45 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_status_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 46 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_autonomy_settings'::regclass AND conname='campaign_autonomy_settings_mode_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 47 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_autonomy_settings'::regclass AND conname='customer_autonomy_settings_mode_check')) THEN RAISE EXCEPTION '20260519033000 postcondition 48 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_action_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 49 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 50 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 51 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_audit_logs'::regclass AND conname='autonomy_action_audit_logs_run_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 52 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_action_logs'::regclass AND conname='autonomy_action_logs_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 53 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 54 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 55 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_actions'::regclass AND conname='autonomy_actions_run_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 56 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_action_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 57 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 58 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_alerts'::regclass AND conname='autonomy_alerts_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 59 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_execution_locks'::regclass AND conname='autonomy_execution_locks_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 60 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_execution_locks'::regclass AND conname='autonomy_execution_locks_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 61 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 62 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_experiments'::regclass AND conname='autonomy_experiments_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 63 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_action_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 64 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 65 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_experiment_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 66 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_learning_memory'::regclass AND conname='autonomy_learning_memory_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 67 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_action_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 68 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 69 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_rollbacks'::regclass AND conname='autonomy_rollbacks_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 70 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 71 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.autonomy_runs'::regclass AND conname='autonomy_runs_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 72 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_autonomy_settings'::regclass AND conname='campaign_autonomy_settings_campaign_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 73 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_autonomy_settings'::regclass AND conname='campaign_autonomy_settings_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 74 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_autonomy_settings'::regclass AND conname='customer_autonomy_settings_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 75 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organization_autonomy_settings'::regclass AND conname='organization_autonomy_settings_organization_id_fkey')) THEN RAISE EXCEPTION '20260519033000 postcondition 76 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_action_audit_logs_action_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 77 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_autonomy_logs_org_action_created') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 78 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_autonomy_logs_org_created') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 79 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_actions_approval_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 80 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_actions_org_campaign_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 81 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_alerts_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 82 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_execution_locks_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 83 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_experiments_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 84 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_learning_memory_pattern_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 85 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_rollbacks_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 86 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.autonomy_runs_org_campaign_started_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 87 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_autonomy_settings_org_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 88 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.customer_autonomy_settings_org_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 89 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_autonomy_settings_org') IS NOT NULL) THEN RAISE EXCEPTION '20260519033000 postcondition 90 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_action_audit_logs'::regclass AND polname='autonomy_action_audit_logs_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 91 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_action_audit_logs'::regclass AND polname='autonomy_action_audit_logs_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 92 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_action_logs'::regclass AND polname='autonomy_action_logs_member_access')) THEN RAISE EXCEPTION '20260519033000 postcondition 93 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_actions'::regclass AND polname='autonomy_actions_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 94 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_actions'::regclass AND polname='autonomy_actions_member_update')) THEN RAISE EXCEPTION '20260519033000 postcondition 95 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_actions'::regclass AND polname='autonomy_actions_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 96 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_alerts'::regclass AND polname='autonomy_alerts_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 97 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_alerts'::regclass AND polname='autonomy_alerts_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 98 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_execution_locks'::regclass AND polname='autonomy_execution_locks_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 99 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_experiments'::regclass AND polname='autonomy_experiments_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 100 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_experiments'::regclass AND polname='autonomy_experiments_member_update')) THEN RAISE EXCEPTION '20260519033000 postcondition 101 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_experiments'::regclass AND polname='autonomy_experiments_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 102 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_learning_memory'::regclass AND polname='autonomy_learning_memory_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 103 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_learning_memory'::regclass AND polname='autonomy_learning_memory_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 104 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_rollbacks'::regclass AND polname='autonomy_rollbacks_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 105 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_rollbacks'::regclass AND polname='autonomy_rollbacks_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 106 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_runs'::regclass AND polname='autonomy_runs_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 107 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.autonomy_runs'::regclass AND polname='autonomy_runs_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 108 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_autonomy_settings'::regclass AND polname='campaign_autonomy_settings_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 109 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_autonomy_settings'::regclass AND polname='campaign_autonomy_settings_member_update')) THEN RAISE EXCEPTION '20260519033000 postcondition 110 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_autonomy_settings'::regclass AND polname='campaign_autonomy_settings_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 111 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.customer_autonomy_settings'::regclass AND polname='customer_autonomy_settings_member_select')) THEN RAISE EXCEPTION '20260519033000 postcondition 112 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.customer_autonomy_settings'::regclass AND polname='customer_autonomy_settings_member_update')) THEN RAISE EXCEPTION '20260519033000 postcondition 113 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.customer_autonomy_settings'::regclass AND polname='customer_autonomy_settings_service_role_all')) THEN RAISE EXCEPTION '20260519033000 postcondition 114 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.organization_autonomy_settings'::regclass AND polname='org_autonomy_settings_member_access')) THEN RAISE EXCEPTION '20260519033000 postcondition 115 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.autonomy_action_logs'::regclass AND tgname='set_autonomy_action_logs_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260519033000 postcondition 116 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.organization_autonomy_settings'::regclass AND tgname='set_organization_autonomy_settings_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260519033000 postcondition 117 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260519033000$;
