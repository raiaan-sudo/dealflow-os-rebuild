-- Keep object-storage deletion identity outside mutable JSON metadata.
-- Existing manual_upload rows are intentionally not backfilled from metadata;
-- they must fail closed until an operator reconciles them from trusted records.

alter table public.creative_assets
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

alter table public.creative_assets
  drop constraint if exists creative_assets_canonical_storage_identity_check;

alter table public.creative_assets
  add constraint creative_assets_canonical_storage_identity_check
  check (
    (storage_bucket is null and storage_path is null)
    or (
      storage_bucket = 'creative-assets'
      and provider_name = 'manual_upload'
      and user_id is not null
      and campaign_id is not null
      and user_id::text ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,127}$'
      and campaign_id::text ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,127}$'
      and storage_path ~ (
        '^'
        || user_id::text
        || '/'
        || campaign_id::text
        || '/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
      )
      and position('..' in storage_path) = 0
    )
  ) not valid;

alter table public.creative_assets
  validate constraint creative_assets_canonical_storage_identity_check;

create or replace function private.protect_creative_asset_storage_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path then
    raise exception 'creative asset storage identity is immutable'
      using errcode = '23514';
  end if;

  if new.user_id is distinct from old.user_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'creative asset owner and campaign identity is immutable'
      using errcode = '23514';
  end if;

  if (
    old.storage_bucket is not null
    or old.storage_path is not null
    or old.provider_name = 'manual_upload'
    or new.provider_name = 'manual_upload'
  ) and new.provider_name is distinct from old.provider_name then
    raise exception 'manual creative provider identity is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_creative_asset_storage_identity
  on public.creative_assets;
create trigger protect_creative_asset_storage_identity
before update on public.creative_assets
for each row
execute function private.protect_creative_asset_storage_identity();

-- Split the legacy FOR ALL policy so authenticated generation can still insert
-- ordinary rows, while only the server role can create protected manual-upload
-- storage identity. The immutable trigger protects subsequent updates for every
-- role, including service-role code.
drop policy if exists creative_assets_member_access on public.creative_assets;
drop policy if exists creative_assets_member_select on public.creative_assets;
drop policy if exists creative_assets_member_insert on public.creative_assets;
drop policy if exists creative_assets_member_update on public.creative_assets;
drop policy if exists creative_assets_member_delete on public.creative_assets;

create policy creative_assets_member_select
  on public.creative_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and private.is_current_user_org_member(campaign_record.organization_id)
    )
  );

create policy creative_assets_member_insert
  on public.creative_assets
  for insert
  to authenticated
  with check (
    storage_bucket is null
    and storage_path is null
    and coalesce(provider_name, '') <> 'manual_upload'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and private.is_current_user_org_member(campaign_record.organization_id)
    )
  );

create policy creative_assets_member_update
  on public.creative_assets
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and private.is_current_user_org_member(campaign_record.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and private.is_current_user_org_member(campaign_record.organization_id)
    )
  );

create policy creative_assets_member_delete
  on public.creative_assets
  for delete
  to authenticated
  using (
    storage_bucket is null
    and storage_path is null
    and coalesce(provider_name, '') <> 'manual_upload'
    and exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and private.is_current_user_org_member(campaign_record.organization_id)
    )
  );

comment on column public.creative_assets.storage_bucket is
  'Protected canonical bucket for server-created manual uploads; never sourced from metadata.';
comment on column public.creative_assets.storage_path is
  'Immutable canonical user/campaign object path for server-created manual uploads.';
