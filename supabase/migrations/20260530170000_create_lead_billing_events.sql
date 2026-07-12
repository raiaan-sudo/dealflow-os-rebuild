-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260530170000 remote_name=create_lead_billing_events original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260530170000_create_lead_billing_events.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260530170000.preconditions.001 sha256=836a2d53cc6d21b8d8e7c847eb1347e34eec0d2a0dd9bbf758cec158369d394b
DO $dealflow_table_guard_lead_billing_events$
DECLARE
  expected_table jsonb := $dealflow_table_guard_lead_billing_events_table${"default_partition_name":null,"default_partition_schema":null,"has_rules":false,"is_partition":false,"owner_name":"postgres","parent_schema":null,"parent_table":null,"partition_bound":null,"partition_key":null,"partition_strategy":null,"persistence":"p","relation_kind":"r","relation_options":null,"replica_identity":"d"}$dealflow_table_guard_lead_billing_events_table$::jsonb;
  expected_columns jsonb := $dealflow_table_guard_lead_billing_events_columns${"id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"gen_random_uuid()","formatted_type":"uuid","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":1,"relation_kind":"r","storage_strategy":"p"},"organization_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":2,"relation_kind":"r","storage_strategy":"p"},"campaign_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":3,"relation_kind":"r","storage_strategy":"p"},"lead_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":4,"relation_kind":"r","storage_strategy":"p"},"stripe_customer_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":5,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":6,"relation_kind":"r","storage_strategy":"x"},"stripe_subscription_item_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":7,"relation_kind":"r","storage_strategy":"x"},"stripe_metered_price_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":8,"relation_kind":"r","storage_strategy":"x"},"amount_cents":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"300","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":9,"relation_kind":"r","storage_strategy":"p"},"meter_event_name":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'dealflow_billable_lead'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":10,"relation_kind":"r","storage_strategy":"x"},"status":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'pending'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":11,"relation_kind":"r","storage_strategy":"x"},"skip_reason":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":12,"relation_kind":"r","storage_strategy":"x"},"stripe_meter_event_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":13,"relation_kind":"r","storage_strategy":"x"},"idempotency_key":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":14,"relation_kind":"r","storage_strategy":"x"},"reported_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":15,"relation_kind":"r","storage_strategy":"p"},"metadata":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'{}'::jsonb","formatted_type":"jsonb","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":16,"relation_kind":"r","storage_strategy":"x"},"created_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":17,"relation_kind":"r","storage_strategy":"p"},"updated_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"timezone('utc'::text, now())","formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":18,"relation_kind":"r","storage_strategy":"p"},"partner_id":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"uuid","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":19,"relation_kind":"r","storage_strategy":"p"},"stripe_payment_intent_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":20,"relation_kind":"r","storage_strategy":"x"},"stripe_charge_id":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":21,"relation_kind":"r","storage_strategy":"x"},"currency":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'usd'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":22,"relation_kind":"r","storage_strategy":"x"},"failure_code":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":23,"relation_kind":"r","storage_strategy":"x"},"failure_message":{"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"text","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":24,"relation_kind":"r","storage_strategy":"x"},"charged_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":25,"relation_kind":"r","storage_strategy":"p"},"attempt_count":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"0","formatted_type":"integer","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":26,"relation_kind":"r","storage_strategy":"p"},"next_retry_at":{"array_dimensions":0,"collation_name":null,"collation_schema":null,"column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":null,"formatted_type":"timestamp with time zone","generated_kind":"","has_default_or_generation":false,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":false,"ordinal_position":27,"relation_kind":"r","storage_strategy":"p"}}$dealflow_table_guard_lead_billing_events_columns$::jsonb;
  required_columns jsonb := $dealflow_table_guard_lead_billing_events_required$["id","organization_id","campaign_id","lead_id","stripe_customer_id","stripe_subscription_id","stripe_subscription_item_id","stripe_metered_price_id","amount_cents","meter_event_name","status","skip_reason","stripe_meter_event_id","idempotency_key","reported_at","metadata","created_at","updated_at","partner_id","stripe_payment_intent_id","stripe_charge_id","currency","failure_code","failure_message","charged_at","attempt_count","next_retry_at"]$dealflow_table_guard_lead_billing_events_required$::jsonb;
  live_column_count integer;
BEGIN
  IF to_regclass('public.lead_billing_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
    WHERE namespace_record.nspname='public'
      AND relation_record.relname='lead_billing_events'
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
    RAISE EXCEPTION 'forward table adoption mismatch: %.%', 'public', 'lead_billing_events' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO live_column_count
  FROM pg_catalog.pg_attribute attribute_record
  WHERE attribute_record.attrelid='public.lead_billing_events'::regclass
    AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped;
  IF EXISTS (
    SELECT 1
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
      WHERE attribute_record.attrelid='public.lead_billing_events'::regclass
        AND attribute_record.attname=required_column.column_name
        AND attribute_record.attnum>0 AND NOT attribute_record.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'forward table-column adoption mismatch: %.%', 'public', 'lead_billing_events' USING ERRCODE='55000';
  END IF;
END
$dealflow_table_guard_lead_billing_events$;

-- dealflow:statement id=20260530170000.preconditions.002 sha256=8396917c485f7bab1192840cc34e22e243cac4592a62299d1a69d90430783a2c
DO $dealflow_index_guard_lead_billing_events_campaign_idx$
BEGIN
  IF to_regclass('public.lead_billing_events_campaign_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_billing_events_campaign_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_billing_events_campaign_idx ON public.lead_billing_events USING btree (campaign_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_billing_events_campaign_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_billing_events_campaign_idx$;

-- dealflow:statement id=20260530170000.preconditions.003 sha256=f45c895e1187aacad26716e4b79652c787e73c2d11be0d2259f3a50daebfce23
DO $dealflow_index_guard_lead_billing_events_org_period_idx$
BEGIN
  IF to_regclass('public.lead_billing_events_org_period_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_billing_events_org_period_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_billing_events_org_period_idx ON public.lead_billing_events USING btree (organization_id, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_billing_events_org_period_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_billing_events_org_period_idx$;

-- dealflow:statement id=20260530170000.preconditions.004 sha256=7333c78bec5804fa7ced371760c313e13bba046e6dd416a4999ac0ea6271538d
DO $dealflow_index_guard_lead_billing_events_payment_intent_idx$
BEGIN
  IF to_regclass('public.lead_billing_events_payment_intent_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_billing_events_payment_intent_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_billing_events_payment_intent_idx ON public.lead_billing_events USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_billing_events_payment_intent_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_billing_events_payment_intent_idx$;

-- dealflow:statement id=20260530170000.preconditions.005 sha256=8d4ed4a04bdfc719a769b007c4fa7d9f2241f6660b43551b1bd48e7334845636
DO $dealflow_index_guard_lead_billing_events_retry_idx$
BEGIN
  IF to_regclass('public.lead_billing_events_retry_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_billing_events_retry_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_billing_events_retry_idx ON public.lead_billing_events USING btree (status, next_retry_at) WHERE ((status = ''failed''::text) AND (next_retry_at IS NOT NULL))'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_billing_events_retry_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_billing_events_retry_idx$;

-- dealflow:statement id=20260530170000.preconditions.006 sha256=af6d2942d58d47765ce68829eb402a1ed60212ea5979554e959ca90d4d7272bf
DO $dealflow_index_guard_lead_billing_events_status_idx$
BEGIN
  IF to_regclass('public.lead_billing_events_status_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class index_record
    JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=index_record.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid=index_record.oid
    WHERE namespace_record.nspname='public'
      AND index_record.relname='lead_billing_events_status_idx'
      AND index_record.relkind='i'
      AND pg_catalog.pg_get_indexdef(index_record.oid)='CREATE INDEX lead_billing_events_status_idx ON public.lead_billing_events USING btree (status, created_at DESC)'
      AND index_state.indisvalid IS TRUE
  ) THEN
    RAISE EXCEPTION 'forward index adoption mismatch: %.%', 'public', 'lead_billing_events_status_idx' USING ERRCODE='55000';
  END IF;
END
$dealflow_index_guard_lead_billing_events_status_idx$;

-- tables
-- dealflow:statement id=20260530170000.tables.001 sha256=f6f636a1c00b438822d05640dbc08ee8060cc0d19c7571e4b2fd3689cc1817ab
CREATE TABLE IF NOT EXISTS "public"."lead_billing_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_subscription_item_id" text,
  "stripe_metered_price_id" text,
  "amount_cents" integer DEFAULT 300 NOT NULL,
  "meter_event_name" text DEFAULT 'dealflow_billable_lead'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "skip_reason" text,
  "stripe_meter_event_id" text,
  "idempotency_key" text NOT NULL,
  "reported_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "partner_id" uuid,
  "stripe_payment_intent_id" text,
  "stripe_charge_id" text,
  "currency" text DEFAULT 'usd'::text NOT NULL,
  "failure_code" text,
  "failure_message" text,
  "charged_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamp with time zone
);

-- constraints
-- dealflow:statement id=20260530170000.constraints.001 sha256=c311c0aad12e75bb5d36012cd8ff5925e8b4b44e6e0a1a12a41cb4fa75990c53
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_idempotency_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_idempotency_unique" UNIQUE (idempotency_key);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (idempotency_key)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_idempotency_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.002 sha256=41f799ab141fd2a7a7d3428c498550e12fa681fa2978b37ceb3dc76c28a8c4d5
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_lead_unique';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_lead_unique" UNIQUE (lead_id);
  ELSIF existing_definition IS DISTINCT FROM 'UNIQUE (lead_id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_lead_unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.003 sha256=998e0d572daa1b671d05888f17d44c639d791f7eaa163bf499524bea1ed36560
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_pkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_pkey" PRIMARY KEY (id);
  ELSIF existing_definition IS DISTINCT FROM 'PRIMARY KEY (id)'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_pkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.004 sha256=4ace5265678d8a0e4654037b3f9ef279221fc9b4adf9fce480fa8a519ccb6906
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_amount_cents_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_amount_cents_check" CHECK ((amount_cents >= 0));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((amount_cents >= 0))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_amount_cents_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.005 sha256=c8f4da69aff3965f354cb5ba74769ddaec7f0fcf7d69ef482223d57718495bd8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_status_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'charging'::text, 'charged'::text, 'reported'::text, 'skipped'::text, 'failed'::text, 'credited'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''pending''::text, ''charging''::text, ''charged''::text, ''reported''::text, ''skipped''::text, ''failed''::text, ''credited''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_status_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.006 sha256=8259c08fc11bf3465fd45b806e81783fc6f7e391eb34d4c66e5d070b4d953f66
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_campaign_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE RESTRICT;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (campaign_id) REFERENCES campaign_plans(id) ON DELETE RESTRICT'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_campaign_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.007 sha256=01ea713200d35a2318f4e2590e5ea959a520469f0ff822960238353b289dbaf9
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_lead_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_lead_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260530170000.constraints.008 sha256=9bb6e2d76154ade8f4610710f9e161fff8382f2d92f9fbcd38cce6de03c7c9f8
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.lead_billing_events'::regclass
    AND constraint_record.conname='lead_billing_events_organization_id_fkey';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."lead_billing_events" ADD CONSTRAINT "lead_billing_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  ELSIF existing_definition IS DISTINCT FROM 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'lead_billing_events', 'lead_billing_events_organization_id_fkey' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- indexes
-- dealflow:statement id=20260530170000.indexes.001 sha256=3a309bb89120092e5ed7d7fa3fc31bf2a4052c99f423195e823e9edd6b0e3832
CREATE INDEX IF NOT EXISTS lead_billing_events_campaign_idx ON public.lead_billing_events USING btree (campaign_id, created_at DESC);

-- dealflow:statement id=20260530170000.indexes.002 sha256=db8292b144191d608f203acbe71229658313a71b3fa58c50333f598cb8c4137f
CREATE INDEX IF NOT EXISTS lead_billing_events_org_period_idx ON public.lead_billing_events USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260530170000.indexes.003 sha256=a1ccd18ad5d3ea11f2efbdbc248217d07bf70b0c429f57f91078ebd020017861
CREATE INDEX IF NOT EXISTS lead_billing_events_payment_intent_idx ON public.lead_billing_events USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);

-- dealflow:statement id=20260530170000.indexes.004 sha256=89a5857a8e97d299da6f24c5696716ab477325510cdecdd42a7271e7eeb64aee
CREATE INDEX IF NOT EXISTS lead_billing_events_retry_idx ON public.lead_billing_events USING btree (status, next_retry_at) WHERE ((status = 'failed'::text) AND (next_retry_at IS NOT NULL));

-- dealflow:statement id=20260530170000.indexes.005 sha256=2d812836a5e9902090500182adf04004cbc1c2bd49904d4d564d101aa0b9b426
CREATE INDEX IF NOT EXISTS lead_billing_events_status_idx ON public.lead_billing_events USING btree (status, created_at DESC);

-- controls
-- dealflow:statement id=20260530170000.controls.001 sha256=84c661e3a707f6145f09018b31d4e1556bec8f97c111d8bf9aebbf14358e6ea5
DROP POLICY IF EXISTS "lead_billing_events_member_select" ON "public"."lead_billing_events";

-- dealflow:statement id=20260530170000.controls.002 sha256=8b2d84022d911ab5258d809aaadaa21806a7f018edfcfb2fcd41b15eda94fba3
CREATE POLICY "lead_billing_events_member_select" ON "public"."lead_billing_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (private.is_current_user_org_member(organization_id));

-- dealflow:statement id=20260530170000.controls.003 sha256=3d92e9aa515db497c7aff8918d64fb9e4142ab6170848b2cacf530b0965ae664
DROP POLICY IF EXISTS "lead_billing_events_service_role_all" ON "public"."lead_billing_events";

-- dealflow:statement id=20260530170000.controls.004 sha256=46090cccb316f25cae29765799bb811b467deae1aa6b5ec78e9c3ea26e604e56
CREATE POLICY "lead_billing_events_service_role_all" ON "public"."lead_billing_events"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- dealflow:statement id=20260530170000.controls.005 sha256=bfe99a53341d21deabe155828c0e03ee55d0c94436043f27d07c3723dcede883
ALTER TABLE "public"."lead_billing_events" ENABLE ROW LEVEL SECURITY;

-- dealflow:statement id=20260530170000.controls.006 sha256=e13d3232eb17f0ce5c39ed7e4cccd5371c24de07be86a8f3c529c8903bb1c593
ALTER TABLE "public"."lead_billing_events" FORCE ROW LEVEL SECURITY;

DO $dealflow_postcondition_20260530170000$
BEGIN
  IF NOT (to_regclass('public.lead_billing_events') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_idempotency_unique')) THEN RAISE EXCEPTION '20260530170000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_lead_unique')) THEN RAISE EXCEPTION '20260530170000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_pkey')) THEN RAISE EXCEPTION '20260530170000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_amount_cents_check')) THEN RAISE EXCEPTION '20260530170000 postcondition 5 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_status_check')) THEN RAISE EXCEPTION '20260530170000 postcondition 6 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_campaign_id_fkey')) THEN RAISE EXCEPTION '20260530170000 postcondition 7 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_lead_id_fkey')) THEN RAISE EXCEPTION '20260530170000 postcondition 8 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.lead_billing_events'::regclass AND conname='lead_billing_events_organization_id_fkey')) THEN RAISE EXCEPTION '20260530170000 postcondition 9 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_billing_events_campaign_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 10 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_billing_events_org_period_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 11 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_billing_events_payment_intent_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 12 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_billing_events_retry_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 13 failed' USING ERRCODE='55000'; END IF;
  IF NOT (to_regclass('public.lead_billing_events_status_idx') IS NOT NULL) THEN RAISE EXCEPTION '20260530170000 postcondition 14 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_billing_events'::regclass AND polname='lead_billing_events_member_select')) THEN RAISE EXCEPTION '20260530170000 postcondition 15 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.lead_billing_events'::regclass AND polname='lead_billing_events_service_role_all')) THEN RAISE EXCEPTION '20260530170000 postcondition 16 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260530170000$;
