alter table public.campaign_plans
  add column if not exists launch_status text null;

comment on column public.campaign_plans.launch_status is
  'Derived launch status projection from campaign_plans.plan for fast filtering and consistency checks.';

alter table public.campaign_plans
  add column if not exists lead_loop_verified boolean not null default false;

comment on column public.campaign_plans.lead_loop_verified is
  'Derived lead loop verification flag from campaign_plans.plan for dashboard and monitoring queries.';

alter table public.campaign_plans
  add column if not exists public_slug text null;

comment on column public.campaign_plans.public_slug is
  'Public funnel slug used for /f/[slug] lookup. May be projected from campaign_plans.plan when present.';

update public.campaign_plans
set
  launch_status = coalesce(
    nullif(plan ->> 'launch_status', ''),
    nullif(plan #>> '{launch_runtime,status}', ''),
    launch_status
  ),
  lead_loop_verified = coalesce(
    case
      when jsonb_typeof(plan -> 'lead_loop_verified') = 'boolean'
        then (plan ->> 'lead_loop_verified')::boolean
      else null
    end,
    lead_loop_verified,
    false
  ),
  public_slug = coalesce(
    nullif(plan ->> 'public_slug', ''),
    public_slug
  )
where plan is not null;

create table if not exists public.app_schema_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260426')
on conflict (key) do update
set
  value = excluded.value,
  updated_at = timezone('utc', now());
