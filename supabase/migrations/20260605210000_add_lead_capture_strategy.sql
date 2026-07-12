-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260605210000 remote_name=add_lead_capture_strategy original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260605210000_add_lead_capture_strategy.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- preconditions
-- dealflow:statement id=20260605210000.preconditions.001 sha256=47934f1a732a4ba86dec8c3cc6d517158178d8189da5df4637964da7751fa568
DO $dealflow_column_guard_campaign_plans_lead_capture_goal$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_lead_capture_goal_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'quality'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":29,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_lead_capture_goal_expected$::jsonb;
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
  WHERE column_record.attname='lead_capture_goal';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'lead_capture_goal' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_lead_capture_goal$;

-- dealflow:statement id=20260605210000.preconditions.002 sha256=2a8ece7205c75fd444c2733367461fd2e20bf50dc24b34f447adfd3082ae13ee
DO $dealflow_column_guard_campaign_plans_capture_method$
DECLARE
  expected_column jsonb := $dealflow_column_guard_campaign_plans_capture_method_expected${"array_dimensions":0,"collation_name":"default","collation_schema":"pg_catalog","column_acl_present":false,"column_options":null,"compression_method":"","default_or_generation_expression":"'website_funnel'::text","formatted_type":"text","generated_kind":"","has_default_or_generation":true,"identity_kind":"","inheritance_count":0,"locally_defined":true,"not_null":true,"ordinal_position":30,"relation_kind":"r","storage_strategy":"x"}$dealflow_column_guard_campaign_plans_capture_method_expected$::jsonb;
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
  WHERE column_record.attname='capture_method';
  IF actual_column IS NOT NULL AND actual_column IS DISTINCT FROM expected_column THEN
    RAISE EXCEPTION 'forward column adoption mismatch: %.%', 'campaign_plans', 'capture_method' USING ERRCODE='55000';
  END IF;
END
$dealflow_column_guard_campaign_plans_capture_method$;

-- columns
-- dealflow:statement id=20260605210000.columns.001 sha256=d98b9461479e8e103add9e983744bd772668ec8b52d1b98411926cbe4adc424f
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "lead_capture_goal" text DEFAULT 'quality'::text NOT NULL;

-- dealflow:statement id=20260605210000.columns.002 sha256=a12e6ebf436eae3578ebb694ab287cd97a48e1ec66e222cb8ba44587aadbf8f3
ALTER TABLE "public"."campaign_plans" ADD COLUMN IF NOT EXISTS "capture_method" text DEFAULT 'website_funnel'::text NOT NULL;

-- constraints
-- dealflow:statement id=20260605210000.constraints.001 sha256=0c60f600810183b104d83359acb944bed9703fa6b4177235ee4b57cb003f619e
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_capture_method_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_capture_method_check" CHECK ((capture_method = ANY (ARRAY['website_funnel'::text, 'meta_instant_form'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((capture_method = ANY (ARRAY[''website_funnel''::text, ''meta_instant_form''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_capture_method_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

-- dealflow:statement id=20260605210000.constraints.002 sha256=cb905e05dff0e5f4283ad2b97d93a7b66711024c978e26686947f41bce5fa68b
DO $dealflow_constraint_adoption$
DECLARE
  existing_definition text;
  existing_validated boolean;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid, false), constraint_record.convalidated
    INTO existing_definition, existing_validated
  FROM pg_catalog.pg_constraint constraint_record
  WHERE constraint_record.conrelid='public.campaign_plans'::regclass
    AND constraint_record.conname='campaign_plans_lead_capture_goal_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_lead_capture_goal_check" CHECK ((lead_capture_goal = ANY (ARRAY['quality'::text, 'balanced'::text, 'volume'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((lead_capture_goal = ANY (ARRAY[''quality''::text, ''balanced''::text, ''volume''::text])))'
     OR existing_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forward constraint adoption mismatch: %.%', 'campaign_plans', 'campaign_plans_lead_capture_goal_check' USING ERRCODE='55000';
  END IF;
END
$dealflow_constraint_adoption$;

DO $dealflow_postcondition_20260605210000$
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='lead_capture_goal' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260605210000 postcondition 1 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.campaign_plans'::regclass AND attname='capture_method' AND attnum>0 AND NOT attisdropped)) THEN RAISE EXCEPTION '20260605210000 postcondition 2 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_capture_method_check')) THEN RAISE EXCEPTION '20260605210000 postcondition 3 failed' USING ERRCODE='55000'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.campaign_plans'::regclass AND conname='campaign_plans_lead_capture_goal_check')) THEN RAISE EXCEPTION '20260605210000 postcondition 4 failed' USING ERRCODE='55000'; END IF;
END
$dealflow_postcondition_20260605210000$;
