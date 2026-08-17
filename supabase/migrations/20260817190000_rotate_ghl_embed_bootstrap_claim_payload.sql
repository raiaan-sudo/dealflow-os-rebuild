-- Keep a pending GHL embed bootstrap claim bound to the exact signed payload
-- returned to the browser. Reopening the same installed location produces a
-- fresh signed payload; the prior function could return the older pending row
-- after a location-unique collision, causing every subsequent consume to fail.
--
-- The latest verified payload replaces the older pending claim. Exact retries
-- remain idempotent, while conflicting same-payload bindings fail closed.

create or replace function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  p_environment text,
  p_partner_id uuid,
  p_app_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_user_fingerprint text,
  p_email_fingerprint text,
  p_parent_origin_fingerprint text,
  p_payload_fingerprint text,
  p_provider_company_id text,
  p_provider_location_id text,
  p_provider_user_id text,
  p_expires_at timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_id uuid;
  existing_claim public.ghl_marketplace_embed_bootstrap_claims%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if p_environment not in ('production','sandbox','test')
    or p_expires_at <= p_now
    or p_expires_at > p_now + interval '10 minutes' then
    raise exception using errcode='22023', message='ghl_marketplace_bootstrap_claim_invalid';
  end if;
  if private.ghl_marketplace_fingerprint_v1(p_provider_company_id) <> p_company_fingerprint
    or private.ghl_marketplace_fingerprint_v1(p_provider_location_id) <> p_location_fingerprint
    or private.ghl_marketplace_fingerprint_v1(p_provider_user_id) <> p_user_fingerprint then
    raise exception using errcode='42501', message='ghl_marketplace_bootstrap_provider_binding_mismatch';
  end if;

  update public.ghl_marketplace_embed_bootstrap_claims
     set status='expired', updated_at=p_now
   where status='pending' and expires_at <= p_now;

  select * into existing_claim
  from public.ghl_marketplace_embed_bootstrap_claims
  where environment=p_environment
    and app_fingerprint=p_app_fingerprint
    and location_fingerprint=p_location_fingerprint
    and status='pending'
    and expires_at > p_now
  for update;

  if found then
    if existing_claim.payload_fingerprint = p_payload_fingerprint
      and existing_claim.partner_id is not distinct from p_partner_id
      and existing_claim.company_fingerprint = p_company_fingerprint
      and existing_claim.user_fingerprint = p_user_fingerprint
      and existing_claim.email_fingerprint = p_email_fingerprint
      and existing_claim.parent_origin_fingerprint = p_parent_origin_fingerprint
      and existing_claim.provider_company_id = p_provider_company_id
      and existing_claim.provider_location_id = p_provider_location_id
      and existing_claim.provider_user_id = p_provider_user_id then
      return existing_claim.id;
    end if;

    if existing_claim.payload_fingerprint = p_payload_fingerprint then
      raise exception using errcode='23505', message='ghl_marketplace_bootstrap_claim_binding_collision';
    end if;

    update public.ghl_marketplace_embed_bootstrap_claims
       set status='rejected', updated_at=p_now
     where id=existing_claim.id and status='pending';
  end if;

  insert into public.ghl_marketplace_embed_bootstrap_claims(
    environment,partner_id,app_fingerprint,company_fingerprint,
    location_fingerprint,user_fingerprint,email_fingerprint,
    parent_origin_fingerprint,payload_fingerprint,provider_company_id,
    provider_location_id,provider_user_id,expires_at,created_at,updated_at
  ) values (
    p_environment,p_partner_id,p_app_fingerprint,p_company_fingerprint,
    p_location_fingerprint,p_user_fingerprint,p_email_fingerprint,
    p_parent_origin_fingerprint,p_payload_fingerprint,p_provider_company_id,
    p_provider_location_id,p_provider_user_id,p_expires_at,p_now,p_now
  )
  returning id into claim_id;
  return claim_id;
exception
  when unique_violation then
    select * into existing_claim
    from public.ghl_marketplace_embed_bootstrap_claims
    where environment=p_environment
      and app_fingerprint=p_app_fingerprint
      and location_fingerprint=p_location_fingerprint
      and status='pending'
      and expires_at > p_now;
    if not found
      or existing_claim.payload_fingerprint <> p_payload_fingerprint
      or existing_claim.partner_id is distinct from p_partner_id
      or existing_claim.company_fingerprint <> p_company_fingerprint
      or existing_claim.user_fingerprint <> p_user_fingerprint
      or existing_claim.email_fingerprint <> p_email_fingerprint
      or existing_claim.parent_origin_fingerprint <> p_parent_origin_fingerprint
      or existing_claim.provider_company_id <> p_provider_company_id
      or existing_claim.provider_location_id <> p_provider_location_id
      or existing_claim.provider_user_id <> p_provider_user_id then
      raise exception using errcode='23505', message='ghl_marketplace_bootstrap_claim_conflict';
    end if;
    return existing_claim.id;
end;
$$;

revoke all on function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  text,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  text,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz
) to service_role;
