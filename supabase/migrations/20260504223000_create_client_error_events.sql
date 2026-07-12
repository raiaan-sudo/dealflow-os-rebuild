-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260504223000 remote_name=create_client_error_events original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260504223000_create_client_error_events.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260504223000.preconditions.001 sha256=c38dee7b898bf951ac9eb580228705c68e4c37342a27cc74f3e67276f18bff23
DO $dealflow_table_guard_client_error_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_client_error_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_client_error_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_client_error_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"event_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"x"},"route_path":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'/'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"x"},"source":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'browser'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"x"},"severity":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'medium'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"error_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"stack":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"component_stack":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":9,"relation_kind":"r","storage_strategy":"x"},"browser":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"viewport":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"occurrence_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"1","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":13,"relation_kind":"r","storage_strategy":"p"},"first_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"p"},"last_seen_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"reviewed_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":16,"relation_kind":"r","storage_strategy":"p"},"reviewed_by":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":17,"relation_kind":"r","storage_strategy":"x"},"resolution_note":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":18,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"now()","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":20,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":21,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_client_error_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_client_error_events_required$["id","event_key","route_path","source","severity","error_name","message","stack","component_stack","browser","viewport","metadata","occurrence_count","first_seen_at","last_seen_at","reviewed_at","reviewed_by","resolution_note","created_at","updated_at"]$dealflow_table_guard_client_error_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.client_error_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='client_error_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'client_error_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.client_error_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
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
      WHERE attribute_record.attrelid='public.client_error_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'client_error_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_client_error_events$;

-- dealflow:statement id=20260504223000.preconditions.002 sha256=e94be7d7ba1c9be836891858a9025ccf2494e1b0f4d23b63125b7ccb258f28fc
DO $dealflow_index_guard_client_error_events_event_key_unique$
BEGIN
  IF to_regclass('public.client_error_events_event_key_unique') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='client_error_events_event_key_unique'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE UNIQUE INDEX client_error_events_event_key_unique ON public.client_error_events USING btree (event_key)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'client_error_events_event_key_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_client_error_events_event_key_unique$;

