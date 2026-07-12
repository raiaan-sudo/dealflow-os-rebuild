-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260519023000 remote_name=create_scale_monitor_incidents original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260519023000_create_scale_monitor_incidents.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260519023000.preconditions.001 sha256=e162d38012b994abac8c465b627c423ddad464b2602e4636266d759b983a47a8
DO $dealflow_table_guard_scale_monitor_incidents$
DECLARE
  expected_table jsonb := $dealflow_table_guard_scale_monitor_incidents_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_scale_monitor_incidents_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_scale_monitor_incidents_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"incident_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"subsystem":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"severity":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'medium'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'open'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"title":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"evidence":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"first_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":8,"relation_kind":"r","storage_strategy":"p"},"last_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"resolved_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"p"},"recurrence_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"1","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"p"},"clean_check_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"p"},"affected_organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"affected_campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"recommended_action":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"x"},"alert_channels":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'[]'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"last_alerted_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"acknowledged_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"acknowledged_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"x"},"resolution_note":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"x"},"synthetic":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"false","formatted_type":"boolean","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":21,"relation_kind":"r","storage_strategy":"p"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":22,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":23,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_scale_monitor_incidents_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_scale_monitor_incidents_required$["id","incident_key","subsystem","severity","status","title","evidence","first_seen_at","last_seen_at","resolved_at","recurrence_count","clean_check_count","affected_organization_id","affected_campaign_id","recommended_action","alert_channels","last_alerted_at","acknowledged_at","acknowledged_by","resolution_note","synthetic","created_at","updated_at"]$dealflow_table_guard_scale_monitor_incidents_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.scale_monitor_incidents') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='scale_monitor_incidents'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'scale_monitor_incidents' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.scale_monitor_incidents'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT attribute_record.*,
             row_number() OVER (ORDER BY attribute_record.attnum)::integer AS dense_ordinal_position
      FROM pg_catalog.pg_attribute attribute_record
      WHERE attribute_record.attrelid='public.scale_monitor_incidents'::regclass
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
      WHERE attribute_record.attrelid='public.scale_monitor_incidents'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'scale_monitor_incidents' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_scale_monitor_incidents$;

