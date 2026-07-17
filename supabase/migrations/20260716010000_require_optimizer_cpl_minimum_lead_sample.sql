-- Prevent a budget increase from using CPL as a qualifying signal before the
-- customer-authorized policy's minimum lead sample exists. Independent CTR,
-- CPC, and landing-page-conversion evidence remains eligible under the
-- existing optimizer guardrails.

create or replace function private.enforce_optimizer_cpl_minimum_lead_sample()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  policy_minimum_leads integer;
  metrics jsonb;
  observed_leads numeric;
  observed_cpl numeric;
  non_cpl_strong_count integer;
begin
  if new.action_type <> 'budget' then
    return new;
  end if;

  select
    policy.minimum_leads_for_cpl,
    decision.input_snapshot -> 'metrics'
  into policy_minimum_leads, metrics
  from public.meta_optimization_policy_authorizations policy
  join public.optimization_decisions decision
    on decision.id = new.decision_id
   and decision.organization_id = new.organization_id
   and decision.campaign_id = new.campaign_id
  where policy.id = new.policy_authorization_id
    and policy.organization_id = new.organization_id
    and policy.user_id = new.user_id
    and policy.campaign_id = new.campaign_id;

  if policy_minimum_leads is null or jsonb_typeof(metrics) is distinct from 'object' then
    return new;
  end if;

  observed_leads := coalesce(
    private.meta_optimization_metric_numeric(metrics, 'leads'),
    -1
  );
  observed_cpl := coalesce(
    private.meta_optimization_metric_numeric(metrics, 'cpl'),
    -1
  );
  non_cpl_strong_count :=
    (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'ctr'), 0) >= 2
      then 1 else 0 end) +
    (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'cpc'), 999999) > 0
        and coalesce(private.meta_optimization_metric_numeric(metrics, 'cpc'), 999999) <= 1
      then 1 else 0 end) +
    (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'lp_cvr'), 0) >= 5
      then 1 else 0 end);

  if observed_leads < policy_minimum_leads
     and observed_cpl > 0
     and observed_cpl <= 50
     and non_cpl_strong_count = 1 then
    raise exception using
      errcode = '55000',
      message = 'below_minimum_leads_for_cpl';
  end if;

  return new;
end;
$$;

drop trigger if exists meta_optimizer_cpl_minimum_lead_sample_guard
  on public.meta_optimization_execution_intents;
create trigger meta_optimizer_cpl_minimum_lead_sample_guard
before insert on public.meta_optimization_execution_intents
for each row execute function private.enforce_optimizer_cpl_minimum_lead_sample();

revoke all on function private.enforce_optimizer_cpl_minimum_lead_sample()
  from public, anon, authenticated;

comment on function private.enforce_optimizer_cpl_minimum_lead_sample() is
  'Fails closed when CPL would be the deciding budget-scale signal before the authorized minimum lead sample; independent non-CPL scale evidence remains eligible.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    join pg_catalog.pg_class relation_record
      on relation_record.oid = trigger_record.tgrelid
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = relation_record.relnamespace
    where namespace_record.nspname = 'public'
      and relation_record.relname = 'meta_optimization_execution_intents'
      and trigger_record.tgname = 'meta_optimizer_cpl_minimum_lead_sample_guard'
      and not trigger_record.tgisinternal
  ) then
    raise exception 'optimizer CPL minimum-lead guard was not installed';
  end if;
end;
$$;
