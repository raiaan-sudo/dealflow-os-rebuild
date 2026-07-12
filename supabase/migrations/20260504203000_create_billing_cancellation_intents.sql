-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260504203000 remote_name=create_billing_cancellation_intents original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260504203000_create_billing_cancellation_intents.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260504203000.preconditions.001 sha256=fb3eb18bda4a5b430341ac12b2d38648bf11bcf48f4906ebf5cc32cfd4612cc4
DO $dealflow_table_guard_billing_cancellation_intents$
DECLARE
  expected_table jsonb := $dealflow_table_guard_billing_cancellation_intents_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_billing_cancellation_intents_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_billing_cancellation_intents_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"user_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"stripe_customer_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"plan_tier":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"subscription_status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"billing_state":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"reason_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'not_provided'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"reason_detail":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'settings_portal_entry'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_billing_cancellation_intents_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_billing_cancellation_intents_required$["id","organization_id","user_id","stripe_customer_id","stripe_subscription_id","plan_tier","subscription_status","billing_state","reason_code","reason_detail","source","created_at"]$dealflow_table_guard_billing_cancellation_intents_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.billing_cancellation_intents') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='billing_cancellation_intents'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'billing_cancellation_intents' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.billing_cancellation_intents'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
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
      WHERE attribute_record.attrelid='public.billing_cancellation_intents'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'billing_cancellation_intents' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_billing_cancellation_intents$;

