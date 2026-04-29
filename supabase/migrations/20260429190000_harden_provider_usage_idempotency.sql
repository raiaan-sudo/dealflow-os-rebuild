drop function if exists public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric);

create or replace function public.reserve_provider_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_operation text,
  p_limit_count integer,
  p_idempotency_key text default null,
  p_estimated_cost numeric default null
)
returns table (
  allowed boolean,
  current_count integer,
  next_count integer,
  limit_count integer,
  usage_id uuid,
  event_id uuid,
  reused_existing boolean,
  event_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := current_date;
  usage_row public.provider_usage_limits%rowtype;
  existing_event public.provider_usage_events%rowtype;
  new_event public.provider_usage_events%rowtype;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_limit_count <= 0 then
    raise exception 'p_limit_count must be positive';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_event
    from public.provider_usage_events
    where idempotency_key = p_idempotency_key;

    if existing_event.id is not null then
      select *
      into usage_row
      from public.provider_usage_limits
      where user_id = existing_event.user_id
        and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            coalesce(existing_event.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and provider = existing_event.provider
        and operation = existing_event.operation
        and usage_date = existing_event.usage_date;

      allowed := true;
      current_count := greatest(coalesce(usage_row.usage_count, 1) - 1, 0);
      next_count := coalesce(usage_row.usage_count, 1);
      limit_count := coalesce(usage_row.limit_count, p_limit_count);
      usage_id := usage_row.id;
      event_id := existing_event.id;
      reused_existing := true;
      event_status := existing_event.status;
      return next;
      return;
    end if;
  end if;

  begin
    insert into public.provider_usage_limits (
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      usage_date,
      usage_count,
      limit_count
    )
    values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      p_provider,
      p_operation,
      today,
      0,
      p_limit_count
    );
  exception when unique_violation then
    update public.provider_usage_limits
    set limit_count = p_limit_count,
        updated_at = now()
    where user_id = p_user_id
      and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and provider = p_provider
      and operation = p_operation
      and usage_date = today;
  end;

  select *
  into usage_row
  from public.provider_usage_limits
  where user_id = p_user_id
    and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider
    and operation = p_operation
    and usage_date = today
  for update;

  if usage_row.usage_count >= p_limit_count then
    allowed := false;
    current_count := usage_row.usage_count;
    next_count := usage_row.usage_count;
    limit_count := p_limit_count;
    usage_id := usage_row.id;
    event_id := null;
    reused_existing := false;
    event_status := null;
    return next;
    return;
  end if;

  update public.provider_usage_limits
  set usage_count = usage_row.usage_count + 1,
      limit_count = p_limit_count,
      updated_at = now()
  where id = usage_row.id;

  insert into public.provider_usage_events (
    organization_id,
    user_id,
    campaign_id,
    provider,
    operation,
    idempotency_key,
    usage_date,
    estimated_cost,
    status
  )
  values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    p_provider,
    p_operation,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    today,
    p_estimated_cost,
    'reserved'
  )
  returning * into new_event;

  allowed := true;
  current_count := usage_row.usage_count;
  next_count := usage_row.usage_count + 1;
  limit_count := p_limit_count;
  usage_id := usage_row.id;
  event_id := new_event.id;
  reused_existing := false;
  event_status := new_event.status;
  return next;
end;
$$;

revoke execute on function public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric) from public, anon, authenticated;
grant execute on function public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric) to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260429190000')
on conflict (key) do update
set value = excluded.value;
