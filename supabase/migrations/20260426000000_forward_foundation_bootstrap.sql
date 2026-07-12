-- dealflow:migration classification=FRESH-ONLY_MINIMAL_FORWARD_FOUNDATION remote_version=20260426000000 remote_name=forward_foundation_bootstrap original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FRESH-ONLY MINIMAL FORWARD FOUNDATION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260426000000_forward_foundation_bootstrap.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- Exactly eight pre-boundary dependency tables. This is not the rejected 41-table May-2 dump.
-- Authority-proven public legacy membership and updated-at helpers are included because later policies/triggers depend on them.
-- private.is_current_user_org_member and public.partners are intentionally absent here.
-- Existing/current databases require the separate read-only adoption gate and must not execute this fresh-only DDL.
-- dealflow:statement id=20260426000000.foundation.guard sha256=008277172f2a2a264800b52294453d0d966150a300ea7cb12abfbb731c2ad2fb
DO $dealflow_foundation_guard$
DECLARE collisions text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO collisions
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    AND c.relname = ANY (ARRAY['campaign_plans', 'creative_assets', 'leads', 'marketing_accounts', 'organization_memberships', 'organizations', 'service_types', 'users']::text[]);
  IF cardinality(collisions) > 0 THEN
    RAISE EXCEPTION 'DealFlow fresh foundation refused nonblank/partial application schema: %', collisions USING ERRCODE='55000';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'DealFlow fresh foundation requires Supabase auth.users' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('private.is_current_user_org_member(uuid)') IS NOT NULL OR to_regclass('public.partners') IS NOT NULL THEN
    RAISE EXCEPTION 'DealFlow fresh foundation chronology collision' USING ERRCODE='55000';
  END IF;
END
$dealflow_foundation_guard$;

-- dealflow:statement id=20260426000000.foundation.table.campaign_plans sha256=833b8a3ace99f270bcc5fc09e6166f241755d4b1d0cb47b607d5fefdcb786809
CREATE TABLE "public"."campaign_plans" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text,
  "plan" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "ads" jsonb,
  "business_name" text,
  "funnel" jsonb,
  "targeting" jsonb,
  "offer" jsonb,
  "creatives" jsonb,
  "expected_outcomes" jsonb,
  "strategy" jsonb,
  "status" text,
  "client_name" text,
  "industry" text,
  "location" text,
  "budget" text,
  "user_id" text,
  "publish_state" text DEFAULT 'draft'::text NOT NULL,
  "public_slug" text,
  "staged_snapshot" jsonb,
  "staged_at" timestamp with time zone,
  "published_snapshot" jsonb,
  "published_at" timestamp with time zone,
  "launch_status" text,
  "lead_loop_verified" boolean DEFAULT false,
  "organization_id" uuid
);

-- dealflow:statement id=20260426000000.foundation.table.creative_assets sha256=dea174f4106807db03725b41c5049d2809f1b084af160f12db1517702ffd1fc0
CREATE TABLE "public"."creative_assets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "campaign_id" uuid,
  "creative_id" text,
  "copy_id" text,
  "asset_type" text,
  "format" text,
  "generation_method" text,
  "status" text,
  "provider_name" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "file_url" text,
  "provider_asset_id" text,
  "thumbnail_url" text,
  "type" text
);

-- dealflow:statement id=20260426000000.foundation.table.leads sha256=17284bc351f68a25b530bc2c632ca4c113f6834991ca5f61f3b43f70415006d8
CREATE TABLE "public"."leads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "service_type_id" uuid,
  "assigned_user_id" uuid,
  "marketing_account_id" uuid,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "status" text DEFAULT 'new'::text NOT NULL,
  "estimated_value" numeric(12,2) DEFAULT 0 NOT NULL,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "campaign_id" uuid,
  "name" text,
  "user_id" uuid,
  "dedupe_hash" text,
  "consent_metadata" jsonb,
  "sms_opted_out_at" timestamp with time zone,
  "tenant_id" uuid,
  "phone_raw" text,
  "phone_e164" text,
  "campaign_name" text,
  "lead_type" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "ad_id" text,
  "landing_page_url" text
);

