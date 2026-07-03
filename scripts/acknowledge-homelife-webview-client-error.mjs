#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const CONFIRM = "ACKNOWLEDGE_HOMELIFE_WEBVIEW_CLIENT_ERROR";
const REVIEWED_BY = "codex-client-error-triage-20260702";
const PROOF_PATH =
  "docs/launch-reports/client-error-triage-20260702/homelife-public-funnel-proof.json";

const TARGET = {
  eventId: "155b3c20-717c-4810-b315-8a8be7919851",
  routePath: "/f/homelife-hearts-realty-inc",
  source: "window_error",
  errorName: "TypeError",
  messageIncludes: "window.webkit.messageHandlers",
  stackIncludes: ["sendDataToNative", "sendPageHideMessage"],
  browser: "Safari",
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseArgs(argv) {
  const args = { apply: false, dryRun: false, confirm: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
  }
  if (!args.apply && !args.dryRun) args.dryRun = true;
  if (args.apply && args.confirm !== CONFIRM) {
    throw new Error(`Apply requires --confirm=${CONFIRM}`);
  }
  return args;
}

function readProof() {
  const proofFile = path.resolve(PROOF_PATH);
  if (!fs.existsSync(proofFile)) throw new Error(`Missing source/live route proof artifact: ${PROOF_PATH}`);
  const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
  if (proof.url !== "https://clicktoscale.io/f/homelife-hearts-realty-inc") {
    throw new Error(`Unexpected proof URL: ${proof.url}`);
  }
  if (proof.method !== "curl-source-scan") throw new Error(`Unexpected proof method: ${proof.method}`);
  if (proof.status !== 200) throw new Error(`Homelife public funnel did not return 200: ${proof.status}`);
  if (proof.sourceSearchMatches !== 0) {
    throw new Error(`App source contains WebView native bridge markers: ${proof.sourceSearchMatches}`);
  }
  if (proof.htmlSearchMatches !== 0) {
    throw new Error(`Live HTML contains WebView native bridge markers: ${proof.htmlSearchMatches}`);
  }
  if (proof.playwrightAvailable !== false) {
    throw new Error("Proof must record Playwright availability for this shell.");
  }
  return proof;
}

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proof = readProof();
  pass("Current Homelife public route source/live HTML proof is clean", PROOF_PATH);

  const supabase = createSupabase();
  const { data: event, error } = await supabase
    .from("client_error_events")
    .select(
      "id,route_path,source,severity,error_name,message,stack,component_stack,browser,viewport,occurrence_count,first_seen_at,last_seen_at,reviewed_at",
    )
    .eq("id", TARGET.eventId)
    .maybeSingle();

  if (error) throw error;
  if (!event) throw new Error(`Target client error event not found: ${TARGET.eventId}`);
  if (event.reviewed_at) throw new Error(`Target client error event already reviewed: ${event.reviewed_at}`);
  if (event.route_path !== TARGET.routePath) throw new Error(`Unexpected route: ${event.route_path}`);
  if (event.source !== TARGET.source) throw new Error(`Unexpected source: ${event.source}`);
  if (event.error_name !== TARGET.errorName) throw new Error(`Unexpected error name: ${event.error_name}`);
  if (!String(event.message ?? "").includes(TARGET.messageIncludes)) {
    throw new Error(`Unexpected message: ${event.message}`);
  }
  for (const expected of TARGET.stackIncludes) {
    if (!String(event.stack ?? "").includes(expected)) throw new Error(`Stack missing ${expected}`);
  }
  if (event.component_stack) throw new Error("Target event unexpectedly has a React component stack");
  if (event.browser !== TARGET.browser) throw new Error(`Unexpected browser: ${event.browser}`);
  if (Number(event.occurrence_count ?? 0) !== 1) {
    throw new Error(`Target event must be one-off before acknowledgement: ${event.occurrence_count}`);
  }
  pass("Target client error matches WebView injected-script invariant", event.id);

  if (args.dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", updatedRows: 0, target: event.id, proofGeneratedAt: proof.generatedAt }, null, 2));
    return;
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("client_error_events")
    .update({
      reviewed_at: reviewedAt,
      reviewed_by: REVIEWED_BY,
      resolution_note:
        "Reviewed during 2026-07-02 client-error triage. Classified as one-off Safari/WebView native bridge injection noise: window.webkit.messageHandlers was not found in app source or live HTML, and current clicktoscale.io/f/homelife-hearts-realty-inc returned 200. Local Playwright browser boot was unavailable during this shell, so no browser-console pass is claimed for this route. No app-owned source or live HTML defect was found.",
    })
    .eq("id", TARGET.eventId)
    .is("reviewed_at", null);

  if (updateError) throw updateError;
  pass("Acknowledged target client error event", reviewedAt);
  console.log(JSON.stringify({ mode: "apply", updatedRows: 1, reviewedAt, target: event.id }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
