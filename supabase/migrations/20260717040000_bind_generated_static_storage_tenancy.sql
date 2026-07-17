-- Bind every paid OpenAI image to one immutable tenant-scoped Storage object
-- before customer credits can settle. Storage API writes to the reserved
-- prefix require an exact RPC-created capability; possession of service_role
-- alone is not an unscoped write grant.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.paid_creative_dispatches'::regclass
      and conname = 'paid_creative_dispatches_tenant_identity_unique'
  ) then
    alter table public.paid_creative_dispatches
      add constraint paid_creative_dispatches_tenant_identity_unique
      unique (id, organization_id, user_id, campaign_id);
  end if;
end;
$$;

create table if not exists private.generated_static_storage_upload_permits (
  dispatch_id uuid primary key,
  organization_id uuid not null,
  user_id uuid not null,
  campaign_id uuid not null,
  provider_name text not null check (provider_name = 'openai'),
  storage_bucket text not null check (storage_bucket = 'creative-assets'),
  storage_path text not null unique,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_length bigint not null check (content_length between 1 and 20971520),
  mime_type text not null check (
    mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  ),
  state text not null default 'authorized'
    check (state in ('authorized', 'object_observed', 'bound')),
  authorized_at timestamptz not null default timezone('utc', now()),
  object_observed_at timestamptz,
  bound_at timestamptz,
  constraint generated_static_permit_dispatch_tenant_fk
    foreign key (dispatch_id, organization_id, user_id, campaign_id)
    references public.paid_creative_dispatches (
      id, organization_id, user_id, campaign_id
    ) on delete restrict,
  constraint generated_static_permit_state_shape check (
    (state = 'authorized' and object_observed_at is null and bound_at is null)
    or (state = 'object_observed' and object_observed_at is not null and bound_at is null)
    or (state = 'bound' and object_observed_at is not null and bound_at is not null)
  )
);

create table if not exists private.generated_static_storage_bindings (
  dispatch_id uuid primary key,
  organization_id uuid not null,
  user_id uuid not null,
  campaign_id uuid not null,
  image_asset_id uuid not null,
  thumbnail_asset_id uuid not null,
  provider_name text not null check (provider_name = 'openai'),
  storage_bucket text not null check (storage_bucket = 'creative-assets'),
  storage_path text not null unique,
  file_url text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_length bigint not null check (content_length between 1 and 20971520),
  mime_type text not null check (
    mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  constraint generated_static_binding_distinct_asset_roles
    check (image_asset_id <> thumbnail_asset_id),
  constraint generated_static_binding_dispatch_tenant_fk
    foreign key (dispatch_id, organization_id, user_id, campaign_id)
    references public.paid_creative_dispatches (
      id, organization_id, user_id, campaign_id
    ) on delete restrict,
  constraint generated_static_binding_image_tenant_fk
    foreign key (image_asset_id, campaign_id, user_id)
    references public.creative_assets (id, campaign_id, user_id) on delete restrict,
  constraint generated_static_binding_thumbnail_tenant_fk
    foreign key (thumbnail_asset_id, campaign_id, user_id)
    references public.creative_assets (id, campaign_id, user_id) on delete restrict
);

-- One immutable, exact-object cleanup authority is created only from a live
-- account-deletion task claim after the generated-static asset pair, tenant,
-- paid dispatch, object path, and content digest all agree. The state machine
-- is consumed by the Storage DELETE trigger and retained as the deletion
-- receipt after the mutable binding/upload ledgers are retired.
create table if not exists private.generated_static_storage_cleanup_authorities (
  id uuid primary key default gen_random_uuid(),
  candidate_sha256 text not null unique
    check (candidate_sha256 ~ '^[0-9a-f]{64}$'),
  task_id uuid not null references public.account_deletion_tasks(id) on delete restrict,
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  authorized_claim_generation bigint not null check (authorized_claim_generation > 0),
  organization_id uuid not null,
  user_id uuid not null,
  campaign_id uuid not null,
  dispatch_id uuid not null,
  image_asset_id uuid not null,
  thumbnail_asset_id uuid not null,
  provider_name text not null check (provider_name = 'openai'),
  storage_bucket text not null check (storage_bucket = 'creative-assets'),
  storage_path text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'authorized'
    check (state in ('authorized', 'object_deleted', 'finalizing', 'finalized')),
  authorized_at timestamptz not null default timezone('utc', now()),
  object_deleted_at timestamptz,
  finalizing_at timestamptz,
  finalized_at timestamptz,
  unique (task_id, dispatch_id),
  unique (storage_bucket, storage_path),
  check (image_asset_id <> thumbnail_asset_id),
  constraint generated_static_cleanup_state_shape check (
    (state = 'authorized' and object_deleted_at is null
      and finalizing_at is null and finalized_at is null)
    or (state = 'object_deleted' and object_deleted_at is not null
      and finalizing_at is null and finalized_at is null)
    or (state = 'finalizing' and object_deleted_at is not null
      and finalizing_at is not null and finalized_at is null)
    or (state = 'finalized' and object_deleted_at is not null
      and finalizing_at is not null and finalized_at is not null)
  )
);

revoke all on private.generated_static_storage_upload_permits
  from public, anon, authenticated, service_role;
revoke all on private.generated_static_storage_bindings
  from public, anon, authenticated, service_role;
revoke all on private.generated_static_storage_cleanup_authorities
  from public, anon, authenticated, service_role;

create or replace function private.protect_generated_static_upload_permit_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from private.generated_static_storage_cleanup_authorities cleanup
      where cleanup.state = 'finalizing'
        and cleanup.dispatch_id = old.dispatch_id
        and cleanup.organization_id = old.organization_id
        and cleanup.user_id = old.user_id
        and cleanup.campaign_id = old.campaign_id
        and cleanup.provider_name = old.provider_name
        and cleanup.storage_bucket = old.storage_bucket
        and cleanup.storage_path = old.storage_path
        and cleanup.content_sha256 = old.content_sha256
    ) then
      return old;
    end if;
    raise exception using errcode = '42501',
      message = 'generated_static_upload_permit_immutable';
  end if;
  if new.dispatch_id is distinct from old.dispatch_id
    or new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.campaign_id is distinct from old.campaign_id
    or new.provider_name is distinct from old.provider_name
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.content_sha256 is distinct from old.content_sha256
    or new.content_length is distinct from old.content_length
    or new.mime_type is distinct from old.mime_type
    or new.authorized_at is distinct from old.authorized_at
    or not (
      (old.state = 'authorized' and new.state = 'object_observed'
        and old.object_observed_at is null and new.object_observed_at is not null
        and new.bound_at is null)
      or (old.state = 'object_observed' and new.state = 'bound'
        and new.object_observed_at is not distinct from old.object_observed_at
        and old.bound_at is null and new.bound_at is not null)
    ) then
    raise exception using errcode = '42501',
      message = 'generated_static_upload_permit_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_generated_static_upload_permit
  on private.generated_static_storage_upload_permits;
