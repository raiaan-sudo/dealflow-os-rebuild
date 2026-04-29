do $$
begin
  if to_regclass('public.lead_messages') is null then
    return;
  end if;

  if exists (
    select 1
    from public.lead_messages
    where provider_message_id is not null
    group by provider_message_id
    having count(*) > 1
  ) then
    raise notice 'Skipped unique lead_messages provider_message_id index because duplicates already exist.';
    return;
  end if;

  create unique index if not exists lead_messages_provider_message_unique_idx
    on public.lead_messages (provider_message_id)
    where provider_message_id is not null;
end $$;
