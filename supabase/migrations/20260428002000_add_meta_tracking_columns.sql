alter table public.marketing_accounts
  add column if not exists launch_domain text null,
  add column if not exists verification_token text null,
  add column if not exists domain_verified boolean not null default false,
  add column if not exists tracking_status text not null default 'not_configured',
  add column if not exists tracking_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tracking_last_checked_at timestamptz null;

comment on column public.marketing_accounts.launch_domain
  is 'Workspace launch domain used for Meta tracking and preflight checks.';

comment on column public.marketing_accounts.verification_token
  is 'Meta domain verification token for the workspace launch domain.';

comment on column public.marketing_accounts.domain_verified
  is 'Whether the workspace launch domain has been verified for Meta tracking.';

comment on column public.marketing_accounts.tracking_status
  is 'Computed Meta tracking readiness status for pixel and domain verification.';

comment on column public.marketing_accounts.tracking_metadata
  is 'Provider-specific tracking verification diagnostics and metadata.';

comment on column public.marketing_accounts.tracking_last_checked_at
  is 'Last time Meta tracking readiness was checked.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
