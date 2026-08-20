#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const bookingFile = "src/lib/services/booking-service.ts";
const leadHandlerFile = "src/lib/services/lead-handler-service.ts";
const bookingSource = fs.readFileSync(bookingFile, "utf8");
const leadHandlerSource = fs.readFileSync(leadHandlerFile, "utf8");
const runtimeSourceFiles = fs
  .readdirSync("src", { recursive: true })
  .filter((entry) => typeof entry === "string" && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry));
const runtimeSources = runtimeSourceFiles.map((entry) => ({
  file: `src/${entry}`,
  source: fs.readFileSync(`src/${entry}`, "utf8"),
}));

let networkCalls = 0;
const denyNetwork = () => {
  networkCalls += 1;
  throw new Error("network access is prohibited in the booking handoff contract");
};

class FakeApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const transpiled = ts.transpileModule(bookingSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const context = {
  module: { exports: {} },
  exports: {},
  require(specifier) {
    if (specifier === "@/lib/api/route") return { ApiError: FakeApiError };
    if (specifier === "@/lib/services/app-context") return { getAppContext: denyNetwork };
    if (specifier === "@/lib/supabase/admin") return { createAdminClient: denyNetwork };
    if (specifier === "@/lib/supabase/server") return { createClient: denyNetwork };
    throw new Error(`Unexpected booking contract import: ${specifier}`);
  },
  Date,
  Intl,
  URL,
  Error,
  TypeError,
};
context.exports = context.module.exports;
vm.runInNewContext(transpiled, context, { filename: bookingFile });

const {
  BOOKING_EXTERNAL_DISPOSITION,
  bookAppointment,
  checkSlotAvailability,
  formatAppointmentConfirmationMessage,
  formatGhlBookingHandoffMessage,
  formatSuggestedSlotMessage,
  generateSuggestedSlots,
  getAvailabilitySettings,
  resolveGhlBookingLink,
  saveAvailabilitySettings,
} = context.module.exports;

assert.equal(BOOKING_EXTERNAL_DISPOSITION.systemOfRecord, "gohighlevel");
assert.equal(
  BOOKING_EXTERNAL_DISPOSITION.localRelations["public.availability_slots"],
  "RETIRED_DO_NOT_CREATE",
);
assert.equal(
  BOOKING_EXTERNAL_DISPOSITION.localRelations["public.booked_slots"],
  "RETIRED_DO_NOT_CREATE",
);
assert.equal(
  BOOKING_EXTERNAL_DISPOSITION.localRelations["public.appointments.write"],
  "EXTERNAL_GHL_SOURCE_OF_TRUTH",
);
assert.equal(
  BOOKING_EXTERNAL_DISPOSITION.runtimeFallback,
  "FAIL_CLOSED_TO_CONFIGURED_GHL_LINK_OR_MANUAL_HANDOFF",
);

assert.equal(
  resolveGhlBookingLink({
    integrations: { gohighlevel: { booking_url: "https://book.example.com/team-calendar" } },
  }),
  "https://book.example.com/team-calendar",
  "nested GHL booking links must resolve",
);
assert.equal(
  resolveGhlBookingLink({ plan: { calendarUrl: " https://book.example.com/calendar " } }),
  "https://book.example.com/calendar",
  "configured plan calendar links must normalize",
);
for (const unsafe of [
  "http://book.example.com/insecure",
  "javascript:alert(1)",
  "https://user:pass@book.example.com/private",
  "not-a-url",
  "",
]) {
  assert.equal(
    resolveGhlBookingLink({ ghl_booking_url: unsafe }),
    null,
    `unsafe booking link must fail closed: ${unsafe || "empty"}`,
  );
}

const bookingMessage = formatGhlBookingHandoffMessage("https://book.example.com/team-calendar");
assert.equal(
  bookingMessage,
  "You can choose a time on the team's booking page here: https://book.example.com/team-calendar If none of those times work, reply here and the team will follow up manually.",
);
assert.match(bookingMessage, /team will follow up manually/i);
const manualMessage = formatGhlBookingHandoffMessage(null);
assert.doesNotMatch(manualMessage, /https?:\/\//);
assert.match(manualMessage, /reach out manually/i);

assert.match(formatSuggestedSlotMessage([]), /reach out manually/i);
assert.match(
  formatAppointmentConfirmationMessage("2030-01-15T15:00:00.000Z"),
  /you're booked for/i,
  "legacy display-only formatting helper must remain available",
);

for (const retiredCall of [
  () => getAvailabilitySettings("user-1"),
  () => saveAvailabilitySettings([]),
  () => generateSuggestedSlots("user-1"),
  () => checkSlotAvailability("user-1", "2030-01-15T15:00:00.000Z"),
  () => bookAppointment("lead-1", "user-1", "campaign-1", "2030-01-15T15:00:00.000Z"),
]) {
  await assert.rejects(
    retiredCall,
    (error) => error instanceof FakeApiError && error.code === "local_booking_retired" && error.status === 410,
    "every legacy local-booking entry point must fail closed without touching storage",
  );
}

assert.doesNotMatch(
  bookingSource,
  /\.from\(["'](?:availability_slots|booked_slots)["']\)/,
  "booking service must not query retired local slot relations",
);
assert.doesNotMatch(
  leadHandlerSource,
  /\.from\(["'](?:availability_slots|booked_slots)["']\)/,
  "lead handler must not query retired local slot relations",
);
const retiredRuntimeReferences = runtimeSources.flatMap(({ file, source }) =>
  [...source.matchAll(/\.from\(["'](availability_slots|booked_slots)["']\)/g)]
    .map((match) => `${file}:${match[1]}`),
);
assert.deepEqual(
  retiredRuntimeReferences,
  [],
  "no active application source may query retired local slot relations",
);
assert.doesNotMatch(
  bookingSource,
  /\.from\(["']appointments["']\)[\s\S]{0,120}\.insert\(/,
  "booking service must not create local appointments",
);
assert.doesNotMatch(
  leadHandlerSource,
  /bookAppointment|generateSuggestedSlots|parseTimeFromMessage|offered_slots|booking_confirmation/,
  "lead-handler booking intent must not enter the retired local scheduling path",
);
assert.match(leadHandlerSource, /getConfiguredGhlBookingLink/);
assert.match(leadHandlerSource, /formatGhlBookingHandoffMessage\(bookingUrl\)/);
assert.match(leadHandlerSource, /status: bookingUrl \? "ghl_link_provided" : "manual_handoff_required"/);
assert.match(leadHandlerSource, /system_of_record: "gohighlevel"/);
assert.match(
  leadHandlerSource,
  /response\.status === "booked"[\s\S]{0,120}lead\.status === "booked" \? "booked" : "qualified"/,
  "unverified AI booking claims must be clamped to qualified",
);
assert.equal(networkCalls, 0, "booking handoff proof must execute with zero network/provider calls");

console.log("GHL booking link and manual handoff contract: PASS (network calls: 0)");