create trigger protect_generated_static_upload_permit
before update or delete on private.generated_static_storage_upload_permits
for each row execute function private.protect_generated_static_upload_permit_v1();

create or replace function private.protect_generated_static_binding_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1
    from private.generated_static_storage_cleanup_authorities cleanup
    where cleanup.state = 'finalizing'
      and cleanup.dispatch_id = old.dispatch_id
      and cleanup.organization_id = old.organization_id
      and cleanup.user_id = old.user_id
      and cleanup.campaign_id = old.campaign_id
      and cleanup.image_asset_id = old.image_asset_id
      and cleanup.thumbnail_asset_id = old.thumbnail_asset_id
      and cleanup.provider_name = old.provider_name
      and cleanup.storage_bucket = old.storage_bucket
      and cleanup.storage_path = old.storage_path
      and cleanup.content_sha256 = old.content_sha256
  ) then
    return old;
  end if;
  raise exception using errcode = '42501',
    message = 'generated_static_storage_binding_immutable';
end;
$$;

drop trigger if exists protect_generated_static_storage_binding
  on private.generated_static_storage_bindings;
create trigger protect_generated_static_storage_binding
before update or delete on private.generated_static_storage_bindings
for each row execute function private.protect_generated_static_binding_v1();

create or replace function private.protect_generated_static_cleanup_authority_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.id is distinct from old.id
    or new.candidate_sha256 is distinct from old.candidate_sha256
    or new.task_id is distinct from old.task_id
    or new.request_id is distinct from old.request_id
    or new.authorized_claim_generation is distinct from old.authorized_claim_generation
    or new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.campaign_id is distinct from old.campaign_id
    or new.dispatch_id is distinct from old.dispatch_id
    or new.image_asset_id is distinct from old.image_asset_id
    or new.thumbnail_asset_id is distinct from old.thumbnail_asset_id
    or new.provider_name is distinct from old.provider_name
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.content_sha256 is distinct from old.content_sha256
    or new.authorized_at is distinct from old.authorized_at
    or not (
      (old.state = 'authorized' and new.state = 'object_deleted'
        and old.object_deleted_at is null and new.object_deleted_at is not null
        and new.finalizing_at is null and new.finalized_at is null)
      or (old.state = 'object_deleted' and new.state = 'finalizing'
        and new.object_deleted_at is not distinct from old.object_deleted_at
        and old.finalizing_at is null and new.finalizing_at is not null
        and new.finalized_at is null)
      or (old.state = 'finalizing' and new.state = 'finalized'
        and new.object_deleted_at is not distinct from old.object_deleted_at
        and new.finalizing_at is not distinct from old.finalizing_at
        and old.finalized_at is null and new.finalized_at is not null)
    ) then
    raise exception using errcode = '42501',
      message = 'generated_static_cleanup_authority_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_generated_static_cleanup_authority
  on private.generated_static_storage_cleanup_authorities;
create trigger protect_generated_static_cleanup_authority
before update or delete on private.generated_static_storage_cleanup_authorities
for each row execute function private.protect_generated_static_cleanup_authority_v1();

