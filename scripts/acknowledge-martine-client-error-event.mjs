#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  eventId: "7c82d82b-d8d2-4dd8-b1a0-ba9531acee76",
  routePath: "/f/martine",
  message: "Script error.",
  source: "window_error",
  browser: "Chrome",
  confirm: "ACKNOWLEDGE_MARTINE_CLIENT_SCRIPT_ERROR",
  proofPath: "docs/launch-reports/perfect-go-browser-proof-20260620/martine-funnel-mobile-events.json",
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
  }

  if (!args.apply && !args.dryRun) {
    args.dryRun = true;
  }

  if (args.apply && args.confirm !== TARGET.confirm) {
    throw new Error(`Apply requires --confirm=${TARGET.confirm}`);
  }

  return args;
}

function readProof() {
  const proofFile = path.resolve(TARGET.proofPath);
  if (!fs.existsSync(proofFile)) {
    throw new Error(`Missing browser proof artifact: ${TARGET.proofPath}`);
  }

  const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
  const events = Array.isArray(proof.events) ? proof.events : [];
  const pageErrors = events.filter((event) => event.type === "pageerror");
  const failedRequests = events.filter((event) => event.type === "requestfailed");
  return {
    status: proof.status,
    url: proof.url,
    overflow: proof.horiz?.overflow === true,
    pageErrorCount: pageErrors.length,
    requestFailedCount: failedRequests.length,
  };
}

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  throw new Error(`${name}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proof = readProof();
  if (proof.status !== 200) fail("Martine browser proof returned 200", String(proof.status));
  if (proof.overflow) fail("Martine browser proof has no horizontal overflow");
  if (proof.pageErrorCount !== 0) fail("Martine browser proof has zero page errors", String(proof.pageErrorCount));
  if (proof.requestFailedCount !== 0) fail("Martine browser proof has zero failed requests", String(proof.requestFailedCount));
  pass("Martine browser proof supports stale/non-blocking classification", TARGET.proofPath);

  const supabase = createSupabase();
  const { data: event, error } = await supabase
    .from("client_error_events")
    .select("id,route_path,source,severity,error_name,message,stack,component_stack,browser,viewport,occurrence_count,first_seen_at,last_seen_at,reviewed_at")
    .eq("id", TARGET.eventId)
    .maybeSingle();

  if (error) fail("Read target client error event", error.message);
  if (!event) fail("Target client error event exists", TARGET.eventId);
  if (event.reviewed_at) fail("Target client error event is still unreviewed", event.reviewed_at);
  if (event.route_path !== TARGET.routePath) fail("Target event route is Martine funnel", String(event.route_path));
  if (event.source !== TARGET.source) fail("Target event source is window_error", String(event.source));
  if (event.message !== TARGET.message) fail("Target event message is cross-origin script error", String(event.message));
  if (event.browser !== TARGET.browser) fail("Target event browser is Chrome", String(event.browser));
  if (event.stack || event.component_stack) fail("Target event has no app stack/component stack");
  if (Number(event.occurrence_count ?? 0) !== 1) fail("Target event is a one-off occurrence", String(event.occurrence_count));
  pass("Target client error matches stale/non-blocking invariant", event.id);

  if (args.dryRun) {
    console.log("DRY_RUN No rows updated.");
    return;
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("client_error_events")
    .update({
      reviewed_at: reviewedAt,
      reviewed_by: "codex-perfect-go-client-error-triage",
      resolution_note:
        "Reviewed after Martine funnel mobile browser proof. Classified as one-off cross-origin Script error with no app stack; /f/martine returned 200, no pageerror, no failed requests, and no horizontal overflow. CSP report-only and Turnstile console noise remain classified separately.",
    })
    .eq("id", TARGET.eventId)
    .is("reviewed_at", null);

  if (updateError) fail("Acknowledge target client error event", updateError.message);
  pass("Acknowledged target client error event", reviewedAt);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