-- dealflow:statement id=20260426000000.foundation.table.marketing_accounts sha256=bf0dae0cc5e68d422c914b8c908c1a3c6ed094f77f36883b23e16e62042e915b
CREATE TABLE "public"."marketing_accounts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "platform" text NOT NULL,
  "status" text DEFAULT 'connected'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "account_name" text,
  "external_account_id" text,
  "pixel_id" text,
  "access_token_encrypted" text,
  "connected_at" timestamp with time zone,
  "last_sync_at" timestamp with time zone,
  "token_last_synced_at" timestamp with time zone,
  "connection_metadata" jsonb,
  "launch_domain" text,
  "verification_token" text,
  "domain_verified" boolean DEFAULT false NOT NULL,
  "tracking_status" text DEFAULT 'not_configured'::text NOT NULL,
  "tracking_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tracking_last_checked_at" timestamp with time zone
);

-- dealflow:statement id=20260426000000.foundation.table.organization_memberships sha256=4194a46cb4603d8546a65c1132c35d5abeda5daf532b1e82ccd8c469fd3af12b
CREATE TABLE "public"."organization_memberships" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260426000000.foundation.table.organizations sha256=47e8b8eb5b3ccd735cbc2badf89298cde942e7644adc1e5444cbdf71c7ac6893
CREATE TABLE "public"."organizations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "plan_tier" text DEFAULT 'pro'::text NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260426000000.foundation.table.service_types sha256=8eb6e79ad19855c2f03851d10ee7b638529d1634231324ceb08dd5018308c2d0
CREATE TABLE "public"."service_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT 'core'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260426000000.foundation.table.users sha256=d7243e47015ba135d33a8da40b089c4fd305ce7be875ef3ce72cc7d71803cd39
CREATE TABLE "public"."users" (
  "id" uuid NOT NULL,
  "email" text NOT NULL,
  "full_name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- dealflow:statement id=20260426000000.foundation.constraint.campaign_plans.campaign_plans_pkey sha256=35f3295404697ae8d2604a5d7ad9ea3aa8c1848c1480f3c7aa1e57d937d58c30
ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.creative_assets.creative_assets_pkey sha256=895d539461884919a9c7e62e43fbe4f78a5faafb09a9586afa96dbefd70386a5
ALTER TABLE "public"."creative_assets" ADD CONSTRAINT "creative_assets_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.leads.leads_pkey sha256=305ccba144d206fcd98da1675a91de7e2c00fa22c48e562a1785510a3df43eff
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.marketing_accounts.marketing_accounts_pkey sha256=5dd827883d4d0b3bc7413d68382f2b37c09c00d7ca763a55f0f4391d1f1846fc
ALTER TABLE "public"."marketing_accounts" ADD CONSTRAINT "marketing_accounts_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.organization_memberships.organization_memberships_organization_id_user_id_key sha256=134abd53ba5582e2cdeea978bd272bb1a55e77bdca7e048312002d5fa952654f
ALTER TABLE "public"."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE (organization_id, user_id);

-- dealflow:statement id=20260426000000.foundation.constraint.organization_memberships.organization_memberships_pkey sha256=e8d5f3dff40a0343354cbcb811b52c9aee438394d65c3fc28f55e4232187d316
ALTER TABLE "public"."organization_memberships" ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.organizations.organizations_pkey sha256=c17de30e88da8eaf0158ae9792c65a07a0871633f69c3f16c7cb1898700f74e2
ALTER TABLE "public"."organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.organizations.organizations_slug_key sha256=39cc529c92be69f109d092222511b9a67a0ecdc5ee0a4370e8351407180afda5
ALTER TABLE "public"."organizations" ADD CONSTRAINT "organizations_slug_key" UNIQUE (slug);

-- dealflow:statement id=20260426000000.foundation.constraint.service_types.service_types_organization_id_name_key sha256=ce162767c2cdb55f070310052d44bd5622b3afaac66ead78f5dd272b3a5a6b8d
ALTER TABLE "public"."service_types" ADD CONSTRAINT "service_types_organization_id_name_key" UNIQUE (organization_id, name);

-- dealflow:statement id=20260426000000.foundation.constraint.service_types.service_types_pkey sha256=566a82e9b14358d66f3b95161ce6d52e342d1fcbef0c72738fee909b9f194cb1
ALTER TABLE "public"."service_types" ADD CONSTRAINT "service_types_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.users.users_email_key sha256=a3e52fe55a0c8569eb3ae4e4ee49d9917e945c059a45df520db873f47974f8cc
ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

-- dealflow:statement id=20260426000000.foundation.constraint.users.users_pkey sha256=4addb0738c3d496122fe7b4b2e1e0cad188d1f63afdad48f71dcc4d5ee464dea
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

-- dealflow:statement id=20260426000000.foundation.constraint.campaign_plans.campaign_plans_publish_state_check sha256=2440a92bd02ef48ae64d4eef367d4a69a351c6e5a6da40ee0276f399d3916924
ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_publish_state_check" CHECK ((publish_state = ANY (ARRAY['draft'::text, 'staged'::text, 'published'::text])));

-- dealflow:statement id=20260426000000.foundation.constraint.campaign_plans.campaign_plans_organization_id_fkey sha256=f6fc7d3f624c68636ae1de759e30cfe3eaa69b0aecd6609db822636604e47881
ALTER TABLE "public"."campaign_plans" ADD CONSTRAINT "campaign_plans_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- dealflow:statement id=20260426000000.foundation.constraint.leads.leads_assigned_user_id_fkey sha256=32585ca1026dfb8db8c5f83211dbd80ac51b9e39c79f827971133ec33ecf83ae
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- dealflow:statement id=20260426000000.foundation.constraint.leads.leads_marketing_account_id_fkey sha256=2b9ea12fae3c600d2db58267ccfa3286a64633d0184dbf3ff467afc3baa76a84
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_marketing_account_id_fkey" FOREIGN KEY (marketing_account_id) REFERENCES marketing_accounts(id) ON DELETE SET NULL;

-- dealflow:statement id=20260426000000.foundation.constraint.leads.leads_organization_id_fkey sha256=20df731ded7417c55157d947c7668402047d7f714d0b3f69bb2ed3068b7447fe
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.leads.leads_service_type_id_fkey sha256=34d80b2ef8f64319ec088c8fe8189a1b42a6844cbcaffe8b5c7845dfa55370f8
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_service_type_id_fkey" FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL;

-- dealflow:statement id=20260426000000.foundation.constraint.marketing_accounts.marketing_accounts_organization_id_fkey sha256=6bf77738aa6060c5019f217ee0319c07263daf7e96d82ff398f36b91d6491e9b
ALTER TABLE "public"."marketing_accounts" ADD CONSTRAINT "marketing_accounts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.organization_memberships.organization_memberships_organization_id_fkey sha256=b80ae56700bb51d8487fdd08bd1c71e178fb69b1c444fa4bf6c07f312e385da3
ALTER TABLE "public"."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.organization_memberships.organization_memberships_user_id_fkey sha256=717477f31344e3e31d44a0830feff884677bb47f61ebe7096349334c1e8a614b
ALTER TABLE "public"."organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.organizations.organizations_owner_user_id_fkey sha256=d56c9efa3eb1d5e164fc6c94a439e6daaf8e2230e6738844b0afdc91f9299d1d
ALTER TABLE "public"."organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.service_types.service_types_organization_id_fkey sha256=bf01894e1610cfa28ee43d016f59276dd20399f46146dd41db8078baa8803e72
ALTER TABLE "public"."service_types" ADD CONSTRAINT "service_types_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.constraint.users.users_id_fkey sha256=705123015585701efd515bf4f2b1c389c310e48ee5f3aec6eea6ba41f871e260
ALTER TABLE "public"."users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- dealflow:statement id=20260426000000.foundation.index.campaign_plans_organization_idx sha256=fffc8c093b0fd56168bd92da880c876bb2713ff0c0581454a615d6cf9ed481f6
CREATE INDEX campaign_plans_organization_idx ON public.campaign_plans USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260426000000.foundation.index.campaign_plans_public_slug_idx sha256=e70d7325e26bb621aa657afaadf3b88cfe19f88e704cb76b04279ea94e24a652
CREATE UNIQUE INDEX campaign_plans_public_slug_idx ON public.campaign_plans USING btree (public_slug) WHERE (public_slug IS NOT NULL);

-- dealflow:statement id=20260426000000.foundation.index.campaign_plans_publish_state_idx sha256=8c64662facc09845a93cf084c7f475e6f6bebd161b613545644070feafd99e92
CREATE INDEX campaign_plans_publish_state_idx ON public.campaign_plans USING btree (publish_state);

-- dealflow:statement id=20260426000000.foundation.index.campaign_plans_published_public_slug_unique_idx sha256=ae211c988ce63b1338bf389d75a0a7b9ce2faa109c74c3636da2cf0a494c03c6
CREATE UNIQUE INDEX campaign_plans_published_public_slug_unique_idx ON public.campaign_plans USING btree (public_slug) WHERE ((public_slug IS NOT NULL) AND (publish_state = 'published'::text));

-- dealflow:statement id=20260426000000.foundation.index.campaign_plans_user_id_unique sha256=6bc829f4889eb876ee9147bd820689080150dd65e9a992b09cc40e74f45c3e57
CREATE UNIQUE INDEX campaign_plans_user_id_unique ON public.campaign_plans USING btree (user_id);

-- dealflow:statement id=20260426000000.foundation.index.idx_creative_assets_provider_asset_id sha256=14ef96e2e52fd054f51e19e32700f6b94959cea18186295c5ff00f7548423365
CREATE INDEX idx_creative_assets_provider_asset_id ON public.creative_assets USING btree (provider_asset_id);

-- dealflow:statement id=20260426000000.foundation.index.idx_leads_org_created sha256=1d48521a2f2ec62e046ff1a4e61b8bff7fd36af283e532d872c5496233f0dcc2
CREATE INDEX idx_leads_org_created ON public.leads USING btree (organization_id, created_at DESC);

-- dealflow:statement id=20260426000000.foundation.index.idx_leads_org_status sha256=3db655b220b5b95b35d14cc3a2e023643daa525cd46a02114d4e14b85ccc3bbf
CREATE INDEX idx_leads_org_status ON public.leads USING btree (organization_id, status);

-- dealflow:statement id=20260426000000.foundation.index.idx_marketing_accounts_org sha256=a77844f9cf570c1a8d77bd51695b8207351e92eb3a9bc80bae9ae7b40441c9c8
CREATE INDEX idx_marketing_accounts_org ON public.marketing_accounts USING btree (organization_id);

-- dealflow:statement id=20260426000000.foundation.index.idx_org_memberships_user sha256=4a261a936c08361cbd6affe21f212e0a564ce07080268d83e1c7ca236bf281fe
CREATE INDEX idx_org_memberships_user ON public.organization_memberships USING btree (user_id);

-- dealflow:statement id=20260426000000.foundation.index.idx_service_types_org sha256=2aaf5fa65b2205f54e743948a8e6a84688b525c4fc3a68e310c0c5fd8bad395a
CREATE INDEX idx_service_types_org ON public.service_types USING btree (organization_id);

-- dealflow:statement id=20260426000000.foundation.index.leads_ad_id_idx sha256=377838c8b02e84ba109512ec77eee70eaf59299964e2f8fe50e71b287022d569
CREATE INDEX leads_ad_id_idx ON public.leads USING btree (ad_id);

-- dealflow:statement id=20260426000000.foundation.index.leads_campaign_contact_idx sha256=2658f60d8d47ed79cd8e427d5e8486dfb242f3d1ad21e747b54304d5fc00a58c
CREATE INDEX leads_campaign_contact_idx ON public.leads USING btree (organization_id, campaign_id, email, phone);

-- dealflow:statement id=20260426000000.foundation.index.leads_dedupe_hash_unique sha256=fbe517d0b8bd36880a8a075fc8c5f0db8667e806b644cf14c68d7fcbd1d4449d
CREATE UNIQUE INDEX leads_dedupe_hash_unique ON public.leads USING btree (dedupe_hash) WHERE (dedupe_hash IS NOT NULL);

-- dealflow:statement id=20260426000000.foundation.index.leads_phone_e164_idx sha256=10417bc94b833ed14f9d4cfb83f8d1280f3c35398f7fbbd9161dc232ac6669f9
CREATE INDEX leads_phone_e164_idx ON public.leads USING btree (phone_e164);

-- dealflow:statement id=20260426000000.foundation.index.leads_tenant_id_idx sha256=78c4bda7eec78c8db7f075a9084d81603bd3b2cbd86fd4067c30e86225fef9fc
CREATE INDEX leads_tenant_id_idx ON public.leads USING btree (tenant_id);

-- dealflow:statement id=20260426000000.foundation.index.marketing_accounts_platform_org_idx sha256=bf8b32054ad84005f33f7bfbc0b7241f1f64703866a55c03a75c970256ef409f
CREATE INDEX marketing_accounts_platform_org_idx ON public.marketing_accounts USING btree (platform, organization_id);

-- dealflow:statement id=20260426000000.foundation.routine.public.is_org_member sha256=afee94307083d179a617eed494795312a39102d960d5aa391d7bac3d533c59b5
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = org_id
      and membership.user_id = auth.uid()
  );
