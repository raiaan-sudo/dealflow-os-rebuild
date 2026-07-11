-- DealFlow post-application read-only verification.
-- Run only after every candidate migration has applied successfully to the
-- explicitly authorized target. Results are booleans or aggregate counts;
-- no customer, provider, campaign, lead, or credential values are returned.

begin transaction isolation level repeatable read read only;

select
  to_regclass('public.ghl_location_mappings') is not null as ghl_mappings_present,
  to_regclass('public.system_job_effects') is not null as system_job_effects_present,
  to_regclass('public.commercial_activations') is not null as activations_present,
  to_regclass('public.campaign_launch_records') is not null as launch_records_present,
  to_regclass('public.support_notification_outbox') is not null as support_outbox_present,
  to_regprocedure('public.claim_next_system_job_v2(text,integer,integer)') is not null
    as system_job_v2_claim_present,
  to_regprocedure('public.settle_ghl_provider_outbox(uuid,uuid,text,uuid,bigint,timestamptz,text,text,text,integer,text,jsonb,text,timestamptz,text)') is not null
    as ghl_settlement_rpc_present;

do $$
begin
  if to_regclass('public.ghl_location_mappings') is null
    or to_regclass('public.system_job_effects') is null
    or to_regclass('public.commercial_activations') is null
    or to_regclass('public.campaign_launch_records') is null
    or to_regclass('public.support_notification_outbox') is null
    or to_regprocedure('public.claim_next_system_job_v2(text,integer,integer)') is null
    or to_regprocedure('public.settle_ghl_provider_outbox(uuid,uuid,text,uuid,bigint,timestamptz,text,text,text,integer,text,jsonb,text,timestamptz,text)') is null then
    raise exception 'DealFlow candidate schema is incomplete; stop post-migration verification.';
  end if;
end;
$$;

select count(*) as duplicate_routable_workspace_mappings
from (
  select organization_id, environment
  from public.ghl_location_mappings
  where status in ('provisioning', 'active')
  group by organization_id, environment
  having count(*) > 1
) duplicates;

select count(*) as duplicate_routable_provider_locations
from (
  select provider_location_id, environment
  from public.ghl_location_mappings
  where status in ('provisioning', 'active')
  group by provider_location_id, environment
  having count(*) > 1
) duplicates;

select count(*) as campaign_rows_without_workspace
from public.campaign_plans
where organization_id is null;

select count(*) as jobs_with_cross_tenant_campaign
from public.system_jobs job
join public.campaign_plans campaign on campaign.id = job.campaign_id
where job.organization_id is distinct from campaign.organization_id;

select count(*) as effects_with_cross_tenant_parent
from public.system_job_effects effect
join public.system_jobs job on job.id = effect.system_job_id
join public.leads lead_row on lead_row.id = effect.lead_id
where effect.organization_id is distinct from job.organization_id
   or effect.organization_id is distinct from lead_row.organization_id;

select count(*) as duplicate_workspace_activations
from (
  select organization_id
  from public.commercial_activations
  group by organization_id
  having count(*) > 1
) duplicates;

select count(*) as activations_without_initial_credit_ledger
from public.commercial_activations activation
left join public.user_credit_ledger ledger
  on ledger.reference_type = 'commercial_activation'
 and ledger.reference_id = activation.id::text
 and ledger.idempotency_key =
   'commercial_activation_initial_credit:' || activation.organization_id::text
where ledger.id is null;

select count(*) as successful_launches_without_complete_provider_identity
from public.campaign_launch_records
where result_status = 'success'
  and (
    meta_campaign_id is null
    or jsonb_array_length(meta_ad_set_ids) = 0
    or jsonb_array_length(meta_ad_ids) = 0
  );

select count(*) as exhausted_support_rows_not_operator_owned
from public.support_notification_outbox
where attempt_count >= max_attempts
  and status in ('pending', 'processing', 'retrying');

select count(*) as exhausted_ghl_fake_effects_not_operator_owned
from public.ghl_lead_effect_events effect
join public.ghl_provider_outbox outbox
  on outbox.id = effect.outbox_id
 and outbox.organization_id = effect.organization_id
where outbox.request_payload @> '{"fake_only": true}'::jsonb
  and effect.attempt_count >= effect.max_attempts
  and (
    effect.status in ('pending', 'replay_requested', 'dispatching', 'retryable_failure')
    or outbox.status in ('pending', 'dispatching', 'retryable_failure')
  );

select
  not has_table_privilege('service_role', 'public.ghl_provider_outbox', 'UPDATE')
    as ghl_outbox_direct_update_denied,
  not has_table_privilege('service_role', 'public.ghl_provider_receipts', 'INSERT')
    as ghl_receipt_direct_insert_denied,
  not has_table_privilege('service_role', 'public.ghl_lead_effect_events', 'UPDATE')
    as ghl_effect_direct_update_denied,
  has_function_privilege(
    'service_role',
    'public.settle_ghl_provider_outbox(uuid,uuid,text,uuid,bigint,timestamptz,text,text,text,integer,text,jsonb,text,timestamptz,text)',
    'EXECUTE'
  ) as ghl_settlement_rpc_enabled;

commit;
