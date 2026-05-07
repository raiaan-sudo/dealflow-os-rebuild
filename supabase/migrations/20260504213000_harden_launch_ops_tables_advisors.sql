create index if not exists activation_events_user_idx
  on public.activation_events(user_id)
  where user_id is not null;

create index if not exists campaign_value_reports_user_idx
  on public.campaign_value_reports(user_id)
  where user_id is not null;

create index if not exists billing_cancellation_intents_user_idx
  on public.billing_cancellation_intents(user_id)
  where user_id is not null;

create index if not exists customer_success_checklists_user_idx
  on public.customer_success_checklists(user_id)
  where user_id is not null;

drop policy if exists activation_events_service_role_all on public.activation_events;
create policy activation_events_service_role_all
  on public.activation_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists campaign_value_reports_service_role_all on public.campaign_value_reports;
create policy campaign_value_reports_service_role_all
  on public.campaign_value_reports
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists billing_cancellation_intents_service_role_all on public.billing_cancellation_intents;
create policy billing_cancellation_intents_service_role_all
  on public.billing_cancellation_intents
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists customer_success_checklists_service_role_all on public.customer_success_checklists;
create policy customer_success_checklists_service_role_all
  on public.customer_success_checklists
  for all
  to service_role
  using (true)
  with check (true);

insert into public.app_schema_metadata (key, value)
values ('launch_ops_table_advisor_hardening_schema_version', '20260504213000')
on conflict (key) do update set value = excluded.value;