$function$;

-- dealflow:statement id=20260426000000.foundation.routine.public.set_updated_at sha256=5f988154871510889cf9a8cded36d539fd8ec2c7ac7876e1622f9d2c7176e4eb
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

-- dealflow:statement id=20260426000000.foundation.routine_grant.public.is_org_member.revoke sha256=48c635009f8d238ec12890b8aa4a4fe6da1bd117b2087879503c50eed88b0568
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon, authenticated;

-- dealflow:statement id=20260426000000.foundation.routine_grant.public.is_org_member.service_role sha256=a50e0898225cdef0537c8038992e4a70f2fc927d3b336a4e156e04989ef9988c
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO service_role;

-- dealflow:statement id=20260426000000.foundation.trigger.set_leads_updated_at sha256=4914d568ba49ff3d32ba9b5aa4494166f6234dd98cd47a6b6aae8dc4fc3b7136
CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.trigger.set_marketing_accounts_updated_at sha256=3e49609e2ede488d197f5c62e13ab8caafadad549d5eabf29cafe2d747f4e468
CREATE TRIGGER set_marketing_accounts_updated_at BEFORE UPDATE ON public.marketing_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.trigger.set_memberships_updated_at sha256=0f9e26a569a429c43c3c004dfb9e51480e5d68099f80b546734593fe6f6ece85
CREATE TRIGGER set_memberships_updated_at BEFORE UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.trigger.set_organizations_updated_at sha256=8f3ace3aaaa97e22954b10e866ff9ffb1937383f841afbcb71910f0c4cf73187
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.trigger.set_service_types_updated_at sha256=5f99c19dd1710e7d09bcb3548e39c37144279b3883530480be608eeaf575566f
CREATE TRIGGER set_service_types_updated_at BEFORE UPDATE ON public.service_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.trigger.set_users_updated_at sha256=508bbe28d6ae56292d104c5f550dde9b9e7468e0394f2355faf133846d32cd76
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dealflow:statement id=20260426000000.foundation.rls.campaign_plans.enable sha256=0b8ba75d34e21e38641faa2ba677ec1474b23ca5eb1f5c090902f53e9cff0954
ALTER TABLE "public"."campaign_plans" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.campaign_plans.force sha256=3ee4da39464213188aed65d8398437eec99be2a9c49b4c0cd3b148bfa87c6a82
ALTER TABLE "public"."campaign_plans" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.creative_assets.enable sha256=636fb97a393c1df9cc10fdbeefa979e8025c00ea85bc98e984ddbbce810c0306
ALTER TABLE "public"."creative_assets" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.creative_assets.force sha256=35a8438d5b102afd64cb06a97b8b0862c2e1993fca0db61395cf6c13e06b7271
ALTER TABLE "public"."creative_assets" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.leads.enable sha256=5516a3f924a223d1cfe13b2d5dc48a78f221f07895fe36aeae52ea33964c9412
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.leads.force sha256=c5bd09cb76f8f9bdc7eb2a45f8de6fe173e0b079afa6100ef2f14cd6a6a9b8bd
ALTER TABLE "public"."leads" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.marketing_accounts.enable sha256=80d6e2e97fa76c29b5ba7198d681c96e3bf961b6a23bd7adf19319b099b75b81
ALTER TABLE "public"."marketing_accounts" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.marketing_accounts.force sha256=a86c156356304220bb81f7cf71317a4b01c6dfaf7fec0c739f051ea20a05e0c2
ALTER TABLE "public"."marketing_accounts" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.organization_memberships.enable sha256=5a1db4f465602f1b069469c703e5da909d2c7af56d747c1bcc2c12fe53641da3
ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.organization_memberships.force sha256=7b89faa050ca272e26540c16320bb9e0da016148a8c1b97d517dcb26ac1cafdb
ALTER TABLE "public"."organization_memberships" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.organizations.enable sha256=a958f4ef980136eec0e811f1ffdb35409d0e5a9acb80c0e29536da162037d482
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.organizations.force sha256=239f3a35565198fb7c0071fa3b5be521dffb5016335bd99f836290e24ec18b4a
ALTER TABLE "public"."organizations" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.service_types.enable sha256=e86d38964f9e9e94714850506cb2727cd1e068aa0512452d8b9f75afd36959ed
ALTER TABLE "public"."service_types" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.service_types.force sha256=d943aef9413a240bb4b7c586144151220475a3bd9c325e3f4b12f62b045f6530
ALTER TABLE "public"."service_types" FORCE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.users.enable sha256=3af2b7dbc357cbda9c4bb2b19436df884e16471817c4a2339d5bc0f3a92dff54
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
-- dealflow:statement id=20260426000000.foundation.rls.users.force sha256=1477b876beff49b1b4c22a33ef11630c13406269ffaa2b0153b195c8b528cb93
ALTER TABLE "public"."users" FORCE ROW LEVEL SECURITY;

