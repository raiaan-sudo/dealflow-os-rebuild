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
  overdraft_limit integer := 2000;
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

  next_balance := current_balance - p_amount;

  if next_balance < -overdraft_limit then
    return query select false, current_balance, null::uuid, false;
    return;
  end if;

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
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'overdrafted',
      next_balance < 0,
      'overdraftLimitCents',
      overdraft_limit
    )
  )
  returning * into inserted_ledger;

  return query select true, next_balance, inserted_ledger.id, false;
end;
$$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260510183000')
on conflict (key) do update
set value = excluded.value;
