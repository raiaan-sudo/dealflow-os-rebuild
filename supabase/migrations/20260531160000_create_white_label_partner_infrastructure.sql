-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260531160000 remote_name=create_white_label_partner_infrastructure original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260531160000_create_white_label_partner_infrastructure.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260531160000.preconditions.001 sha256=3b1f6d841d4df47de8015cd70700a967c8858589c66860fba42deba208349ce2
DO $dealflow_table_guard_partner_accounts$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_accounts_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_accounts_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_accounts_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"account_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"attribution_source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"attribution_detail":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"locked":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_accounts_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_accounts_required$["id","partner_id","account_id","user_id","attribution_source","attribution_detail","locked","created_at","updated_at"]$dealflow_table_guard_partner_accounts_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_accounts') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_accounts'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_accounts' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_accounts'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_accounts'::regclass
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
      WHERE attribute_record.attrelid='public.partner_accounts'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_accounts' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_accounts$;

-- dealflow:statement id=20260531160000.preconditions.002 sha256=2b63428f737e4c5487c0c3d8c75fa01465ea179be652e003822397b14c94e97b
DO $dealflow_table_guard_partner_audit_logs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_audit_logs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_audit_logs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_audit_logs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"actor_user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"actor_role":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"action":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"target_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"target_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"ip_address":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"user_agent":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_audit_logs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_audit_logs_required$["id","partner_id","actor_user_id","actor_role","action","target_type","target_id","metadata_json","ip_address","user_agent","created_at"]$dealflow_table_guard_partner_audit_logs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_audit_logs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_audit_logs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_audit_logs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_audit_logs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_audit_logs'::regclass
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
      WHERE attribute_record.attrelid='public.partner_audit_logs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_audit_logs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_audit_logs$;

-- dealflow:statement id=20260531160000.preconditions.003 sha256=04943890a681d09b2a3e73abbeea47b6ef6d746ff6cef3aa893fb202ae12bb00
DO $dealflow_table_guard_partner_billing_attribution$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_billing_attribution_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_billing_attribution_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_billing_attribution_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"account_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"stripe_customer_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"stripe_invoice_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"pricing_plan_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"attribution_source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"}}$dealflow_table_guard_partner_billing_attribution_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_billing_attribution_required$["id","partner_id","account_id","stripe_customer_id","stripe_subscription_id","stripe_invoice_id","pricing_plan_key","attribution_source","created_at","updated_at","metadata_json"]$dealflow_table_guard_partner_billing_attribution_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_billing_attribution') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_billing_attribution'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_billing_attribution' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_billing_attribution'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_billing_attribution'::regclass
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
      WHERE attribute_record.attrelid='public.partner_billing_attribution'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_billing_attribution' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_billing_attribution$;

-- dealflow:statement id=20260531160000.preconditions.004 sha256=c340e98f47b4524ba0a55c1f6b4e2108f4c7d088ec5b2c5a0c3137058d492902
DO $dealflow_table_guard_partner_branding$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_branding_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_branding_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_branding_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"theme_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"copy_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"email_branding_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"pricing_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"feature_flags_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_branding_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_branding_required$["id","partner_id","theme_json","copy_json","email_branding_json","pricing_json","feature_flags_json","created_at","updated_at"]$dealflow_table_guard_partner_branding_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_branding') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_branding'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_branding' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_branding'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_branding'::regclass
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
      WHERE attribute_record.attrelid='public.partner_branding'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_branding' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_branding$;

-- dealflow:statement id=20260531160000.preconditions.005 sha256=7a5f81b7454e4625768e129e7a28849afcf170c0c289d8495edec104cb6cb2bd
DO $dealflow_table_guard_partner_commission_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_commission_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_commission_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_commission_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"account_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"stripe_customer_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"stripe_invoice_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"event_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"gross_amount":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"net_amount":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"commission_rate":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(6,4)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"m"},"commission_amount":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"currency":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'usd'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'pending'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"notes":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"metadata_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"x"}}$dealflow_table_guard_partner_commission_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_commission_events_required$["id","partner_id","account_id","stripe_customer_id","stripe_subscription_id","stripe_invoice_id","event_type","gross_amount","net_amount","commission_rate","commission_amount","currency","status","notes","created_at","updated_at","metadata_json"]$dealflow_table_guard_partner_commission_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_commission_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_commission_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_commission_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_commission_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_commission_events'::regclass
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
      WHERE attribute_record.attrelid='public.partner_commission_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_commission_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_commission_events$;

-- dealflow:statement id=20260531160000.preconditions.006 sha256=72cd5f3a8df9ae8d4426a014104c3bd9b39f52a2671278f5a0a303a6573d689b
DO $dealflow_table_guard_partner_configs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_configs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_configs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_configs_columns${"partner_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"x"},"display_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"product_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"legal_fallback_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'DealFlow'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"support_email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"support_phone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"primary_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"secondary_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"accent_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"background_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"logo_url":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"favicon_url":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"billing_owner":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'dealflow'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"stripe_partner_metadata":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"ghl_enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"ghl_default_pipeline_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"ghl_default_stage_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"x"},"ghl_default_tags":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"x"},"sms_template":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'default'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":20,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":21,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":22,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_configs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_configs_required$["partner_id","display_name","product_name","legal_fallback_name","support_email","support_phone","primary_color","secondary_color","accent_color","background_color","logo_url","favicon_url","billing_owner","stripe_partner_metadata","ghl_enabled","ghl_default_pipeline_id","ghl_default_stage_id","ghl_default_tags","sms_template","metadata","created_at","updated_at"]$dealflow_table_guard_partner_configs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_configs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_configs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_configs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_configs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_configs'::regclass
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
      WHERE attribute_record.attrelid='public.partner_configs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_configs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_configs$;

-- dealflow:statement id=20260531160000.preconditions.007 sha256=7a36dff5a11c250f3834853ff383aa4dc27c17f790da40cd4a68043bb0c1c019
DO $dealflow_table_guard_partner_domains$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_domains_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_domains_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_domains_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"domain":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'primary'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"verification_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'pending'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"ssl_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'unknown'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"verification_token":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"encode(extensions.gen_random_bytes(24), 'hex'::text)","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"dns_target":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"last_checked_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"deleted_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_domains_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_domains_required$["id","partner_id","domain","type","verification_status","ssl_status","verification_token","dns_target","last_checked_at","created_at","updated_at","deleted_at"]$dealflow_table_guard_partner_domains_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_domains') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_domains'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_domains' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_domains'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_domains'::regclass
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
      WHERE attribute_record.attrelid='public.partner_domains'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_domains' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_domains$;

-- dealflow:statement id=20260531160000.preconditions.008 sha256=7c794ed446f4ab5a3265ed393017ae1258bfb247b0b3d81fc5099285f73d6b35
DO $dealflow_table_guard_partner_feature_flags$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_feature_flags_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_feature_flags_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_feature_flags_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"flag_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"config_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_feature_flags_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_feature_flags_required$["id","partner_id","flag_key","enabled","config_json","created_at","updated_at"]$dealflow_table_guard_partner_feature_flags_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_feature_flags') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_feature_flags'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_feature_flags' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_feature_flags'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_feature_flags'::regclass
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
      WHERE attribute_record.attrelid='public.partner_feature_flags'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_feature_flags' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_feature_flags$;

-- dealflow:statement id=20260531160000.preconditions.009 sha256=8c03c6531284a8785a747f77e68fc52d3b099ea52a94e046bf0e41180a716f33
DO $dealflow_table_guard_partner_ghl_config$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_ghl_config_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_ghl_config_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_ghl_config_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"auth_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'private_integration_token'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"encrypted_credential_ref":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"agency_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"company_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"default_location_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"default_pipeline_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"default_stage_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"default_tags":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"default_source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'DealFlow / Click to Scale'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"rate_limit_policy":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{\"backoff\": \"exponential\", \"requests_per_10s\": 100, \"requests_per_day\": 200000}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_ghl_config_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_ghl_config_required$["id","enabled","auth_type","encrypted_credential_ref","agency_id","company_id","default_location_id","default_pipeline_id","default_stage_id","default_tags","default_source","rate_limit_policy","created_at","updated_at","metadata","partner_id"]$dealflow_table_guard_partner_ghl_config_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_ghl_config') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_ghl_config'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_ghl_config' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_ghl_config'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_ghl_config'::regclass
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
      WHERE attribute_record.attrelid='public.partner_ghl_config'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_ghl_config' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_ghl_config$;

-- dealflow:statement id=20260531160000.preconditions.010 sha256=34321fe8b332667919501f0adf675dd62c4fb16447e7db5614ad138d2a7088e2
DO $dealflow_table_guard_partner_ghl_template_config$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_ghl_template_config_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_ghl_template_config_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_ghl_template_config_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"snapshot_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"default_pipeline_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"default_stage_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"default_custom_fields":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"default_tags":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_ghl_template_config_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_ghl_template_config_required$["id","enabled","snapshot_id","default_pipeline_name","default_stage_name","default_custom_fields","default_tags","metadata","created_at","updated_at","partner_id"]$dealflow_table_guard_partner_ghl_template_config_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_ghl_template_config') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_ghl_template_config'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_ghl_template_config' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_ghl_template_config'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_ghl_template_config'::regclass
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
      WHERE attribute_record.attrelid='public.partner_ghl_template_config'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_ghl_template_config' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_ghl_template_config$;

-- dealflow:statement id=20260531160000.preconditions.011 sha256=af5aecf525e698584958a56ccff6dc6935945f2876c79643c17636e69af36028
DO $dealflow_table_guard_partner_ghl_workflow_config$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_ghl_workflow_config_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_ghl_workflow_config_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_ghl_workflow_config_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"workflow_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"enrollment_trigger":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'lead_synced'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_ghl_workflow_config_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_ghl_workflow_config_required$["id","enabled","workflow_id","enrollment_trigger","metadata","created_at","updated_at","partner_id"]$dealflow_table_guard_partner_ghl_workflow_config_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_ghl_workflow_config') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_ghl_workflow_config'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_ghl_workflow_config' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_ghl_workflow_config'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_ghl_workflow_config'::regclass
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
      WHERE attribute_record.attrelid='public.partner_ghl_workflow_config'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_ghl_workflow_config' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_ghl_workflow_config$;

-- dealflow:statement id=20260531160000.preconditions.012 sha256=fb1b8ae6a920d152fafcf9949baab0319232a71c05ef325e93573f4f21c25b8f
DO $dealflow_table_guard_partner_invites$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_invites_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_invites_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_invites_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"role":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"attribution_source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"max_uses":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"integer","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"use_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"expires_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"used_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"used_by_user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'active'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_invites_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_invites_required$["id","partner_id","code","email","role","attribution_source","max_uses","use_count","expires_at","used_at","used_by_user_id","status","created_at","updated_at"]$dealflow_table_guard_partner_invites_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_invites') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_invites'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_invites' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_invites'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_invites'::regclass
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
      WHERE attribute_record.attrelid='public.partner_invites'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_invites' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_invites$;

-- dealflow:statement id=20260531160000.preconditions.013 sha256=8691e67ef9c3fa40fabef8c33c7975bdeea9d416275a97a82c366c4ac99b0e5e
DO $dealflow_table_guard_partner_memberships$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_memberships_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_memberships_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_memberships_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"role":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'partner_viewer'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'active'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_memberships_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_memberships_required$["id","partner_id","user_id","role","status","created_at","updated_at"]$dealflow_table_guard_partner_memberships_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_memberships') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_memberships'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_memberships' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_memberships'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_memberships'::regclass
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
      WHERE attribute_record.attrelid='public.partner_memberships'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_memberships' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_memberships$;

-- dealflow:statement id=20260531160000.preconditions.014 sha256=41680f3963951e4fd8bd0299c5884ceaf8068bdc87e70e3f732db698abbc6b18
DO $dealflow_table_guard_partner_support_settings$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_support_settings_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_support_settings_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_support_settings_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"support_mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'dealflow_first'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"support_email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"support_phone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"escalation_email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"support_footer_copy":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_support_settings_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_support_settings_required$["id","partner_id","support_mode","support_email","support_phone","escalation_email","support_footer_copy","created_at","updated_at"]$dealflow_table_guard_partner_support_settings_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_support_settings') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_support_settings'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_support_settings' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_support_settings'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_support_settings'::regclass
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
      WHERE attribute_record.attrelid='public.partner_support_settings'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_support_settings' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_support_settings$;

-- dealflow:statement id=20260531160000.preconditions.015 sha256=ea937fe755d5c9cb0b82a964ef83c58a574d82e5ee0ecbeb8698cbd9cdefa815
DO $dealflow_table_guard_partner_vertical_configs$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partner_vertical_configs_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partner_vertical_configs_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partner_vertical_configs_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"vertical_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'real_estate_agent'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"campaign_templates_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"funnel_templates_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"lead_form_schema_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"creative_prompt_templates_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"copy_rules_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"compliance_rules_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"dashboard_labels_json":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'active'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partner_vertical_configs_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partner_vertical_configs_required$["id","partner_id","vertical_key","campaign_templates_json","funnel_templates_json","lead_form_schema_json","creative_prompt_templates_json","copy_rules_json","compliance_rules_json","dashboard_labels_json","status","created_at","updated_at"]$dealflow_table_guard_partner_vertical_configs_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partner_vertical_configs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partner_vertical_configs'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partner_vertical_configs' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partner_vertical_configs'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partner_vertical_configs'::regclass
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
      WHERE attribute_record.attrelid='public.partner_vertical_configs'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partner_vertical_configs' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partner_vertical_configs$;

-- dealflow:statement id=20260531160000.preconditions.016 sha256=cd297d133adf226afeff6f0dea72b526656fcaa61df910de3b6efb474e9372f3
DO $dealflow_table_guard_partners$
DECLARE
  expected_table jsonb := $dealflow_table_guard_partners_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_partners_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_partners_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"slug":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"brand_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"legal_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"logo_url":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"favicon_url":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"primary_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'#67e8f9'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"secondary_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"accent_color":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"support_email":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"support_phone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"commission_rate":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric(6,4)","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"m"},"default_timezone":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'America/Toronto'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'draft'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"powered_by_dealflow":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"created_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"updated_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"},"deleted_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_partners_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_partners_required$["id","slug","brand_name","legal_name","logo_url","favicon_url","primary_color","secondary_color","accent_color","support_email","support_phone","commission_rate","default_timezone","status","powered_by_dealflow","created_by","updated_by","created_at","updated_at","deleted_at"]$dealflow_table_guard_partners_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.partners') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='partners'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'partners' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.partners'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.partners'::regclass
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
      WHERE attribute_record.attrelid='public.partners'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'partners' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_partners$;

