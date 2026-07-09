import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const phoneSource = readFileSync("src/lib/phone.ts", "utf8");
const smsSource = readFileSync("src/lib/services/sms-service.ts", "utf8");
const notificationSource = readFileSync("src/lib/services/internal-lead-notification-service.ts", "utf8");
const leadCaptureSource = readFileSync("src/app/api/lead-capture/route.ts", "utf8");
const systemJobSource = readFileSync("src/lib/services/system-job-service.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260429230000_internal_sms_lead_notifications.sql", "utf8");
const hardeningMigrationSource = readFileSync("supabase/migrations/20260430010000_public_launch_final_hardening.sql", "utf8");

function normalizePhone(input, defaultCountry = "US") {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  const country = defaultCountry.trim().toUpperCase();
  const stripped = raw.replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) {
    const digits = stripped.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = stripped.replace(/\D/g, "");
  if ((country === "US" || country === "CA") && digits.length === 10) return `+1${digits}`;
  if ((country === "US" || country === "CA") && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

assert.equal(normalizePhone("(555) 123-4567"), "+15551234567");
assert.equal(normalizePhone("1-555-123-4567"), "+15551234567");
assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
assert.equal(normalizePhone("12345"), null);

assert.match(phoneSource, /export function normalizePhone/);
assert.match(migrationSource, /create table if not exists public\.agent_profiles/);
assert.match(migrationSource, /create table if not exists public\.lead_assignments/);
assert.match(migrationSource, /create table if not exists public\.lead_notifications/);
assert.match(migrationSource, /landing_page_url text/);
assert.match(migrationSource, /ad_id text/);
assert.match(migrationSource, /unassigned/);
assert.match(migrationSource, /lead_notifications_once_per_lead_agent_purpose/);
assert.match(hardeningMigrationSource, /alter table public\.agent_profiles force row level security/);
assert.match(hardeningMigrationSource, /alter table public\.lead_assignments force row level security/);
assert.match(hardeningMigrationSource, /alter table public\.lead_notifications force row level security/);
assert.match(hardeningMigrationSource, /revoke all on public\.agent_profiles from anon, authenticated/);
assert.match(smsSource, /MessagingServiceSid/);
assert.doesNotMatch(smsSource, /\bFrom:/);
assert.match(smsSource, /TWILIO_ACCOUNT_SID/);
assert.match(smsSource, /TWILIO_AUTH_TOKEN/);
assert.match(smsSource, /TWILIO_MESSAGING_SERVICE_SID/);
assert.match(smsSource, /missing_twilio_env/);
assert.match(smsSource, /INTERNAL_LEAD_SMS_ENABLED/);
assert.match(smsSource, /SMS_MOCK_MODE/);
assert.match(smsSource, /TEST_SMS_MODE/);
assert.match(smsSource, /mock_sms_/);
assert.match(smsSource, /queued: "queued"/);
assert.match(notificationSource, /purpose: "new_lead_alert"/);
assert.match(notificationSource, /purpose: "lead_reply_template"/);
assert.match(notificationSource, /no_eligible_agent/);
assert.match(notificationSource, /Copy\/paste reply for/);
assert.match(notificationSource, /params\.agent\.phone_e164/);
assert.doesNotMatch(notificationSource, /lead\.phone_e164\)\s*;/);
assert.match(leadCaptureSource, /queueLeadSideEffectsJob/);
assert.match(leadCaptureSource, /getPublicFunnelEntitlements/);
assert.match(leadCaptureSource, /canCaptureLeads/);
assert.match(leadCaptureSource, /campaign_subscription_inactive/);
assert.match(systemJobSource, /kind:\s*"lead_side_effects"/);
assert.match(systemJobSource, /safeNotifyAssignedAgentOfNewLead/);
assert.match(systemJobSource, /safeSendMetaLeadConversion/);

console.log("Internal SMS notification static tests passed.");