-- dealflow:statement id=20260519023000.preconditions.002 sha256=00e70a2bc7f4807ceb444970fd4bcee13c3b190f0cf4b86394d99ca85daa96f1
DO $dealflow_index_guard_scale_monitor_incidents_status_idx$
BEGIN
  IF to_regclass('public.scale_monitor_incidents_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='scale_monitor_incidents_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX scale_monitor_incidents_status_idx ON public.scale_monitor_incidents USING btree (status, severity, last_seen_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'scale_monitor_incidents_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_scale_monitor_incidents_status_idx$;

-- dealflow:statement id=20260519023000.preconditions.003 sha256=d6e5f8239a4e158517e225a38e45e620c7448ab6587253a5aa4bab03583074fe
DO $dealflow_index_guard_scale_monitor_incidents_subsystem_idx$
BEGIN
  IF to_regclass('public.scale_monitor_incidents_subsystem_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='scale_monitor_incidents_subsystem_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX scale_monitor_incidents_subsystem_idx ON public.scale_monitor_incidents USING btree (subsystem, status, last_seen_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'scale_monitor_incidents_subsystem_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_scale_monitor_incidents_subsystem_idx$;

-- tables
-- dealflow:statement id=20260519023000.tables.001 sha256=eae8a0a8f9f764cd55f895b9c8f6d8ec0ca8ea6287369de311342fa2485e90c0
CREATE TABLE IF NOT EXISTS "public"."scale_monitor_incidents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "incident_key" text NOT NULL,
  "subsystem" text NOT NULL,
  "severity" text DEFAULT 'medium'::text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "title" text NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "recurrence_count" integer DEFAULT 1 NOT NULL,
  "clean_check_count" integer DEFAULT 0 NOT NULL,
  "affected_organization_id" uuid,
  "affected_campaign_id" uuid,
  "recommended_action" text NOT NULL,
  "alert_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_alerted_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" text,
  "resolution_note" text,
  "synthetic" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- constraints
-- dealflow:statement id=20260519023000.constraints.001 sha256=fa00cbd18d50a6040def054689c246c5e242028520ba52d1c4f018c43719af78
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_incidents'::regclass
    AND constraint_record.conname='scale_monitor_incidents_incident_key_key';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_incidents" ADD CONSTRAINT "scale_monitor_incidents_incident_key_key" UNIQUE (incident_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (incident_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_incidents', 'scale_monitor_incidents_incident_key_key' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519023000.constraints.002 sha256=d4f8b7b1ec8eba934a4647108f70bb777c8e8bdd534f35dc838ba74bd2f01748
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_incidents'::regclass
    AND constraint_record.conname='scale_monitor_incidents_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_incidents" ADD CONSTRAINT "scale_monitor_incidents_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_incidents', 'scale_monitor_incidents_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519023000.constraints.003 sha256=56b885d4b944ec6efcde70195eba1cc2493dd22bb62f567d319a4b3cc744ae4f
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_incidents'::regclass
    AND constraint_record.conname='scale_monitor_incidents_severity_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_incidents" ADD CONSTRAINT "scale_monitor_incidents_severity_check" CHECK ((severity = ANY (ARRAY['p0'::text, 'p1'::text, 'p2'::text, 'p3'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((severity = ANY (ARRAY[''p0''::text, ''p1''::text, ''p2''::text, ''p3''::text, ''low''::text, ''medium''::text, ''high''::text, ''critical''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_incidents', 'scale_monitor_incidents_severity_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260519023000.constraints.004 sha256=dde06cb63ee242c6a39f327544b77eda4cf4d917b2caa66aa1e07ec82fdc0769
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.scale_monitor_incidents'::regclass
    AND constraint_record.conname='scale_monitor_incidents_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."scale_monitor_incidents" ADD CONSTRAINT "scale_monitor_incidents_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''open''::text, ''acknowledged''::text, ''resolved''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'scale_monitor_incidents', 'scale_monitor_incidents_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260519023000.indexes.001 sha256=7b8e667e96003bda20cec7ba8a31b5d12db57015794beee7f95acd12d176e280
CREATE INDEX IF NOT EXISTS scale_monitor_incidents_status_idx ON public.scale_monitor_incidents USING btree (status, severity, last_seen_at DESC);

-- dealflow:statement id=20260519023000.indexes.002 sha256=fc469bc59be668bd32ea6e0c5d05efd036a58d960478a93dbc0318de76d739cd
CREATE INDEX IF NOT EXISTS scale_monitor_incidents_subsystem_idx ON public.scale_monitor_incidents USING btree (subsystem, status, last_seen_at DESC);

-- controls
-- dealflow:statement id=20260519023000.controls.001 sha256=d073a82cf839819c82eef7da34d1bdbc837b044942895fdeeb6d08c30d23b766
DROP POLICY IF EXISTS "scale_monitor_incidents_service_role_all" ON "public"."scale_monitor_incidents";

-- dealflow:statement id=20260519023000.controls.002 sha256=ef2bd07ec7b6e849431db75e639ca6b8d0acd95e5405e78af21b005717c1c185
CREATE POLICY "scale_monitor_incidents_service_role_all" ON "public"."scale_monitor_incidents"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260519023000.controls.003 sha256=7f91aeaaf45ad15d2d3d08c8eb38f052a6347925a2b5bfdd2981ffafbf5a7923
ALTER TABLE "public"."scale_monitor_incidents" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260519023000.controls.004 sha256=fe4fd0846198b75b9d2a59a5daba95ca33862768b341cb4456fc325d1d94993a
ALTER TABLE "public"."scale_monitor_incidents" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260519023000$
BEGIN
  IF NOT (to_regclass('public.scale_monitor_incidents') IS NOT NULL) THEN RAISE EXCEPTION '20260519023000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_incidents'::regclass AND conname='scale_monitor_incidents_incident_key_key')) THEN RAISE EXCEPTION '20260519023000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_incidents'::regclass AND conname='scale_monitor_incidents_pkey')) THEN RAISE EXCEPTION '20260519023000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_incidents'::regclass AND conname='scale_monitor_incidents_severity_check')) THEN RAISE EXCEPTION '20260519023000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.scale_monitor_incidents'::regclass AND conname='scale_monitor_incidents_status_check')) THEN RAISE EXCEPTION '20260519023000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.scale_monitor_incidents_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519023000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.scale_monitor_incidents_subsystem_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260519023000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.scale_monitor_incidents'::regclass AND polname='scale_monitor_incidents_service_role_all')) THEN RAISE EXCEPTION '20260519023000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260519023000$;
