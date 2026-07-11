alter table public.stripe_webhook_events
  add column if not exists processing_claim_token uuid null,
  add column if not exists processing_claim_generation bigint not null default 0,
  add column if not exists processing_locked_until timestamptz null;

update public.stripe_webhook_events
set processing_claim_token = coalesce(processing_claim_token, gen_random_uuid()),
    processing_claim_generation = greatest(processing_claim_generation, 1),
    processing_locked_until = coalesce(
      processing_locked_until,
      coalesce(updated_at, created_at, timezone('utc', now())) + interval '5 minutes'
    )
where status = 'processing';

update public.stripe_webhook_events
set processing_claim_token = null,
    processing_locked_until = null
where status <> 'processing'
  and (processing_claim_token is not null or processing_locked_until is not null);

create or replace function public.normalize_stripe_webhook_processing_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'processing' then
    if tg_op = 'INSERT' or old.status <> 'processing' then
      new.processing_claim_token := coalesce(new.processing_claim_token, gen_random_uuid());
      new.processing_claim_generation := greatest(
        coalesce(new.processing_claim_generation, 0),
        case when tg_op = 'UPDATE' then coalesce(old.processing_claim_generation, 0) + 1 else 1 end
      );
      new.processing_locked_until := coalesce(
        new.processing_locked_until,
        timezone('utc', now()) + interval '5 minutes'
      );
    else
      new.processing_claim_token := coalesce(new.processing_claim_token, old.processing_claim_token);
      new.processing_claim_generation := greatest(
        coalesce(new.processing_claim_generation, 0),
        coalesce(old.processing_claim_generation, 1)
      );
      new.processing_locked_until := coalesce(
        new.processing_locked_until,
        old.processing_locked_until,
        timezone('utc', now()) + interval '5 minutes'
      );
    end if;
  else
    new.processing_claim_token := null;
    new.processing_locked_until := null;
  end if;

  return new;
end;
$$;

drop trigger if exists stripe_webhook_events_normalize_processing_claim
  on public.stripe_webhook_events;

create trigger stripe_webhook_events_normalize_processing_claim
before insert or update of status, processing_claim_token, processing_claim_generation, processing_locked_until
on public.stripe_webhook_events
for each row execute function public.normalize_stripe_webhook_processing_claim();

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_processing_claim_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_processing_claim_check
  check (
    (
      status = 'processing'
      and processing_claim_token is not null
      and processing_claim_generation >= 1
      and processing_locked_until is not null
    )
    or
    (
      status <> 'processing'
      and processing_claim_token is null
      and processing_locked_until is null
    )
  );

revoke update (processing_claim_token, processing_claim_generation, processing_locked_until)
  on public.stripe_webhook_events from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.stripe_webhook_events from anon, authenticated;

grant select, insert, update on public.stripe_webhook_events to service_role;

comment on column public.stripe_webhook_events.processing_claim_token is
  'Opaque service-role claim token required to settle this exact Stripe webhook processing attempt.';

comment on column public.stripe_webhook_events.processing_claim_generation is
  'Monotonic processing generation used with processing_claim_token to fence stale webhook workers.';

comment on column public.stripe_webhook_events.processing_locked_until is
  'Exclusive processing lease deadline; settlement after expiry or reclaim is rejected.';
