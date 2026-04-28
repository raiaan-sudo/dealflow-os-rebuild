alter table if exists public.system_jobs enable row level security;
alter table if exists public.system_job_logs enable row level security;
alter table if exists public.billing_subscriptions enable row level security;
alter table if exists public.stripe_webhook_events enable row level security;
alter table if exists public.provider_usage_limits enable row level security;
alter table if exists public.provider_usage_events enable row level security;
alter table if exists public.meta_launch_locks enable row level security;
alter table if exists public.lead_messages enable row level security;
alter table if exists public.rate_limit_buckets enable row level security;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428130000')
on conflict (key) do update
set value = excluded.value;