create or replace function public.authorize_generated_static_storage_upload_v1(
  p_dispatch_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text,
  p_content_length bigint,
  p_mime_type text
)
returns table (authorized boolean, reused boolean, permit_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_record public.paid_creative_dispatches%rowtype;
  permit_record private.generated_static_storage_upload_permits%rowtype;
  expected_path text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_service_role_required';
  end if;
  if p_dispatch_id is null or p_organization_id is null or p_user_id is null
    or p_campaign_id is null
    or p_storage_bucket is distinct from 'creative-assets'
    or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_content_length < 1 or p_content_length > 20971520
    or p_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
    raise exception using errcode = '22023',
      message = 'generated_static_storage_authority_invalid';
  end if;
  expected_path := 'generated-static/' || p_organization_id::text || '/'
    || p_user_id::text || '/' || p_campaign_id::text || '/openai/'
    || p_dispatch_id::text || '.image';
  if p_storage_path is distinct from expected_path then
    raise exception using errcode = '22023',
      message = 'generated_static_storage_path_invalid';
  end if;

  select dispatch_row.* into dispatch_record
  from public.paid_creative_dispatches dispatch_row
  where dispatch_row.id = p_dispatch_id
    and dispatch_row.organization_id = p_organization_id
    and dispatch_row.user_id = p_user_id
    and dispatch_row.campaign_id = p_campaign_id
  for update;
  if dispatch_record.id is null
    or dispatch_record.provider <> 'openai'
    or dispatch_record.operation <> 'openai_image_generation'
    or dispatch_record.state <> 'accepted'
    or dispatch_record.provider_output is null then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_dispatch_scope_mismatch';
  end if;

  begin
    insert into private.generated_static_storage_upload_permits (
      dispatch_id, organization_id, user_id, campaign_id, provider_name,
      storage_bucket, storage_path, content_sha256, content_length, mime_type
    ) values (
      p_dispatch_id, p_organization_id, p_user_id, p_campaign_id, 'openai',
      p_storage_bucket, p_storage_path, p_content_sha256, p_content_length, p_mime_type
    ) on conflict (dispatch_id) do nothing;
  exception when unique_violation then
    raise exception using errcode = '23505',
      message = 'generated_static_storage_identity_collision';
  end;

  select permit.* into strict permit_record
  from private.generated_static_storage_upload_permits permit
  where permit.dispatch_id = p_dispatch_id
  for update;
  if permit_record.organization_id is distinct from p_organization_id
    or permit_record.user_id is distinct from p_user_id
    or permit_record.campaign_id is distinct from p_campaign_id
    or permit_record.provider_name <> 'openai'
    or permit_record.storage_bucket is distinct from p_storage_bucket
    or permit_record.storage_path is distinct from p_storage_path
    or permit_record.content_sha256 is distinct from p_content_sha256
    or permit_record.content_length is distinct from p_content_length
    or permit_record.mime_type is distinct from p_mime_type then
    raise exception using errcode = '23505',
      message = 'generated_static_storage_identity_collision';
  end if;
  return query select true, permit_record.state <> 'authorized', permit_record.state;
end;
$$;

-- A service-role Storage API insert is accepted only after the exact paid
-- dispatch created a durable permit above. Update and deletion of generated
-- static objects fail closed; lifecycle cleanup needs a separately authorized
-- exact-object protocol rather than an ambiguous best-effort delete.
create or replace function private.protect_generated_static_storage_prefix_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_bucket text := case when tg_op = 'DELETE' then old.bucket_id else new.bucket_id end;
  object_name text := case when tg_op = 'DELETE' then old.name else new.name end;
  observed_count integer;
begin
  if object_bucket <> 'creative-assets' or object_name not like 'generated-static/%' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_prefix_reserved';
  end if;
  if tg_op = 'DELETE' then
    update private.generated_static_storage_cleanup_authorities cleanup
    set state = 'object_deleted', object_deleted_at = timezone('utc', now())
    where cleanup.storage_bucket = object_bucket
      and cleanup.storage_path = object_name
      and cleanup.state = 'authorized';
    get diagnostics observed_count = row_count;
    if observed_count <> 1 then
      raise exception using errcode = '42501',
        message = 'generated_static_storage_cleanup_authority_required';
    end if;
    return old;
  end if;
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_prefix_reserved';
  end if;
  update private.generated_static_storage_upload_permits permit
  set state = 'object_observed', object_observed_at = timezone('utc', now())
  where permit.storage_bucket = object_bucket
    and permit.storage_path = object_name
    and permit.state = 'authorized';
  get diagnostics observed_count = row_count;
  if observed_count <> 1 then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_upload_permit_required';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_generated_static_storage_prefix on storage.objects;
create trigger protect_generated_static_storage_prefix
before insert or update or delete on storage.objects
for each row execute function private.protect_generated_static_storage_prefix_v1();

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
            || user_id::text || '/' || campaign_id::text || '/'
            || provider_name || '/' || id::text || '\.video$'
          )
        )
        or (
          provider_name = 'openai'
          and paid_creative_dispatch_id is not null
          and storage_path ~ (
            '^generated-static/'
            || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
            || user_id::text || '/' || campaign_id::text
            || '/openai/' || paid_creative_dispatch_id::text || '\.image$'
          )
        )
      )
      and position('..' in storage_path) = 0
    )
  ) not valid;

alter table public.creative_assets
  validate constraint creative_assets_canonical_storage_identity_check;

create or replace function private.reject_unbound_generated_storage_insert_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_bucket = 'creative-assets'
    and (new.storage_path like 'generated-video/%'
      or new.storage_path like 'generated-static/%') then
    raise exception using errcode = '42501',
      message = 'generated_storage_rpc_binding_required';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_unbound_generated_storage_insert
  on public.creative_assets;
create trigger reject_unbound_generated_storage_insert
before insert on public.creative_assets
for each row execute function private.reject_unbound_generated_storage_insert_v1();

create or replace function private.protect_creative_asset_storage_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  identity_changed boolean :=
    new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path;
  authorized_generated_video_bind boolean :=
    old.storage_bucket is null
    and old.storage_path is null
    and new.storage_bucket = 'creative-assets'
    and new.provider_name in ('higgsfield', 'heygen')
    and exists (
      select 1 from private.generated_video_storage_bindings binding
      where binding.asset_id = new.id
        and binding.user_id = new.user_id
        and binding.campaign_id = new.campaign_id
        and binding.provider_name = new.provider_name
        and binding.storage_bucket = new.storage_bucket
        and binding.storage_path = new.storage_path
        and binding.file_url = new.file_url
    );
  authorized_generated_static_bind boolean :=
    old.storage_bucket is null
    and old.storage_path is null
    and new.storage_bucket = 'creative-assets'
    and new.provider_name = 'openai'
    and exists (
      select 1 from private.generated_static_storage_bindings binding
      where binding.dispatch_id = new.paid_creative_dispatch_id
        and binding.user_id = new.user_id
        and binding.campaign_id = new.campaign_id
        and new.id in (binding.image_asset_id, binding.thumbnail_asset_id)
        and binding.storage_bucket = new.storage_bucket
        and binding.storage_path = new.storage_path
        and binding.file_url = new.file_url
    );
