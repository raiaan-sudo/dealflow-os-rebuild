insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
