-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260504190000 remote_name=create_campaign_value_reports original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260504190000_create_campaign_value_reports.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260504190000.preconditions.001 sha256=4774c74b5b74b38e4219c4991b185f35fd3ff7e9d126e0a381e3d74a141d58cd
DO $dealflow_table_guard_campaign_value_reports$
DECLARE
  expected_table jsonb := $dealflow_table_guard_campaign_value_reports_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_campaign_value_reports_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_campaign_value_reports_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"report_type":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'weekly_value'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"report_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"period_start":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"date","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"p"},"period_end":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"date","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'generated'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"summary":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"jsonb","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_campaign_value_reports_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_campaign_value_reports_required$["id","organization_id","user_id","campaign_id","report_type","report_key","period_start","period_end","status","summary","created_at","updated_at"]$dealflow_table_guard_campaign_value_reports_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.campaign_value_reports') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='campaign_value_reports'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'campaign_value_reports' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.campaign_value_reports'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.campaign_value_reports'::regclass
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
      WHERE attribute_record.attrelid='public.campaign_value_reports'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'campaign_value_reports' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_campaign_value_reports$;

-- dealflow:statement id=20260504190000.preconditions.002 sha256=4e2176ecbcd8b039d1bfc267a9f23ff414d4dc9bd29fc14cb21f9774ee717e17
DO $dealflow_index_guard_campaign_value_reports_campaign_created_idx$
BEGIN
  IF to_regclass('public.campaign_value_reports_campaign_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_value_reports_campaign_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_value_reports_campaign_created_idx ON public.campaign_value_reports USING btree (campaign_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_value_reports_campaign_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_value_reports_campaign_created_idx$;

-- dealflow:statement id=20260504190000.preconditions.003 sha256=98c9c1bb082db37a5516a7b2835338f8916690a9c7a701b3636a85faccf8f813
DO $dealflow_index_guard_campaign_value_reports_org_campaign_key_unique$
BEGIN
  IF to_regclass('public.campaign_value_reports_org_campaign_key_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_value_reports_org_campaign_key_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX campaign_value_reports_org_campaign_key_unique ON public.campaign_value_reports USING btree (organization_id, campaign_id, report_key)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_value_reports_org_campaign_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_value_reports_org_campaign_key_unique$;

-- dealflow:statement id=20260504190000.preconditions.004 sha256=a819d1575bf3120ff6723e6b86526971538aec6e139fad6be46f3accd0116a0b
DO $dealflow_index_guard_campaign_value_reports_org_created_idx$
BEGIN
  IF to_regclass('public.campaign_value_reports_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_value_reports_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_value_reports_org_created_idx ON public.campaign_value_reports USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_value_reports_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_value_reports_org_created_idx$;

-- dealflow:statement id=20260504190000.preconditions.005 sha256=1e6e69359141049042e47b68610519f7e21770d2db813eecffaf676a75c63478
DO $dealflow_index_guard_campaign_value_reports_user_idx$
BEGIN
  IF to_regclass('public.campaign_value_reports_user_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='campaign_value_reports_user_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX campaign_value_reports_user_idx ON public.campaign_value_reports USING btree (user_id) WHERE (user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'campaign_value_reports_user_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_campaign_value_reports_user_idx$;

-- tables
-- dealflow:statement id=20260504190000.tables.001 sha256=c26d877c8e9aa7b7599286cfd2d311d81ddc52ce9920d90b9821cfc18d4c7f76
CREATE TABLE IF NOT EXISTS "public"."campaign_value_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "campaign_id" uuid,
  "report_type" text DEFAULT 'weekly_value'::text NOT NULL,
  "report_key" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text DEFAULT 'generated'::text NOT NULL,
  "summary" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- constraints
-- dealflow:statement id=20260504190000.constraints.001 sha256=7867d631725167039348f09bca1df6746bf85144272e82e5f7f00b37cddb133a
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.002 sha256=7eb358fe07528e9f4c787dfbb601d82cb1cd32efa1c4e82350338e0bbeb99f05
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_key_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_key_not_blank" CHECK ((length(TRIM(BOTH FROM report_key)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM report_key)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_key_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.003 sha256=2bebda712bbb48c0c7250a0c73166c3b789ac8d2c5b468e23a244e69f24eb809
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_status_check" CHECK ((status = ANY (ARRAY['generated'::text, 'review_needed'::text, 'sent'::text, 'archived'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''generated''::text, ''review_needed''::text, ''sent''::text, ''archived''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.004 sha256=679d8a02b741945d67ec1b016562933586e162bab5a929bbda254e27fb5fa245
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_type_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_type_check" CHECK ((report_type = ANY (ARRAY['weekly_value'::text, 'campaign_progress'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((report_type = ANY (ARRAY[''weekly_value''::text, ''campaign_progress''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_type_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.005 sha256=dee68c18c005134240bbec33b165599c15f841915131282cf1627da0ed52941f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.006 sha256=0d408495c08b50dac38c5058c249f64947bd731db9cc08e2f7bc764f84bb19b8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504190000.constraints.007 sha256=05a67f962fc89c7c632cc6d591c06011ec505e37349f5c022f288c2351d71c84
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_value_reports'::regclass
    AND constraint_record.conname='campaign_value_reports_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_value_reports" ADD CONSTRAINT "campaign_value_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_value_reports', 'campaign_value_reports_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260504190000.indexes.001 sha256=a1cbd74795180361304725eaf194b285a55cc1e01bcf481a3eb727cec4c4a35d
CREATE INDEX IF NOT EXISTS campaign_value_reports_campaign_created_idx ON public.campaign_value_reports USING btree (campaign_id, created_at DESC);

-- dealflow:statement id=20260504190000.indexes.002 sha256=b1d662404f07e4b17ff90dc5c3649fd648f41f70ebe864d0826655287443fd7e
CREATE UNIQUE INDEX IF NOT EXISTS campaign_value_reports_org_campaign_key_unique ON public.campaign_value_reports USING btree (organization_id, campaign_id, report_key);

-- dealflow:statement id=20260504190000.indexes.003 sha256=29c23d3219a25a5a4d376763a2a35df68b0ee26293e7dcdef637d70c9316227b
CREATE INDEX IF NOT EXISTS campaign_value_reports_org_created_idx ON public.campaign_value_reports USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260504190000.indexes.004 sha256=11f47791ff4e8aa07d2ffcfbfcf718e0bdc5976b7ef2de60fb9c8b5ce16c7782
CREATE INDEX IF NOT EXISTS campaign_value_reports_user_idx ON public.campaign_value_reports USING btree (user_id) WHERE (user_id IS NOT NULL);

-- controls
-- dealflow:statement id=20260504190000.controls.001 sha256=b3f78942be66ff285f2603aeec60b8cec6af33b7cbd2282c5b0717825b2cf518
DROP POLICY IF EXISTS "campaign_value_reports_member_select" ON "public"."campaign_value_reports";

-- dealflow:statement id=20260504190000.controls.002 sha256=07f7fba1b4bf687bac8a194f8ceab8f55968142b1b7678ab390ef8e3bc99c4af
CREATE POLICY "campaign_value_reports_member_select" ON "public"."campaign_value_reports"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260504190000.controls.003 sha256=3efa4c18b2b2362a130fddf43319abd97dd2ad8dfafc7a7aabbbf9882f946599
DROP POLICY IF EXISTS "campaign_value_reports_service_role_all" ON "public"."campaign_value_reports";

-- dealflow:statement id=20260504190000.controls.004 sha256=0985f39bb4cb7ff5a393a1285b87487072252c4094b1f81745bcd9948c01a75c
CREATE POLICY "campaign_value_reports_service_role_all" ON "public"."campaign_value_reports"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260504190000.controls.005 sha256=b88a4d579b82fc1122a335cacb35ba0bf9dec8aaf8d2b8c7c9e268ff8e685800
ALTER TABLE "public"."campaign_value_reports" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260504190000.controls.006 sha256=4ace7d1ce4686323535d1a8c231c44fdffca2ea6b254b1fdf36d20f1e0998770
ALTER TABLE "public"."campaign_value_reports" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260504190000$
BEGIN
  IF NOT (to_regclass('public.campaign_value_reports') IS NOT NULL) THEN RAISE EXCEPTION '20260504190000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_pkey')) THEN RAISE EXCEPTION '20260504190000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_key_not_blank')) THEN RAISE EXCEPTION '20260504190000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_status_check')) THEN RAISE EXCEPTION '20260504190000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_type_check')) THEN RAISE EXCEPTION '20260504190000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_campaign_id_fkey')) THEN RAISE EXCEPTION '20260504190000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_organization_id_fkey')) THEN RAISE EXCEPTION '20260504190000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_value_reports'::regclass AND conname='campaign_value_reports_user_id_fkey')) THEN RAISE EXCEPTION '20260504190000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_value_reports_campaign_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504190000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_value_reports_org_campaign_key_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260504190000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_value_reports_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504190000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.campaign_value_reports_user_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504190000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_value_reports'::regclass AND polname='campaign_value_reports_member_select')) THEN RAISE EXCEPTION '20260504190000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.campaign_value_reports'::regclass AND polname='campaign_value_reports_service_role_all')) THEN RAISE EXCEPTION '20260504190000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260504190000$;