begin
  if identity_changed
    and not authorized_generated_video_bind
    and not authorized_generated_static_bind then
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
    old.storage_bucket is not null or old.storage_path is not null
    or old.provider_name = 'manual_upload' or new.provider_name = 'manual_upload'
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
    and not authorized_generated_video_bind
    and not authorized_generated_static_bind then
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
  if old.storage_bucket = 'creative-assets'
    and old.storage_path like 'generated-static/%'
    and (
      new.metadata -> 'generatedStaticStorageSha256'
        is distinct from old.metadata -> 'generatedStaticStorageSha256'
      or new.metadata -> 'generatedStaticStorageBytes'
        is distinct from old.metadata -> 'generatedStaticStorageBytes'
      or new.metadata -> 'generatedStaticStorageMimeType'
        is distinct from old.metadata -> 'generatedStaticStorageMimeType'
    ) then
    raise exception 'generated static storage receipt is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.bind_generated_static_storage_v1(
  p_dispatch_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_image_asset_id uuid,
  p_thumbnail_asset_id uuid,
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
  image_asset_id uuid,
  thumbnail_asset_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_record public.paid_creative_dispatches%rowtype;
  permit_record private.generated_static_storage_upload_permits%rowtype;
  binding_record private.generated_static_storage_bindings%rowtype;
  image_record public.creative_assets%rowtype;
  thumbnail_record public.creative_assets%rowtype;
  expected_path text;
  was_reused boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_service_role_required';
  end if;
  if p_dispatch_id is null or p_organization_id is null or p_user_id is null
    or p_campaign_id is null or p_image_asset_id is null or p_thumbnail_asset_id is null
    or p_image_asset_id = p_thumbnail_asset_id
    or p_storage_bucket is distinct from 'creative-assets'
    or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_content_length < 1 or p_content_length > 20971520
    or p_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
    raise exception using errcode = '22023',
      message = 'generated_static_storage_binding_invalid';
  end if;
  expected_path := 'generated-static/' || p_organization_id::text || '/'
    || p_user_id::text || '/' || p_campaign_id::text || '/openai/'
    || p_dispatch_id::text || '.image';
  if p_storage_path is distinct from expected_path
    or p_file_url !~ '^https://[^/@?#]+/storage/v1/object/public/creative-assets/'
    or right(p_file_url, length(expected_path)) is distinct from expected_path then
    raise exception using errcode = '22023',
      message = 'generated_static_storage_path_invalid';
  end if;

  select dispatch_row.* into dispatch_record
  from public.paid_creative_dispatches dispatch_row
  where dispatch_row.id = p_dispatch_id
    and dispatch_row.organization_id = p_organization_id
    and dispatch_row.user_id = p_user_id
    and dispatch_row.campaign_id = p_campaign_id
  for update;
  if dispatch_record.id is null or dispatch_record.provider <> 'openai'
    or dispatch_record.operation <> 'openai_image_generation'
    or dispatch_record.state not in ('accepted', 'projected')
    or dispatch_record.provider_output is null then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_dispatch_scope_mismatch';
  end if;

  select permit.* into permit_record
  from private.generated_static_storage_upload_permits permit
  where permit.dispatch_id = p_dispatch_id
    and permit.organization_id = p_organization_id
    and permit.user_id = p_user_id
    and permit.campaign_id = p_campaign_id
  for update;
  if permit_record.dispatch_id is null
    or permit_record.state not in ('object_observed', 'bound')
    or permit_record.storage_bucket is distinct from p_storage_bucket
    or permit_record.storage_path is distinct from p_storage_path
    or permit_record.content_sha256 is distinct from p_content_sha256
    or permit_record.content_length is distinct from p_content_length
    or permit_record.mime_type is distinct from p_mime_type then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_permit_scope_mismatch';
  end if;
  if not exists (
    select 1 from storage.objects object_row
    where object_row.bucket_id = p_storage_bucket
      and object_row.name = p_storage_path
  ) then
    raise exception using errcode = '55000',
      message = 'generated_static_storage_object_not_observed';
  end if;

  select asset.* into image_record
  from public.creative_assets asset
  where asset.id = p_image_asset_id for update;
  select asset.* into thumbnail_record
  from public.creative_assets asset
  where asset.id = p_thumbnail_asset_id for update;
  if image_record.id is null or thumbnail_record.id is null
    or image_record.user_id is distinct from p_user_id
    or thumbnail_record.user_id is distinct from p_user_id
    or image_record.campaign_id is distinct from p_campaign_id
    or thumbnail_record.campaign_id is distinct from p_campaign_id
    or image_record.paid_creative_dispatch_id is distinct from p_dispatch_id
    or thumbnail_record.paid_creative_dispatch_id is distinct from p_dispatch_id
    or image_record.provider_name <> 'openai'
    or thumbnail_record.provider_name <> 'openai'
    or image_record.asset_type <> 'image_frame'
    or thumbnail_record.asset_type <> 'thumbnail'
    or image_record.status <> 'ready' or thumbnail_record.status <> 'ready'
    or image_record.file_url is distinct from p_file_url
    or thumbnail_record.file_url is distinct from p_file_url
    or (image_record.storage_bucket is not null
      and image_record.storage_bucket is distinct from p_storage_bucket)
    or (thumbnail_record.storage_bucket is not null
      and thumbnail_record.storage_bucket is distinct from p_storage_bucket)
    or (image_record.storage_path is not null
      and image_record.storage_path is distinct from p_storage_path)
    or (thumbnail_record.storage_path is not null
      and thumbnail_record.storage_path is distinct from p_storage_path) then
    raise exception using errcode = '42501',
      message = 'generated_static_storage_asset_scope_mismatch';
  end if;

  begin
    insert into private.generated_static_storage_bindings (
      dispatch_id, organization_id, user_id, campaign_id,
      image_asset_id, thumbnail_asset_id, provider_name,
      storage_bucket, storage_path, file_url,
      content_sha256, content_length, mime_type
    ) values (
      p_dispatch_id, p_organization_id, p_user_id, p_campaign_id,
      p_image_asset_id, p_thumbnail_asset_id, 'openai',
      p_storage_bucket, p_storage_path, p_file_url,
      p_content_sha256, p_content_length, p_mime_type
    ) on conflict (dispatch_id) do nothing;
  exception when unique_violation then
    raise exception using errcode = '23505',
      message = 'generated_static_storage_identity_collision';
  end;
  select binding.* into strict binding_record
  from private.generated_static_storage_bindings binding
  where binding.dispatch_id = p_dispatch_id;
  was_reused := permit_record.state = 'bound';
  if binding_record.organization_id is distinct from p_organization_id
    or binding_record.user_id is distinct from p_user_id
    or binding_record.campaign_id is distinct from p_campaign_id
    or binding_record.image_asset_id is distinct from p_image_asset_id
    or binding_record.thumbnail_asset_id is distinct from p_thumbnail_asset_id
    or binding_record.provider_name <> 'openai'
    or binding_record.storage_bucket is distinct from p_storage_bucket
    or binding_record.storage_path is distinct from p_storage_path
    or binding_record.file_url is distinct from p_file_url
    or binding_record.content_sha256 is distinct from p_content_sha256
    or binding_record.content_length is distinct from p_content_length
    or binding_record.mime_type is distinct from p_mime_type then
    raise exception using errcode = '23505',
      message = 'generated_static_storage_identity_collision';
  end if;

  update public.creative_assets asset
  set storage_bucket = p_storage_bucket,
      storage_path = p_storage_path,
      metadata = coalesce(asset.metadata, '{}'::jsonb) || jsonb_build_object(
        'generatedStaticStorageSha256', p_content_sha256,
        'generatedStaticStorageBytes', p_content_length,
        'generatedStaticStorageMimeType', p_mime_type
      )
  where asset.id in (p_image_asset_id, p_thumbnail_asset_id)
    and asset.user_id = p_user_id and asset.campaign_id = p_campaign_id;

  if permit_record.state = 'object_observed' then
    update private.generated_static_storage_upload_permits permit
    set state = 'bound', bound_at = timezone('utc', now())
    where permit.dispatch_id = p_dispatch_id and permit.state = 'object_observed';
  end if;
  return query select true, was_reused, p_storage_bucket, p_storage_path,
    p_image_asset_id, p_thumbnail_asset_id;