-- dealflow:statement id=20260504203000.preconditions.002 sha256=f2074eac4f4c04e466626659917e51219a0c4570efdfe04776fc20a6d7570a68
DO $dealflow_index_guard_billing_cancellation_intents_org_created_idx$
BEGIN
  IF to_regclass('public.billing_cancellation_intents_org_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='billing_cancellation_intents_org_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX billing_cancellation_intents_org_created_idx ON public.billing_cancellation_intents USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'billing_cancellation_intents_org_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_billing_cancellation_intents_org_created_idx$;

-- dealflow:statement id=20260504203000.preconditions.003 sha256=5fd36e037d675fc81680f1f564aa379e5fbdf5d4aefb0a59c35117c46f140ba3
DO $dealflow_index_guard_billing_cancellation_intents_subscription_created_idx$
BEGIN
  IF to_regclass('public.billing_cancellation_intents_subscription_created_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='billing_cancellation_intents_subscription_created_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX billing_cancellation_intents_subscription_created_idx ON public.billing_cancellation_intents USING btree (stripe_subscription_id, created_at DESC) WHERE (stripe_subscription_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'billing_cancellation_intents_subscription_created_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_billing_cancellation_intents_subscription_created_idx$;

-- dealflow:statement id=20260504203000.preconditions.004 sha256=f7f1e534e52c8598a1248142ae76d02aa5ed196cf127b9ba9a2917515e268d1e
DO $dealflow_index_guard_billing_cancellation_intents_user_idx$
BEGIN
  IF to_regclass('public.billing_cancellation_intents_user_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='billing_cancellation_intents_user_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX billing_cancellation_intents_user_idx ON public.billing_cancellation_intents USING btree (user_id) WHERE (user_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'billing_cancellation_intents_user_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_billing_cancellation_intents_user_idx$;

-- tables
-- dealflow:statement id=20260504203000.tables.001 sha256=8b3b98ab6a10ae47be0fab378e8403dc4475bb17baead4438dee92508aad0378
CREATE TABLE IF NOT EXISTS "public"."billing_cancellation_intents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "plan_tier" text,
  "subscription_status" text,
  "billing_state" text,
  "reason_code" text DEFAULT 'not_provided'::text NOT NULL,
  "reason_detail" text,
  "source" text DEFAULT 'settings_portal_entry'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- constraints
-- dealflow:statement id=20260504203000.constraints.001 sha256=814ce852234d988c4f4780edda4b379a0844901a002e23968c00d97bb1309bd0
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504203000.constraints.002 sha256=52668a0fd84090a15b4a87a78f0c4755f7261d9552a1b229ac68989a4750a436
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_reason_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_reason_check" CHECK ((reason_code = ANY (ARRAY['too_expensive'::text, 'not_enough_leads'::text, 'campaign_paused'::text, 'missing_features'::text, 'switched_provider'::text, 'temporary_pause'::text, 'other'::text, 'not_provided'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((reason_code = ANY (ARRAY[''too_expensive''::text, ''not_enough_leads''::text, ''campaign_paused''::text, ''missing_features''::text, ''switched_provider''::text, ''temporary_pause''::text, ''other''::text, ''not_provided''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_reason_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504203000.constraints.003 sha256=fbdbea20c2707c3463b3d269acb619aa6daeeb48a55e54becadeed770ba816f7
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_source_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_source_not_blank" CHECK ((length(TRIM(BOTH FROM source)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM source)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_source_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504203000.constraints.004 sha256=77e7b1aca66e4b4953140d69d54167e9d4058edb976e90e9db5cf250deec078d
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504203000.constraints.005 sha256=4e5c618599a482bcebe330be2b117d58a6ac32ee0cc6a5b4165d3eb7e9807b4c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.billing_cancellation_intents'::regclass
    AND constraint_record.conname='billing_cancellation_intents_user_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."billing_cancellation_intents" ADD CONSTRAINT "billing_cancellation_intents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'billing_cancellation_intents', 'billing_cancellation_intents_user_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260504203000.indexes.001 sha256=58fc0be38a79dcd7e6d34e591e812bc9e9ecb80dd9242c66437cd7a8023aed83
CREATE INDEX IF NOT EXISTS billing_cancellation_intents_org_created_idx ON public.billing_cancellation_intents USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260504203000.indexes.002 sha256=af4e5d1f19528a3baae44470818f16bf868c120de31b333e79634ff1a43338b0
CREATE INDEX IF NOT EXISTS billing_cancellation_intents_subscription_created_idx ON public.billing_cancellation_intents USING btree (stripe_subscription_id, created_at DESC) WHERE (stripe_subscription_id IS NOT NULL);

-- dealflow:statement id=20260504203000.indexes.003 sha256=1fce6f880387b941c9308bcedda6d7abb0895df74da92d8238ea71863cc46b8d
CREATE INDEX IF NOT EXISTS billing_cancellation_intents_user_idx ON public.billing_cancellation_intents USING btree (user_id) WHERE (user_id IS NOT NULL);

-- controls
-- dealflow:statement id=20260504203000.controls.001 sha256=8110f3056882adbb1b7d6ffb051fd6de50fadd9ba319d5dd2d0947a76a1df8b3
DROP POLICY IF EXISTS "billing_cancellation_intents_member_select" ON "public"."billing_cancellation_intents";

-- dealflow:statement id=20260504203000.controls.002 sha256=65ad28741cc8b89b75467daf6a6af5abf7ad077da7db706cf9a578fdc3e0d22b
CREATE POLICY "billing_cancellation_intents_member_select" ON "public"."billing_cancellation_intents"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260504203000.controls.003 sha256=dac087aa0394c16e384de0f2ba5796f275261c43c2714c0a8088c44a9a1bc0c7
DROP POLICY IF EXISTS "billing_cancellation_intents_service_role_all" ON "public"."billing_cancellation_intents";

-- dealflow:statement id=20260504203000.controls.004 sha256=7bcc81e1f8fb7a747217707a09644329f9036c96684e8a8900fbb06ae7c4464c
CREATE POLICY "billing_cancellation_intents_service_role_all" ON "public"."billing_cancellation_intents"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260504203000.controls.005 sha256=a9142fca8a66e623619f036d68d8589901165e26cd9f51fe387637897063a33e
ALTER TABLE "public"."billing_cancellation_intents" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260504203000.controls.006 sha256=5cbe138a738fce8cbd98319058ffdfdcc18e19d7d87ed02a5dc5db0c74aa22f3
ALTER TABLE "public"."billing_cancellation_intents" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260504203000$
BEGIN
  IF NOT (to_regclass('public.billing_cancellation_intents') IS NOT NULL) THEN RAISE EXCEPTION '20260504203000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_pkey')) THEN RAISE EXCEPTION '20260504203000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_reason_check')) THEN RAISE EXCEPTION '20260504203000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_source_not_blank')) THEN RAISE EXCEPTION '20260504203000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_organization_id_fkey')) THEN RAISE EXCEPTION '20260504203000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.billing_cancellation_intents'::regclass AND conname='billing_cancellation_intents_user_id_fkey')) THEN RAISE EXCEPTION '20260504203000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.billing_cancellation_intents_org_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504203000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.billing_cancellation_intents_subscription_created_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504203000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.billing_cancellation_intents_user_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504203000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.billing_cancellation_intents'::regclass AND polname='billing_cancellation_intents_member_select')) THEN RAISE EXCEPTION '20260504203000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.billing_cancellation_intents'::regclass AND polname='billing_cancellation_intents_service_role_all')) THEN RAISE EXCEPTION '20260504203000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260504203000$;
