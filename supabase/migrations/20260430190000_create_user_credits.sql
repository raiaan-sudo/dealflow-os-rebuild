create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_credits_balance_nonnegative check (balance >= 0)
);

comment on table public.user_credits is
  'Per-user paid generation credit balance. Balance is stored in cents-equivalent integer units.';

create table if not exists public.user_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid null references public.organizations (id) on delete set null,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  reference_type text null,
  reference_id text null,
  idempotency_key text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_credit_ledger_balance_after_nonnegative check (balance_after >= 0),
  constraint user_credit_ledger_reason_present check (length(trim(reason)) > 0)
);

comment on table public.user_credit_ledger is
  'Append-only credit movements for top-ups, paid generation consumption, and refunds.';

create unique index if not exists user_credit_ledger_idempotency_unique
  on public.user_credit_ledger (idempotency_key)
  where idempotency_key is not null;

create index if not exists user_credit_ledger_user_created_idx
  on public.user_credit_ledger (user_id, created_at desc);

create index if not exists user_credit_ledger_reference_idx
  on public.user_credit_ledger (reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

alter table public.user_credits enable row level security;
alter table public.user_credit_ledger enable row level security;
alter table public.user_credits force row level security;
alter table public.user_credit_ledger force row level security;

drop policy if exists user_credits_member_select on public.user_credits;
create policy user_credits_member_select
  on public.user_credits
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_credit_ledger_member_select on public.user_credit_ledger;
create policy user_credit_ledger_member_select
  on public.user_credit_ledger
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.user_credits from anon, authenticated;
revoke all on table public.user_credit_ledger from anon, authenticated;
grant select on table public.user_credits to authenticated;
grant select on table public.user_credit_ledger to authenticated;

create or replace function public.consume_user_credits(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  next_balance integer;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'credit reason is required';
  end if;

  if p_idempotency_key is not null then
    select *
      into existing_ledger
      from public.user_credit_ledger
     where idempotency_key = p_idempotency_key
       and user_id = p_user_id
     limit 1;

    if found then
      return query select true, existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance
    into current_balance
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  if current_balance < p_amount then
    return query select false, current_balance, null::uuid, false;
    return;
  end if;

  next_balance := current_balance - p_amount;

  update public.user_credits
     set balance = next_balance,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_organization_id,
    -p_amount,
    next_balance,
    trim(p_reason),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_ledger;

  return query select true, next_balance, inserted_ledger.id, false;
end;
$$;

create or replace function public.grant_user_credits(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  next_balance integer;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'credit reason is required';
  end if;

  if p_idempotency_key is not null then
    select *
      into existing_ledger
      from public.user_credit_ledger
     where idempotency_key = p_idempotency_key
       and user_id = p_user_id
     limit 1;

    if found then
      return query select existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance
    into current_balance
    from public.user_credits uc
   where uc.user_id = p_user_id
   for update;

  next_balance := current_balance + p_amount;

  update public.user_credits
     set balance = next_balance,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_organization_id,
    p_amount,
    next_balance,
    trim(p_reason),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_ledger;

  return query select next_balance, inserted_ledger.id, false;
end;
$$;

revoke all on function public.consume_user_credits(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

revoke all on function public.grant_user_credits(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.consume_user_credits(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

grant execute on function public.grant_user_credits(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260430190000')
on conflict (key) do update
set value = excluded.value;