end;
$$;

create or replace function private.generated_static_cleanup_candidate_sha256_v1(
  p_task_id uuid,
  p_request_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_dispatch_id uuid,
  p_image_asset_id uuid,
  p_thumbnail_asset_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(chr(31),
    'dealflow-generated-static-cleanup-v1', p_task_id::text, p_request_id::text,
    p_organization_id::text, p_user_id::text, p_campaign_id::text,
    p_dispatch_id::text, p_image_asset_id::text, p_thumbnail_asset_id::text,
    p_storage_bucket, p_storage_path, p_content_sha256
  ), 'UTF8'), 'sha256'), 'hex');
$$;

-- V2 extends the deletion inventory with the exact immutable OpenAI pair and
-- digest needed to mint one cleanup authority. No provider-generated object is
-- classified canonical from path shape alone.
create or replace function public.get_account_deletion_creative_storage_inventory_v2(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint
)
returns table (
  asset_id uuid,
  storage_bucket text,
  storage_path text,
  inventory_state text,
  provider_name text,
  dispatch_id uuid,
  organization_id uuid,
  user_id uuid,
  campaign_id uuid,
  image_asset_id uuid,
  thumbnail_asset_id uuid,
  content_sha256 text,
  cleanup_state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare task public.account_deletion_tasks%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'account_deletion_service_role_required';
  end if;
  select * into strict task
  from public.account_deletion_tasks candidate
  where candidate.id = p_task_id
    and candidate.task_kind = 'delete_creative_storage'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now());

  return query
  select asset.id, asset.storage_bucket, asset.storage_path,
    case
      when asset.user_id is distinct from campaign.user_id then 'ambiguous_user_scope'
      when asset.storage_bucket is null and asset.storage_path is null then 'database_only'
      when asset.storage_bucket = 'creative-assets'
        and position('..' in asset.storage_path) = 0
        and (
          (asset.provider_name = 'manual_upload'
            and asset.storage_path = asset.user_id::text || '/'
              || asset.campaign_id::text || '/' || split_part(asset.storage_path, '/', 3)
            and split_part(asset.storage_path, '/', 3) <> '')
          or (asset.provider_name in ('higgsfield', 'heygen') and exists (
            select 1 from private.generated_video_storage_bindings video
            where video.asset_id = asset.id
              and video.organization_id = task.organization_id
              and video.user_id = asset.user_id
              and video.campaign_id = asset.campaign_id
              and video.provider_name = asset.provider_name
              and video.storage_bucket = asset.storage_bucket
              and video.storage_path = asset.storage_path
          ))
          or (asset.provider_name = 'openai'
            and static_binding.dispatch_id = asset.paid_creative_dispatch_id
            and static_binding.organization_id = task.organization_id
            and static_binding.user_id = asset.user_id
            and static_binding.campaign_id = asset.campaign_id
            and asset.id in (
              static_binding.image_asset_id, static_binding.thumbnail_asset_id
            )
            and static_binding.storage_bucket = asset.storage_bucket
            and static_binding.storage_path = asset.storage_path
            and asset.metadata ->> 'generatedStaticStorageSha256'
              = static_binding.content_sha256
            and exists (
              select 1
              from private.generated_static_storage_upload_permits upload_permit
              where upload_permit.dispatch_id = static_binding.dispatch_id
                and upload_permit.organization_id = static_binding.organization_id
                and upload_permit.user_id = static_binding.user_id
                and upload_permit.campaign_id = static_binding.campaign_id
                and upload_permit.storage_bucket = static_binding.storage_bucket
                and upload_permit.storage_path = static_binding.storage_path
                and upload_permit.content_sha256 = static_binding.content_sha256
                and upload_permit.state = 'bound'
            )
            and exists (
              select 1 from public.creative_assets image_asset
              where image_asset.id = static_binding.image_asset_id
                and image_asset.asset_type = 'image_frame'
                and image_asset.provider_name = 'openai'
                and image_asset.paid_creative_dispatch_id = static_binding.dispatch_id
                and image_asset.user_id = static_binding.user_id
                and image_asset.campaign_id = static_binding.campaign_id
                and image_asset.storage_bucket = static_binding.storage_bucket
                and image_asset.storage_path = static_binding.storage_path
                and image_asset.metadata ->> 'generatedStaticStorageSha256'
                  = static_binding.content_sha256
            )
            and exists (
              select 1 from public.creative_assets thumbnail_asset
              where thumbnail_asset.id = static_binding.thumbnail_asset_id
                and thumbnail_asset.asset_type = 'thumbnail'
                and thumbnail_asset.provider_name = 'openai'
                and thumbnail_asset.paid_creative_dispatch_id = static_binding.dispatch_id
                and thumbnail_asset.user_id = static_binding.user_id
                and thumbnail_asset.campaign_id = static_binding.campaign_id
                and thumbnail_asset.storage_bucket = static_binding.storage_bucket
                and thumbnail_asset.storage_path = static_binding.storage_path
                and thumbnail_asset.metadata ->> 'generatedStaticStorageSha256'
                  = static_binding.content_sha256
            ))
        ) then 'canonical'
      else 'ambiguous_storage_identity'
    end,
    asset.provider_name, static_binding.dispatch_id, task.organization_id,
    asset.user_id, asset.campaign_id, static_binding.image_asset_id,
    static_binding.thumbnail_asset_id, static_binding.content_sha256,
    cleanup.state
  from public.creative_assets asset
  join public.campaign_plans campaign on campaign.id = asset.campaign_id
  left join private.generated_static_storage_bindings static_binding
    on static_binding.dispatch_id = asset.paid_creative_dispatch_id
    and asset.id in (static_binding.image_asset_id, static_binding.thumbnail_asset_id)
  left join private.generated_static_storage_cleanup_authorities cleanup
    on cleanup.task_id = task.id
    and cleanup.dispatch_id = static_binding.dispatch_id
    and cleanup.candidate_sha256 = private.generated_static_cleanup_candidate_sha256_v1(
      task.id, task.request_id, task.organization_id, static_binding.user_id,
      static_binding.campaign_id, static_binding.dispatch_id,
      static_binding.image_asset_id, static_binding.thumbnail_asset_id,
      static_binding.storage_bucket, static_binding.storage_path,
      static_binding.content_sha256
    )
  where campaign.organization_id = task.organization_id
  union all
  select asset.id, null::text, null::text, 'ambiguous_campaign_scope'::text,
    asset.provider_name, asset.paid_creative_dispatch_id, task.organization_id,
    asset.user_id, asset.campaign_id, null::uuid, null::uuid, null::text, null::text
  from public.creative_assets asset
  where asset.user_id = task.requested_by_user_id
    and not exists (
      select 1 from public.campaign_plans campaign
      where campaign.id = asset.campaign_id
        and campaign.organization_id = task.organization_id
        and campaign.user_id = asset.user_id
    );
