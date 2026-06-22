-- Allow a workspace user to own multiple campaign plans.
-- Older DealFlow builds recovered from unique user_id conflicts by updating the
-- latest campaign. That made a fresh onboarding flow silently overwrite the
-- active campaign. New campaign creation must insert a new row instead.

drop index if exists public.campaign_plans_user_id_unique;
alter table if exists public.campaign_plans
  drop constraint if exists campaign_plans_user_id_key;