-- dealflow:statement id=20260426000000.foundation.postcondition sha256=17d064339db7267f8071e36dad10afca24b4b1d1414d7650636d5fdbde294d6e
DO $dealflow_foundation_postcondition$
DECLARE actual_count integer;
BEGIN
  SELECT count(*) INTO actual_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY (ARRAY['campaign_plans', 'creative_assets', 'leads', 'marketing_accounts', 'organization_memberships', 'organizations', 'service_types', 'users']::text[]);
  IF actual_count <> 8 THEN RAISE EXCEPTION 'DealFlow foundation postcondition expected 8 tables, found %', actual_count USING ERRCODE='55000'; END IF;
  IF to_regprocedure('private.is_current_user_org_member(uuid)') IS NOT NULL OR to_regclass('public.partners') IS NOT NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition chronology failure' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.is_org_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing public membership helper' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing updated-at trigger helper' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger trigger_record
      JOIN pg_catalog.pg_class relation_record ON relation_record.oid=trigger_record.tgrelid
      JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid=relation_record.relnamespace
      WHERE namespace_record.nspname='public' AND NOT trigger_record.tgisinternal
        AND trigger_record.tgname = ANY (ARRAY[
          'set_leads_updated_at', 'set_marketing_accounts_updated_at', 'set_memberships_updated_at',
          'set_organizations_updated_at', 'set_service_types_updated_at', 'set_users_updated_at'
        ]::text[])) <> 6 THEN
    RAISE EXCEPTION 'DealFlow foundation postcondition missing updated-at triggers' USING ERRCODE='55000';
  END IF;
END
$dealflow_foundation_postcondition$;
