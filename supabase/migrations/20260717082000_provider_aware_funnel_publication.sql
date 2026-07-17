-- GHL-hosted funnel publication truth. DealFlow does not pretend to build an
-- unsupported arbitrary GHL page: the exact snapshot slot, custom values,
-- preinstalled forms, HTTPS destination, and provider readback must all agree.

create table public.ghl_funnel_publications (
  id uuid primary key default gen_random_uuid(),
  personalization_id uuid not null unique references public.ghl_location_personalizations(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  location_mapping_id uuid not null references public.ghl_location_mappings(id) on delete restrict,
  environment text not null check (environment in ('production','sandbox','test')),
  slot_key text not null,
  publication_surface_kind text not null default 'ghl_snapshot_funnel'
    check (publication_surface_kind = 'ghl_snapshot_funnel'),
  destination_url text not null check (
    destination_url ~ '^https://[^/?#[:space:]]+(/[^?#[:space:]]*)?$'
    and length(destination_url) <= 2048
  ),
  destination_contract_fingerprint text not null check (destination_contract_fingerprint ~ '^[a-f0-9]{64}$'),
  source_plan_fingerprint text not null check (source_plan_fingerprint ~ '^[a-f0-9]{64}$'),
  verified_form_references jsonb not null check (
    jsonb_typeof(verified_form_references) = 'array'
    and jsonb_array_length(verified_form_references) between 1 and 50
  ),
  provider_readback_digest text not null check (provider_readback_digest ~ '^[a-f0-9]{64}$'),
  provider_receipt_digest text not null check (provider_receipt_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'ready' check (status in ('ready','stale','operator_required')),
  verified_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_funnel_publication_campaign_unique unique(campaign_id, environment),
  constraint ghl_funnel_publication_tenant_fk foreign key(campaign_id,organization_id)
    references public.campaign_plans(id,organization_id) on delete restrict
);

create table public.ghl_funnel_publication_receipts (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.ghl_funnel_publications(id) on delete restrict,
  personalization_receipt_id uuid not null unique references public.ghl_campaign_personalization_receipts(id) on delete restrict,
  outcome text not null check (outcome in ('ready','stale','operator_required')),
  provider_readback_digest text not null check (provider_readback_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest text not null check (evidence_digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default timezone('utc', now())
);

alter table public.ghl_funnel_publications enable row level security;
alter table public.ghl_funnel_publications force row level security;
alter table public.ghl_funnel_publication_receipts enable row level security;
alter table public.ghl_funnel_publication_receipts force row level security;
revoke all on public.ghl_funnel_publications from public, anon, authenticated, service_role;
revoke all on public.ghl_funnel_publication_receipts from public, anon, authenticated, service_role;
grant select on public.ghl_funnel_publications, public.ghl_funnel_publication_receipts to service_role;

create or replace function private.reject_ghl_publication_receipt_mutation_v1()
returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='ghl_funnel_publication_receipts_append_only'; end;
$$;
create trigger ghl_funnel_publication_receipts_append_only
before update or delete on public.ghl_funnel_publication_receipts
for each row execute function private.reject_ghl_publication_receipt_mutation_v1();

create or replace function public.finalize_ghl_funnel_publication_v1(p_personalization_id uuid)
returns public.ghl_funnel_publications
language plpgsql security definer set search_path='' as $$
declare
  personalization public.ghl_location_personalizations%rowtype;
  receipt public.ghl_campaign_personalization_receipts%rowtype;
  publication public.ghl_funnel_publications%rowtype;
  verified_references jsonb;
  readback_digest text;
  evidence_digest text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='ghl_publication_service_role_required';
  end if;
  select * into strict personalization from public.ghl_location_personalizations candidate
    where candidate.id=p_personalization_id for update;
  if personalization.campaign_id is null or personalization.status<>'ready'
    or personalization.current_step<>'ready' or personalization.verified_at is null
    or personalization.destination_url !~ '^https://'
    or personalization.source_plan_fingerprint !~ '^[a-f0-9]{64}$'
    or personalization.destination_contract_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='55000',message='ghl_publication_personalization_not_ready';
  end if;
  select * into receipt from public.ghl_campaign_personalization_receipts candidate
    where candidate.personalization_id=p_personalization_id
      and candidate.step='forms' and candidate.outcome='succeeded'
    order by candidate.recorded_at desc limit 1;
  verified_references := receipt.receipt->'verifiedReferences';
  readback_digest := receipt.receipt->>'responseFingerprint';
  if receipt.id is null or jsonb_typeof(verified_references)<>'array'
    or jsonb_array_length(verified_references)<1
    or readback_digest !~ '^[a-f0-9]{64}$'
    or exists (
      select 1 from jsonb_array_elements_text(personalization.required_form_ids) required_form
      where not verified_references ? required_form
    ) then
    raise exception using errcode='55000',message='ghl_publication_provider_readback_incomplete';
  end if;
  evidence_digest := encode(extensions.digest(convert_to(jsonb_build_object(
    'personalizationId',personalization.id,'campaignId',personalization.campaign_id,
    'destination',personalization.destination_url,'destinationFingerprint',personalization.destination_contract_fingerprint,
    'sourceFingerprint',personalization.source_plan_fingerprint,'verifiedReferences',verified_references,
    'providerReadbackDigest',readback_digest,'receiptId',receipt.id
  )::text,'UTF8'),'sha256'),'hex');
  insert into public.ghl_funnel_publications(
    personalization_id,organization_id,campaign_id,location_mapping_id,environment,slot_key,
    destination_url,destination_contract_fingerprint,source_plan_fingerprint,
    verified_form_references,provider_readback_digest,provider_receipt_digest,verified_at
  ) values (
    personalization.id,personalization.organization_id,personalization.campaign_id,
    personalization.location_mapping_id,personalization.environment,personalization.slot_key,
    personalization.destination_url,personalization.destination_contract_fingerprint,
    personalization.source_plan_fingerprint,verified_references,readback_digest,evidence_digest,
    personalization.verified_at
  ) on conflict(campaign_id,environment) do update set
    status=case
      when ghl_funnel_publications.provider_receipt_digest=excluded.provider_receipt_digest then 'ready'
      else 'operator_required' end,
    updated_at=timezone('utc',now())
  returning * into publication;
  insert into public.ghl_funnel_publication_receipts(
    publication_id,personalization_receipt_id,outcome,provider_readback_digest,evidence_digest
  ) values(publication.id,receipt.id,publication.status,readback_digest,evidence_digest)
  on conflict(personalization_receipt_id) do nothing;
  -- Return the durable operator-required projection instead of raising here.
  -- A PL/pgSQL exception would roll the conflict record back and erase the
  -- evidence needed for reconciliation. The caller must require status=ready.
  return publication;
end;
$$;

create or replace function public.resolve_ghl_ready_campaign_destination_v3(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_environment text
)
returns table(
  publication_id uuid,
  personalization_id uuid,
  campaign_id uuid,
  location_mapping_id uuid,
  slot_key text,
  destination_url text,
  destination_contract_fingerprint text,
  provider_readback_digest text,
  verified_at timestamptz
)
language sql security definer set search_path='' stable as $$
  select publication.id,publication.personalization_id,publication.campaign_id,
    publication.location_mapping_id,publication.slot_key,publication.destination_url,
    publication.destination_contract_fingerprint,publication.provider_readback_digest,
    publication.verified_at
  from public.ghl_funnel_publications publication
  join public.ghl_location_personalizations personalization
    on personalization.id=publication.personalization_id
  join public.campaign_plans campaign
    on campaign.id=publication.campaign_id and campaign.organization_id=publication.organization_id
  join public.ghl_location_mappings mapping
    on mapping.id=publication.location_mapping_id and mapping.organization_id=publication.organization_id
      and mapping.environment=publication.environment
  where publication.organization_id=p_organization_id
    and publication.campaign_id=p_campaign_id
    and publication.environment=p_environment
    and publication.status='ready'
    and personalization.status='ready' and personalization.current_step='ready'
    and mapping.status='active' and campaign.publish_state='published'
    and publication.source_plan_fingerprint=public.ghl_campaign_personalization_source_fingerprint_v2(
      campaign.plan,campaign.id,campaign.organization_id
    )
  limit 1
$$;

revoke all on function public.finalize_ghl_funnel_publication_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_ghl_funnel_publication_v1(uuid) to service_role;
revoke all on function public.resolve_ghl_ready_campaign_destination_v3(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_ghl_ready_campaign_destination_v3(uuid,uuid,text) to service_role;

do $dealflow_ghl_publication_postcondition$
begin
  if to_regclass('public.ghl_funnel_publications') is null
    or to_regprocedure('public.finalize_ghl_funnel_publication_v1(uuid)') is null
    or to_regprocedure('public.resolve_ghl_ready_campaign_destination_v3(uuid,uuid,text)') is null then
    raise exception '20260717082000 postcondition failed';
  end if;
end;
$dealflow_ghl_publication_postcondition$;
