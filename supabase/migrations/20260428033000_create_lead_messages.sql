create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  message text not null,
  provider_message_id text null,
  delivery_status text not null default 'recorded',
  error_message text null,
  created_at timestamptz not null default now()
);

comment on table public.lead_messages is
  'Inbound and outbound lead conversation messages with provider delivery truth.';

create index if not exists lead_messages_lead_created_idx
  on public.lead_messages (lead_id, created_at);

create index if not exists lead_messages_provider_message_idx
  on public.lead_messages (provider_message_id)
  where provider_message_id is not null;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428033000')
on conflict (key) do update
set value = excluded.value;