end;
$$;

create or replace function public.authorize_generated_static_storage_cleanup_v1(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_dispatch_id uuid,
  p_image_asset_id uuid,
  p_thumbnail_asset_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text
)
returns table (
  cleanup_id uuid,
  candidate_sha256 text,
  cleanup_state text,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.account_deletion_tasks%rowtype;
  binding private.generated_static_storage_bindings%rowtype;
  cleanup private.generated_static_storage_cleanup_authorities%rowtype;
  candidate_hash text;
  inserted_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'account_deletion_service_role_required';
  end if;
  if p_image_asset_id is null or p_thumbnail_asset_id is null
    or p_image_asset_id = p_thumbnail_asset_id
    or p_storage_bucket is distinct from 'creative-assets'
    or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'generated_static_cleanup_candidate_invalid';
  end if;
  select * into strict task
  from public.account_deletion_tasks candidate
  where candidate.id = p_task_id
    and candidate.task_kind = 'delete_creative_storage'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;
  if task.organization_id is distinct from p_organization_id then
    raise exception using errcode = '42501',
      message = 'generated_static_cleanup_tenant_mismatch';
  end if;
  select binding_row.* into binding
  from private.generated_static_storage_bindings binding_row
  where binding_row.dispatch_id = p_dispatch_id
    and binding_row.organization_id = p_organization_id
    and binding_row.user_id = p_user_id
    and binding_row.campaign_id = p_campaign_id
    and binding_row.image_asset_id = p_image_asset_id
    and binding_row.thumbnail_asset_id = p_thumbnail_asset_id
    and binding_row.storage_bucket = p_storage_bucket
    and binding_row.storage_path = p_storage_path
    and binding_row.content_sha256 = p_content_sha256
  for update;
  if not found or binding.provider_name <> 'openai' then
    raise exception using errcode = '42501',
      message = 'generated_static_cleanup_binding_mismatch';
  end if;
  if not exists (
    select 1 from public.campaign_plans campaign
    where campaign.id = p_campaign_id
      and campaign.organization_id = p_organization_id
      and campaign.user_id = p_user_id
  ) or not exists (
    select 1 from private.generated_static_storage_upload_permits upload_permit
    where upload_permit.dispatch_id = p_dispatch_id
      and upload_permit.organization_id = p_organization_id
      and upload_permit.user_id = p_user_id
      and upload_permit.campaign_id = p_campaign_id
      and upload_permit.storage_bucket = p_storage_bucket
      and upload_permit.storage_path = p_storage_path
      and upload_permit.content_sha256 = p_content_sha256
      and upload_permit.state = 'bound'
  ) or not exists (
    select 1 from public.creative_assets image_asset
    join public.creative_assets thumbnail_asset
      on thumbnail_asset.id = p_thumbnail_asset_id
    where image_asset.id = p_image_asset_id
      and image_asset.user_id = p_user_id
      and thumbnail_asset.user_id = p_user_id
      and image_asset.campaign_id = p_campaign_id
      and thumbnail_asset.campaign_id = p_campaign_id
      and image_asset.paid_creative_dispatch_id = p_dispatch_id
      and thumbnail_asset.paid_creative_dispatch_id = p_dispatch_id
      and image_asset.provider_name = 'openai'
      and thumbnail_asset.provider_name = 'openai'
      and image_asset.asset_type = 'image_frame'
      and thumbnail_asset.asset_type = 'thumbnail'
      and image_asset.storage_bucket = p_storage_bucket
      and thumbnail_asset.storage_bucket = p_storage_bucket
      and image_asset.storage_path = p_storage_path
      and thumbnail_asset.storage_path = p_storage_path
      and image_asset.metadata ->> 'generatedStaticStorageSha256' = p_content_sha256
      and thumbnail_asset.metadata ->> 'generatedStaticStorageSha256' = p_content_sha256
  ) then
    raise exception using errcode = '42501',
      message = 'generated_static_cleanup_candidate_mismatch';
  end if;

  candidate_hash := private.generated_static_cleanup_candidate_sha256_v1(
    task.id, task.request_id, p_organization_id, p_user_id, p_campaign_id,
    p_dispatch_id, p_image_asset_id, p_thumbnail_asset_id, p_storage_bucket,
    p_storage_path, p_content_sha256
  );
  begin
    insert into private.generated_static_storage_cleanup_authorities (
      candidate_sha256, task_id, request_id, authorized_claim_generation,
      organization_id, user_id, campaign_id, dispatch_id, image_asset_id,
      thumbnail_asset_id, provider_name, storage_bucket, storage_path,
      content_sha256
    )
    select candidate_hash, task.id, task.request_id, p_claim_generation,
      p_organization_id, p_user_id, p_campaign_id, p_dispatch_id,
      p_image_asset_id, p_thumbnail_asset_id, 'openai', p_storage_bucket,
      p_storage_path, p_content_sha256
    where exists (
      select 1 from storage.objects object_row
      where object_row.bucket_id = p_storage_bucket
        and object_row.name = p_storage_path
    )
    on conflict (task_id, dispatch_id) do nothing;
    get diagnostics inserted_count = row_count;
  exception when unique_violation then
    raise exception using errcode = '23505',
      message = 'generated_static_cleanup_identity_collision';
  end;
  select cleanup_row.* into cleanup
  from private.generated_static_storage_cleanup_authorities cleanup_row
  where cleanup_row.task_id = task.id
    and cleanup_row.dispatch_id = p_dispatch_id
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'generated_static_cleanup_object_not_observed';
  end if;
  if cleanup.candidate_sha256 is distinct from candidate_hash
    or cleanup.request_id is distinct from task.request_id
    or cleanup.organization_id is distinct from p_organization_id
    or cleanup.user_id is distinct from p_user_id
    or cleanup.campaign_id is distinct from p_campaign_id
    or cleanup.image_asset_id is distinct from p_image_asset_id
    or cleanup.thumbnail_asset_id is distinct from p_thumbnail_asset_id
    or cleanup.provider_name <> 'openai'
    or cleanup.storage_bucket is distinct from p_storage_bucket
    or cleanup.storage_path is distinct from p_storage_path
    or cleanup.content_sha256 is distinct from p_content_sha256 then
    raise exception using errcode = '23505',
      message = 'generated_static_cleanup_identity_collision';
  end if;
  return query select cleanup.id, cleanup.candidate_sha256, cleanup.state,
    inserted_count = 0;
end;
$$;

create or replace function public.finalize_account_deletion_creative_storage_v2(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_asset_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.account_deletion_tasks%rowtype;
  expected_ids uuid[];
  binding private.generated_static_storage_bindings%rowtype;
  cleanup private.generated_static_storage_cleanup_authorities%rowtype;
  expected_candidate text;
  affected integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'account_deletion_service_role_required';
  end if;
  select * into strict task
  from public.account_deletion_tasks candidate
  where candidate.id = p_task_id
    and candidate.task_kind = 'delete_creative_storage'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;

  if exists (
    select 1 from public.get_account_deletion_creative_storage_inventory_v2(
      p_task_id, p_claim_token, p_claim_generation
    ) inventory
    where inventory.inventory_state not in ('canonical', 'database_only')
  ) then
    raise exception using errcode = '55000',
      message = 'account_deletion_creative_inventory_ambiguous';
  end if;
  select coalesce(array_agg(inventory.asset_id order by inventory.asset_id), '{}'::uuid[])
  into expected_ids
  from public.get_account_deletion_creative_storage_inventory_v2(
    p_task_id, p_claim_token, p_claim_generation
  ) inventory;
  if expected_ids is distinct from (
    select coalesce(array_agg(candidate order by candidate), '{}'::uuid[])
    from unnest(coalesce(p_asset_ids, '{}'::uuid[])) candidate
  ) then
    raise exception using errcode = '55000',
      message = 'account_deletion_creative_inventory_changed';
  end if;
  if exists (
    select 1
    from public.get_account_deletion_creative_storage_inventory_v2(
      p_task_id, p_claim_token, p_claim_generation
    ) inventory
    join storage.objects object_row
      on object_row.bucket_id = inventory.storage_bucket
      and object_row.name = inventory.storage_path
    where inventory.inventory_state = 'canonical'
  ) then
    raise exception using errcode = '55000',
      message = 'account_deletion_creative_storage_object_still_present';
  end if;

  for binding in
    select binding_row.*
    from private.generated_static_storage_bindings binding_row
    where binding_row.organization_id = task.organization_id
      and (
        binding_row.image_asset_id = any(expected_ids)
        or binding_row.thumbnail_asset_id = any(expected_ids)
      )
    order by binding_row.dispatch_id
    for update
  loop
    if not (binding.image_asset_id = any(expected_ids))
      or not (binding.thumbnail_asset_id = any(expected_ids)) then
      raise exception using errcode = '55000',
        message = 'generated_static_cleanup_pair_incomplete';
    end if;
    expected_candidate := private.generated_static_cleanup_candidate_sha256_v1(
      task.id, task.request_id, binding.organization_id, binding.user_id,
      binding.campaign_id, binding.dispatch_id, binding.image_asset_id,
      binding.thumbnail_asset_id, binding.storage_bucket, binding.storage_path,
      binding.content_sha256
    );
    select cleanup_row.* into cleanup
    from private.generated_static_storage_cleanup_authorities cleanup_row
    where cleanup_row.task_id = task.id
      and cleanup_row.dispatch_id = binding.dispatch_id
    for update;
    if not found or cleanup.state <> 'object_deleted'
      or cleanup.candidate_sha256 is distinct from expected_candidate
      or cleanup.organization_id is distinct from binding.organization_id
      or cleanup.user_id is distinct from binding.user_id
      or cleanup.campaign_id is distinct from binding.campaign_id
      or cleanup.image_asset_id is distinct from binding.image_asset_id
      or cleanup.thumbnail_asset_id is distinct from binding.thumbnail_asset_id
      or cleanup.storage_bucket is distinct from binding.storage_bucket
      or cleanup.storage_path is distinct from binding.storage_path
      or cleanup.content_sha256 is distinct from binding.content_sha256 then
      raise exception using errcode = '55000',
        message = 'generated_static_cleanup_authority_unconsumed';
    end if;
    update private.generated_static_storage_cleanup_authorities cleanup_row
    set state = 'finalizing', finalizing_at = timezone('utc', now())
    where cleanup_row.id = cleanup.id and cleanup_row.state = 'object_deleted';
    delete from private.generated_static_storage_bindings binding_row
    where binding_row.dispatch_id = binding.dispatch_id;
    delete from private.generated_static_storage_upload_permits upload_permit
    where upload_permit.dispatch_id = binding.dispatch_id;
  end loop;

  perform set_config('dealflow.account_deletion_request_id', task.request_id::text, true);
  delete from public.creative_assets asset where asset.id = any(expected_ids);
  get diagnostics affected = row_count;
  update private.generated_static_storage_cleanup_authorities cleanup_row
  set state = 'finalized', finalized_at = timezone('utc', now())
  where cleanup_row.task_id = task.id and cleanup_row.state = 'finalizing';
  return affected;
end;
$$;

-- The paid-dispatch settlement transaction rolls back in full unless its
-- static creative rows already carry the exact immutable Storage binding.
create or replace function private.require_generated_static_binding_before_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding private.generated_static_storage_bindings%rowtype;
begin
  if new.provider = 'openai' and new.operation = 'openai_image_generation'
    and new.state = 'projected' and old.state is distinct from 'projected' then
    select binding_row.* into binding
    from private.generated_static_storage_bindings binding_row
    where binding_row.dispatch_id = new.id
      and binding_row.organization_id = new.organization_id
      and binding_row.user_id = new.user_id
      and binding_row.campaign_id = new.campaign_id;
    if binding.dispatch_id is null
      or new.projection_receipt is null
      or jsonb_typeof(new.projection_receipt) <> 'object'
      or new.projection_receipt ->> 'kind' <> 'static_creative'
      or new.projection_receipt ->> 'campaignId' <> new.campaign_id::text
      or new.projection_receipt ->> 'storageBucket' <> binding.storage_bucket
      or new.projection_receipt ->> 'storagePath' <> binding.storage_path
      or new.projection_receipt ->> 'contentSha256' <> binding.content_sha256
      or jsonb_typeof(new.projection_receipt -> 'creativeAssetIds') is distinct from 'array'
      or jsonb_array_length(new.projection_receipt -> 'creativeAssetIds') <> 2
      or not (new.projection_receipt -> 'creativeAssetIds'
        @> jsonb_build_array(binding.image_asset_id::text))
      or not (new.projection_receipt -> 'creativeAssetIds'
        @> jsonb_build_array(binding.thumbnail_asset_id::text)) then
      raise exception using errcode = '55000',
        message = 'generated_static_storage_binding_required_before_settlement';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists require_generated_static_binding_before_projection
  on public.paid_creative_dispatches;
create trigger require_generated_static_binding_before_projection
before update of state, projection_receipt on public.paid_creative_dispatches
for each row execute function private.require_generated_static_binding_before_projection_v1();

revoke all on function public.authorize_generated_static_storage_upload_v1(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.authorize_generated_static_storage_upload_v1(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text
) to service_role;
revoke all on function public.bind_generated_static_storage_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.bind_generated_static_storage_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) to service_role;
revoke all on function public.get_account_deletion_creative_storage_inventory_v2(
  uuid, uuid, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.get_account_deletion_creative_storage_inventory_v2(
  uuid, uuid, bigint
) to service_role;
revoke all on function public.authorize_generated_static_storage_cleanup_v1(
  uuid, uuid, bigint, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.authorize_generated_static_storage_cleanup_v1(
  uuid, uuid, bigint, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text
) to service_role;
revoke all on function public.finalize_account_deletion_creative_storage_v2(
  uuid, uuid, bigint, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_account_deletion_creative_storage_v2(
  uuid, uuid, bigint, uuid[]
) to service_role;

comment on table private.generated_static_storage_upload_permits is
  'Exact service-mediated capability for one paid OpenAI image Storage insert; identity is immutable and the capability is consumed by object observation and binding.';
comment on table private.generated_static_storage_bindings is
  'Immutable tenant, campaign, dispatch, creative-role, object and content binding for canonical generated static media.';
comment on table private.generated_static_storage_cleanup_authorities is
  'Immutable candidate, tenant, asset-pair, dispatch, object and digest-bound account-deletion authority; one Storage DELETE consumes it and finalization retains it as the cleanup receipt.';
comment on function public.bind_generated_static_storage_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) is 'Binds one observed paid OpenAI image object to the exact tenant, user, campaign, dispatch and two creative roles before financial settlement.';
comment on function public.authorize_generated_static_storage_cleanup_v1(
  uuid, uuid, bigint, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text
) is 'Mints or recovers one exact account-deletion cleanup authority for a canonical generated-static asset pair without granting generic Storage deletion.';
comment on function public.finalize_account_deletion_creative_storage_v2(
  uuid, uuid, bigint, uuid[]
) is 'Finalizes only an unchanged tenant creative inventory after every Storage object is absent and every OpenAI cleanup authority was consumed, retiring mutable binding ledgers atomically.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260717040000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
