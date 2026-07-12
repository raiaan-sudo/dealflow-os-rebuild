-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260614193000 remote_name=click_to_scale_partner_ghl_sync original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260614193000_click_to_scale_partner_ghl_sync.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260614193000.preconditions.001 sha256=b6a76fca24fb1763ed6aa11c74942f45a921098b483fa47eac3bbf840681ffb5
DO $dealflow_table_guard_workspace_ghl_mapping$
DECLARE
  expected_table jsonb := $dealflow_table_guard_workspace_ghl_mapping_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_workspace_ghl_mapping_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_workspace_ghl_mapping_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"workspace_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"ghl_location_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"ghl_pipeline_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"ghl_stage_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"sync_enabled":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"true","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"p"},"assigned_by":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_workspace_ghl_mapping_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_workspace_ghl_mapping_required$["id","workspace_id","ghl_location_id","ghl_pipeline_id","ghl_stage_id","sync_enabled","assigned_by","created_at","updated_at","metadata","partner_id"]$dealflow_table_guard_workspace_ghl_mapping_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.workspace_ghl_mapping') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='workspace_ghl_mapping'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'workspace_ghl_mapping' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.workspace_ghl_mapping'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.workspace_ghl_mapping'::regclass
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
      WHERE attribute_record.attrelid='public.workspace_ghl_mapping'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'workspace_ghl_mapping' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_workspace_ghl_mapping$;

-- dealflow:statement id=20260614193000.preconditions.002 sha256=776d53e07b68d4f5a054cde2ba2cc03a8eaae2cf2487d720b59806b1295fc116
DO $dealflow_index_guard_workspace_ghl_mapping_partner_idx$
BEGIN
  IF to_regclass('public.workspace_ghl_mapping_partner_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_ghl_mapping_partner_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX workspace_ghl_mapping_partner_idx ON public.workspace_ghl_mapping USING btree (partner_id, sync_enabled)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_ghl_mapping_partner_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_ghl_mapping_partner_idx$;

-- dealflow:statement id=20260614193000.preconditions.003 sha256=1253d6c0d9b4083e8b68658940ee37851d369a49d23b2738463156cbb131a4c3
DO $dealflow_index_guard_workspace_ghl_mapping_workspace_partner_unique$
BEGIN
  IF to_regclass('public.workspace_ghl_mapping_workspace_partner_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='workspace_ghl_mapping_workspace_partner_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX workspace_ghl_mapping_workspace_partner_unique ON public.workspace_ghl_mapping USING btree (workspace_id, partner_id)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'workspace_ghl_mapping_workspace_partner_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_workspace_ghl_mapping_workspace_partner_unique$;

-- tables
-- dealflow:statement id=20260614193000.tables.001 sha256=a854998c2917dc98ba9cf9c6d07487ce1f47c6d325b41fdcb55351149dd44300
CREATE TABLE IF NOT EXISTS "public"."workspace_ghl_mapping" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "ghl_location_id" text NOT NULL,
  "ghl_pipeline_id" text,
  "ghl_stage_id" text,
  "sync_enabled" boolean DEFAULT true NOT NULL,
  "assigned_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "partner_id" uuid NOT NULL
);

-- constraints
-- dealflow:statement id=20260614193000.constraints.001 sha256=9960a2bc321290b6c2dbacdda058dd8dd54b89afd63ccd51739771b9e54ed541
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.002 sha256=50d1c2554a5cd5665b20b68cc036e56b2fab6bc270f0c8bac033fb3cdde04b4c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_location_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_location_check" CHECK ((ghl_location_id ~ '^[A-Za-z0-9_-]{3,120}$'::text));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((ghl_location_id ~ ''^[A-Za-z0-9_-]{3,120}$''::text))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_location_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.003 sha256=b8495f0bc211effe1a4fea4f33cb45fc54ddf9ab96ce369be512fff71ba73dde
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_pipeline_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_pipeline_check" CHECK (((ghl_pipeline_id IS NULL) OR (ghl_pipeline_id ~ '^[A-Za-z0-9_-]{3,160}$'::text)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((ghl_pipeline_id IS NULL) OR (ghl_pipeline_id ~ ''^[A-Za-z0-9_-]{3,160}$''::text)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_pipeline_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.004 sha256=df509c8e3d83459ede90dc2c997bf43ce6f65379fab3103b681c42748631141c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_stage_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_stage_check" CHECK (((ghl_stage_id IS NULL) OR (ghl_stage_id ~ '^[A-Za-z0-9_-]{3,160}$'::text)));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK (((ghl_stage_id IS NULL) OR (ghl_stage_id ~ ''^[A-Za-z0-9_-]{3,160}$''::text)))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_stage_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.005 sha256=18ddf2a9be992c83c437702131a3f872965008808a792a3123cecc318f70b5bb
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_assigned_by_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_assigned_by_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.006 sha256=e485ea8bb36010babd38a2386ba55b13d35ef36e9db1834887635b4c389d5215
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_partner_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_partner_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260614193000.constraints.007 sha256=79009da222f530da87aa2e9cece4a48cfc8bea8fd5853fcee2f2a5642b31d5af
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.workspace_ghl_mapping'::regclass
    AND constraint_record.conname='workspace_ghl_mapping_workspace_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."workspace_ghl_mapping" ADD CONSTRAINT "workspace_ghl_mapping_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (workspace_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'workspace_ghl_mapping', 'workspace_ghl_mapping_workspace_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260614193000.indexes.001 sha256=f870c418523bb7ded2912ce8b540129a8ece5bde313f081c84db118bb74a2fb2
CREATE INDEX IF NOT EXISTS workspace_ghl_mapping_partner_idx ON public.workspace_ghl_mapping USING btree (partner_id, sync_enabled);

-- dealflow:statement id=20260614193000.indexes.002 sha256=3f77c2e995f4273171e3e75aa7b8727c8f64d74a6eb68700333566e723741ea1
CREATE UNIQUE INDEX IF NOT EXISTS workspace_ghl_mapping_workspace_partner_unique ON public.workspace_ghl_mapping USING btree (workspace_id, partner_id);

-- controls
-- dealflow:statement id=20260614193000.controls.001 sha256=6cd34f98775650ef0b8f990e75dec3f71d44a9765a5771b61501ddc8d95df95e
DROP POLICY IF EXISTS "workspace_ghl_mapping_member_select" ON "public"."workspace_ghl_mapping";

-- dealflow:statement id=20260614193000.controls.002 sha256=7a3a4f91e6a918140d09f85ff81b6fba239e6c56899c4426263335bf74662607
CREATE POLICY "workspace_ghl_mapping_member_select" ON "public"."workspace_ghl_mapping"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(workspace_id));

