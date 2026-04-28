alter table public.campaign_plans
  add column if not exists organization_id uuid null references public.organizations (id) on delete set null;

update public.campaign_plans cp
set organization_id = org.id
from public.organizations org
where cp.organization_id is null
  and org.owner_user_id::text = cp.user_id::text;

alter table public.marketing_accounts
  add column if not exists account_name text null,
  add column if not exists external_account_id text null,
  add column if not exists pixel_id text null,
  add column if not exists access_token_encrypted text null,
  add column if not exists connected_at timestamptz null,
  add column if not exists last_sync_at timestamptz null,
  add column if not exists token_last_synced_at timestamptz null,
  add column if not exists connection_metadata jsonb null;

create index if not exists campaign_plans_organization_idx
  on public.campaign_plans (organization_id, created_at desc);

create index if not exists marketing_accounts_platform_org_idx
  on public.marketing_accounts (platform, organization_id);

comment on column public.campaign_plans.organization_id
  is 'Workspace that owns the campaign plan; used by billing, Meta launch, and operator visibility.';

comment on column public.marketing_accounts.access_token_encrypted
  is 'Encrypted provider access token for workspace-level Meta OAuth.';

comment on column public.marketing_accounts.connection_metadata
  is 'Provider asset discovery and selected Meta ad account/Page/pixel state.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260427')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
