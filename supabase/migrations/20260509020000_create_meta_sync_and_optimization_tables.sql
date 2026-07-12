-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260509020000 remote_name=create_meta_sync_and_optimization_tables original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260509020000_create_meta_sync_and_optimization_tables.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260509020000.preconditions.001 sha256=a1b63733b340cb08d3c71380e88309a4c643e60cd14c35f7c8ecc5d1e716fe7c
DO $dealflow_table_guard_campaign_performance_snapshots$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_performance_snapshots_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_performance_snapshots_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_performance_snapshots_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'meta_sync'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"meta_campaign_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"meta_ad_set_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"meta_ad_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"spend_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"impressions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"reach":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"frequency":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"m"},"cpm_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"ctr":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"m"},"cpc_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"landing_page_views":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"leads":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"cpl_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"form_submits":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"thank_you_conversions":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"},"funnel_cvr":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"numeric","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":20,"relation_kind":"r","storage_strategy":"m"},"selected_creative_asset_ids":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":21,"relation_kind":"r","storage_strategy":"x"},"creative_angle":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":22,"relation_kind":"r","storage_strategy":"x"},"creative_hook":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":23,"relation_kind":"r","storage_strategy":"x"},"creative_cta":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":24,"relation_kind":"r","storage_strategy":"x"},"public_funnel_state":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":25,"relation_kind":"r","storage_strategy":"x"},"lead_notification_state":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":26,"relation_kind":"r","storage_strategy":"x"},"lead_quality_status_counts":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":27,"relation_kind":"r","storage_strategy":"x"},"booked_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":28,"relation_kind":"r","storage_strategy":"p"},"showed_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":29,"relation_kind":"r","storage_strategy":"p"},"signed_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":30,"relation_kind":"r","storage_strategy":"p"},"billing_state":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'unknown'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":31,"relation_kind":"r","storage_strategy":"x"},"operator_debt_state":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'unknown'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":32,"relation_kind":"r","storage_strategy":"x"},"destination_health_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'unknown'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":33,"relation_kind":"r","storage_strategy":"x"},"snapshot_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":34,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":35,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_performance_snapshots_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_performance_snapshots_required$["id","organization_id","campaign_id","source","meta_campaign_id","meta_ad_set_id","meta_ad_id","spend_cents","impressions","reach","frequency","cpm_cents","ctr","cpc_cents","landing_page_views","leads","cpl_cents","form_submits","thank_you_conversions","funnel_cvr","selected_creative_asset_ids","creative_angle","creative_hook","creative_cta","public_funnel_state","lead_notification_state","lead_quality_status_counts","booked_count","showed_count","signed_count","billing_state","operator_debt_state","destination_health_status","snapshot_at","created_at"]$dealflow_table_guard_campaign_performance_snapshots_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_performance_snapshots') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_performance_snapshots'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_performance_snapshots' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_performance_snapshots'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_performance_snapshots'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_performance_snapshots'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_performance_snapshots' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_performance_snapshots$;

-- dealflow:statement id=20260509020000.preconditions.002 sha256=4130cc18de30974746d75dc135101e3b779c0d87fee5c28b9f7f60333d71de1d
DO $dealflow_table_guard_campaign_sync_snapshots$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_sync_snapshots_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_sync_snapshots_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_sync_snapshots_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"account_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"launch_mode":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'test'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"sync_result":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'failed'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"meta_campaign_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"meta_ad_set_ids":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"meta_ad_ids":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"campaign_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"ad_set_statuses":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"ad_statuses":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"delivery_metrics":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"sync_metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"sync_errors":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"synced_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_sync_snapshots_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_sync_snapshots_required$["id","organization_id","user_id","campaign_name","account_name","launch_mode","sync_result","meta_campaign_id","meta_ad_set_ids","meta_ad_ids","campaign_status","ad_set_statuses","ad_statuses","delivery_metrics","sync_metadata","sync_errors","synced_at","created_at"]$dealflow_table_guard_campaign_sync_snapshots_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_sync_snapshots') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_sync_snapshots'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_sync_snapshots' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_sync_snapshots'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
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
      WHERE attribute_record.attrelid='public.campaign_sync_snapshots'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_sync_snapshots' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_sync_snapshots$;

