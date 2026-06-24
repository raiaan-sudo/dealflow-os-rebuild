#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const CONFIRM = "ACKNOWLEDGE_CURRENT_CLIENT_ERROR_EVENTS";
const REVIEWED_BY = "codex-true-full-go-client-error-triage";
const PUBLIC_PROOF =
  "docs/launch-reports/true-full-go-closeout-20260623/public-browser-cleanliness/summary.json";
const AUTH_PROOF =
  "docs/launch-reports/true-full-go-closeout-20260623/live-auth-normal-current/normal-summary.json";

const TARGETS = [
  {
    eventId: "6c5b4d14-e355-4202-a97b-13bc6e5f92a7",
    routePath: "/f/martine",
    source: "window_error",
    errorName: "Error",
    messageIncludes: "Error invoking postMessage: Java object is gone",
    proof: "public-martine",
    note:
      "Reviewed during TRUE 100% GO closeout. Current desktop/mobile /f/martine browser proof returned 200, no overflow, and no app-owned or unclassified route console/network issue. Classified as stale one-off browser postMessage teardown noise.",
  },
  {
    eventId: "6adbaa5b-5d79-451b-982f-e8ac76f00c83",
    routePath: "/build/creatives",
    source: "unhandled_rejection",
    errorName: "TypeError",
    messageIncludes: "l[e] is not a function",
    proof: "auth-build-creatives",
    note:
      "Reviewed during TRUE 100% GO closeout. Current authenticated normal-user desktop/mobile proof passed /build/creatives with zero unclassified console issues, zero unclassified failed requests, and no overflow. Classified as stale one-off pre-closeout browser event.",
  },
  {
    eventId: "5aa27a81-1e6b-4ac7-8ecf-d529dd24da9f",
    routePath: "/build/creatives",
    source: "unhandled_rejection",
    errorName: "TypeError",
    messageIncludes: "l[e] is not a function",
    proof: "auth-build-creatives",
    note:
      "Reviewed during TRUE 100% GO closeout. Current authenticated normal-user desktop/mobile proof passed /build/creatives with zero unclassified console issues, zero unclassified failed requests, and no overflow. Classified as stale one-off pre-closeout browser event.",
  },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function readJson(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing proof artifact: ${relativePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function assertPublicMartineProof() {
  const proof = readJson(PUBLIC_PROOF);
  const martineRoutes = (proof.results ?? []).filter((route) => route.label === "app-martine-funnel");
  if (martineRoutes.length !== 2) throw new Error("Public proof must include desktop and mobile /f/martine routes.");
  for (const route of martineRoutes) {
    if (!route.routeOk) throw new Error(`Martine route proof failed for ${route.profile}.`);
    if (route.overflow) throw new Error(`Martine route overflow detected for ${route.profile}.`);
    const badConsole = (route.consoleEvents ?? []).filter(
      (event) => event.class === "unclassified" && ["error", "warning"].includes(event.type),
    );
    const badRequests = (route.requestIssues ?? []).filter((event) => event.class === "unclassified");
    if (badConsole.length > 0) throw new Error(`Martine route has unclassified console events for ${route.profile}.`);
    if (badRequests.length > 0) throw new Error(`Martine route has unclassified request issues for ${route.profile}.`);
  }
}

function assertAuthBuildCreativesProof() {
  const proof = readJson(AUTH_PROOF);
  if (proof.pass !== true) throw new Error("Authenticated normal browser proof must pass.");
  const creativeRoutes = (proof.routes ?? []).filter((route) => route.route === "/build/creatives");
  if (creativeRoutes.length !== 2) throw new Error("Authenticated proof must include desktop and mobile /build/creatives.");
  for (const route of creativeRoutes) {
    if (route.overflow) throw new Error(`Authenticated /build/creatives overflow detected for ${route.kind}.`);
    if (!route.expectedText.every((expectation) => expectation.found)) {
      throw new Error(`Authenticated /build/creatives expected text missing for ${route.kind}.`);
    }
  }
  if (proof.unclassifiedConsoleCount !== 0) throw new Error("Authenticated proof has unclassified console events.");
  if (proof.unclassifiedFailedRequestCount !== 0) throw new Error("Authenticated proof has unclassified failed requests.");
}

function assertProofs() {
  assertPublicMartineProof();
  assertAuthBuildCreativesProof();
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertProofs();
  const supabase = createSupabase();

  const { data, error } = await supabase
    .from("client_error_events")
    .select("id,route_path,source,severity,error_name,message,occurrence_count,reviewed_at")
    .in("id", TARGETS.map((target) => target.eventId));

  if (error) throw error;
  const rowsById = new Map((data ?? []).map((row) => [row.id, row]));
  const reviewedAt = new Date().toISOString();
  const verified = [];

  for (const target of TARGETS) {
    const row = rowsById.get(target.eventId);
    if (!row) throw new Error(`Missing target client error event: ${target.eventId}`);
    if (row.reviewed_at) throw new Error(`Target already reviewed: ${target.eventId}`);
    if (row.route_path !== target.routePath) throw new Error(`Unexpected route for ${target.eventId}: ${row.route_path}`);
    if (row.source !== target.source) throw new Error(`Unexpected source for ${target.eventId}: ${row.source}`);
    if (row.error_name !== target.errorName) throw new Error(`Unexpected error name for ${target.eventId}: ${row.error_name}`);
    if (!String(row.message ?? "").includes(target.messageIncludes)) {
      throw new Error(`Unexpected message for ${target.eventId}: ${row.message}`);
    }
    if (Number(row.occurrence_count ?? 0) !== 1) {
      throw new Error(`Target must be one-off before acknowledgement: ${target.eventId}`);
    }
    verified.push({ id: target.eventId, routePath: target.routePath, proof: target.proof });
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", verified, updatedRows: 0 }, null, 2));
    return;
  }

  for (const target of TARGETS) {
    const { error: updateError } = await supabase
      .from("client_error_events")
      .update({
        reviewed_at: reviewedAt,
        reviewed_by: REVIEWED_BY,
        resolution_note: target.note,
      })
      .eq("id", target.eventId)
      .is("reviewed_at", null);
    if (updateError) throw updateError;
  }

  console.log(JSON.stringify({ mode: "apply", reviewedAt, updatedRows: TARGETS.length, verified }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
