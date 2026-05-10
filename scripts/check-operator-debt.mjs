#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  process.exitCode = 1;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function countRows(supabase, table, queryBuilder) {
  const query = queryBuilder(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function countUnreviewedFailedProviderEvents(supabase) {
  const { data, error } = await supabase
    .from("provider_usage_events")
    .select("id,metadata")
    .eq("status", "failed");

  if (error) {
    throw new Error(`provider_usage_events: ${error.message}`);
  }

  return (data ?? []).filter((row) => !row.metadata?.operatorReviewedAt).length;
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
  ] = await Promise.all([
    countRows(supabase, "system_jobs", (query) =>
      query.eq("status", "failed").is("reviewed_at", null),
    ),
    countRows(supabase, "system_jobs", (query) =>
      query.not("dead_lettered_at", "is", null).is("reviewed_at", null),
    ),
    countRows(supabase, "stripe_webhook_events", (query) =>
      query.eq("status", "failed").is("reviewed_at", null),
    ),
    countUnreviewedFailedProviderEvents(supabase),
    countRows(supabase, "provider_usage_events", (query) =>
      query
        .eq("status", "reserved")
        .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ),
  ]);

  const summary = {
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (unresolvedFailedJobs === 0) {
    pass("Unresolved failed jobs", "none");
  } else {
    fail("Unresolved failed jobs", `${unresolvedFailedJobs} require retry, review, or resolution`);
  }

  if (unresolvedDeadLetterJobs === 0) {
    pass("Unresolved dead-letter jobs", "none");
  } else {
    fail("Unresolved dead-letter jobs", `${unresolvedDeadLetterJobs} require retry, review, or resolution`);
  }

  if (unresolvedStripeFailures === 0) {
    pass("Unresolved Stripe webhook failures", "none");
  } else {
    fail("Unresolved Stripe webhook failures", `${unresolvedStripeFailures} require replay, resync, or review`);
  }

  if (failedProviderEvents === 0 && staleProviderReservations === 0) {
    pass("Provider usage debt", "no failed events or stale reservations");
  } else {
    warn(
      "Provider usage debt",
      `${failedProviderEvents} failed events, ${staleProviderReservations} stale reservations`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("Operator debt check crashed", error instanceof Error ? error.message : String(error));
});