-- dealflow:statement id=20260531160000.preconditions.017 sha256=2b93b02f6d5ee766fb7a3b8d36fb299e4c075b3f61c73b95294d312f31bea680
DO $dealflow_table_guard_workspace_partner_attribution$
DECLARE
  expected_table jsonb := $dealflow_table_guard_workspace_partner_attribution_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_workspace_partner_attribution_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_workspace_partner_attribution_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'admin'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"active":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"assigned_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_workspace_partner_attribution_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_workspace_partner_attribution_required$["id","workspace_id","source","active","metadata","assigned_by","created_at","updated_at","partner_id"]$dealflow_table_guard_workspace_partner_attribution_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.workspace_partner_attribution') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='workspace_partner_attribution'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'workspace_partner_attribution' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.workspace_partner_attribution'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.workspace_partner_attribution'::regclass
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
      WHERE attribute_record.attrelid='public.workspace_partner_attribution'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'workspace_partner_attribution' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_workspace_partner_attribution$;

-- dealflow:statement id=20260531160000.preconditions.018 sha256=18fb688212eb1e548993bfa659f5aaaec5740658fa4c22ec1674a0d945d3180e
DO $dealflow_column_guard_activation_events_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_activation_events_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_activation_events_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.activation_events') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.activation_events'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'activation_events', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_activation_events_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.019 sha256=547518965860f0d4495db4705e9af123d17983f7367767b83ab5cb074a99100a
DO $dealflow_column_guard_billing_cancellation_intents_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_cancellation_intents_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_billing_cancellation_intents_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.billing_cancellation_intents') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.billing_cancellation_intents'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_cancellation_intents', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_cancellation_intents_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.020 sha256=b1a404c3192306057723d677292d05c153c545697c93c1e2d9392e1fe4169083
DO $dealflow_column_guard_billing_subscriptions_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_subscriptions_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_billing_subscriptions_partner_id_expected$::jsonb;
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
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_subscriptions', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_subscriptions_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.021 sha256=abea7dda351dc400dac9331af883d55c86c86d587d94122bc88253bdb478ab61
DO $dealflow_column_guard_billing_subscriptions_partner_product_name$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_subscriptions_partner_product_name_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_billing_subscriptions_partner_product_name_expected$::jsonb;
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
  WHERE column_record.attname='partner_product_name';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_subscriptions', 'partner_product_name' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_subscriptions_partner_product_name$;

-- dealflow:statement id=20260531160000.preconditions.022 sha256=635aefe1c4ab00290ebccd5256a5c0c49092b258491e77d9948b9d9bdead35cb
DO $dealflow_column_guard_billing_subscriptions_partner_plan_label$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_subscriptions_partner_plan_label_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_billing_subscriptions_partner_plan_label_expected$::jsonb;
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
  WHERE column_record.attname='partner_plan_label';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_subscriptions', 'partner_plan_label' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_subscriptions_partner_plan_label$;

-- dealflow:statement id=20260531160000.preconditions.023 sha256=9dafeba301890e229757492420f0e84ee1f57d5d661f4dd6b39ace1925ff4328
DO $dealflow_column_guard_billing_subscriptions_partner_price_ids$
DECLARE
  expected_column jsonb := $dealflow_column_guard_billing_subscriptions_partner_price_ids_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":21,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_billing_subscriptions_partner_price_ids_expected$::jsonb;
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
  WHERE column_record.attname='partner_price_ids';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'billing_subscriptions', 'partner_price_ids' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_billing_subscriptions_partner_price_ids$;

-- dealflow:statement id=20260531160000.preconditions.024 sha256=949bf2d06115caa768c0993950a08d500eed11795a85ce0a9801a7dfccb526ba
DO $dealflow_column_guard_campaign_plans_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":28,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_campaign_plans_partner_id_expected$::jsonb;
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
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.025 sha256=cbbd4763e74d957c80c457834d3ffeff313beb213609c3b93cac1fdf78ec7b84
DO $dealflow_column_guard_campaign_sync_snapshots_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_sync_snapshots_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_campaign_sync_snapshots_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.campaign_sync_snapshots') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.campaign_sync_snapshots'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_sync_snapshots', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_sync_snapshots_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.026 sha256=8d57dcddb6c646fd129b38d4715df644b1ab9f5770915b334af9c4fb2426cf64
DO $dealflow_column_guard_client_error_events_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_client_error_events_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":21,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_client_error_events_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.client_error_events') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.client_error_events'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'client_error_events', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_client_error_events_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.027 sha256=3eaec504a96f0003eed623cbdf22c038cb6af37aa38e592886d3fe9d81d90789
DO $dealflow_column_guard_creative_assets_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_creative_assets_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_creative_assets_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.creative_assets') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.creative_assets'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'creative_assets', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_creative_assets_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.028 sha256=432b36aefc59ee292e8cba91ea4dc3e3f32ec15a53f6445b531959f40ae8e792
DO $dealflow_column_guard_customer_success_checklists_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_customer_success_checklists_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_customer_success_checklists_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.customer_success_checklists') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.customer_success_checklists'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'customer_success_checklists', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_customer_success_checklists_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.029 sha256=422261cd1bd0b7be30cdb689eb987319f8a81816106388c9b404b40f4fc9c644
DO $dealflow_column_guard_lead_billing_events_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_lead_billing_events_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_lead_billing_events_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.lead_billing_events') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.lead_billing_events'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'lead_billing_events', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_lead_billing_events_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.030 sha256=34be0ced30e9777b5009e8ba20957d23a1bb25d90aa5420f308b33d3caecfe50
DO $dealflow_column_guard_lead_messages_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_lead_messages_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_lead_messages_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.lead_messages') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.lead_messages'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'lead_messages', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_lead_messages_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.031 sha256=7e8b021ac01c705f22f3614edab557e51ba06941359958645d687b04900c1f71
DO $dealflow_column_guard_leads_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_leads_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":33,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_leads_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.leads') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.leads'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'leads', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_leads_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.032 sha256=cfe2e7f972d8fe5122d47bcdeda83f951401caedacf137896b997e937e56cbf0
DO $dealflow_column_guard_marketing_accounts_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_marketing_accounts_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":22,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_marketing_accounts_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.marketing_accounts') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.marketing_accounts'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'marketing_accounts', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_marketing_accounts_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.033 sha256=f6781c41223400a309abcdb1cf498e2fc8d270d40beaaa0c0eab28750ffa7d69
DO $dealflow_column_guard_organizations_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_organizations_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_organizations_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.organizations'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'organizations', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_organizations_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.034 sha256=1255170761a8921029452352fd2bddb74cea92aafab7e6674a21b16677ebcce1
DO $dealflow_column_guard_provider_usage_events_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_provider_usage_events_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_provider_usage_events_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.provider_usage_events') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.provider_usage_events'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'provider_usage_events', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_provider_usage_events_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.035 sha256=f4c7ab05843868f3fd62b977c38a983d5c86d48451293e075661c913a6fdf3a4
DO $dealflow_column_guard_provider_usage_limits_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_provider_usage_limits_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_provider_usage_limits_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.provider_usage_limits') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.provider_usage_limits'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'provider_usage_limits', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_provider_usage_limits_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.036 sha256=7ecff410579b7cc8f43b4a258eaf51a2d1ccff4fc6fe55605c7ba4ceb3b53978
DO $dealflow_column_guard_stripe_webhook_events_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_stripe_webhook_events_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_stripe_webhook_events_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.stripe_webhook_events') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.stripe_webhook_events'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'stripe_webhook_events', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_stripe_webhook_events_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.037 sha256=0f4113914ccdef7ce23c806ce61380dc605dfba511900d7da4d5e04ae030ba27
DO $dealflow_column_guard_system_jobs_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_system_jobs_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":26,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_system_jobs_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.system_jobs') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.system_jobs'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'system_jobs', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_system_jobs_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.038 sha256=0566168dfb069180293c084ee5af0f9bd4dc7c5f72f575b6f48bd2ce55ca4c47
DO $dealflow_column_guard_users_partner_id$
DECLARE
  expected_column jsonb := $dealflow_column_guard_users_partner_id_expected${"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"}$dealflow_column_guard_users_partner_id_expected$::jsonb;
  actual_column jsonb;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
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
    WHERE attribute_record.attrelid='public.users'::regclass
      AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
  ) column_record
  JOIN pg_catalog.pg_class relation_record ON relation_record.oid=column_record.attrelid
  LEFT JOIN pg_catalog.pg_attrdef default_record
    ON default_record.adrelid=column_record.attrelid AND default_record.adnum=column_record.attnum
  LEFT JOIN pg_catalog.pg_collation collation_record ON collation_record.oid=column_record.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid=collation_record.collnamespace
  WHERE column_record.attname='partner_id';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'users', 'partner_id' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_users_partner_id$;