-- dealflow:statement id=20260614193000.controls.003 sha256=1370fc0221d91dc5e1b5c2e16dac2f89b3561108deda623630b7b06a3eae90cc
DROP POLICY IF EXISTS "workspace_ghl_mapping_service_role_all" ON "public"."workspace_ghl_mapping";

-- dealflow:statement id=20260614193000.controls.004 sha256=712cd948ff2c2b4810d95f18175d298810a649576a33f9bec026815ffe0a4020
CREATE POLICY "workspace_ghl_mapping_service_role_all" ON "public"."workspace_ghl_mapping"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

-- dealflow:statement id=20260614193000.controls.005 sha256=072bf3c09f247e59d8d1ff0228b0d40b365efa752b5a83219d790e6369348d00
ALTER TABLE "public"."workspace_ghl_mapping" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260614193000.controls.006 sha256=0fe489fbae62e1d2b20007337c364cf37d7407556d428b65e0c29c1329d05d6c
ALTER TABLE "public"."workspace_ghl_mapping" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260614193000$
BEGIN
  IF NOT (to_regclass('public.workspace_ghl_mapping') IS NOT NULL) THEN RAISE EXCEPTION '20260614193000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_pkey')) THEN RAISE EXCEPTION '20260614193000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_location_check')) THEN RAISE EXCEPTION '20260614193000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_pipeline_check')) THEN RAISE EXCEPTION '20260614193000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_stage_check')) THEN RAISE EXCEPTION '20260614193000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_assigned_by_fkey')) THEN RAISE EXCEPTION '20260614193000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_partner_id_fkey')) THEN RAISE EXCEPTION '20260614193000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.workspace_ghl_mapping'::regclass AND conname='workspace_ghl_mapping_workspace_id_fkey')) THEN RAISE EXCEPTION '20260614193000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_ghl_mapping_partner_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260614193000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.workspace_ghl_mapping_workspace_partner_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260614193000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_ghl_mapping'::regclass AND polname='workspace_ghl_mapping_member_select')) THEN RAISE EXCEPTION '20260614193000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.workspace_ghl_mapping'::regclass AND polname='workspace_ghl_mapping_service_role_all')) THEN RAISE EXCEPTION '20260614193000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260614193000$;
