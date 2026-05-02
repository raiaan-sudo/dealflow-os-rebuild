alter table if exists public.campaign_plans
  add column if not exists publish_state text not null default 'draft',
  add column if not exists staged_snapshot jsonb null,
  add column if not exists published_snapshot jsonb null,
  add column if not exists staged_at timestamptz null,
  add column if not exists published_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaign_plans_publish_state_check'
      and conrelid = 'public.campaign_plans'::regclass
  ) then
    alter table public.campaign_plans
      add constraint campaign_plans_publish_state_check
      check (publish_state in ('draft', 'staged', 'published'));
  end if;
end $$;

create index if not exists campaign_plans_publish_state_idx
  on public.campaign_plans (publish_state, created_at desc);

create unique index if not exists campaign_plans_published_public_slug_unique_idx
  on public.campaign_plans (public_slug)
  where public_slug is not null and publish_state = 'published';

comment on column public.campaign_plans.publish_state is
  'Public funnel lifecycle state for staged and published campaign previews.';

comment on column public.campaign_plans.staged_snapshot is
  'Immutable campaign snapshot captured when a public funnel is staged.';

comment on column public.campaign_plans.published_snapshot is
  'Immutable campaign snapshot served by public /f/[slug] routes.';