-- dealflow:statement id=20260531160000.preconditions.039 sha256=7a3b43272adfd70f56e7fddf1d67cb6add8da13b71ccd22c55abd9f80eac803a
DO $dealflow_index_guard_billing_subscriptions_partner_idx$
BEGIN
  IF to_regclass('public.billing_subscriptions_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='billing_subscriptions_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX billing_subscriptions_partner_idx ON public.billing_subscriptions USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'billing_subscriptions_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_billing_subscriptions_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.040 sha256=c7f17e21103af5af2d419dc6b3f9a09a3d21c72d51c7e40531605cc1b42b4955
DO $dealflow_index_guard_campaign_plans_partner_idx$
BEGIN
  IF to_regclass('public.campaign_plans_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_plans_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_plans_partner_idx ON public.campaign_plans USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_plans_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_plans_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.041 sha256=49ee142c38ce8c2d443fedbe5d162db912fdd500b0d951a348fa43189213f9ab
DO $dealflow_index_guard_creative_assets_partner_idx$
BEGIN
  IF to_regclass('public.creative_assets_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='creative_assets_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX creative_assets_partner_idx ON public.creative_assets USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'creative_assets_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_creative_assets_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.042 sha256=34af738f28b0a1d2808206f61fb623f6927df4615f2f3cdc2dc1e0ee8c59a140
DO $dealflow_index_guard_leads_partner_idx$
BEGIN
  IF to_regclass('public.leads_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='leads_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX leads_partner_idx ON public.leads USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'leads_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_leads_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.043 sha256=682d2d5db0af5566db5420281d828dcf3570901620073d060309a466bb67db53
DO $dealflow_index_guard_organizations_partner_idx$
BEGIN
  IF to_regclass('public.organizations_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='organizations_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX organizations_partner_idx ON public.organizations USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'organizations_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_organizations_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.044 sha256=17519221890ca0cf72b40af2317dcf6060eec64b0cd7bc1fae6f843a5416cef6
DO $dealflow_index_guard_partner_accounts_account_idx$
BEGIN
  IF to_regclass('public.partner_accounts_account_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_accounts_account_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_accounts_account_idx ON public.partner_accounts USING btree (account_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_accounts_account_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_accounts_account_idx$;

-- dealflow:statement id=20260531160000.preconditions.045 sha256=effa707d9ee8a615f9de60da0d05448f421a5c93dfa0fe84a54604f361fb0fcb
DO $dealflow_index_guard_partner_accounts_partner_account_idx$
BEGIN
  IF to_regclass('public.partner_accounts_partner_account_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_accounts_partner_account_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_accounts_partner_account_idx ON public.partner_accounts USING btree (partner_id, account_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_accounts_partner_account_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_accounts_partner_account_idx$;

-- dealflow:statement id=20260531160000.preconditions.046 sha256=9962c85a55a9aa58782ea421ae230832762ea6899bb2a8880b0a8ce0384ac33e
DO $dealflow_index_guard_partner_audit_logs_partner_created_idx$
BEGIN
  IF to_regclass('public.partner_audit_logs_partner_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_audit_logs_partner_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_audit_logs_partner_created_idx ON public.partner_audit_logs USING btree (partner_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_audit_logs_partner_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_audit_logs_partner_created_idx$;

-- dealflow:statement id=20260531160000.preconditions.047 sha256=12752f14b5d16d0c5bb0bdfde0d3436d1c59fc004c06b7e0ff332379b5f38a50
DO $dealflow_index_guard_partner_billing_attribution_customer_idx$
BEGIN
  IF to_regclass('public.partner_billing_attribution_customer_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_billing_attribution_customer_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_billing_attribution_customer_idx ON public.partner_billing_attribution USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_billing_attribution_customer_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_billing_attribution_customer_idx$;

-- dealflow:statement id=20260531160000.preconditions.048 sha256=1e854f3b400cb754f519371a20b4fe32db3f820c9c45c408762593b7a62cdc5f
DO $dealflow_index_guard_partner_billing_attribution_invoice_idx$
BEGIN
  IF to_regclass('public.partner_billing_attribution_invoice_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_billing_attribution_invoice_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_billing_attribution_invoice_idx ON public.partner_billing_attribution USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_billing_attribution_invoice_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_billing_attribution_invoice_idx$;

-- dealflow:statement id=20260531160000.preconditions.049 sha256=994c1c90671c13785caddcc9e794860ad4c8571b191e463589a48644199eb6e3
DO $dealflow_index_guard_partner_billing_attribution_subscription_idx$
BEGIN
  IF to_regclass('public.partner_billing_attribution_subscription_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_billing_attribution_subscription_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_billing_attribution_subscription_idx ON public.partner_billing_attribution USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_billing_attribution_subscription_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_billing_attribution_subscription_idx$;

-- dealflow:statement id=20260531160000.preconditions.050 sha256=31f142d1b29112e606df005982422f498ce7b15c5f203d2b50cb8acce0acafb8
DO $dealflow_index_guard_partner_commission_events_invoice_event_unique$
BEGIN
  IF to_regclass('public.partner_commission_events_invoice_event_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_commission_events_invoice_event_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX partner_commission_events_invoice_event_unique ON public.partner_commission_events USING btree (partner_id, stripe_invoice_id, event_type) WHERE (stripe_invoice_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_commission_events_invoice_event_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_commission_events_invoice_event_unique$;

-- dealflow:statement id=20260531160000.preconditions.051 sha256=f71a4dc74366ef4049796dbe2ccc847a97d1844e71229099e3245553bf9bc67d
DO $dealflow_index_guard_partner_commission_events_partner_status_idx$
BEGIN
  IF to_regclass('public.partner_commission_events_partner_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_commission_events_partner_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_commission_events_partner_status_idx ON public.partner_commission_events USING btree (partner_id, status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_commission_events_partner_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_commission_events_partner_status_idx$;

-- dealflow:statement id=20260531160000.preconditions.052 sha256=162bee350b3f8a1b11ab1ca4b59a257652a66ef277ec2695968b0e0b03913968
DO $dealflow_index_guard_partner_domains_partner_idx$
BEGIN
  IF to_regclass('public.partner_domains_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_domains_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_domains_partner_idx ON public.partner_domains USING btree (partner_id, verification_status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_domains_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_domains_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.053 sha256=f35627d3c0b4e0529cffc1716ea267676d26f3b4280f3d5161a18ee3be734fca
DO $dealflow_index_guard_partner_ghl_config_partner_unique$
BEGIN
  IF to_regclass('public.partner_ghl_config_partner_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_ghl_config_partner_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX partner_ghl_config_partner_unique ON public.partner_ghl_config USING btree (partner_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_ghl_config_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_ghl_config_partner_unique$;

-- dealflow:statement id=20260531160000.preconditions.054 sha256=4d1de3e1b676afda23eb1131393f28753a11099b9d184eb7181a9c3e5cb7fcc9
DO $dealflow_index_guard_partner_ghl_template_config_partner_unique$
BEGIN
  IF to_regclass('public.partner_ghl_template_config_partner_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_ghl_template_config_partner_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX partner_ghl_template_config_partner_unique ON public.partner_ghl_template_config USING btree (partner_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_ghl_template_config_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_ghl_template_config_partner_unique$;

-- dealflow:statement id=20260531160000.preconditions.055 sha256=c0107940409038b69f6f033de6831218f3f7bfdf2bef48a8c6772fd1f7d181ef
DO $dealflow_index_guard_partner_ghl_workflow_config_partner_unique$
BEGIN
  IF to_regclass('public.partner_ghl_workflow_config_partner_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_ghl_workflow_config_partner_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX partner_ghl_workflow_config_partner_unique ON public.partner_ghl_workflow_config USING btree (partner_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_ghl_workflow_config_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_ghl_workflow_config_partner_unique$;

-- dealflow:statement id=20260531160000.preconditions.056 sha256=a62a4827573a86c6591d3b973c2559f56c9a5e6d5e71625c77d4817e4c8fdfff
DO $dealflow_index_guard_partner_memberships_partner_user_idx$
BEGIN
  IF to_regclass('public.partner_memberships_partner_user_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_memberships_partner_user_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_memberships_partner_user_idx ON public.partner_memberships USING btree (partner_id, user_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_memberships_partner_user_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_memberships_partner_user_idx$;

-- dealflow:statement id=20260531160000.preconditions.057 sha256=e98b3caa818bc1deafad37f77175b842c87b784ca10da5bcaa18260aea1ace1d
DO $dealflow_index_guard_partner_memberships_user_idx$
BEGIN
  IF to_regclass('public.partner_memberships_user_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_memberships_user_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partner_memberships_user_idx ON public.partner_memberships USING btree (user_id, status)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_memberships_user_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_memberships_user_idx$;

-- dealflow:statement id=20260531160000.preconditions.058 sha256=075a0d748ed08131ce56f91eda76fb6b452b4d1e2efe50327373abb1e44300ec
DO $dealflow_index_guard_partner_vertical_configs_native_unique$
BEGIN
  IF to_regclass('public.partner_vertical_configs_native_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partner_vertical_configs_native_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX partner_vertical_configs_native_unique ON public.partner_vertical_configs USING btree (vertical_key) WHERE (partner_id IS NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partner_vertical_configs_native_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partner_vertical_configs_native_unique$;

-- dealflow:statement id=20260531160000.preconditions.059 sha256=32fafe9a34ae4daaad47ccf7434081e0705cdd51518bde7c279f857996807e37
DO $dealflow_index_guard_partners_status_idx$
BEGIN
  IF to_regclass('public.partners_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='partners_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX partners_status_idx ON public.partners USING btree (status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'partners_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_partners_status_idx$;

-- dealflow:statement id=20260531160000.preconditions.060 sha256=a4b8ac33e617638a4d782c19c14eee186e309cbd47f3502ae1c4c6612204a670
DO $dealflow_index_guard_users_partner_idx$
BEGIN
  IF to_regclass('public.users_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='users_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX users_partner_idx ON public.users USING btree (partner_id) WHERE (partner_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'users_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_users_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.061 sha256=d6190be89a83814752aae88f04d9beda347632fcc8ac5ba5ddc75def2b00c936
DO $dealflow_index_guard_workspace_partner_attribution_workspace_partner_idx$
BEGIN
  IF to_regclass('public.workspace_partner_attribution_workspace_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_partner_attribution_workspace_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX workspace_partner_attribution_workspace_partner_idx ON public.workspace_partner_attribution USING btree (workspace_id, partner_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_partner_attribution_workspace_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_partner_attribution_workspace_partner_idx$;

-- dealflow:statement id=20260531160000.preconditions.062 sha256=d234cb7676b467b0a9e22c2d8f7ebee29c0da86e9fc89fde3f9b50d33b4b11d0
DO $dealflow_index_guard_workspace_partner_attribution_workspace_unique$
BEGIN
  IF to_regclass('public.workspace_partner_attribution_workspace_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_partner_attribution_workspace_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX workspace_partner_attribution_workspace_unique ON public.workspace_partner_attribution USING btree (workspace_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_partner_attribution_workspace_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_partner_attribution_workspace_unique$;

-- tables
-- dealflow:statement id=20260531160000.tables.001 sha256=3a5c22900d0c0c981b92547530474f181d6009346e1481eb60405963d9932e39
CREATE TABLE IF NOT EXISTS "public"."partner_accounts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "user_id" uuid,
  "attribution_source" text NOT NULL,
  "attribution_detail" text,
  "locked" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.002 sha256=6010565cbe693be654e6c4fbe4aaed761f7b8fc221a8e5353a4512d2e2ea3421
CREATE TABLE IF NOT EXISTS "public"."partner_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid,
  "actor_user_id" uuid,
  "actor_role" text,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.003 sha256=c3b3379d3e871968f03bb4758c27550065858499f6403899342fd7ce073eb460
CREATE TABLE IF NOT EXISTS "public"."partner_billing_attribution" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_invoice_id" text,
  "pricing_plan_key" text,
  "attribution_source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- dealflow:statement id=20260531160000.tables.004 sha256=9327a971b287e31a943d3fec4ebb7b27b1f34118b323736f5c7c089c938db842
CREATE TABLE IF NOT EXISTS "public"."partner_branding" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "theme_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "copy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "email_branding_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pricing_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "feature_flags_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.005 sha256=428c6aa3c1c551dfc3f71b54ced84fe453ae061f3efd2144e7baecfd495be5ac
CREATE TABLE IF NOT EXISTS "public"."partner_commission_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_invoice_id" text,
  "event_type" text NOT NULL,
  "gross_amount" integer DEFAULT 0 NOT NULL,
  "net_amount" integer,
  "commission_rate" numeric(6,4) DEFAULT 0 NOT NULL,
  "commission_amount" integer DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'usd'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- dealflow:statement id=20260531160000.tables.006 sha256=bcdbc5381ff37e7a48aa030d564d8eafed8965b008e2b41a50e0608b227bfff2
CREATE TABLE IF NOT EXISTS "public"."partner_configs" (
  "partner_id" text NOT NULL,
  "display_name" text NOT NULL,
  "product_name" text NOT NULL,
  "legal_fallback_name" text DEFAULT 'DealFlow'::text NOT NULL,
  "support_email" text NOT NULL,
  "support_phone" text,
  "primary_color" text NOT NULL,
  "secondary_color" text NOT NULL,
  "accent_color" text NOT NULL,
  "background_color" text NOT NULL,
  "logo_url" text,
  "favicon_url" text,
  "billing_owner" text DEFAULT 'dealflow'::text NOT NULL,
  "stripe_partner_metadata" text NOT NULL,
  "ghl_enabled" boolean DEFAULT false NOT NULL,
  "ghl_default_pipeline_id" text,
  "ghl_default_stage_id" text,
  "ghl_default_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sms_template" text DEFAULT 'default'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260531160000.tables.007 sha256=1dd90cdb9ed8b1100bdbd10b0103fd4910b2446ba4ac5ffb122ed2b39f49b2f8
CREATE TABLE IF NOT EXISTS "public"."partner_domains" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "type" text DEFAULT 'primary'::text NOT NULL,
  "verification_status" text DEFAULT 'pending'::text NOT NULL,
  "ssl_status" text DEFAULT 'unknown'::text NOT NULL,
  "verification_token" text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
  "dns_target" text,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "deleted_at" timestamp with time zone
);

-- dealflow:statement id=20260531160000.tables.008 sha256=03ceba6532201308a65018d23411acdd4293c68ed1b736d0ff2fd1453756c535
CREATE TABLE IF NOT EXISTS "public"."partner_feature_flags" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "flag_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config_json" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.009 sha256=6687fc94f2c7536176b818f7e5b7822acc8fdc807de22f33048a8cc7391998aa
CREATE TABLE IF NOT EXISTS "public"."partner_ghl_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "auth_type" text DEFAULT 'private_integration_token'::text NOT NULL,
  "encrypted_credential_ref" text NOT NULL,
  "agency_id" text,
  "company_id" text,
  "default_location_id" text,
  "default_pipeline_id" text,
  "default_stage_id" text,
  "default_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_source" text DEFAULT 'DealFlow / Click to Scale'::text NOT NULL,
  "rate_limit_policy" jsonb DEFAULT '{"backoff": "exponential", "requests_per_10s": 100, "requests_per_day": 200000}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260531160000.tables.010 sha256=9973f28875b105ff2a66341ff9dd76f8c2f353167e4974066e349d4cf771e35a
CREATE TABLE IF NOT EXISTS "public"."partner_ghl_template_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "snapshot_id" text,
  "default_pipeline_name" text,
  "default_stage_name" text,
  "default_custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260531160000.tables.011 sha256=ed33450f727ca223663135da242e2cda889dd1c425c7f563f018dc6c6bcbc1b5
CREATE TABLE IF NOT EXISTS "public"."partner_ghl_workflow_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "workflow_id" text,
  "enrollment_trigger" text DEFAULT 'lead_synced'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- dealflow:statement id=20260531160000.tables.012 sha256=a1eaa087af66762b75ecef6911c9a394dd8c5c0a23e98e0309566f49a84608c2
CREATE TABLE IF NOT EXISTS "public"."partner_invites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "code" text NOT NULL,
  "email" text,
  "role" text,
  "attribution_source" text,
  "max_uses" integer,
  "use_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "used_at" timestamp with time zone,
  "used_by_user_id" uuid,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.013 sha256=3cff766eb909f25ba031015a39532309c0e16a24127f3d63cd5d7c20f9c14be6
CREATE TABLE IF NOT EXISTS "public"."partner_memberships" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'partner_viewer'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.014 sha256=31f375e6c1d91992ff4a6e22c051be6900159b7d28c51b0923e5fcc2bf9aacf2
CREATE TABLE IF NOT EXISTS "public"."partner_support_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "support_mode" text DEFAULT 'dealflow_first'::text NOT NULL,
  "support_email" text,
  "support_phone" text,
  "escalation_email" text,
  "support_footer_copy" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.015 sha256=8dd87d38307c3228221bb954fa45e3103211f3730822d7e3c0626e4437f3ae24
CREATE TABLE IF NOT EXISTS "public"."partner_vertical_configs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid,
  "vertical_key" text DEFAULT 'real_estate_agent'::text NOT NULL,
  "campaign_templates_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "funnel_templates_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "lead_form_schema_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "creative_prompt_templates_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "copy_rules_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "compliance_rules_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dashboard_labels_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260531160000.tables.016 sha256=2a524b0f8e1231f3106932ee8936a9bcddb2760e71bf65739bec2d2e05a27b7b
CREATE TABLE IF NOT EXISTS "public"."partners" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "brand_name" text NOT NULL,
  "legal_name" text,
  "logo_url" text,
  "favicon_url" text,
  "primary_color" text DEFAULT '#67e8f9'::text NOT NULL,
  "secondary_color" text,
  "accent_color" text,
  "support_email" text,
  "support_phone" text,
  "commission_rate" numeric(6,4) DEFAULT 0 NOT NULL,
  "default_timezone" text DEFAULT 'America/Toronto'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "powered_by_dealflow" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "deleted_at" timestamp with time zone
);

-- dealflow:statement id=20260531160000.tables.017 sha256=7806d21f25b9c39c0469e9fc20be865747b6d7517bbac94d75fb8fb32e9e070a
CREATE TABLE IF NOT EXISTS "public"."workspace_partner_attribution" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source" text DEFAULT 'admin'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "assigned_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_id" uuid NOT NULL
);

-- columns
-- dealflow:statement id=20260531160000.columns.001 sha256=aa9097431f3c3695cd81f58c2b3b45a4b64dd22c3337a6a95cf0a796c29fe560
ALTER TABLE "public"."activation_events" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.002 sha256=adba80e3a5362526ed5a8fd403cac9ffa276fecff59f5663d38003bedce99781
ALTER TABLE "public"."billing_cancellation_intents" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.003 sha256=97548cfec735ac464324024bd7e2fdfd963ac6f8b880b1f7f64dd3b61f941959
ALTER TABLE "public"."billing_subscriptions" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.004 sha256=cc09850d08872bc5de8b74c0dc5a3298e0ac1364af25729c166a29df4cdec89b
ALTER TABLE "public"."billing_subscriptions" ADD COLUMN IF NOT EXISTS "partner_product_name" text;

-- dealflow:statement id=20260531160000.columns.005 sha256=f8dd2b1a8f2cad28d3788e43dfb5d6b7a59033202e7c89f8931b10b87866b487
ALTER TABLE "public"."billing_subscriptions" ADD COLUMN IF NOT EXISTS "partner_plan_label" text;

-- dealflow:statement id=20260531160000.columns.006 sha256=cee1884e29f95e1ea73feae9127de3dea0ef02eabe0194925e0e2974389bd41d
ALTER TABLE "public"."billing_subscriptions" ADD COLUMN IF NOT EXISTS "partner_price_ids" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- dealflow:statement id=20260531160000.columns.007 sha256=a7cefd396e134e97fe7dd493ac44cb439af4141aa68e29650c08b21dfacbf567
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.008 sha256=e220dafa86de5b9c90474dd8583a25aadc10c13255e381becd4ad5e769b3b8a1
ALTER TABLE "public"."campaign_sync_snapshots" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.009 sha256=1b0c5d1ef80c259041ad423afdaa6f7fd2f6bfa3bd6defbe49893d9fc2b631ba
ALTER TABLE "public"."client_error_events" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.010 sha256=341a70c47e9a3596fc892cebdd0315d2cc566ea2eb795de9c39e34d2d5e3a490
ALTER TABLE "public"."creative_assets" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.011 sha256=7279552171f89ecae89eee8943523040d68e56bd187a43296f411749b66ee455
ALTER TABLE "public"."customer_success_checklists" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.012 sha256=3de4f175cc8f79ee02046b0705943e790927baa52f0394a461100365f7a18362
ALTER TABLE "public"."lead_billing_events" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.013 sha256=089a52dd814866534124a48962ccd1ca2434a7b05c2a0e3f42cc02387b026303
ALTER TABLE "public"."lead_messages" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.014 sha256=a0dcac2a7a1c7e18acf8d938169d1c84905d081f8c9bab4aeedbdeddc1bb9d15
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.015 sha256=da8e315d9f50e07c16a5d3911d6722b5b14ef64e44a296c162326ccb78a6ec75
ALTER TABLE "public"."marketing_accounts" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.016 sha256=3dcd01f451d252128a617efcebbd701bc41be12eacf6e389bebad60582fc3cce
ALTER TABLE "public"."organizations" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.017 sha256=7be0d54be8fa9376e12bd4ab1fa6a57550eee896353540204b3ee0f4032c664e
ALTER TABLE "public"."provider_usage_events" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.018 sha256=27a294e99061f6055651a31b52e529331ed1894b967e69ccc9310beab07728e2
ALTER TABLE "public"."provider_usage_limits" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.019 sha256=7571733906254cbee52e1233ff46f5edb0a8b1cd3b253377427778714c4eff02
ALTER TABLE "public"."stripe_webhook_events" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.020 sha256=30434bd3f00e664887d690969eec4e10db126859956a5b188952846d48376dff
ALTER TABLE "public"."system_jobs" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- dealflow:statement id=20260531160000.columns.021 sha256=a7377f1cc4bf3eef3e4d080c18e2eb7010e3f26968b888fa8a695091da05cea3
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "partner_id" uuid;

-- routines
-- dealflow:statement id=20260531160000.routines.001 sha256=87ab01d5830295b8449273fdc16ff526496676055d34c231b54c383cefff2c5d
CREATE OR REPLACE FUNCTION public.is_current_user_partner_member(p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.partner_memberships membership_record
    where membership_record.partner_id = p_partner_id
      and membership_record.user_id = auth.uid()
      and membership_record.status = 'active'
  );
$function$;

-- constraints
-- dealflow:statement id=20260531160000.constraints.001 sha256=58d6c5899ff4a72f620a48c8e826ecaeb2f72ad7ed338bb7846148e613c9bbd4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_account_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_account_unique" UNIQUE (account_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (account_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_account_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.002 sha256=1c429232087fa5d4aa2b78e2fc0324901b8538a749f2c74575eae55a552d5617
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.003 sha256=868576ebb6b4028637eb0322e4378be47accb89a428377afdbcc7ce2eba55de1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_audit_logs'::regclass
    AND constraint_record.conname='partner_audit_logs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_audit_logs" ADD CONSTRAINT "partner_audit_logs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_audit_logs', 'partner_audit_logs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.004 sha256=07a00f14d130d9fd225c6dfd872dd6f65ed443e5cdfa33a2c97f63c75244beee
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_billing_attribution'::regclass
    AND constraint_record.conname='partner_billing_attribution_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_billing_attribution" ADD CONSTRAINT "partner_billing_attribution_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_billing_attribution', 'partner_billing_attribution_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.005 sha256=a7a5137ca3dd3ad9303691545b49fb9ab9f0ddb3734860128e173e53692be28f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_branding'::regclass
    AND constraint_record.conname='partner_branding_partner_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_branding" ADD CONSTRAINT "partner_branding_partner_unique" UNIQUE (partner_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (partner_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_branding', 'partner_branding_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.006 sha256=49d611d7e5d2622f0bc615f5eaff6e2e06119f355ccd2a10c68752c9cd93047c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_branding'::regclass
    AND constraint_record.conname='partner_branding_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_branding" ADD CONSTRAINT "partner_branding_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_branding', 'partner_branding_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.007 sha256=364530623f809e5364e021c733052220047c436f940f2a99b2d22a4b8fc9004f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_commission_events'::regclass
    AND constraint_record.conname='partner_commission_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_commission_events" ADD CONSTRAINT "partner_commission_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_commission_events', 'partner_commission_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.008 sha256=f57d6fecf562ff4fcd41a5cc43e3fadf3457c90861d9c74b3f22d5de0137fa7a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_configs'::regclass
    AND constraint_record.conname='partner_configs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_configs" ADD CONSTRAINT "partner_configs_pkey" PRIMARY KEY (partner_id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (partner_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_configs', 'partner_configs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.009 sha256=8d278a032f0b6fd1cb66c80772e3e995b965f39b39b075b367a36df3745da6e2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_domain_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_domain_unique" UNIQUE (domain);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (domain)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_domain_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.010 sha256=083f79bf49c67d0ebadb9bdcd5e2175fdadc7e9fc7631ddc9cff9d3cd6e06b38
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.011 sha256=55c5af29dbe9a7db28110d4b3b0af98a4976d6dbc2fdbc653f8ac15fd8376644
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_feature_flags'::regclass
    AND constraint_record.conname='partner_feature_flags_partner_key_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_feature_flags" ADD CONSTRAINT "partner_feature_flags_partner_key_unique" UNIQUE (partner_id, flag_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (partner_id, flag_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_feature_flags', 'partner_feature_flags_partner_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.012 sha256=768a750445d84b75865777013e34658baf24538519b6b77eb69730c37cdd48d8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_feature_flags'::regclass
    AND constraint_record.conname='partner_feature_flags_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_feature_flags" ADD CONSTRAINT "partner_feature_flags_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_feature_flags', 'partner_feature_flags_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.013 sha256=77cf85bfaaaf0dc709359510d9b2ceb065ac1b1f35825359ef69a6d1f499e5b0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_config'::regclass
    AND constraint_record.conname='partner_ghl_config_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_config" ADD CONSTRAINT "partner_ghl_config_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_config', 'partner_ghl_config_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.014 sha256=38407eebd9ed79afbc1cdedcc25b482181dd57299151d8bf5a179553f22ec74d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_template_config'::regclass
    AND constraint_record.conname='partner_ghl_template_config_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_template_config" ADD CONSTRAINT "partner_ghl_template_config_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_template_config', 'partner_ghl_template_config_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.015 sha256=a91756d8c9954bf403ae03224d3b92cadf60bd6d8638e1c70ff77ace35b81c7f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_workflow_config'::regclass
    AND constraint_record.conname='partner_ghl_workflow_config_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_workflow_config" ADD CONSTRAINT "partner_ghl_workflow_config_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_workflow_config', 'partner_ghl_workflow_config_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.016 sha256=bc9ef3ee38345a951061a5658bddbe7f9b76f544396f491231de037386e280ef
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_code_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_code_unique" UNIQUE (code);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (code)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_code_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.017 sha256=d13824f59e851af5e0aa19a5910547051ef0bf69e0bf1ecc4235b93fcd2b967c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.018 sha256=8d5154b1020cfcf9a03bd2125beb4aba9baeeef1417ee8a94ea6f91016a61d90
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_partner_user_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_partner_user_unique" UNIQUE (partner_id, user_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (partner_id, user_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_partner_user_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.019 sha256=5f8ce9900f7a37eff9d68dab76fc51db25e464c7cb54cec1162282067a4d51f0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.020 sha256=71b5bd2a66195c90ba8d7e8d440f314b0c5ef9205a36a39e6463f5bd16f67232
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_support_settings'::regclass
    AND constraint_record.conname='partner_support_settings_partner_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_support_settings" ADD CONSTRAINT "partner_support_settings_partner_unique" UNIQUE (partner_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (partner_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_support_settings', 'partner_support_settings_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.021 sha256=996d40ee5455de333132b288cac9b930e986e780c0fd88db5c0070d631d8a112
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_support_settings'::regclass
    AND constraint_record.conname='partner_support_settings_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_support_settings" ADD CONSTRAINT "partner_support_settings_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_support_settings', 'partner_support_settings_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.022 sha256=3344ee22303bc798dd4fbd3cf59420555b75374fa1d73ee6d345ce6b5fdaa155
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_vertical_configs'::regclass
    AND constraint_record.conname='partner_vertical_configs_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_vertical_configs" ADD CONSTRAINT "partner_vertical_configs_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_vertical_configs', 'partner_vertical_configs_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.023 sha256=e7c473bb1982b5364f7dcb90fac87ddbc9ab11676f58168b7f7f572efcfc0104
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_vertical_configs'::regclass
    AND constraint_record.conname='partner_vertical_configs_scope_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_vertical_configs" ADD CONSTRAINT "partner_vertical_configs_scope_unique" UNIQUE (partner_id, vertical_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (partner_id, vertical_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_vertical_configs', 'partner_vertical_configs_scope_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.024 sha256=355dee28e96aca4ac5f7eaf38191db4dc3c0d8577c5205f33641e931cf66e123
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.025 sha256=620ea4ad6c1b17d7f7573b506274b47f5cc7c9a80f58e7e4cb59ac369eba01d9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_slug_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_slug_unique" UNIQUE (slug);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (slug)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_slug_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.026 sha256=b548d7016ce352ce593c65dd78cb6624eebbcc503930327b12e9ab7dd69d71e8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_partner_attribution'::regclass
    AND constraint_record.conname='workspace_partner_attribution_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_partner_attribution" ADD CONSTRAINT "workspace_partner_attribution_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_partner_attribution', 'workspace_partner_attribution_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.027 sha256=6e286cdfbf577ba46b0281040dc455b24e2a926d3b2f12e2c7035a78e764e6d4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_source_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_source_check" CHECK ((attribution_source = ANY (ARRAY['domain'::text, 'slug'::text, 'invite'::text, 'admin'::text, 'import'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((attribution_source = ANY (ARRAY[''domain''::text, ''slug''::text, ''invite''::text, ''admin''::text, ''import''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_source_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.028 sha256=f4b44b7b57202ec8111bf0e12e9e8ea766b4531315b28b6f387fb2565a991dc3
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_commission_events'::regclass
    AND constraint_record.conname='partner_commission_events_event_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_commission_events" ADD CONSTRAINT "partner_commission_events_event_type_check" CHECK ((event_type = ANY (ARRAY['invoice_paid'::text, 'refund'::text, 'dispute'::text, 'cancellation'::text, 'failed_payment'::text, 'manual_adjustment'::text, 'void'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((event_type = ANY (ARRAY[''invoice_paid''::text, ''refund''::text, ''dispute''::text, ''cancellation''::text, ''failed_payment''::text, ''manual_adjustment''::text, ''void''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_commission_events', 'partner_commission_events_event_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.029 sha256=417cb4334d8fb1031af20ccdbe5e55e0d0cc4480e8a1d31526ed188822e0432a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_commission_events'::regclass
    AND constraint_record.conname='partner_commission_events_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_commission_events" ADD CONSTRAINT "partner_commission_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'void'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''paid''::text, ''void''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_commission_events', 'partner_commission_events_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.030 sha256=02b58a82b538d1c777ab1570e6b6d7bbbc5e255680ef42310d9a286f79529a11
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_configs'::regclass
    AND constraint_record.conname='partner_configs_billing_owner_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_configs" ADD CONSTRAINT "partner_configs_billing_owner_check" CHECK ((billing_owner = 'dealflow'::text));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((billing_owner = ''dealflow''::text))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_configs', 'partner_configs_billing_owner_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.031 sha256=41daabc615e6b2c2f564931806ae0da124e8c4338bf67b9da1b850b567a1e5ff
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_configs'::regclass
    AND constraint_record.conname='partner_configs_sms_template_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_configs" ADD CONSTRAINT "partner_configs_sms_template_check" CHECK ((sms_template = ANY (ARRAY['default'::text, 'click_to_scale_lead_alert'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((sms_template = ANY (ARRAY[''default''::text, ''click_to_scale_lead_alert''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_configs', 'partner_configs_sms_template_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.032 sha256=1eb480958f797975c451b6a10382c3aaba23a99e92950dd53b35c6fc9467e85b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_domain_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_domain_check" CHECK (((domain = lower(domain)) AND (domain !~ '^https?://'::text)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((domain = lower(domain)) AND (domain !~ ''^https?://''::text)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_domain_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.033 sha256=c24d8aa17a3aec26881109b36f3ee738df0424250b5a20afb1143ce37c469dd1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_ssl_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_ssl_status_check" CHECK ((ssl_status = ANY (ARRAY['pending'::text, 'active'::text, 'failed'::text, 'unknown'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((ssl_status = ANY (ARRAY[''pending''::text, ''active''::text, ''failed''::text, ''unknown''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_ssl_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.034 sha256=9f28cb55e3c58e80a5208a60f6565b2244b4ac48170e6f69ea51542ebf53e296
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_type_check" CHECK ((type = ANY (ARRAY['primary'::text, 'redirect'::text, 'preview'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((type = ANY (ARRAY[''primary''::text, ''redirect''::text, ''preview''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.035 sha256=7d9e47f6ce612d1c1182eaff141c4ca0196e59ee14b6fba00d3255dcb0202f10
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_verification_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_verification_status_check" CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text, 'disabled'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((verification_status = ANY (ARRAY[''pending''::text, ''verified''::text, ''failed''::text, ''disabled''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_verification_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.036 sha256=21da5ac502058dcab829e5d9081b0049637ad139bbed28823a30160fae2cf9c1
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_config'::regclass
    AND constraint_record.conname='partner_ghl_config_auth_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_config" ADD CONSTRAINT "partner_ghl_config_auth_type_check" CHECK ((auth_type = ANY (ARRAY['private_integration_token'::text, 'oauth'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((auth_type = ANY (ARRAY[''private_integration_token''::text, ''oauth''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_config', 'partner_ghl_config_auth_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.037 sha256=265c8223eb24fdf90a9b2391f4271d21c3b5202640afbae0435f62f0e0658311
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_workflow_config'::regclass
    AND constraint_record.conname='partner_ghl_workflow_config_trigger_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_workflow_config" ADD CONSTRAINT "partner_ghl_workflow_config_trigger_check" CHECK ((enrollment_trigger = ANY (ARRAY['disabled'::text, 'lead_synced'::text, 'manual'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((enrollment_trigger = ANY (ARRAY[''disabled''::text, ''lead_synced''::text, ''manual''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_workflow_config', 'partner_ghl_workflow_config_trigger_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.038 sha256=80ece430952044cc0dc31583ad0e873bc234122f5b4b559a4caa92ab7a51d75f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_max_uses_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_max_uses_check" CHECK (((max_uses IS NULL) OR (max_uses > 0)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((max_uses IS NULL) OR (max_uses > 0)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_max_uses_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.039 sha256=03ec1b38fd26050492fb69d3121a66b75cd89554fcfa4db5abe0aaf5c0213b97
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_role_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_role_check" CHECK (((role IS NULL) OR (role = ANY (ARRAY['partner_admin'::text, 'partner_sales_rep'::text, 'partner_support'::text, 'partner_viewer'::text]))));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((role IS NULL) OR (role = ANY (ARRAY[''partner_admin''::text, ''partner_sales_rep''::text, ''partner_support''::text, ''partner_viewer''::text]))))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_role_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.040 sha256=5a2b695d9df48877bfca1471f04ddf6a0c6fa61a07a04e5ff5ab2adf21147202
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'used'::text, 'expired'::text, 'revoked'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''active''::text, ''used''::text, ''expired''::text, ''revoked''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.041 sha256=d888fa04a22ca8ef320d46af98c043eab3d9659450dd5dcfa0b5b8bdac5f9ce9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_use_count_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_use_count_check" CHECK ((use_count >= 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((use_count >= 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_use_count_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.042 sha256=13c44da4b07d18a1b26f5e27cefb8318b66665113c57b293fbd4428d1201832e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_role_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_role_check" CHECK ((role = ANY (ARRAY['partner_admin'::text, 'partner_sales_rep'::text, 'partner_support'::text, 'partner_viewer'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((role = ANY (ARRAY[''partner_admin''::text, ''partner_sales_rep''::text, ''partner_support''::text, ''partner_viewer''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_role_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.043 sha256=d9c1fc799f898417f30cb4f34ed6153e5b6e52ebd429fb98f824f5b76eb69635
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''active''::text, ''invited''::text, ''disabled''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.044 sha256=b6cbf2758d667d54c50e508199b2e6236a7fbba07c60f0d123bb43a9c76452df
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_support_settings'::regclass
    AND constraint_record.conname='partner_support_settings_mode_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_support_settings" ADD CONSTRAINT "partner_support_settings_mode_check" CHECK ((support_mode = ANY (ARRAY['partner_first'::text, 'dealflow_first'::text, 'hybrid'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((support_mode = ANY (ARRAY[''partner_first''::text, ''dealflow_first''::text, ''hybrid''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_support_settings', 'partner_support_settings_mode_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.045 sha256=732b949ef971bb3a321d5f3ba6111e6ddf37cc8629591484d050bb7502e6130e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_vertical_configs'::regclass
    AND constraint_record.conname='partner_vertical_configs_key_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_vertical_configs" ADD CONSTRAINT "partner_vertical_configs_key_check" CHECK ((vertical_key = ANY (ARRAY['real_estate_agent'::text, 'real_estate_wholesaler'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((vertical_key = ANY (ARRAY[''real_estate_agent''::text, ''real_estate_wholesaler''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_vertical_configs', 'partner_vertical_configs_key_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.046 sha256=0356b3613e5ddad1e80cb86c169a419201b7746ae9cbb8a31bff87e3aace5f70
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_vertical_configs'::regclass
    AND constraint_record.conname='partner_vertical_configs_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_vertical_configs" ADD CONSTRAINT "partner_vertical_configs_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''active''::text, ''paused''::text, ''archived''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_vertical_configs', 'partner_vertical_configs_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.047 sha256=24976fa210b799c32bb85dd250e12159d9f5045bfc8916d3ae48013ac7c32123
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_slug_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_slug_check" CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::text));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((slug ~ ''^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$''::text))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_slug_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.048 sha256=939b3b1e12573891ce4d3a333cfc8241a6bf26b0f19a26fe72e8fcab0f80809a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''draft''::text, ''active''::text, ''paused''::text, ''archived''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.049 sha256=a7b22dd62633eba1553e32315461dbcf10bcc8f8945480b83fa1356cca9fa8f7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.activation_events'::regclass
    AND constraint_record.conname='activation_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."activation_events" ADD CONSTRAINT "activation_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'activation_events', 'activation_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.050 sha256=07f9697e72aa8d3614998cbd3561f300875afa869e02d32f4a79f0131e47173b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.051 sha256=2d4942bc21e2312b6df279898daebff290d8a3a5f46c85249f92790adb775411
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_subscriptions'::regclass
    AND constraint_record.conname='billing_subscriptions_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_subscriptions', 'billing_subscriptions_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.052 sha256=5bf458064948545361c78203a4678db6bad3d460a355ec600ccb22ae4e75a959
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.053 sha256=7ec2263cbaf4e96f541c5c68e9698aef0fb52565587fc5efce437fee96be0fe8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.054 sha256=e24435391594d73463349f4565153ab564064c519e385bc01bf1d1174cd4496b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.055 sha256=d7898565b4f9d1ef448ec80d2b43601f80cbd6bc2268922c1cb9bcee37834e4b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.creative_assets'::regclass
    AND constraint_record.conname='creative_assets_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."creative_assets" ADD CONSTRAINT "creative_assets_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'creative_assets', 'creative_assets_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.056 sha256=d0835cfc3a500f4250026c25511010aa0f53e8a0b10ed090a6fb2084d6a67a22
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.057 sha256=b92c4fc53e185d1ceed6f913806b41a686cf92b0eec534e00b583a9dd3413ae3
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.058 sha256=e8be3c6423de32a45b2cb4d0c7207cbfa04e588fbcac7e75cdda8876082ffe62
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_messages'::regclass
    AND constraint_record.conname='lead_messages_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_messages" ADD CONSTRAINT "lead_messages_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_messages', 'lead_messages_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.059 sha256=2bffc2f5e26c19fb4e1742b4ec7b1c33ce49821381edfe9b1d44572acb2572b0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.leads'::regclass
    AND constraint_record.conname='leads_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'leads', 'leads_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.060 sha256=6342f4758d840eafc6fe0477db8fe863a2ab0c77a5e65a7eba3b327c9e92b396
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.marketing_accounts'::regclass
    AND constraint_record.conname='marketing_accounts_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."marketing_accounts" ADD CONSTRAINT "marketing_accounts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'marketing_accounts', 'marketing_accounts_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.061 sha256=95dc6a617c357e9e57f2c86fa12bc8c4bcce6d4a54c21ebb82245d980dca22a5
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.organizations'::regclass
    AND constraint_record.conname='organizations_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."organizations" ADD CONSTRAINT "organizations_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'organizations', 'organizations_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.062 sha256=a545c8614b7dd453168fc9819301e34d1f80df74cc1d0a8e0d35cffb39c1fe5f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_account_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_account_id_fkey" FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_account_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.063 sha256=9dc006fa0f97971b616c92c4a2d90f9674ef6116471173665c60a6e460ad47d9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.064 sha256=e53517f02817a51b8f4790d6eac4753b80e6a1c837d9bc7cd958d12d194cb60c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_accounts'::regclass
    AND constraint_record.conname='partner_accounts_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_accounts" ADD CONSTRAINT "partner_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_accounts', 'partner_accounts_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.065 sha256=8ecf0416d78da89862cf110adb867ca47748b9cba88a2ca6edca8ded014f68df
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_audit_logs'::regclass
    AND constraint_record.conname='partner_audit_logs_actor_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_audit_logs" ADD CONSTRAINT "partner_audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_audit_logs', 'partner_audit_logs_actor_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.066 sha256=0c8cef6483cdf508916f539d7a5f5b6708bc809d74a5a17c043bd6fe4704082d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_audit_logs'::regclass
    AND constraint_record.conname='partner_audit_logs_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_audit_logs" ADD CONSTRAINT "partner_audit_logs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_audit_logs', 'partner_audit_logs_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.067 sha256=1a3edd64e2dc69722d3718f985f4cf019863d0d5f56860f7d64e218d7f3b00fa
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_billing_attribution'::regclass
    AND constraint_record.conname='partner_billing_attribution_account_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_billing_attribution" ADD CONSTRAINT "partner_billing_attribution_account_id_fkey" FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_billing_attribution', 'partner_billing_attribution_account_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.068 sha256=5f339af6ff4f76841b0fb32a4b6f978832aeaa6911a6de17858317a3ff11230e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_billing_attribution'::regclass
    AND constraint_record.conname='partner_billing_attribution_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_billing_attribution" ADD CONSTRAINT "partner_billing_attribution_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_billing_attribution', 'partner_billing_attribution_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.069 sha256=8d04a09fe7d6a9de03e44cf702b92a607bd9141d53f4fcb4fc7ba60d816ec82d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_branding'::regclass
    AND constraint_record.conname='partner_branding_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_branding" ADD CONSTRAINT "partner_branding_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_branding', 'partner_branding_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.070 sha256=fa9ecfd1c69ee477a110923cd48da42c5f1042947d69249178fb1f58adecec36
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_commission_events'::regclass
    AND constraint_record.conname='partner_commission_events_account_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_commission_events" ADD CONSTRAINT "partner_commission_events_account_id_fkey" FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (account_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_commission_events', 'partner_commission_events_account_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.071 sha256=85e9894772a1acce11488187d547c91b2e2b2b6e0196b5ada5f99d6385b02328
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_commission_events'::regclass
    AND constraint_record.conname='partner_commission_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_commission_events" ADD CONSTRAINT "partner_commission_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_commission_events', 'partner_commission_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.072 sha256=f3cfefca3d3b314545fd7f331cdc265a6d6ae3463631a6da652e69dd1967ebf3
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_domains'::regclass
    AND constraint_record.conname='partner_domains_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_domains" ADD CONSTRAINT "partner_domains_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_domains', 'partner_domains_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.073 sha256=f3da03ff95de30c35fc6db04bf1dc107be7f7a063fc6ff7ed74ff2581d851a22
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_feature_flags'::regclass
    AND constraint_record.conname='partner_feature_flags_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_feature_flags" ADD CONSTRAINT "partner_feature_flags_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_feature_flags', 'partner_feature_flags_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.074 sha256=9343d484707cc9c5e66ca771ae60612084de4179841379d1ce8f7f51c12c550b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_config'::regclass
    AND constraint_record.conname='partner_ghl_config_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_config" ADD CONSTRAINT "partner_ghl_config_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_config', 'partner_ghl_config_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.075 sha256=c8ef7a8e0040ae503f70b67c56d6f0b196051c1c7b88dea17780c89cfbefc6e4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_template_config'::regclass
    AND constraint_record.conname='partner_ghl_template_config_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_template_config" ADD CONSTRAINT "partner_ghl_template_config_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_template_config', 'partner_ghl_template_config_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.076 sha256=87b1ad4899e8bcd1e3a0ef816c785777b6a5ff2760e385090631bec17740f837
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_ghl_workflow_config'::regclass
    AND constraint_record.conname='partner_ghl_workflow_config_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_ghl_workflow_config" ADD CONSTRAINT "partner_ghl_workflow_config_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_ghl_workflow_config', 'partner_ghl_workflow_config_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.077 sha256=e6a08fe20bafacda6f88bf0def19ade615325505c8fee817369cb1cd00930e27
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.078 sha256=99c07a94ceda132e520069d00edc67d13e38e18ee714f8253c36e14f9d6e32b7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_invites'::regclass
    AND constraint_record.conname='partner_invites_used_by_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_invites" ADD CONSTRAINT "partner_invites_used_by_user_id_fkey" FOREIGN KEY (used_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (used_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_invites', 'partner_invites_used_by_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.079 sha256=019e98dddd3bed8ee1cb6ae8e66418a2ba4033b989e114ffaad4e118046d489e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.080 sha256=cb13e765f69a5bb7dc951877235dafc59585fe541b897ce673406bf1cde844af
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_memberships'::regclass
    AND constraint_record.conname='partner_memberships_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_memberships" ADD CONSTRAINT "partner_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_memberships', 'partner_memberships_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.081 sha256=5e0643384bb5201c0572e3822a8648eb49e9a82990654ec25c1524304a931c78
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_support_settings'::regclass
    AND constraint_record.conname='partner_support_settings_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_support_settings" ADD CONSTRAINT "partner_support_settings_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_support_settings', 'partner_support_settings_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.082 sha256=665632a7bd4ff220a3bda11032881aa1291fae7ba2d15130efd0d22098eb90f2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partner_vertical_configs'::regclass
    AND constraint_record.conname='partner_vertical_configs_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partner_vertical_configs" ADD CONSTRAINT "partner_vertical_configs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partner_vertical_configs', 'partner_vertical_configs_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.083 sha256=75da70faab5c0a1850b9807ddd9192792b1c4e03f8ea9284955cb7fc9990c761
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_created_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_created_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.084 sha256=319fd1b12c004e542e474c0080008117ebbfbade21fe7481a42f7943395a3542
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.partners'::regclass
    AND constraint_record.conname='partners_updated_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'partners', 'partners_updated_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.085 sha256=0775165b972697ff282c4d8513d951b57e70748aa084a005d34ac8b1f8b4247a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.provider_usage_events'::regclass
    AND constraint_record.conname='provider_usage_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."provider_usage_events" ADD CONSTRAINT "provider_usage_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'provider_usage_events', 'provider_usage_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.086 sha256=258f2cc94af5619725597ed4a97fb539ac042d58646f27139fb9f34b85d42a0b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.provider_usage_limits'::regclass
    AND constraint_record.conname='provider_usage_limits_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."provider_usage_limits" ADD CONSTRAINT "provider_usage_limits_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'provider_usage_limits', 'provider_usage_limits_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.087 sha256=c1bb7724f0dd9607c6bde2270f7efda95d3bf564d4118aa6f3cdd5240738cab9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.stripe_webhook_events'::regclass
    AND constraint_record.conname='stripe_webhook_events_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'stripe_webhook_events', 'stripe_webhook_events_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.088 sha256=899983a458753e8ec48e1fa2bee463236bbd4a0ad45bcadfa4e137d3c00ae807
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.system_jobs'::regclass
    AND constraint_record.conname='system_jobs_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."system_jobs" ADD CONSTRAINT "system_jobs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'system_jobs', 'system_jobs_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.089 sha256=ec627cdf684ab1bbb3c7832d41b4bfbbc8ca9095bc60b23ac99ad5452570a40c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.users'::regclass
    AND constraint_record.conname='users_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."users" ADD CONSTRAINT "users_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'users', 'users_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.090 sha256=9d8c929953935d25bc3bb8f1bb9c88636b4e027b967b0bb37c6e9d53f9f1e279
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_partner_attribution'::regclass
    AND constraint_record.conname='workspace_partner_attribution_assigned_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_partner_attribution" ADD CONSTRAINT "workspace_partner_attribution_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_partner_attribution', 'workspace_partner_attribution_assigned_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.091 sha256=2b252fc361b5cc9aea4ef352c60c9a1c4faca6df17e0df0e9b98d77689da88d2
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_partner_attribution'::regclass
    AND constraint_record.conname='workspace_partner_attribution_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_partner_attribution" ADD CONSTRAINT "workspace_partner_attribution_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_partner_attribution', 'workspace_partner_attribution_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260531160000.constraints.092 sha256=73dfe0514e3f35cd5453c697e793b7c3b92117978224dd15688aa6e6c4d50c05
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_partner_attribution'::regclass
    AND constraint_record.conname='workspace_partner_attribution_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_partner_attribution" ADD CONSTRAINT "workspace_partner_attribution_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_partner_attribution', 'workspace_partner_attribution_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260531160000.indexes.001 sha256=ef45a2cd7742d230352de0db7e686d1df2b13a91fa7bdbe3dbbab885004b4a15
CREATE INDEX IF NOT EXISTS billing_subscriptions_partner_idx ON public.billing_subscriptions USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.002 sha256=7034c380fab95822d829e45c49073ad813e1dbd943892a961b968ab666fec15e
CREATE INDEX IF NOT EXISTS campaign_plans_partner_idx ON public.campaign_plans USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.003 sha256=f83dc271cfde05bfd6e1bed773c183e21b86abbd11a3f0a5150ee3711f3839fe
CREATE INDEX IF NOT EXISTS creative_assets_partner_idx ON public.creative_assets USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.004 sha256=7664034e53270da25abc10b604141cf9e8c63c013398ec89fc8c655e002aa6ae
CREATE INDEX IF NOT EXISTS leads_partner_idx ON public.leads USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.005 sha256=ccca08ea4a41790b25a1eebd955e22242c6f1a6630338ced28a8290644f6b3dc
CREATE INDEX IF NOT EXISTS organizations_partner_idx ON public.organizations USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.006 sha256=7c54531854e5860eac9c29bb987f50ea9c2cf5e2f7915959403a7faebd8b67c7
CREATE INDEX IF NOT EXISTS partner_accounts_account_idx ON public.partner_accounts USING btree (account_id);

-- dealflow:statement id=20260531160000.indexes.007 sha256=c7b61460eb268d4cdf180726a8f4efc1dd87bd114ca6f57a62698338e9859b85
CREATE INDEX IF NOT EXISTS partner_accounts_partner_account_idx ON public.partner_accounts USING btree (partner_id, account_id);

-- dealflow:statement id=20260531160000.indexes.008 sha256=6f22591f4eae03f61188fb0e7cf5dca090d9ba771044895d64735577a81b82f2
CREATE INDEX IF NOT EXISTS partner_audit_logs_partner_created_idx ON public.partner_audit_logs USING btree (partner_id, created_at DESC);

-- dealflow:statement id=20260531160000.indexes.009 sha256=e48fdaf3ebd92259295c48a1929b14c7a918bfb75ea8971047cab276137d00f3
CREATE INDEX IF NOT EXISTS partner_billing_attribution_customer_idx ON public.partner_billing_attribution USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.010 sha256=f9419101c2c94bcfe328341573e265e303238eb9bf38a5098699e74dfb018949
CREATE INDEX IF NOT EXISTS partner_billing_attribution_invoice_idx ON public.partner_billing_attribution USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.011 sha256=c58d1b73722ad2e84514b176985034611be260e12677fc83b69ad54331d13846
CREATE INDEX IF NOT EXISTS partner_billing_attribution_subscription_idx ON public.partner_billing_attribution USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.012 sha256=cbccde74c91e3d2cb2ed60fd3f858ec4b1f665f6bd456f82d95fe1f44e021175
CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_events_invoice_event_unique ON public.partner_commission_events USING btree (partner_id, stripe_invoice_id, event_type) WHERE (stripe_invoice_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.013 sha256=f19f1a9b9b44231d5c41ad534da43c574e4ef4a2702d413c3ee4d9d13f7b3ca3
CREATE INDEX IF NOT EXISTS partner_commission_events_partner_status_idx ON public.partner_commission_events USING btree (partner_id, status, created_at DESC);

-- dealflow:statement id=20260531160000.indexes.014 sha256=9bd6f5719b0b1a114f145d5ee8a006f111d02c931562bbd60abba79b9bd2ae2b
CREATE INDEX IF NOT EXISTS partner_domains_partner_idx ON public.partner_domains USING btree (partner_id, verification_status);

-- dealflow:statement id=20260531160000.indexes.015 sha256=eed53bbc65d4c7e92083d5a9f28f1c485e65ef5196a23e19a7cbaf757560c882
CREATE UNIQUE INDEX IF NOT EXISTS partner_ghl_config_partner_unique ON public.partner_ghl_config USING btree (partner_id);

-- dealflow:statement id=20260531160000.indexes.016 sha256=b476cdb2a652b664b5ce6185a7e448777acd278200a934c6232597d550c4794b
CREATE UNIQUE INDEX IF NOT EXISTS partner_ghl_template_config_partner_unique ON public.partner_ghl_template_config USING btree (partner_id);

-- dealflow:statement id=20260531160000.indexes.017 sha256=e37b8b3386aabd1a1db4716a6c340c3425d56446bebeaacc6c06db3a75b3e90e
CREATE UNIQUE INDEX IF NOT EXISTS partner_ghl_workflow_config_partner_unique ON public.partner_ghl_workflow_config USING btree (partner_id);

-- dealflow:statement id=20260531160000.indexes.018 sha256=ba7a581e1b1a14710452283f53a8af453ce40dfc5198303a25f91d6403b2bf12
CREATE INDEX IF NOT EXISTS partner_memberships_partner_user_idx ON public.partner_memberships USING btree (partner_id, user_id);

-- dealflow:statement id=20260531160000.indexes.019 sha256=bb0bf05a832a07f53216579472cbe4b1dcc497f69103039c25fcf5ae31ca254a
CREATE INDEX IF NOT EXISTS partner_memberships_user_idx ON public.partner_memberships USING btree (user_id, status);

-- dealflow:statement id=20260531160000.indexes.020 sha256=b90626033d789a4a65ea7f1a1e32df455159681e1f69a1f82e88de182ed1c3b8
CREATE UNIQUE INDEX IF NOT EXISTS partner_vertical_configs_native_unique ON public.partner_vertical_configs USING btree (vertical_key) WHERE (partner_id IS NULL);

-- dealflow:statement id=20260531160000.indexes.021 sha256=12d82674196b946262173a16fcd225329bb2fe459866866ca816ec5ea82c7a0c
CREATE INDEX IF NOT EXISTS partners_status_idx ON public.partners USING btree (status, created_at DESC);

-- dealflow:statement id=20260531160000.indexes.022 sha256=6314b2a6ef79be983b94fe58bca58f691f1a7cf6714954a64e2b4372a8c651d4
CREATE INDEX IF NOT EXISTS users_partner_idx ON public.users USING btree (partner_id) WHERE (partner_id IS NOT NULL);

-- dealflow:statement id=20260531160000.indexes.023 sha256=5ff43f645878acf59b3d459a078b6f81aadb32e335818b7a35acedf23d3c7f12
CREATE INDEX IF NOT EXISTS workspace_partner_attribution_workspace_partner_idx ON public.workspace_partner_attribution USING btree (workspace_id, partner_id);

-- dealflow:statement id=20260531160000.indexes.024 sha256=b5a77e71bb77eb4145159f904d534734d4c7c92ae088043fd8080bd4e307b32c
CREATE UNIQUE INDEX IF NOT EXISTS workspace_partner_attribution_workspace_unique ON public.workspace_partner_attribution USING btree (workspace_id);

-- controls
-- dealflow:statement id=20260531160000.controls.001 sha256=11191618ffa5a50d267753f01c7a388002e02443954d5c159a3acf8477be21d8
DROP POLICY IF EXISTS "partner_accounts_member_select" ON "public"."partner_accounts";

-- dealflow:statement id=20260531160000.controls.002 sha256=bcdacab2f558d988ad8fed2b95f78e392469e42db7721d82fc49e2cf4f039f74
CREATE POLICY "partner_accounts_member_select" ON "public"."partner_accounts"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.003 sha256=eb27c3ceeb5c122768350fd3a5c9687a764e2d303ada126c3a8a55c7fb29b85f
DROP POLICY IF EXISTS "partner_audit_logs_member_select" ON "public"."partner_audit_logs";

-- dealflow:statement id=20260531160000.controls.004 sha256=4630b624f179574559c0287c3c379e731a7f82b167afa65d74d91bc7dd69f648
CREATE POLICY "partner_audit_logs_member_select" ON "public"."partner_audit_logs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((partner_id IS NOT NULL) AND is_current_user_partner_member(partner_id)));

-- dealflow:statement id=20260531160000.controls.005 sha256=28f765400c037a5ed660c11d69cc5dbb54c3fbb62d08b01be8ed6da10a77d0ef
DROP POLICY IF EXISTS "partner_billing_attribution_member_select" ON "public"."partner_billing_attribution";

-- dealflow:statement id=20260531160000.controls.006 sha256=098c72cbf0f0e4da44b7501fb56f2310f9020481b1f59055ac422bf6538dc727
CREATE POLICY "partner_billing_attribution_member_select" ON "public"."partner_billing_attribution"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.007 sha256=9525cfb4611a4a129f183adedf634d87a612c40d29cf6219548f99bedcbc9b00
DROP POLICY IF EXISTS "partner_branding_member_select" ON "public"."partner_branding";

-- dealflow:statement id=20260531160000.controls.008 sha256=a773cd9c8db1e05aec7d897c480e2e8f9ed7887f2a15bbe902b6ede45c6b8121
CREATE POLICY "partner_branding_member_select" ON "public"."partner_branding"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.009 sha256=5d7c35abbaed61c8f54262018a02965a82d4eb3ac4db422e0903432686429d07
DROP POLICY IF EXISTS "partner_commission_events_member_select" ON "public"."partner_commission_events";

-- dealflow:statement id=20260531160000.controls.010 sha256=1514d5b901e6cb77f2ac37402547a2c18decc27850b86cc768c318a712f1b4e3
CREATE POLICY "partner_commission_events_member_select" ON "public"."partner_commission_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.011 sha256=49afe8322289167bcab60ed6cfe6558258e94a7de13b508634f6e4dfdbb2fe4e
DROP POLICY IF EXISTS "partner_configs_authenticated_select" ON "public"."partner_configs";

-- dealflow:statement id=20260531160000.controls.012 sha256=86458ca5b3f86bf8be97d87cb8d3f068787d7f931717d9db62d80de23c161a4c
CREATE POLICY "partner_configs_authenticated_select" ON "public"."partner_configs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (true);

-- dealflow:statement id=20260531160000.controls.013 sha256=53e309bdc69da28e6701a06c87e5d7fb141d4a5a2773b493f2178050d1de8965
DROP POLICY IF EXISTS "partner_configs_service_role_all" ON "public"."partner_configs";

-- dealflow:statement id=20260531160000.controls.014 sha256=56822ab27f0b8841f40350141c059e5c3942b728b66f8232fffbae27e90eef95
CREATE POLICY "partner_configs_service_role_all" ON "public"."partner_configs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260531160000.controls.015 sha256=1aa6193f0e570e097d28117596b2cd109307e777f2af04ce267608282610b289
DROP POLICY IF EXISTS "partner_domains_member_select" ON "public"."partner_domains";

-- dealflow:statement id=20260531160000.controls.016 sha256=a98175838b96f3e1fd76ad28fdd7d90cecd46ff7371e19f084849d378e8bc4fd
CREATE POLICY "partner_domains_member_select" ON "public"."partner_domains"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.017 sha256=6c1d61e86ad3dd8a91a6c9b28239a054422bf5c939365048f1660ad4111605f5
DROP POLICY IF EXISTS "partner_feature_flags_member_select" ON "public"."partner_feature_flags";

-- dealflow:statement id=20260531160000.controls.018 sha256=f935f157ccd7a3f3bd5671b5e568460ed6ee09b4d91a5255ce9345dc8c400c53
CREATE POLICY "partner_feature_flags_member_select" ON "public"."partner_feature_flags"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.019 sha256=d9a3ca860c4524722b0a2fc28662442312633f53f6a00afb997fd7f065507d07
DROP POLICY IF EXISTS "partner_ghl_config_service_role_all" ON "public"."partner_ghl_config";

-- dealflow:statement id=20260531160000.controls.020 sha256=dc02041ede628db4ef3eff96fe99331a80452aab846245aa13f410beeecea8c1
CREATE POLICY "partner_ghl_config_service_role_all" ON "public"."partner_ghl_config"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260531160000.controls.021 sha256=29222bd9ba82b7400a7d32e6eb77c2e3dd8569b6113b2fe99cac91d855920f69
DROP POLICY IF EXISTS "partner_ghl_template_config_service_role_all" ON "public"."partner_ghl_template_config";

-- dealflow:statement id=20260531160000.controls.022 sha256=5598b63ccd1211e221884177acdbb3d6d0f78d5b170b01b09ba50273951db147
CREATE POLICY "partner_ghl_template_config_service_role_all" ON "public"."partner_ghl_template_config"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260531160000.controls.023 sha256=4d5e42dd684e74b79e42924f6da6feb95271c5f2457e5a7b2f54f340f94670e1
DROP POLICY IF EXISTS "partner_ghl_workflow_config_service_role_all" ON "public"."partner_ghl_workflow_config";

-- dealflow:statement id=20260531160000.controls.024 sha256=65d42156adb8d510e56d91cb9cb3b0d65e841193e017310bd970ba1a25b13896
CREATE POLICY "partner_ghl_workflow_config_service_role_all" ON "public"."partner_ghl_workflow_config"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260531160000.controls.025 sha256=f63fa46c8ae54280ebe9281be472e2f9c926fd2bd036e646747d3044623382c5
DROP POLICY IF EXISTS "partner_memberships_member_select" ON "public"."partner_memberships";

-- dealflow:statement id=20260531160000.controls.026 sha256=83d965995d28c723cd695542f02366ee000fb56a46ae22bfb5fd36b2eae22f7a
CREATE POLICY "partner_memberships_member_select" ON "public"."partner_memberships"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR is_current_user_partner_member(partner_id)));

-- dealflow:statement id=20260531160000.controls.027 sha256=72ab5a083fd3a873ba7d05bfa3978b9fb2c3246d2c7a9a163cc0b37def7a08e5
DROP POLICY IF EXISTS "partner_support_settings_member_select" ON "public"."partner_support_settings";

-- dealflow:statement id=20260531160000.controls.028 sha256=76770ea670997a1b38308c88dfba349f48cfb8020170caf5b6c24bd0fef7b4e4
CREATE POLICY "partner_support_settings_member_select" ON "public"."partner_support_settings"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(partner_id));

-- dealflow:statement id=20260531160000.controls.029 sha256=15ae269e01aa501d193d1c3e64fad8722304ecdc843ee308fa30c68c4eb29783
DROP POLICY IF EXISTS "partner_vertical_configs_member_select" ON "public"."partner_vertical_configs";

-- dealflow:statement id=20260531160000.controls.030 sha256=5e5b67aa6d8688d84ad04f3c956a4b310beaa6d259032f8627dccd6c5b2fb57d
CREATE POLICY "partner_vertical_configs_member_select" ON "public"."partner_vertical_configs"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((partner_id IS NULL) OR is_current_user_partner_member(partner_id)));

-- dealflow:statement id=20260531160000.controls.031 sha256=7c9d9e8cdddb226e76d063a75660084d727edf19254ddee14ca064687f7c225f
DROP POLICY IF EXISTS "partners_member_select" ON "public"."partners";

-- dealflow:statement id=20260531160000.controls.032 sha256=8b7995822bafb14f083bbf287bd7dd6b54dcfbe7639e1d7a3847e7f70b2ac1f0
CREATE POLICY "partners_member_select" ON "public"."partners"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (is_current_user_partner_member(id));

-- dealflow:statement id=20260531160000.controls.033 sha256=3c7318275967a35a1909a90e63f17bc15937918df6f358b99c04a2dd23840cf6
DROP POLICY IF EXISTS "workspace_partner_attribution_member_select" ON "public"."workspace_partner_attribution";

-- dealflow:statement id=20260531160000.controls.034 sha256=f01d7923f42abf324cd87016c74af8a9701a5e3a948f5fa3a039efd1f35c4092
CREATE POLICY "workspace_partner_attribution_member_select" ON "public"."workspace_partner_attribution"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260531160000.controls.035 sha256=825f77c61dc5119bfec40b70ea76cb62672d1c36c7cda0bc385f348c1c83b636
DROP POLICY IF EXISTS "workspace_partner_attribution_service_role_all" ON "public"."workspace_partner_attribution";

-- dealflow:statement id=20260531160000.controls.036 sha256=219b518613863dc31b080549c7a3661e26a6be341c730bd3a09f835cb2e13323
CREATE POLICY "workspace_partner_attribution_service_role_all" ON "public"."workspace_partner_attribution"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260531160000.controls.037 sha256=e5d592b25bc804315e43c268658355ddfa137d383bf2e7b81d56d47f1da38326
ALTER TABLE "public"."partner_accounts" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.038 sha256=acafb3f4fddfa8bc8883a087c88ed7c710c965c325e9e6e819781b7033e0b3b7
ALTER TABLE "public"."partner_accounts" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.039 sha256=3adc1aeb54841cdd073c336716deb0e8d66ba8cda70ca39a73fd7096594623d7
ALTER TABLE "public"."partner_audit_logs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.040 sha256=84611821efaf6359de2e9caa36d442093d0610c4a38cb6db66777a836453a48e
ALTER TABLE "public"."partner_audit_logs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.041 sha256=437f597300ab7dbd8e2dd8d33e6f97566545deb70bdae6e53b71db41abaefa31
ALTER TABLE "public"."partner_billing_attribution" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.042 sha256=aa5e5a64681b6826e16eaa8f1db303245a5fd20e118554c5f92dc6af79d54326
ALTER TABLE "public"."partner_billing_attribution" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.043 sha256=be9f584352b3ff956d79ee77ceb4e3b6823ff4de39556dd3755d0570431470d9
ALTER TABLE "public"."partner_branding" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.044 sha256=2644469fe488ffd3253ecdbcc1bc997f22f87532c55a136d3a712d55a594ff67
ALTER TABLE "public"."partner_branding" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.045 sha256=af08958140267831538c0f7c4e0a561836d0ef0acada895cf33153d46f274343
ALTER TABLE "public"."partner_commission_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.046 sha256=fb91af26514cfc4a6244061ac96f040122924eb17faaadf6d316cbec4ea3062b
ALTER TABLE "public"."partner_commission_events" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.047 sha256=3cd575a30f29d83e1041ccb447b5689b0f8416b734182b06f75cb9a489c57558
ALTER TABLE "public"."partner_configs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.048 sha256=fbfee076002a7a4785ee36064b2062e78cc9999d5c819f1be09b00c121e37941
ALTER TABLE "public"."partner_configs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.049 sha256=4f1b4250182fd687b0090e1fa5bc89b84eb6ca95e8bc0a004949a70342ed2d5e
ALTER TABLE "public"."partner_domains" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.050 sha256=b1f0f5366cc4f574b511389da5ee9681777b308c2d6f9269cdffbecb6f46863c
ALTER TABLE "public"."partner_domains" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.051 sha256=c548e746bd2af54a58f0b049791815fad0a3500632177f6f257ce93d2f10dad9
ALTER TABLE "public"."partner_feature_flags" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.052 sha256=265abd71841fbbf319d840b380050b4bab2fdcdaeb3d5d2227fe7469dff61a81
ALTER TABLE "public"."partner_feature_flags" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.053 sha256=e28be20d8c16ec80a26c5d6ac95ffd05a1fa3bff4313539a2b37deb6f3ac2ba9
ALTER TABLE "public"."partner_ghl_config" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.054 sha256=1f80db6ca5bad7603bda1e737c65909950454d1f61a63ef4259aa160008b8ef6
ALTER TABLE "public"."partner_ghl_config" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.055 sha256=e31b24d00af29867156a869383d5416ec1fe08163fdfd8f44df0b916e38e1b75
ALTER TABLE "public"."partner_ghl_template_config" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.056 sha256=24e57d6ad52469b12d36c44022c980d1512e3f8d707dd8045ccc1fac1bb8eddd
ALTER TABLE "public"."partner_ghl_template_config" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.057 sha256=1d16738d8bb9f9260aacb3af1010857dab34b44f6e99fe0b98aff036fbed51d0
ALTER TABLE "public"."partner_ghl_workflow_config" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.058 sha256=86581d8840a95784e93b1ce465c92d32575137b50f662aaca27d8b795c40cf43
ALTER TABLE "public"."partner_ghl_workflow_config" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.059 sha256=016e9938cd611762941d887c1774d021ba98d3552de94a40c48cbaba2388bbf6
ALTER TABLE "public"."partner_invites" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.060 sha256=f379cb0b9a71441cc47538a16e8fe30d839c9362d0a9ad2d0fe76b4771cb2adb
ALTER TABLE "public"."partner_invites" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.061 sha256=e4d445c7f3332f7eff22bde493fa5d0968a4c8eb70435579d5ba0ff8292a3b20
ALTER TABLE "public"."partner_memberships" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.062 sha256=8f14d1abac1f88401cf7c56e907191b4a96eade09241f07a4c4619843df1c9ce
ALTER TABLE "public"."partner_memberships" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.063 sha256=3c2000c3d6c2c26029f8cbd8b1187984fe159820633c1cd98701451f9118fe9d
ALTER TABLE "public"."partner_support_settings" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.064 sha256=136bd8975aeb38a7db0084ad7137e4c4d52d039e5e48db3a9154d5dd57176f2c
ALTER TABLE "public"."partner_support_settings" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.065 sha256=fdce89eab57eab7b01ea517e5cee76382658a2057ee0ae2339909747042beedb
ALTER TABLE "public"."partner_vertical_configs" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.066 sha256=a76dceaa3bd6b02233a493eb8b7404a3fa7fb186f3be80a75cb2bdacc6d6629d
ALTER TABLE "public"."partner_vertical_configs" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.067 sha256=f3cfe2dbc85deead4426e628511a3dee481a67a33cf715e7c1766d78485f90a3
ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.068 sha256=6067f059650d1d1320a552c233aff58de2314bc7688eb8e099bf32e4022cdf17
ALTER TABLE "public"."partners" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.069 sha256=0da3a0d3b496eb47aa86ad3482c716e1207abf539bc494b9e579f598fb8a95e3
ALTER TABLE "public"."workspace_partner_attribution" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260531160000.controls.070 sha256=69dab2642b0e23127eb738919ce7d2d94a9586cc0b3b3f06203929dcab6cd0ac
ALTER TABLE "public"."workspace_partner_attribution" FORCE ROW LEVEL SECURITY;

-- grants
-- dealflow:statement id=20260531160000.grants.001 sha256=2c72aabec0bbbd1c9e25528775a23fa8c3677d4bf8a20b1ed64a1d1cf0eccdd5
REVOKE EXECUTE ON FUNCTION public.is_current_user_partner_member(uuid) FROM PUBLIC, anon;

DO $dealflow_postcondition_20260531160000$
BEGIN
  IF NOT (to_regclass('public.partner_accounts') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_audit_logs') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_billing_attribution') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_branding') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_commission_events') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_configs') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_domains') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_feature_flags') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_config') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_template_config') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_workflow_config') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_invites') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_memberships') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_support_settings') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_vertical_configs') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partners') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_partner_attribution') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 17 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.activation_events'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 18 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_cancellation_intents'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 19 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_subscriptions'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 20 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_subscriptions'::regclass AND attname='partner_product_name' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 21 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_subscriptions'::regclass AND attname='partner_plan_label' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 22 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.billing_subscriptions'::regclass AND attname='partner_price_ids' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 23 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 24 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_sync_snapshots'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 25 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.client_error_events'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 26 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.creative_assets'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 27 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.customer_success_checklists'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 28 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.lead_billing_events'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 29 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.lead_messages'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 30 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.leads'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 31 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.marketing_accounts'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 32 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.organizations'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 33 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.provider_usage_events'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 34 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.provider_usage_limits'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 35 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.stripe_webhook_events'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 36 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.system_jobs'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 37 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.users'::regclass AND attname='partner_id' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260531160000 postcondition 38 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_proc procedure_record JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=procedure_record.pronamespace WHERE namespace_record.nspname='public' AND procedure_record.proname='is_current_user_partner_member')) THEN RAISE EXCEPTION '20260531160000 postcondition 39 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_account_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 40 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 41 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_audit_logs'::regclass AND conname='partner_audit_logs_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 42 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_billing_attribution'::regclass AND conname='partner_billing_attribution_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 43 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_branding'::regclass AND conname='partner_branding_partner_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 44 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_branding'::regclass AND conname='partner_branding_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 45 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_commission_events'::regclass AND conname='partner_commission_events_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 46 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_configs'::regclass AND conname='partner_configs_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 47 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_domain_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 48 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 49 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_feature_flags'::regclass AND conname='partner_feature_flags_partner_key_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 50 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_feature_flags'::regclass AND conname='partner_feature_flags_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 51 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_config'::regclass AND conname='partner_ghl_config_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 52 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_template_config'::regclass AND conname='partner_ghl_template_config_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 53 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_workflow_config'::regclass AND conname='partner_ghl_workflow_config_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 54 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_code_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 55 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 56 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_partner_user_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 57 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 58 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_support_settings'::regclass AND conname='partner_support_settings_partner_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 59 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_support_settings'::regclass AND conname='partner_support_settings_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 60 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_vertical_configs'::regclass AND conname='partner_vertical_configs_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 61 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_vertical_configs'::regclass AND conname='partner_vertical_configs_scope_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 62 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 63 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_slug_unique')) THEN RAISE EXCEPTION '20260531160000 postcondition 64 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_partner_attribution'::regclass AND conname='workspace_partner_attribution_pkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 65 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_source_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 66 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_commission_events'::regclass AND conname='partner_commission_events_event_type_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 67 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_commission_events'::regclass AND conname='partner_commission_events_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 68 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_configs'::regclass AND conname='partner_configs_billing_owner_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 69 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_configs'::regclass AND conname='partner_configs_sms_template_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 70 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_domain_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 71 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_ssl_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 72 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_type_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 73 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_verification_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 74 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_config'::regclass AND conname='partner_ghl_config_auth_type_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 75 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_workflow_config'::regclass AND conname='partner_ghl_workflow_config_trigger_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 76 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_max_uses_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 77 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_role_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 78 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 79 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_use_count_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 80 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_role_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 81 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 82 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_support_settings'::regclass AND conname='partner_support_settings_mode_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 83 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_vertical_configs'::regclass AND conname='partner_vertical_configs_key_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 84 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_vertical_configs'::regclass AND conname='partner_vertical_configs_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 85 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_slug_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 86 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_status_check')) THEN RAISE EXCEPTION '20260531160000 postcondition 87 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.activation_events'::regclass AND conname='activation_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 88 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 89 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_subscriptions'::regclass AND conname='billing_subscriptions_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 90 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 91 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 92 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 93 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.creative_assets'::regclass AND conname='creative_assets_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 94 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 95 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 96 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_messages'::regclass AND conname='lead_messages_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 97 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.leads'::regclass AND conname='leads_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 98 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.marketing_accounts'::regclass AND conname='marketing_accounts_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 99 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.organizations'::regclass AND conname='organizations_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 100 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_account_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 101 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 102 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_accounts'::regclass AND conname='partner_accounts_user_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 103 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_audit_logs'::regclass AND conname='partner_audit_logs_actor_user_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 104 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_audit_logs'::regclass AND conname='partner_audit_logs_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 105 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_billing_attribution'::regclass AND conname='partner_billing_attribution_account_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 106 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_billing_attribution'::regclass AND conname='partner_billing_attribution_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 107 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_branding'::regclass AND conname='partner_branding_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 108 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_commission_events'::regclass AND conname='partner_commission_events_account_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 109 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_commission_events'::regclass AND conname='partner_commission_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 110 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_domains'::regclass AND conname='partner_domains_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 111 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_feature_flags'::regclass AND conname='partner_feature_flags_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 112 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_config'::regclass AND conname='partner_ghl_config_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 113 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_template_config'::regclass AND conname='partner_ghl_template_config_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 114 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_ghl_workflow_config'::regclass AND conname='partner_ghl_workflow_config_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 115 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 116 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_invites'::regclass AND conname='partner_invites_used_by_user_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 117 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 118 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_memberships'::regclass AND conname='partner_memberships_user_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 119 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_support_settings'::regclass AND conname='partner_support_settings_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 120 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partner_vertical_configs'::regclass AND conname='partner_vertical_configs_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 121 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_created_by_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 122 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_updated_by_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 123 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.provider_usage_events'::regclass AND conname='provider_usage_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 124 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.provider_usage_limits'::regclass AND conname='provider_usage_limits_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 125 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.stripe_webhook_events'::regclass AND conname='stripe_webhook_events_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 126 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.system_jobs'::regclass AND conname='system_jobs_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 127 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.users'::regclass AND conname='users_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 128 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_partner_attribution'::regclass AND conname='workspace_partner_attribution_assigned_by_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 129 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_partner_attribution'::regclass AND conname='workspace_partner_attribution_partner_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 130 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_partner_attribution'::regclass AND conname='workspace_partner_attribution_workspace_id_fkey')) THEN RAISE EXCEPTION '20260531160000 postcondition 131 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.billing_subscriptions_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 132 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_plans_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 133 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.creative_assets_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 134 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.leads_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 135 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.organizations_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 136 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_accounts_account_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 137 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_accounts_partner_account_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 138 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_audit_logs_partner_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 139 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_billing_attribution_customer_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 140 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_billing_attribution_invoice_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 141 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_billing_attribution_subscription_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 142 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_commission_events_invoice_event_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 143 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_commission_events_partner_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 144 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_domains_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 145 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_config_partner_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 146 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_template_config_partner_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 147 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_ghl_workflow_config_partner_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 148 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_memberships_partner_user_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 149 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_memberships_user_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 150 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partner_vertical_configs_native_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 151 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.partners_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 152 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.users_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 153 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_partner_attribution_workspace_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 154 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_partner_attribution_workspace_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260531160000 postcondition 155 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_accounts'::regclass AND polname='partner_accounts_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 156 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_audit_logs'::regclass AND polname='partner_audit_logs_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 157 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_billing_attribution'::regclass AND polname='partner_billing_attribution_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 158 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_branding'::regclass AND polname='partner_branding_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 159 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_commission_events'::regclass AND polname='partner_commission_events_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 160 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_configs'::regclass AND polname='partner_configs_authenticated_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 161 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_configs'::regclass AND polname='partner_configs_service_role_all')) THEN RAISE EXCEPTION '20260531160000 postcondition 162 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_domains'::regclass AND polname='partner_domains_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 163 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_feature_flags'::regclass AND polname='partner_feature_flags_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 164 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_ghl_config'::regclass AND polname='partner_ghl_config_service_role_all')) THEN RAISE EXCEPTION '20260531160000 postcondition 165 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_ghl_template_config'::regclass AND polname='partner_ghl_template_config_service_role_all')) THEN RAISE EXCEPTION '20260531160000 postcondition 166 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_ghl_workflow_config'::regclass AND polname='partner_ghl_workflow_config_service_role_all')) THEN RAISE EXCEPTION '20260531160000 postcondition 167 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_memberships'::regclass AND polname='partner_memberships_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 168 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_support_settings'::regclass AND polname='partner_support_settings_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 169 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partner_vertical_configs'::regclass AND polname='partner_vertical_configs_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 170 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.partners'::regclass AND polname='partners_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 171 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_partner_attribution'::regclass AND polname='workspace_partner_attribution_member_select')) THEN RAISE EXCEPTION '20260531160000 postcondition 172 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_partner_attribution'::regclass AND polname='workspace_partner_attribution_service_role_all')) THEN RAISE EXCEPTION '20260531160000 postcondition 173 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260531160000$;
