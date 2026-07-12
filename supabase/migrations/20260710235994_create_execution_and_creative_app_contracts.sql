-- dealflow:migration classification=FORWARD_APP-CONTRACT_MIGRATION;_NO_HISTORICAL_BODY_CLAIMED remote_version=20260710235994 remote_name=create_execution_and_creative_app_contracts original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD APP-CONTRACT MIGRATION; NO HISTORICAL BODY CLAIMED; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260710235994_create_execution_and_creative_app_contracts.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- dealflow:statement id=20260710235994.app_contract.001 sha256=d3f191bfa249a1d1b4d3d60f77cb3a5209320704c4cdca2e45d2bf0316fe2f1f

-- These nine relations are derived from active application read/write contracts. They were absent
-- from both the authoritative pre-candidate public capture and the sealed migration chain.
-- availability_slots and booked_slots are intentionally excluded: GHL is the locked calendar and
-- appointment source of truth, and the legacy local booking path fails closed in application code.

DO $dealflow_app_contract_guard$
DECLARE collisions text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO collisions
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY[
      'campaign_executions', 'campaign_execution_ad_sets', 'campaign_execution_ads',
      'campaign_execution_logs', 'creative_asset_logs', 'creative_intelligence',
      'creative_pattern_scores', 'creative_performance_snapshots', 'creative_render_jobs'
    ]::text[]);
  IF cardinality(collisions) > 0 THEN
    RAISE EXCEPTION 'app-contract migration refused partial/colliding relations: %', collisions USING ERRCODE = '55000';
  END IF;
END
$dealflow_app_contract_guard$;

CREATE TABLE public.campaign_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  meta_connection_id uuid,
  meta_ad_account_id uuid,
  execution_status text NOT NULL DEFAULT 'pending',
  launch_mode text NOT NULL DEFAULT 'autopilot',
  objective text,
  destination_url text,
  budget_type text,
  daily_budget numeric,
  lifetime_budget numeric,
  meta_campaign_external_id text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT campaign_executions_campaign_tenant_fk
    FOREIGN KEY (campaign_id, organization_id, user_id)
    REFERENCES public.campaign_plans (id, organization_id, user_id) ON DELETE CASCADE,
  CONSTRAINT campaign_executions_status_check
    CHECK (execution_status IN ('pending','validating','launching','launched','partially_failed','failed','unknown_terminal')),
  CONSTRAINT campaign_executions_budget_check
    CHECK (coalesce(daily_budget, 0) >= 0 AND coalesce(lifetime_budget, 0) >= 0)
);

CREATE TABLE public.campaign_execution_ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_ad_set_external_id text,
  status text NOT NULL DEFAULT 'creating',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.campaign_execution_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  ad_set_execution_id uuid NOT NULL REFERENCES public.campaign_execution_ad_sets(id) ON DELETE CASCADE,
  creative_name text,
  headline text,
  primary_text text,
  cta text,
  destination_url text,
  format text,
  meta_ad_external_id text,
  status text NOT NULL DEFAULT 'creating',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.campaign_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_status text NOT NULL,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.creative_assets
  ADD CONSTRAINT creative_assets_tenant_identity_unique
  UNIQUE (id, campaign_id, user_id);

CREATE TABLE public.creative_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  creative_asset_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  render_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_name text,
  provider_job_id text,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_render_jobs_asset_tenant_fk
    FOREIGN KEY (creative_asset_id, campaign_id, user_id)
    REFERENCES public.creative_assets (id, campaign_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.creative_asset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_status text NOT NULL,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.creative_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  hook text NOT NULL,
  angle text NOT NULL,
  audience text NOT NULL,
  offer text,
  industry text NOT NULL,
  format text NOT NULL,
  notes text,
  performance_tag text NOT NULL DEFAULT 'test',
  result_tag text,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_intelligence_scope_check CHECK (
    (organization_id IS NULL AND user_id IS NULL) OR (organization_id IS NOT NULL AND user_id IS NOT NULL)
  ),
  CONSTRAINT creative_intelligence_performance_tag_check CHECK (performance_tag IN ('high','medium','test')),
  CONSTRAINT creative_intelligence_result_tag_check CHECK (result_tag IS NULL OR result_tag IN ('winner','average','loser'))
);

CREATE TABLE public.creative_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creative_id text NOT NULL,
  campaign_id text NOT NULL,
  angle text NOT NULL,
  hook text NOT NULL,
  headline text NOT NULL,
  cta text NOT NULL,
  spend numeric NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  ctr numeric NOT NULL DEFAULT 0 CHECK (ctr >= 0),
  leads bigint NOT NULL DEFAULT 0 CHECK (leads >= 0),
  cpl numeric CHECK (cpl IS NULL OR cpl >= 0),
  status text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('winner','average','loser','inconclusive')),
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.creative_pattern_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hook text NOT NULL,
  angle text NOT NULL,
  offer text NOT NULL,
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  inconclusive_count integer NOT NULL DEFAULT 0 CHECK (inconclusive_count >= 0),
  last_seen timestamptz,
  confidence_score numeric NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT creative_pattern_scores_identity_unique UNIQUE (organization_id, user_id, hook, angle, offer)
);