-- dealflow:statement id=20260504223000.preconditions.003 sha256=0e0e04924c99c1db61c019affa308d4841c69ddfeabcc901cced5bd1251b6669
DO $dealflow_index_guard_client_error_events_last_seen_idx$
BEGIN
  IF to_regclass('public.client_error_events_last_seen_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='client_error_events_last_seen_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX client_error_events_last_seen_idx ON public.client_error_events USING btree (last_seen_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'client_error_events_last_seen_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_client_error_events_last_seen_idx$;

-- dealflow:statement id=20260504223000.preconditions.004 sha256=3d7ff6eb7e413ad2c642bc745b9b7311f9f5c9076ec13c78ff7f84b0d5b3ca20
DO $dealflow_index_guard_client_error_events_unreviewed_idx$
BEGIN
  IF to_regclass('public.client_error_events_unreviewed_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='client_error_events_unreviewed_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX client_error_events_unreviewed_idx ON public.client_error_events USING btree (last_seen_at DESC) WHERE (reviewed_at IS NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'client_error_events_unreviewed_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_client_error_events_unreviewed_idx$;

-- tables
-- dealflow:statement id=20260504223000.tables.001 sha256=6510e728f959998a7d3a993445de0b8f6dd3d2309395004859b77d14a65d55fe
CREATE TABLE IF NOT EXISTS "public"."client_error_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_key" text NOT NULL,
  "route_path" text DEFAULT '/'::text NOT NULL,
  "source" text DEFAULT 'browser'::text NOT NULL,
  "severity" text DEFAULT 'medium'::text NOT NULL,
  "error_name" text,
  "message" text NOT NULL,
  "stack" text,
  "component_stack" text,
  "browser" text,
  "viewport" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurrence_count" integer DEFAULT 1 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" text,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- constraints
-- dealflow:statement id=20260504223000.constraints.001 sha256=a16c2697e9e19dd9c43ad11b6f05a2a792b6b7597b43de1dacb343865fa872ce
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.002 sha256=a5331df90cf28c2a97fe39d686ee5bc293dc59abcf1b1778e73688f5221a4bae
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_event_key_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_event_key_not_blank" CHECK ((length(TRIM(BOTH FROM event_key)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM event_key)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_event_key_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.003 sha256=b7fb7696f01091255a4dc6ae2780a7d2161da4d5c635ca98d9289ee969dd168c
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_message_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_message_not_blank" CHECK ((length(TRIM(BOTH FROM message)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM message)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_message_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.004 sha256=8c9c7d12b9eae5196bac025ec74d44a45f63699e5d7be9d01de9e68a943ad44b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_occurrence_positive';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_occurrence_positive" CHECK ((occurrence_count > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((occurrence_count > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_occurrence_positive' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.005 sha256=b49a7763e50a114e112e4560b0d120f076b283048208c7e89e73efaac68f8911
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_route_path_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_route_path_not_blank" CHECK ((length(TRIM(BOTH FROM route_path)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM route_path)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_route_path_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.006 sha256=d5bae8e2ece7aa8d67fb3af09ba9863a5d50c0d1644dcb4ff968ecddb0df6ee9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_severity_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_severity_check" CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((severity = ANY (ARRAY[''critical''::text, ''high''::text, ''medium''::text, ''low''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_severity_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260504223000.constraints.007 sha256=8630d5167b96895a9873f210b0e0b9c0e86d43d319b8ba4271dfc2bd2bf87594
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.client_error_events'::regclass
    AND constraint_record.conname='client_error_events_source_not_blank';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."client_error_events" ADD CONSTRAINT "client_error_events_source_not_blank" CHECK ((length(TRIM(BOTH FROM source)) > 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((length(TRIM(BOTH FROM source)) > 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'client_error_events', 'client_error_events_source_not_blank' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260504223000.indexes.001 sha256=ada5bb3208bf2dfddbff9aac8522468c3ea30d661ea2c85f092770f0cb4922d4
CREATE UNIQUE INDEX IF NOT EXISTS client_error_events_event_key_unique ON public.client_error_events USING btree (event_key);

-- dealflow:statement id=20260504223000.indexes.002 sha256=e5ee8492156599368a66751b6bdfecb894751f57abac4b14cc6b4582b55f541e
CREATE INDEX IF NOT EXISTS client_error_events_last_seen_idx ON public.client_error_events USING btree (last_seen_at DESC);

-- dealflow:statement id=20260504223000.indexes.003 sha256=92d371fc79ed25d176a6868f531d8325c8da6d7ab8e0bd5dea7ab626d973f37d
CREATE INDEX IF NOT EXISTS client_error_events_unreviewed_idx ON public.client_error_events USING btree (last_seen_at DESC) WHERE (reviewed_at IS NULL);

-- controls
-- dealflow:statement id=20260504223000.controls.001 sha256=1a72d56c575d5dac2adcf7e775162256f2bc56dd4826f609b6c1d4dab0a51174
DROP POLICY IF EXISTS "client_error_events_service_role_all" ON "public"."client_error_events";

-- dealflow:statement id=20260504223000.controls.002 sha256=02133b55450b908f5eb2c23b3c0347d2eee02155aac0a7e2b0b6d05346fa3a7a
CREATE POLICY "client_error_events_service_role_all" ON "public"."client_error_events"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260504223000.controls.003 sha256=8a9ae0fabf804516ec89896f5490edd37278c892e67157d3e9b616d2dab5f85c
ALTER TABLE "public"."client_error_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260504223000.controls.004 sha256=165f4b1c950a5aa70c3b639d6d5c994cecc7554fffcbdc60290aadcfae11760e
ALTER TABLE "public"."client_error_events" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260504223000$
BEGIN
  IF NOT (to_regclass('public.client_error_events') IS NOT NULL) THEN RAISE EXCEPTION '20260504223000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_pkey')) THEN RAISE EXCEPTION '20260504223000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_event_key_not_blank')) THEN RAISE EXCEPTION '20260504223000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_message_not_blank')) THEN RAISE EXCEPTION '20260504223000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_occurrence_positive')) THEN RAISE EXCEPTION '20260504223000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_route_path_not_blank')) THEN RAISE EXCEPTION '20260504223000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_severity_check')) THEN RAISE EXCEPTION '20260504223000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.client_error_events'::regclass AND conname='client_error_events_source_not_blank')) THEN RAISE EXCEPTION '20260504223000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.client_error_events_event_key_unique') IS NOT NULL) THEN RAISE EXCEPTION '20260504223000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.client_error_events_last_seen_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504223000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.client_error_events_unreviewed_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260504223000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.client_error_events'::regclass AND polname='client_error_events_service_role_all')) THEN RAISE EXCEPTION '20260504223000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260504223000$;
