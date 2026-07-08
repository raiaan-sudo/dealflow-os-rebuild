# External Provider Proof Follow-Ups

These checks require approved test assets and must not be run against real customer accounts.

## Stripe Access-Key E2E

Needs Stripe test-mode secret, webhook secret, and a staging webhook target.

Proof: checkout creates key, success reveals once, signup claims token, `billing_subscriptions` updates through normal billing sync, reuse fails, unpaid/revoked/expired keys fail.

## Twilio Notification Proof

Needs an approved test phone and Twilio log access.

Proof: one staging/test lead notification sends to the test phone, delivery status records, no customer number is used, and PII is not logged.

## GHL CRM Proof

Needs GHL test location, pipeline, stage, and contact/opportunity write approval.

Proof: configured workspace writes a test contact/opportunity; missing mapping remains visible as `crm_not_configured`; lead capture still succeeds when CRM sync is skipped.

## Authenticated App E2E

Needs seeded staging/local test user.

Proof: login, onboarding, campaign create/edit, preview, publish, dashboard, settings/integrations, billing/paywall/access key, logout/login recovery.

## Vercel/Production Logs

Needs read-only log access.

Proof: no new unhandled server exceptions, no `/api/client-errors` trusted-alias 403 spikes, no lead capture 5xx spikes, and no webhook signature bypass.