CREATE INDEX campaign_executions_campaign_created_idx ON public.campaign_executions(campaign_id, created_at DESC);
CREATE INDEX campaign_executions_user_created_idx ON public.campaign_executions(user_id, created_at DESC);
CREATE INDEX campaign_execution_ad_sets_execution_idx ON public.campaign_execution_ad_sets(execution_id, created_at);
CREATE INDEX campaign_execution_ads_execution_idx ON public.campaign_execution_ads(execution_id, created_at);
CREATE INDEX campaign_execution_logs_execution_idx ON public.campaign_execution_logs(execution_id, created_at);
CREATE INDEX creative_render_jobs_asset_created_idx ON public.creative_render_jobs(creative_asset_id, created_at DESC);
CREATE INDEX creative_asset_logs_asset_created_idx ON public.creative_asset_logs(creative_asset_id, created_at);
CREATE INDEX creative_intelligence_tenant_updated_idx ON public.creative_intelligence(organization_id, user_id, updated_at DESC);
CREATE INDEX creative_performance_tenant_campaign_sync_idx ON public.creative_performance_snapshots(organization_id, user_id, campaign_id, synced_at DESC);
CREATE INDEX creative_pattern_scores_tenant_confidence_idx ON public.creative_pattern_scores(organization_id, user_id, confidence_score DESC);

ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ad_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_ads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_execution_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_render_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_asset_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_intelligence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_performance_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.creative_pattern_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_pattern_scores FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_executions_member_access ON public.campaign_executions FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY campaign_execution_ad_sets_member_access ON public.campaign_execution_ad_sets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY campaign_execution_ads_member_access ON public.campaign_execution_ads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY campaign_execution_logs_member_access ON public.campaign_execution_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.id=execution_id AND e.user_id=auth.uid() AND private.is_current_user_org_member(e.organization_id)));
CREATE POLICY creative_render_jobs_member_access ON public.creative_render_jobs FOR ALL TO authenticated
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY creative_asset_logs_member_access ON public.creative_asset_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.creative_assets a WHERE a.id=creative_asset_id AND a.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.creative_assets a WHERE a.id=creative_asset_id AND a.user_id=auth.uid()));
CREATE POLICY creative_intelligence_member_access ON public.creative_intelligence FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND user_id=auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY creative_intelligence_shared_select ON public.creative_intelligence FOR SELECT TO authenticated
  USING (organization_id IS NULL AND user_id IS NULL);
CREATE POLICY creative_performance_snapshots_member_access ON public.creative_performance_snapshots FOR ALL TO authenticated
  USING (user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id=auth.uid() AND private.is_current_user_org_member(organization_id));
CREATE POLICY creative_pattern_scores_member_access ON public.creative_pattern_scores FOR ALL TO authenticated
  USING (user_id=auth.uid() AND private.is_current_user_org_member(organization_id))
  WITH CHECK (user_id=auth.uid() AND private.is_current_user_org_member(organization_id));

CREATE POLICY campaign_executions_service_role_all ON public.campaign_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_ad_sets_service_role_all ON public.campaign_execution_ad_sets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_ads_service_role_all ON public.campaign_execution_ads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY campaign_execution_logs_service_role_all ON public.campaign_execution_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_render_jobs_service_role_all ON public.creative_render_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_asset_logs_service_role_all ON public.creative_asset_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_intelligence_service_role_all ON public.creative_intelligence FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_performance_snapshots_service_role_all ON public.creative_performance_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY creative_pattern_scores_service_role_all ON public.creative_pattern_scores FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.campaign_executions, public.campaign_execution_ad_sets, public.campaign_execution_ads,
  public.campaign_execution_logs, public.creative_render_jobs, public.creative_asset_logs,
  public.creative_intelligence, public.creative_performance_snapshots, public.creative_pattern_scores FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_executions, public.campaign_execution_ad_sets,
  public.campaign_execution_ads, public.campaign_execution_logs, public.creative_render_jobs,
  public.creative_asset_logs, public.creative_intelligence, public.creative_performance_snapshots,
  public.creative_pattern_scores TO authenticated, service_role;

DO $dealflow_app_contract_postcondition$
DECLARE relation_count integer;
BEGIN
  SELECT count(*) INTO relation_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY (ARRAY[
    'campaign_executions', 'campaign_execution_ad_sets', 'campaign_execution_ads',
    'campaign_execution_logs', 'creative_asset_logs', 'creative_intelligence',
    'creative_pattern_scores', 'creative_performance_snapshots', 'creative_render_jobs'
  ]::text[]);
  IF relation_count <> 9 THEN
    RAISE EXCEPTION 'app-contract postcondition failed: expected 9 relations, found %', relation_count USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.creative_assets'::regclass
      AND conname='creative_assets_tenant_identity_unique'
      AND contype='u'
  ) THEN
    RAISE EXCEPTION 'app-contract postcondition failed: creative asset tenant identity is not unique' USING ERRCODE='55000';
  END IF;
END
$dealflow_app_contract_postcondition$;
