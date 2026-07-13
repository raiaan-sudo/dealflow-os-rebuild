-- Atomically binds one exact provider video to DealFlow-owned immutable object
-- storage. The private binding ledger is the trigger capability: callers
-- cannot authorize a storage-identity transition by setting a custom GUC.

alter table public.creative_assets
  drop constraint if exists creative_assets_canonical_storage_identity_check;

alter table public.creative_assets
  add constraint creative_assets_canonical_storage_identity_check
  check (
    (storage_bucket is null and storage_path is null)
    or (
      storage_bucket = 'creative-assets'
      and user_id is not null
      and campaign_id is not null
      and (
        (
          provider_name = 'manual_upload'
          and storage_path ~ (
            '^' || user_id::text || '/' || campaign_id::text
            || '/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
          )
        )
        or (
          provider_name in ('higgsfield', 'heygen')
          and storage_path ~ (
            '^generated-video/'
            || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
            || user_id::text || '/'
            || campaign_id::text || '/'
            || provider_name || '/'
            || id::text || '\.video$'
          )
        )
      )
      and position('..' in storage_path) = 0
    )
  ) not valid;

alter table public.creative_assets
  validate constraint creative_assets_canonical_storage_identity_check;

create table if not exists private.generated_video_storage_bindings (
  asset_id uuid primary key
    references public.creative_assets(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  campaign_id uuid not null,
  provider_name text not null
    check (provider_name in ('higgsfield', 'heygen')),
  provider_asset_id_digest text not null
    check (provider_asset_id_digest ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null
    check (storage_bucket = 'creative-assets'),
  storage_path text not null unique,
  file_url text not null,
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_length bigint not null
    check (content_length between 1 and 104857600),
  mime_type text not null
    check (mime_type in ('video/mp4', 'video/quicktime', 'video/webm')),
  created_at timestamptz not null default timezone('utc', now())
);

revoke all on private.generated_video_storage_bindings
  from public, anon, authenticated, service_role;
grant select on private.generated_video_storage_bindings to service_role;

create or replace function private.protect_creative_asset_storage_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  identity_changed boolean :=
    new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path;
  authorized_generated_bind boolean :=
    old.storage_bucket is null
    and old.storage_path is null
    and new.storage_bucket = 'creative-assets'
    and new.provider_name in ('higgsfield', 'heygen')
    and exists (
      select 1
      from private.generated_video_storage_bindings binding
      where binding.asset_id = new.id
        and binding.user_id = new.user_id
        and binding.campaign_id = new.campaign_id
        and binding.provider_name = new.provider_name
        and binding.storage_bucket = new.storage_bucket
        and binding.storage_path = new.storage_path
        and binding.file_url = new.file_url
    );
begin
  if identity_changed and not authorized_generated_bind then
    raise exception 'creative asset storage identity is immutable'
      using errcode = '23514';
  end if;

  if new.user_id is distinct from old.user_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'creative asset owner and campaign identity is immutable'
      using errcode = '23514';
  end if;

  if new.paid_creative_dispatch_id is distinct from old.paid_creative_dispatch_id then
    raise exception 'paid creative dispatch identity is immutable'
      using errcode = '23514';
  end if;

  if old.paid_creative_dispatch_id is not null
     and new.provider_asset_id is distinct from old.provider_asset_id then
    raise exception 'creative provider asset identity is immutable'
      using errcode = '23514';
  end if;

  if old.paid_creative_dispatch_id is not null
     and new.provider_name is distinct from old.provider_name then
    raise exception 'paid creative provider identity is immutable'
      using errcode = '23514';
  end if;

  if (
    old.storage_bucket is not null
    or old.storage_path is not null
    or old.provider_name = 'manual_upload'
    or new.provider_name = 'manual_upload'
  ) and new.provider_name is distinct from old.provider_name then
    raise exception 'creative provider identity is immutable'
      using errcode = '23514';
  end if;

  if old.storage_bucket is not null
     and new.file_url is distinct from old.file_url then
    raise exception 'stored creative customer URL is immutable'
      using errcode = '23514';
  end if;

  if old.paid_creative_dispatch_id is not null
     and new.file_url is distinct from old.file_url
     and not authorized_generated_bind then
    raise exception 'paid creative customer URL is immutable'
      using errcode = '23514';
  end if;

  if old.paid_creative_dispatch_id is not null
     and old.provider_name = 'openai'
     and new.status is distinct from old.status then
    raise exception 'paid static creative status is immutable'
      using errcode = '23514';
  end if;

  if old.storage_bucket = 'creative-assets'
     and old.storage_path like 'generated-video/%'
     and (
       new.status is distinct from old.status
       or new.metadata -> 'generatedVideoStorageSha256'
          is distinct from old.metadata -> 'generatedVideoStorageSha256'
       or new.metadata -> 'generatedVideoStorageBytes'
          is distinct from old.metadata -> 'generatedVideoStorageBytes'
       or new.metadata -> 'generatedVideoStorageMimeType'
          is distinct from old.metadata -> 'generatedVideoStorageMimeType'
     ) then
    raise exception 'generated video storage receipt is immutable'
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

create or replace function public.bind_generated_video_storage_v1(
  p_asset_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider_name text,
  p_provider_asset_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_url text,
  p_content_sha256 text,
  p_content_length bigint,
  p_mime_type text
)
returns table (
  bound boolean,
  reused boolean,
  storage_bucket text,
  storage_path text,
  file_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_record public.creative_assets%rowtype;
  dispatch_record public.paid_creative_dispatches%rowtype;
  campaign_organization_id uuid;
  expected_path text;
  expected_provider_asset_id_digest text;
  existing_binding private.generated_video_storage_bindings%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'generated_video_storage_service_role_required';
  end if;

  if p_asset_id is null or p_organization_id is null or p_user_id is null
    or p_campaign_id is null
    or p_provider_name not in ('higgsfield', 'heygen')
    or nullif(trim(coalesce(p_provider_asset_id, '')), '') is null
    or p_storage_bucket is distinct from 'creative-assets'
    or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_content_length < 1 or p_content_length > 104857600
    or p_mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
    raise exception using errcode = '22023', message = 'generated_video_storage_binding_invalid';
  end if;

  expected_path := 'generated-video/' || p_organization_id::text || '/'
    || p_user_id::text || '/' || p_campaign_id::text || '/'
    || p_provider_name || '/' || p_asset_id::text || '.video';
  expected_provider_asset_id_digest := encode(
    extensions.digest(convert_to(p_provider_name || ':' || p_provider_asset_id, 'UTF8'), 'sha256'),
    'hex'
  );

  if p_storage_path is distinct from expected_path
    or p_file_url !~ '^https://[^/@?#]+/storage/v1/object/public/creative-assets/'
    or right(p_file_url, length(expected_path)) is distinct from expected_path then
    raise exception using errcode = '22023', message = 'generated_video_storage_path_invalid';
  end if;

  select asset_row.*
  into asset_record
  from public.creative_assets asset_row
  where asset_row.id = p_asset_id
  for update;

  if asset_record.id is not null then
    select campaign_row.organization_id
    into campaign_organization_id
    from public.campaign_plans campaign_row
    where campaign_row.id = asset_record.campaign_id;
  end if;

  if asset_record.id is null
    or asset_record.user_id is distinct from p_user_id
    or asset_record.campaign_id is distinct from p_campaign_id
    or campaign_organization_id is distinct from p_organization_id
    or asset_record.provider_name is distinct from p_provider_name
    or asset_record.provider_asset_id is distinct from p_provider_asset_id
    or asset_record.paid_creative_dispatch_id is null then
    raise exception using errcode = '42501', message = 'generated_video_storage_scope_mismatch';
  end if;

  select dispatch_row.*
  into dispatch_record
  from public.paid_creative_dispatches dispatch_row
  where dispatch_row.id = asset_record.paid_creative_dispatch_id;

  if dispatch_record.id is null
    or dispatch_record.organization_id is distinct from p_organization_id
    or dispatch_record.user_id is distinct from p_user_id
    or dispatch_record.campaign_id is distinct from p_campaign_id
    or dispatch_record.provider is distinct from p_provider_name
    or dispatch_record.operation is distinct from p_provider_name || '_video_generation'
    or dispatch_record.provider_request_id is distinct from p_provider_asset_id
    or dispatch_record.state not in ('accepted', 'projected') then
    raise exception using errcode = '42501', message = 'generated_video_storage_dispatch_mismatch';
  end if;

  insert into private.generated_video_storage_bindings (
    asset_id, organization_id, user_id, campaign_id, provider_name,
    provider_asset_id_digest, storage_bucket, storage_path, file_url,
    content_sha256, content_length, mime_type
  ) values (
    p_asset_id, p_organization_id, p_user_id, p_campaign_id, p_provider_name,
    expected_provider_asset_id_digest, p_storage_bucket, p_storage_path, p_file_url,
    p_content_sha256, p_content_length, p_mime_type
  )
  on conflict (asset_id) do nothing;

  select binding.*
  into existing_binding
  from private.generated_video_storage_bindings binding
  where binding.asset_id = p_asset_id
  for update;

  if existing_binding.asset_id is null
    or existing_binding.organization_id is distinct from p_organization_id
    or existing_binding.user_id is distinct from p_user_id
    or existing_binding.campaign_id is distinct from p_campaign_id
    or existing_binding.provider_name is distinct from p_provider_name
    or existing_binding.provider_asset_id_digest is distinct from expected_provider_asset_id_digest
    or existing_binding.storage_bucket is distinct from p_storage_bucket
    or existing_binding.storage_path is distinct from p_storage_path
    or existing_binding.file_url is distinct from p_file_url
    or existing_binding.content_sha256 is distinct from p_content_sha256
    or existing_binding.content_length is distinct from p_content_length
    or existing_binding.mime_type is distinct from p_mime_type then
    raise exception using errcode = '23505', message = 'generated_video_storage_identity_collision';
  end if;

  if asset_record.storage_bucket is not null or asset_record.storage_path is not null then
    if asset_record.storage_bucket is distinct from p_storage_bucket
      or asset_record.storage_path is distinct from p_storage_path
      or asset_record.file_url is distinct from p_file_url then
      raise exception using errcode = '23505', message = 'generated_video_storage_identity_collision';
    end if;
    return query select true, true, asset_record.storage_bucket,
      asset_record.storage_path, asset_record.file_url;
    return;
  end if;

  if asset_record.status not in ('generating', 'ready') then
    raise exception using errcode = '55000', message = 'generated_video_storage_asset_not_bindable';
  end if;

  update public.creative_assets target
  set storage_bucket = p_storage_bucket,
      storage_path = p_storage_path,
      file_url = p_file_url,
      status = 'ready',
      metadata = coalesce(target.metadata, '{}'::jsonb) || jsonb_build_object(
        'generatedVideoStorageSha256', p_content_sha256,
        'generatedVideoStorageBytes', p_content_length,
        'generatedVideoStorageMimeType', p_mime_type
      )
  where target.id = p_asset_id
    and target.user_id = p_user_id
    and target.campaign_id = p_campaign_id
  returning target.* into asset_record;

  return query select true, false, asset_record.storage_bucket,
    asset_record.storage_path, asset_record.file_url;
end;
$$;

revoke all on function public.bind_generated_video_storage_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.bind_generated_video_storage_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, bigint, text
) to service_role;

-- The reserved prefix stays protected even if a future permissive storage
-- policy is added. Only server-role Storage API operations may mutate it.
create or replace function private.protect_generated_video_storage_prefix()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  object_bucket text := case when tg_op = 'DELETE' then old.bucket_id else new.bucket_id end;
  object_name text := case when tg_op = 'DELETE' then old.name else new.name end;
begin
  if object_bucket = 'creative-assets'
    and object_name like 'generated-video/%'
    and auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'generated_video_storage_prefix_reserved';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_generated_video_storage_prefix on storage.objects;
create trigger protect_generated_video_storage_prefix
before insert or update or delete on storage.objects
for each row execute function private.protect_generated_video_storage_prefix();

comment on table private.generated_video_storage_bindings is
  'Immutable server-only capability ledger for exact generated-video object bindings.';
comment on function public.bind_generated_video_storage_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, bigint, text
) is 'Atomically binds one exact paid provider video object to its tenant, user, campaign and creative asset after an immutable upload.';
