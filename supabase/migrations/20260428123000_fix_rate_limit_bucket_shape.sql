do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rate_limit_buckets'
      and column_name = 'key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rate_limit_buckets'
      and column_name = 'bucket_key'
  ) then
    alter table public.rate_limit_buckets rename column key to bucket_key;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rate_limit_buckets'
      and column_name = 'count'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rate_limit_buckets'
      and column_name = 'request_count'
  ) then
    alter table public.rate_limit_buckets rename column count to request_count;
  end if;
end $$;

alter table public.rate_limit_buckets
  add column if not exists bucket_key text,
  add column if not exists request_count integer not null default 0,
  add column if not exists reset_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_count_nonnegative;

alter table public.rate_limit_buckets
  add constraint rate_limit_buckets_count_nonnegative check (request_count >= 0);

create unique index if not exists rate_limit_buckets_bucket_key_unique
  on public.rate_limit_buckets (bucket_key);

drop function if exists public.consume_rate_limit_bucket(text, integer, integer);

create or replace function public.consume_rate_limit_bucket(
  p_bucket_key text,
  p_max_requests integer,
  p_window_ms integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
  now_at timestamptz := now();
  next_reset timestamptz := now() + (greatest(p_window_ms, 1000)::text || ' milliseconds')::interval;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'bucket_key is required';
  end if;

  if p_max_requests <= 0 then
    raise exception 'max_requests must be positive';
  end if;

  insert into public.rate_limit_buckets (bucket_key, request_count, reset_at)
  values (p_bucket_key, 0, next_reset)
  on conflict (bucket_key) do nothing;

  select *
  into bucket
  from public.rate_limit_buckets
  where rate_limit_buckets.bucket_key = p_bucket_key
  for update;

  if bucket.reset_at <= now_at then
    update public.rate_limit_buckets
    set request_count = 1,
        reset_at = next_reset,
        updated_at = now_at
    where rate_limit_buckets.bucket_key = p_bucket_key;

    allowed := true;
    remaining := greatest(p_max_requests - 1, 0);
    reset_at := next_reset;
    return next;
    return;
  end if;

  if bucket.request_count >= p_max_requests then
    allowed := false;
    remaining := 0;
    reset_at := bucket.reset_at;
    return next;
    return;
  end if;

  update public.rate_limit_buckets
  set request_count = bucket.request_count + 1,
      updated_at = now_at
  where rate_limit_buckets.bucket_key = p_bucket_key;

  allowed := true;
  remaining := greatest(p_max_requests - bucket.request_count - 1, 0);
  reset_at := bucket.reset_at;
  return next;
end;
$$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428123000')
on conflict (key) do update
set value = excluded.value;
