-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260504210000 remote_name=create_customer_success_checklists original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260504210000_create_customer_success_checklists.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260504210000.preconditions.001 sha256=c49b5b71cafdc968c2ea9ca8c5808dd56edf9be33c0c51ef72ccd4eed2584019
DO $dealflow_table_guard_customer_success_checklists$
DECLARE
  expected_table jsonb := $dealflow_table_guard_customer_success_checklists_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_customer_success_checklists_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_customer_success_checklists_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"onboarding_reviewed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"p"},"creative_qa_completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"preview_reviewed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"billing_verified_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"meta_connected_verified_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"assets_selected_verified_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"launch_readiness_verified_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"lead_loop_verified_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"day_7_check_in_completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"day_14_value_proof_completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"day_25_renewal_risk_review_completed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"risk_level":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'normal'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"owner_note":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_customer_success_checklists_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_customer_success_checklists_required$["id","organization_id","user_id","campaign_id","onboarding_reviewed_at","creative_qa_completed_at","preview_reviewed_at","billing_verified_at","meta_connected_verified_at","assets_selected_verified_at","launch_readiness_verified_at","lead_loop_verified_at","day_7_check_in_completed_at","day_14_value_proof_completed_at","day_25_renewal_risk_review_completed_at","risk_level","owner_note","created_at","updated_at"]$dealflow_table_guard_customer_success_checklists_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.customer_success_checklists') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='customer_success_checklists'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'customer_success_checklists' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.customer_success_checklists'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
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
      WHERE attribute_record.attrelid='public.customer_success_checklists'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'customer_success_checklists' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_customer_success_checklists$;