-- dealflow:statement id=20260509020000.preconditions.003 sha256=cf4d8de6a9b5136d6f5fc635ea4f9488d9c07a0c55a1dc39d7409d231eccacdf
DO $dealflow_table_guard_insights$
DECLARE
  expected_table jsonb := $dealflow_table_guard_insights_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_insights_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_insights_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"body":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"category":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"severity":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'info'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_insights_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_insights_required$["id","organization_id","title","body","category","severity","created_at","updated_at"]$dealflow_table_guard_insights_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.insights') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='insights'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'insights' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.insights'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.insights'::regclass
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
      WHERE attribute_record.attrelid='public.insights'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'insights' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_insights$;

-- dealflow:statement id=20260509020000.preconditions.004 sha256=eace4cc2f3d750aef2af34a8e584c57fcdd2a91f0593fe39d99337b878320889
DO $dealflow_table_guard_recommendations$
DECLARE
  expected_table jsonb := $dealflow_table_guard_recommendations_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_recommendations_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_recommendations_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"body":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"category":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"priority":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'medium'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'open'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_recommendations_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_recommendations_required$["id","organization_id","title","body","category","priority","status","created_at","updated_at"]$dealflow_table_guard_recommendations_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.recommendations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='recommendations'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'recommendations' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.recommendations'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.recommendations'::regclass
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
      WHERE attribute_record.attrelid='public.recommendations'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'recommendations' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_recommendations$;

