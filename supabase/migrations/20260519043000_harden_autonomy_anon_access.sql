-- Pro Autopilot V1 access hardening.
-- Rollback note: re-grant only the minimum privileges required by owner-scoped
-- policies. Do not grant anon access to autonomy execution or audit tables.

revoke all on public.customer_autonomy_settings from anon;
revoke all on public.campaign_autonomy_settings from anon;
revoke all on public.autonomy_runs from anon;
revoke all on public.autonomy_actions from anon;
revoke all on public.autonomy_action_audit_logs from anon;
revoke all on public.autonomy_rollbacks from anon;
revoke all on public.autonomy_experiments from anon;
revoke all on public.campaign_performance_snapshots from anon;
revoke all on public.autonomy_learning_memory from anon;
revoke all on public.autonomy_alerts from anon;
revoke all on public.autonomy_execution_locks from anon;
revoke all on public.autonomy_idempotency_records from anon;

revoke all on public.autonomy_execution_locks from authenticated;
revoke all on public.autonomy_idempotency_records from authenticated;

grant select on public.customer_autonomy_settings to authenticated;
grant update on public.customer_autonomy_settings to authenticated;
grant select on public.campaign_autonomy_settings to authenticated;
grant update on public.campaign_autonomy_settings to authenticated;
grant select on public.autonomy_runs to authenticated;
grant select on public.autonomy_actions to authenticated;
grant update on public.autonomy_actions to authenticated;
grant select on public.autonomy_action_audit_logs to authenticated;
grant select on public.autonomy_rollbacks to authenticated;
grant select on public.autonomy_experiments to authenticated;
grant update on public.autonomy_experiments to authenticated;
grant select on public.campaign_performance_snapshots to authenticated;
grant select on public.autonomy_learning_memory to authenticated;
grant select on public.autonomy_alerts to authenticated;

insert into public.app_schema_metadata (key, value)
values
  ('schema_version', '20260519043000'),
  ('autonomy_access_hardening_schema_version', '20260519043000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