-- dealflow:statement id=20260504210000.preconditions.002 sha256=a55235f4bb22f9c3d81effbfe17bc2bc995e71ef687959fde2620af7afe86f4b
DO $dealflow_index_guard_customer_success_checklists_campaign_idx$
BEGIN
  IF to_regclass('public.customer_success_checklists_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='customer_success_checklists_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX customer_success_checklists_campaign_idx ON public.customer_success_checklists USING btree (campaign_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'customer_success_checklists_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_customer_success_checklists_campaign_idx$;

-- dealflow:statement id=20260504210000.preconditions.003 sha256=5bbcce8351575dface110969c1bc2a7cfd97ba0e87b0f3380de97b3a064da5a6
DO $dealflow_index_guard_customer_success_checklists_org_updated_idx$
BEGIN
  IF to_regclass('public.customer_success_checklists_org_updated_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='customer_success_checklists_org_updated_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX customer_success_checklists_org_updated_idx ON public.customer_success_checklists USING btree (organization_id, updated_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'customer_success_checklists_org_updated_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_customer_success_checklists_org_updated_idx$;

-- dealflow:statement id=20260504210000.preconditions.004 sha256=226c6fdee24787b79b9ba5e0a48e0f4c0b5e1cdc36775d3f540f1065c79f576a
DO $dealflow_index_guard_customer_success_checklists_user_idx$
BEGIN
  IF to_regclass('public.customer_success_checklists_user_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='customer_success_checklists_user_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX customer_success_checklists_user_idx ON public.customer_success_checklists USING btree (user_id) WHERE (user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'customer_success_checklists_user_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_customer_success_checklists_user_idx$;

-- tables
-- dealflow:statement id=20260504210000.tables.001 sha256=b55066084545df95b72ecf76757855d392b0de40c921c47090669ca7313a5b3a
CREATE TABLE IF NOT EXISTS "public"."customer_success_checklists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "campaign_id" uuid NOT NULL,
  "onboarding_reviewed_at" timestamp with time zone,
  "creative_qa_completed_at" timestamp with time zone,
  "preview_reviewed_at" timestamp with time zone,
  "billing_verified_at" timestamp with time zone,
  "meta_connected_verified_at" timestamp with time zone,
  "assets_selected_verified_at" timestamp with time zone,
  "launch_readiness_verified_at" timestamp with time zone,
  "lead_loop_verified_at" timestamp with time zone,
  "day_7_check_in_completed_at" timestamp with time zone,
  "day_14_value_proof_completed_at" timestamp with time zone,
  "day_25_renewal_risk_review_completed_at" timestamp with time zone,
  "risk_level" text DEFAULT 'normal'::text NOT NULL,
  "owner_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- constraints
-- dealflow:statement id=20260504210000.constraints.001 sha256=70ebac4d4ced56b072f976bfae8044c2a01f8f46a3610c433368f581b6845f5d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_campaign_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_campaign_unique" UNIQUE (campaign_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (campaign_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_campaign_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504210000.constraints.002 sha256=aec15ddee8fb19819f47ec5f5d802b5f061370373a51efc7ae5f59f6509b2f94
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504210000.constraints.003 sha256=3e06710c6f124b4a6a9f2b21209531788631257447d23d5fc848be4fe93eb2b9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_risk_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_risk_check" CHECK ((risk_level = ANY (ARRAY['normal'::text, 'watch'::text, 'at_risk'::text, 'blocked'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((risk_level = ANY (ARRAY[''normal''::text, ''watch''::text, ''at_risk''::text, ''blocked''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_risk_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504210000.constraints.004 sha256=ada81f3f32b447ee248a9b2eb59e973a334a82c1fe6207dfb7fe0e5f0720e9a9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504210000.constraints.005 sha256=99d8e1a35ffa7b9eaa4c9fee43cbf88b7e66056082b291c4d12557b517b988d9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504210000.constraints.006 sha256=9afadeba965e05030b766df0b363a47916b20ffe8b460c2dc45a43154cd3b9c5
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.customer_success_checklists'::regclass
    AND constraint_record.conname='customer_success_checklists_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."customer_success_checklists" ADD CONSTRAINT "customer_success_checklists_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'customer_success_checklists', 'customer_success_checklists_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260504210000.indexes.001 sha256=f99146da8fec9f0dd37b6331b1143314562df3c95fa6f1f9441bb32923370445
CREATE INDEX IF NOT EXISTS customer_success_checklists_campaign_idx ON public.customer_success_checklists USING btree (campaign_id);

-- dealflow:statement id=20260504210000.indexes.002 sha256=ad804d899a79e6b722698ec74e68b2fc958e54f090e3624deaa200049195ab6e
CREATE INDEX IF NOT EXISTS customer_success_checklists_org_updated_idx ON public.customer_success_checklists USING btree (organization_id, updated_at DESC);

-- dealflow:statement id=20260504210000.indexes.003 sha256=86432076a239e46068d4bca6e3081b123d3dd5849b3ba42356c51a7a9255145e
CREATE INDEX IF NOT EXISTS customer_success_checklists_user_idx ON public.customer_success_checklists USING btree (user_id) WHERE (user_id IS NOT NULL);

-- controls
-- dealflow:statement id=20260504210000.controls.001 sha256=1d4495d3670e7cdc7b5f1db0fc4281a825c3b26bee89c76bc58aa20e3e9655e2
DROP POLICY IF EXISTS "customer_success_checklists_member_select" ON "public"."customer_success_checklists";

-- dealflow:statement id=20260504210000.controls.002 sha256=45b73b0346628a7dcac7bdda33c104b40cd9e352ee2d77b73be4f2ac84a4e530
CREATE POLICY "customer_success_checklists_member_select" ON "public"."customer_success_checklists"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260504210000.controls.003 sha256=ebaa5b2f70d2759aa0045417cd1c8aa38a7c4a7ce4ccd38b5cce00f6e4c75972
DROP POLICY IF EXISTS "customer_success_checklists_service_role_all" ON "public"."customer_success_checklists";

-- dealflow:statement id=20260504210000.controls.004 sha256=c56f53764a25307a00a6e1ab838d08cdc8d9f96941ebd5bcbd0b9fc09596d950
CREATE POLICY "customer_success_checklists_service_role_all" ON "public"."customer_success_checklists"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260504210000.controls.005 sha256=0859ebe7dd7ab3439d9428d8570cbc6fa8d315731e46a1fcd4f314a2c34ddfa8
ALTER TABLE "public"."customer_success_checklists" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260504210000.controls.006 sha256=429a3708388282fdf53286bf4e4f4e5b11a44e1eb1fbbd2b9bf0e0fc9bf70c02
ALTER TABLE "public"."customer_success_checklists" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260504210000$
BEGIN
  IF NOT (to_regclass('public.customer_success_checklists') IS NOT NULL) THEN RAISE EXCEPTION '20260504210000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_campaign_unique')) THEN RAISE EXCEPTION '20260504210000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_pkey')) THEN RAISE EXCEPTION '20260504210000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_risk_check')) THEN RAISE EXCEPTION '20260504210000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_campaign_id_fkey')) THEN RAISE EXCEPTION '20260504210000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_organization_id_fkey')) THEN RAISE EXCEPTION '20260504210000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.customer_success_checklists'::regclass AND conname='customer_success_checklists_user_id_fkey')) THEN RAISE EXCEPTION '20260504210000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.customer_success_checklists_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504210000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.customer_success_checklists_org_updated_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504210000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.customer_success_checklists_user_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504210000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.customer_success_checklists'::regclass AND polname='customer_success_checklists_member_select')) THEN RAISE EXCEPTION '20260504210000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.customer_success_checklists'::regclass AND polname='customer_success_checklists_service_role_all')) THEN RAISE EXCEPTION '20260504210000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260504210000$;