-- dealflow:statement id=20260509020000.preconditions.005 sha256=6e352e48e30c4e0c5e599fed7091d582cdfb2c614a1d2686e1f5b833e2644cb5
DO $dealflow_index_guard_campaign_performance_snapshots_campaign_time_idx$
BEGIN
  IF to_regclass('public.campaign_performance_snapshots_campaign_time_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_performance_snapshots_campaign_time_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_performance_snapshots_campaign_time_idx ON public.campaign_performance_snapshots USING btree (organization_id, campaign_id, snapshot_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_performance_snapshots_campaign_time_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_performance_snapshots_campaign_time_idx$;

-- dealflow:statement id=20260509020000.preconditions.006 sha256=10ec3f7d928fe4eb31928a5b7307dc79a9bdf89a4a999293a842f85626707424
DO $dealflow_index_guard_campaign_sync_snapshots_campaign_name_idx$
BEGIN
  IF to_regclass('public.campaign_sync_snapshots_campaign_name_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_sync_snapshots_campaign_name_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_sync_snapshots_campaign_name_idx ON public.campaign_sync_snapshots USING btree (organization_id, user_id, campaign_name, synced_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_sync_snapshots_campaign_name_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_sync_snapshots_campaign_name_idx$;

-- dealflow:statement id=20260509020000.preconditions.007 sha256=263b8c6a89661f3941bbdf7792a19fc637f3f59730b8c218af7913db807d0b4f
DO $dealflow_index_guard_campaign_sync_snapshots_meta_campaign_idx$
BEGIN
  IF to_regclass('public.campaign_sync_snapshots_meta_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_sync_snapshots_meta_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_sync_snapshots_meta_campaign_idx ON public.campaign_sync_snapshots USING btree (organization_id, user_id, meta_campaign_id, synced_at DESC) WHERE (meta_campaign_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_sync_snapshots_meta_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_sync_snapshots_meta_campaign_idx$;

-- dealflow:statement id=20260509020000.preconditions.008 sha256=c73542147719eceb01e1fa98b68f7caa0d087adad6d4dace65116400b0b15309
DO $dealflow_index_guard_campaign_sync_snapshots_org_synced_idx$
BEGIN
  IF to_regclass('public.campaign_sync_snapshots_org_synced_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_sync_snapshots_org_synced_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_sync_snapshots_org_synced_idx ON public.campaign_sync_snapshots USING btree (organization_id, synced_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_sync_snapshots_org_synced_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_sync_snapshots_org_synced_idx$;

-- dealflow:statement id=20260509020000.preconditions.009 sha256=fa8a2d242c8dde0f29d4efaeacc894bef967caea32ccf082a20c28f87bc1f3fa
DO $dealflow_index_guard_campaign_sync_snapshots_user_synced_idx$
BEGIN
  IF to_regclass('public.campaign_sync_snapshots_user_synced_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_sync_snapshots_user_synced_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_sync_snapshots_user_synced_idx ON public.campaign_sync_snapshots USING btree (user_id, synced_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_sync_snapshots_user_synced_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_sync_snapshots_user_synced_idx$;

-- dealflow:statement id=20260509020000.preconditions.010 sha256=343a70407dbf981063c4a0ea70fb8adaf7031eade30571dc62eec63c2eb66ebb
DO $dealflow_index_guard_idx_insights_org_created$
BEGIN
  IF to_regclass('public.idx_insights_org_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_insights_org_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_insights_org_created ON public.insights USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_insights_org_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_insights_org_created$;

-- dealflow:statement id=20260509020000.preconditions.011 sha256=a261c0fab6fe732f845dd975391161854ccd93b1370c2f4737807e3ae3d214e7
DO $dealflow_index_guard_idx_recommendations_org_created$
BEGIN
  IF to_regclass('public.idx_recommendations_org_created') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='idx_recommendations_org_created'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX idx_recommendations_org_created ON public.recommendations USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'idx_recommendations_org_created' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_idx_recommendations_org_created$;

-- tables
-- dealflow:statement id=20260509020000.tables.001 sha256=3c8c1640fe9111edb012acfd5b5d8fd83a108fe20b374ff0c8e603d67c78c554
CREATE TABLE IF NOT EXISTS "public"."campaign_performance_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "source" text DEFAULT 'meta_sync'::text NOT NULL,
  "meta_campaign_id" text,
  "meta_ad_set_id" text,
  "meta_ad_id" text,
  "spend_cents" integer DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "reach" integer DEFAULT 0 NOT NULL,
  "frequency" numeric DEFAULT 0 NOT NULL,
  "cpm_cents" integer DEFAULT 0 NOT NULL,
  "ctr" numeric DEFAULT 0 NOT NULL,
  "cpc_cents" integer DEFAULT 0 NOT NULL,
  "landing_page_views" integer DEFAULT 0 NOT NULL,
  "leads" integer DEFAULT 0 NOT NULL,
  "cpl_cents" integer DEFAULT 0 NOT NULL,
  "form_submits" integer DEFAULT 0 NOT NULL,
  "thank_you_conversions" integer DEFAULT 0 NOT NULL,
  "funnel_cvr" numeric DEFAULT 0 NOT NULL,
  "selected_creative_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "creative_angle" text,
  "creative_hook" text,
  "creative_cta" text,
  "public_funnel_state" text,
  "lead_notification_state" text,
  "lead_quality_status_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "booked_count" integer DEFAULT 0 NOT NULL,
  "showed_count" integer DEFAULT 0 NOT NULL,
  "signed_count" integer DEFAULT 0 NOT NULL,
  "billing_state" text DEFAULT 'unknown'::text NOT NULL,
  "operator_debt_state" text DEFAULT 'unknown'::text NOT NULL,
  "destination_health_status" text DEFAULT 'unknown'::text NOT NULL,
  "snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260509020000.tables.002 sha256=86b5c4ae29a03ff1a800191ad70246e960540a3e44c3633d2472d545ab305601
CREATE TABLE IF NOT EXISTS "public"."campaign_sync_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "campaign_name" text NOT NULL,
  "account_name" text,
  "launch_mode" text DEFAULT 'test'::text NOT NULL,
  "sync_result" text DEFAULT 'failed'::text NOT NULL,
  "meta_campaign_id" text,
  "meta_ad_set_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "meta_ad_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "campaign_status" text,
  "ad_set_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ad_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "delivery_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sync_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sync_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- dealflow:statement id=20260509020000.tables.003 sha256=84ecfd3b5e1e4eb2a2e8118c120a6d9ab98f8b39e2996419592abc9f94806543
CREATE TABLE IF NOT EXISTS "public"."insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text NOT NULL,
  "severity" text DEFAULT 'info'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260509020000.tables.004 sha256=2de47b308bbf823e30c0145a234474050ee8d2ed504c00c75887f0d38a6a0739
CREATE TABLE IF NOT EXISTS "public"."recommendations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text NOT NULL,
  "priority" text DEFAULT 'medium'::text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- constraints
-- dealflow:statement id=20260509020000.constraints.001 sha256=44867d1a661214aeb200d4f0fc7b706460d01bd678f49a63a307adccbde35e3e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_performance_snapshots'::regclass
    AND constraint_record.conname='campaign_performance_snapshots_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_performance_snapshots" ADD CONSTRAINT "campaign_performance_snapshots_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_performance_snapshots', 'campaign_performance_snapshots_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.002 sha256=5fe926156e0598945ecb697f2c6d8275a7bb32d4a84ccd3a454abfd60c904dfc
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.003 sha256=ab1808516292a794af56792e70ebe028188a543fc99ca44b68ba09be8b81cb63
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.insights'::regclass
    AND constraint_record.conname='insights_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."insights" ADD CONSTRAINT "insights_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'insights', 'insights_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.004 sha256=0d2f0622051c2545b4bed84848068f62039f27a2aab3531ada8bc20caeb0a69d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.recommendations'::regclass
    AND constraint_record.conname='recommendations_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."recommendations" ADD CONSTRAINT "recommendations_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'recommendations', 'recommendations_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.005 sha256=0b283d68eaf253640ffa799bc729f5fbdb8d6e15c54c67db86c63d14fb54daba
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_launch_mode_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_launch_mode_check" CHECK ((launch_mode = ANY (ARRAY['test'::text, 'live'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((launch_mode = ANY (ARRAY[''test''::text, ''live''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_launch_mode_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.006 sha256=81d2004938a7506a456f724390c0cd029ac73c77f39163a1bb2d1ec6f3b5eee4
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_name_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_name_not_blank" CHECK ((length(TRIM(BOTH FROM campaign_name)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM campaign_name)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_name_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.007 sha256=2dade55a6a04e3a2633dd7611037c2a00b022f587247eb0332eb15dfc7a37cee
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_result_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_result_check" CHECK ((sync_result = ANY (ARRAY['success'::text, 'partial_success'::text, 'failed'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((sync_result = ANY (ARRAY[''success''::text, ''partial_success''::text, ''failed''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_result_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.008 sha256=63b8daae848fc8df5773b541e69baac909f0a56a0ec57837f0c8fc74d6a84225
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_performance_snapshots'::regclass
    AND constraint_record.conname='campaign_performance_snapshots_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_performance_snapshots" ADD CONSTRAINT "campaign_performance_snapshots_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_performance_snapshots', 'campaign_performance_snapshots_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.009 sha256=78380528e1395b35a8c9fe6d16d88d6b06619515ab86770c7911b887626af32d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_performance_snapshots'::regclass
    AND constraint_record.conname='campaign_performance_snapshots_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_performance_snapshots" ADD CONSTRAINT "campaign_performance_snapshots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_performance_snapshots', 'campaign_performance_snapshots_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.010 sha256=053c47929a5db7c3cfe9b6600c31600d523adffea9b3003ba8c5f64b74940e97
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.011 sha256=3cf1ccd15e81d614ea484e392d2b549e64e8d187129d0a79f566f631fc578e11
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_sync_snapshots'::regclass
    AND constraint_record.conname='campaign_sync_snapshots_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_sync_snapshots" ADD CONSTRAINT "campaign_sync_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_sync_snapshots', 'campaign_sync_snapshots_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.012 sha256=a4a481bc562922e475ea95b69a8c1fa7ffaccbd4b5200cbc75f475a2b5dee02e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.insights'::regclass
    AND constraint_record.conname='insights_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."insights" ADD CONSTRAINT "insights_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'insights', 'insights_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260509020000.constraints.013 sha256=a055889e746b36a80155fe401b6ade9d3713da0f3adefbefb421d2f082c27105
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.recommendations'::regclass
    AND constraint_record.conname='recommendations_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."recommendations" ADD CONSTRAINT "recommendations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'recommendations', 'recommendations_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260509020000.indexes.001 sha256=496f2b1c91d100ad274ed0301fba46e0dd213454eb87e3358a382f9dbd30179b
CREATE INDEX IF NOT EXISTS campaign_performance_snapshots_campaign_time_idx ON public.campaign_performance_snapshots USING btree (organization_id, campaign_id, snapshot_at DESC);

-- dealflow:statement id=20260509020000.indexes.002 sha256=5c914cc973510a1e843e12233a8eba10929d7d711ef907a8924ecb8ee0dc2c2e
CREATE INDEX IF NOT EXISTS campaign_sync_snapshots_campaign_name_idx ON public.campaign_sync_snapshots USING btree (organization_id, user_id, campaign_name, synced_at DESC);

-- dealflow:statement id=20260509020000.indexes.003 sha256=facd1a2b71c4dd24dbebdcd44c3e871d7a260e84edab8ca96f07fec3f824f3e2
CREATE INDEX IF NOT EXISTS campaign_sync_snapshots_meta_campaign_idx ON public.campaign_sync_snapshots USING btree (organization_id, user_id, meta_campaign_id, synced_at DESC) WHERE (meta_campaign_id IS NOT NULL);

-- dealflow:statement id=20260509020000.indexes.004 sha256=8dd54c91a254df6b3aa0b9049fad16f62c09ed84cf28157ec6b0c53cc6b40f36
CREATE INDEX IF NOT EXISTS campaign_sync_snapshots_org_synced_idx ON public.campaign_sync_snapshots USING btree (organization_id, synced_at DESC);

-- dealflow:statement id=20260509020000.indexes.005 sha256=20333447731402b23bde0f3c9873ca75419625652ef324ee5b2b4cb5662a9f4b
CREATE INDEX IF NOT EXISTS campaign_sync_snapshots_user_synced_idx ON public.campaign_sync_snapshots USING btree (user_id, synced_at DESC);

-- dealflow:statement id=20260509020000.indexes.006 sha256=4be84dc6797e59d29aa3a5342f3ba2f78286d28d17a26a01609b2485acf92d1e
CREATE INDEX IF NOT EXISTS idx_insights_org_created ON public.insights USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260509020000.indexes.007 sha256=7c80ee5b870e71f3629892fe3a45c74a5bad8fd0107d5370a807fd5659d9411e
CREATE INDEX IF NOT EXISTS idx_recommendations_org_created ON public.recommendations USING btree (organization_id, created_at DESC);

-- controls
-- dealflow:statement id=20260509020000.controls.001 sha256=d3704b8b0ed50a54d51aa8789108ba6b43184b1b4ba2e0ce625cafa5daa7f380
DROP POLICY IF EXISTS "campaign_performance_snapshots_member_select" ON "public"."campaign_performance_snapshots";

-- dealflow:statement id=20260509020000.controls.002 sha256=b660c44c7d2e0bf9daa980512cf486601f8f2066984aaf77345600cac1229092
CREATE POLICY "campaign_performance_snapshots_member_select" ON "public"."campaign_performance_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260509020000.controls.003 sha256=54cb28509c3ba368d8fad1ea2249f04a5fd574a99e2417673e62f8cfa97d3183
DROP POLICY IF EXISTS "campaign_performance_snapshots_service_role_all" ON "public"."campaign_performance_snapshots";

-- dealflow:statement id=20260509020000.controls.004 sha256=f9405f328a90a12bede1bf872a07ce59468bd79d2a69d3fe70e9b956cbf30f19
CREATE POLICY "campaign_performance_snapshots_service_role_all" ON "public"."campaign_performance_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260509020000.controls.005 sha256=f7b2df89e8c6cf61b160a01b175460de90308fccb60818d244b73bafd587aaad
DROP POLICY IF EXISTS "campaign_sync_snapshots_member_insert" ON "public"."campaign_sync_snapshots";

-- dealflow:statement id=20260509020000.controls.006 sha256=58000b57729ff4135cc770f6f7fe71ea5ee61d6cf72889c6802a74923700018f
CREATE POLICY "campaign_sync_snapshots_member_insert" ON "public"."campaign_sync_snapshots"
  AS PERMISSIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260509020000.controls.007 sha256=570feb7a07b6d0dcc5d278dc0d0e47addac25e457fa0c9ec3d04a370f77849b7
DROP POLICY IF EXISTS "campaign_sync_snapshots_member_select" ON "public"."campaign_sync_snapshots";

-- dealflow:statement id=20260509020000.controls.008 sha256=ffa16582f4fccb103f17e644f70ce0bcf6c012b053ac57c65186d760bfedf1cf
CREATE POLICY "campaign_sync_snapshots_member_select" ON "public"."campaign_sync_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = user_id) AND private.is_current_user_org_member(organization_id)));

-- dealflow:statement id=20260509020000.controls.009 sha256=408cdc2c91ed047474ac28e9a5b76eecca0df92d34fa920d1dd54482b5e50704
DROP POLICY IF EXISTS "campaign_sync_snapshots_service_role_all" ON "public"."campaign_sync_snapshots";

-- dealflow:statement id=20260509020000.controls.010 sha256=2c29098a449b534dd301cfac36e052d9acf2c31e2849742eb200742180ddb804
CREATE POLICY "campaign_sync_snapshots_service_role_all" ON "public"."campaign_sync_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260509020000.controls.011 sha256=06a4421ada4a2b3ab67b1b121abb8392e9a74fb2339b24a73cc270f97efb21ed
DROP POLICY IF EXISTS "insights_member_access" ON "public"."insights";

-- dealflow:statement id=20260509020000.controls.012 sha256=f862d28f8f9734923a15affc975ee656cb95385aa213b52df9f58d336b69d9b2
CREATE POLICY "insights_member_access" ON "public"."insights"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260509020000.controls.013 sha256=c2b75d21967e2e8fcb186f2f0d239d8b5554f85b4acaa7382bc3ba7deeec9fe7
DROP POLICY IF EXISTS "recommendations_member_access" ON "public"."recommendations";

-- dealflow:statement id=20260509020000.controls.014 sha256=4586741ed9afeb31293fae47fcb5a9e9373edd9dfc143c1921f8b48173bbab5c
CREATE POLICY "recommendations_member_access" ON "public"."recommendations"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- dealflow:statement id=20260509020000.controls.015 sha256=390cf1508b13d7516cf2ce01741d265f94f5db53022bbb75dca13773f49cca8a
DROP TRIGGER IF EXISTS "set_insights_updated_at" ON "public"."insights";

-- dealflow:statement id=20260509020000.controls.016 sha256=eb73f6ad3f19011335a663d675f2ac5ca19d02d7253c4cce1d61605c18a6a589
CREATE TRIGGER set_insights_updated_at BEFORE UPDATE ON public.insights FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260509020000.controls.017 sha256=42067e53885c4c597a762e1a4ffda883a4f74feb3ae2a939535717523a7de6e7
DROP TRIGGER IF EXISTS "set_recommendations_updated_at" ON "public"."recommendations";

-- dealflow:statement id=20260509020000.controls.018 sha256=0e2bb8cf6ae622c2fd6c8dec4c66baf11e0bd47dad68d327569fa48f14938959
CREATE TRIGGER set_recommendations_updated_at BEFORE UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260509020000.controls.019 sha256=dbc182beb954842d1cb42146d802093a6859e1cccebd9e6e712b9e849eeeb56d
ALTER TABLE "public"."campaign_performance_snapshots" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.020 sha256=750fc277dc489623817eccaa6f0606e6ea7bd6892cf9928f360676a66563b5a5
ALTER TABLE "public"."campaign_performance_snapshots" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.021 sha256=61c470af5a6757bb2cbe8b6c5f7e57969af4057bec6f93b9475a6678b28b6af9
ALTER TABLE "public"."campaign_sync_snapshots" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.022 sha256=565d27179e002eae161c4c3d95ce5d8c55daa30521eae2ffbd193a580f6a4340
ALTER TABLE "public"."campaign_sync_snapshots" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.023 sha256=23c58309f9da4f0f69d6bf3784ddbda7c121bc29c1ac03f3a2de2ce5a7cfd29f
ALTER TABLE "public"."insights" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.024 sha256=d601c7ef230c338a10a2905cde9009381cbd78cfef926389a42b54db28271327
ALTER TABLE "public"."insights" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.025 sha256=574aec7c08a9ab2142832977e1a2dbe7f71c342cb713ced6cd4f76fa9ba9796a
ALTER TABLE "public"."recommendations" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260509020000.controls.026 sha256=addd2b812badf5b3d936c748305e5778e4037ce9166994e8c100779b8e7a4ad0
ALTER TABLE "public"."recommendations" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260509020000$
BEGIN
  IF NOT (to_regclass('public.campaign_performance_snapshots') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_sync_snapshots') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.insights') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.recommendations') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_performance_snapshots'::regclass AND conname='campaign_performance_snapshots_pkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_pkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.insights'::regclass AND conname='insights_pkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.recommendations'::regclass AND conname='recommendations_pkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_launch_mode_check')) THEN RAISE EXCEPTION '20260509020000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_name_not_blank')) THEN RAISE EXCEPTION '20260509020000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_result_check')) THEN RAISE EXCEPTION '20260509020000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_performance_snapshots'::regclass AND conname='campaign_performance_snapshots_campaign_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_performance_snapshots'::regclass AND conname='campaign_performance_snapshots_organization_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_organization_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_sync_snapshots'::regclass AND conname='campaign_sync_snapshots_user_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.insights'::regclass AND conname='insights_organization_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.recommendations'::regclass AND conname='recommendations_organization_id_fkey')) THEN RAISE EXCEPTION '20260509020000 postcondition 17 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_performance_snapshots_campaign_time_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 18 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_sync_snapshots_campaign_name_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 19 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_sync_snapshots_meta_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 20 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_sync_snapshots_org_synced_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 21 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_sync_snapshots_user_synced_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 22 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_insights_org_created') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 23 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.idx_recommendations_org_created') IS NOT NULL) THEN RAISE EXCEPTION '20260509020000 postcondition 24 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_performance_snapshots'::regclass AND polname='campaign_performance_snapshots_member_select')) THEN RAISE EXCEPTION '20260509020000 postcondition 25 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_performance_snapshots'::regclass AND polname='campaign_performance_snapshots_service_role_all')) THEN RAISE EXCEPTION '20260509020000 postcondition 26 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_sync_snapshots'::regclass AND polname='campaign_sync_snapshots_member_insert')) THEN RAISE EXCEPTION '20260509020000 postcondition 27 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_sync_snapshots'::regclass AND polname='campaign_sync_snapshots_member_select')) THEN RAISE EXCEPTION '20260509020000 postcondition 28 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_sync_snapshots'::regclass AND polname='campaign_sync_snapshots_service_role_all')) THEN RAISE EXCEPTION '20260509020000 postcondition 29 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.insights'::regclass AND polname='insights_member_access')) THEN RAISE EXCEPTION '20260509020000 postcondition 30 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.recommendations'::regclass AND polname='recommendations_member_access')) THEN RAISE EXCEPTION '20260509020000 postcondition 31 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.insights'::regclass AND tgname='set_insights_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260509020000 postcondition 32 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.recommendations'::regclass AND tgname='set_recommendations_updated_at' AND NOT tgisinternal)) THEN RAISE EXCEPTION '20260509020000 postcondition 33 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260509020000$;
