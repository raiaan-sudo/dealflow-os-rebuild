alter table if exists public.billing_subscriptions
  add column if not exists partner_product_name text null,
  add column if not exists partner_plan_label text null,
  add column if not exists partner_price_ids jsonb not null default '{}'::jsonb,
  add column if not exists commission_rate_snapshot numeric(6, 4) null;

alter table if exists public.partner_billing_attribution
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table if exists public.partner_commission_events
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;
