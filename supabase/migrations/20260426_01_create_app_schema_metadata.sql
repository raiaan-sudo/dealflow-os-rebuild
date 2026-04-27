create table if not exists public.app_schema_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260426')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
