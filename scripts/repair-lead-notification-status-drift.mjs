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

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: staleRows, error: readError } = await supabase
    .from("lead_notifications")
    .select("id, lead_id, purpose, status, sent_at, delivered_at, failed_at")
    .eq("status", "queued")
    .not("delivered_at", "is", null)
    .is("failed_at", null)
    .order("created_at", { ascending: true });

  if (readError) {
    throw readError;
  }

  const rows = staleRows ?? [];
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    matchedRows: rows.length,
    target: "lead_notifications where status = queued and delivered_at is not null and failed_at is null",
    rows: rows.map((row) => ({
      id: row.id,
      lead_id: row.lead_id,
      purpose: row.purpose,
      beforeStatus: row.status,
      afterStatus: "delivered",
      sent_at: row.sent_at,
      delivered_at: row.delivered_at,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!args.apply || rows.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("lead_notifications")
    .update({
      status: "delivered",
      error_message: null,
      updated_at: now,
    })
    .eq("status", "queued")
    .not("delivered_at", "is", null)
    .is("failed_at", null)
    .select("id, status");

  if (updateError) {
    throw updateError;
  }

  console.log(JSON.stringify({
    mode: "apply-result",
    updatedRows: updatedRows?.length ?? 0,
    ids: (updatedRows ?? []).map((row) => row.id),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
