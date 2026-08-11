#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (index % 2 === 0) pairs.push([value.replace(/^--/, ""), values[index + 1]]);
  return pairs;
}, []));
const implementationCommit = args["implementation-commit"];
const generatedAt = args["generated-at"];
if (!/^[0-9a-f]{40}$/.test(implementationCommit ?? "")) throw new Error("--implementation-commit must be an exact SHA");
if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error("--generated-at must be an ISO timestamp");

const git = (...values) => execFileSync("git", values, { cwd: root, encoding: "utf8" }).trim();
if (git("rev-parse", implementationCommit) !== implementationCommit) throw new Error("implementation commit is unavailable");

const tracked = git("ls-files").split("\n").filter(Boolean).sort();
const exists = (file) => fs.existsSync(path.join(root, file));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(path.join(root, file)));
const records = [];

function routeFromFile(file, leaf) {
  const withoutRoot = file.replace(/^src\/app\//, "").replace(new RegExp(`/${leaf.replace(".", "\\.")}$`), "");
  const visible = withoutRoot.split("/").filter((part) => !/^\(.+\)$/.test(part));
  return `/${visible.join("/")}`.replace(/\/$/, "") || "/";
}

for (const file of tracked.filter((file) => file.startsWith("src/app/") && file.endsWith("/page.tsx"))) {
  records.push({ class: "page", identity: routeFromFile(file, "page.tsx"), path: file, detail: "Next.js page" });
}
for (const file of tracked.filter((file) => file.startsWith("src/app/") && file.endsWith("/route.ts"))) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const handlers = [...new Set([
    ...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g),
    ...source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g),
  ].map((match) => match[1]))].sort();
  records.push({ class: "api_route", identity: routeFromFile(file, "route.ts"), path: file, detail: handlers.join("|") || "NO_EXPORTED_HANDLER" });
  for (const handler of handlers) records.push({ class: "http_handler", identity: `${handler} ${routeFromFile(file, "route.ts")}`, path: file, detail: handler });
}
for (const file of tracked.filter((file) => file.startsWith("supabase/migrations/") && file.endsWith(".sql"))) {
  records.push({ class: "migration", identity: path.basename(file, ".sql"), path: file, detail: fileSha(file) });
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
for (const cron of vercel.crons ?? []) records.push({ class: "cron", identity: `${cron.schedule} ${cron.path}`, path: "vercel.json", detail: cron.schedule });
for (const file of tracked.filter((file) => file === "scripts/run-durable-system-worker.ts")) records.push({ class: "worker", identity: "durable_system_worker", path: file, detail: "worker:durable" });
for (const record of records.filter((record) => record.class === "api_route" && /(?:webhook|callback)/.test(record.identity))) {
  records.push({ class: "webhook_or_callback", identity: record.identity, path: record.path, detail: record.detail });
}

const operational = JSON.parse(fs.readFileSync(path.join(root, "config/operational-system-inventory.v1.json"), "utf8"));
for (const system of operational.systems) records.push({ class: "operational_system", identity: system.id, path: "config/operational-system-inventory.v1.json", detail: system.label });
for (const file of tracked.filter((file) => /(?:^|\/)generate-release-guard\.mjs$|(?:^|\/)test-release-guard[^/]*\.(?:mjs|ts)$/.test(file))) {
  records.push({ class: "release_guard", identity: path.basename(file), path: file, detail: "release guard implementation or regression proof" });
}

const aggregateDefinitions = [
  ["component", (file) => file.startsWith("src/components/") && /\.[jt]sx?$/.test(file)],
  ["library_module", (file) => file.startsWith("src/lib/") && /\.[cm]?[jt]sx?$/.test(file)],
  ["test", (file) => /(^|\/)(?:test|tests)(?:[-_/]|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)],
  ["script", (file) => file.startsWith("scripts/") && /\.[cm]?[jt]sx?$/.test(file)],
  ["ci_workflow", (file) => file.startsWith(".github/workflows/") && /\.ya?ml$/.test(file)],
  ["documentation", (file) => file.startsWith("docs/") && /\.(?:md|json|csv)$/.test(file)],
];
for (const [name, predicate] of aggregateDefinitions) {
  records.push({ class: "aggregate", identity: name, path: "<tracked-source>", detail: String(tracked.filter(predicate).length) });
}

records.sort((a, b) => a.class.localeCompare(b.class) || a.identity.localeCompare(b.identity) || a.path.localeCompare(b.path));
for (const record of records) if (record.path !== "<tracked-source>" && !exists(record.path)) throw new Error(`missing inventory path ${record.path}`);
const classCounts = Object.fromEntries([...new Set(records.map(({ class: type }) => type))].sort().map((type) => [type, records.filter((record) => record.class === type).length]));
const payload = {
  schemaVersion: "dealflow.current-source-inventory.v1",
  generatedAt,
  implementationCommit,
  implementationTree: git("rev-parse", `${implementationCommit}^{tree}`),
  baselineCommit: "d37c50945ff7004d700301fc89c15eb9273dac5b",
  trackedFileCount: tracked.length,
  migrationCount: classCounts.migration,
  classCounts,
  aggregateCounts: Object.fromEntries(records.filter(({ class: type }) => type === "aggregate").map(({ identity, detail }) => [identity, Number(detail)])),
  records,
};

const docs = path.join(root, "docs/dealflow-completion");
fs.writeFileSync(path.join(docs, "current-source-inventory.json"), `${JSON.stringify(payload, null, 2)}\n`);
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
fs.writeFileSync(path.join(docs, "current-source-inventory.csv"), `class,identity,path,detail\n${records.map((record) => [record.class, record.identity, record.path, record.detail].map(quote).join(",")).join("\n")}\n`);
const countTable = Object.entries(classCounts).map(([type, count]) => `| ${type} | ${count} |`).join("\n");
fs.writeFileSync(path.join(docs, "CURRENT_SOURCE_INVENTORY.md"), `# Current source inventory\n\nGenerated from Git-tracked source for implementation commit \`${implementationCommit}\` (tree \`${payload.implementationTree}\`). Counts are generated, not hand-entered.\n\n| Class | Count |\n|---|---:|\n${countTable}\n\nThe JSON and CSV companions list every page, API route, HTTP handler, migration, worker, cron, webhook/callback, operational system, and release-guard file. Aggregate rows cover components, library modules, tests, scripts, CI, and documentation. Historical ledgers remain audit history and are not current candidate proof.\n`);

const traceability = {
  schemaVersion: "dealflow.current-traceability.v1",
  generatedAt,
  implementationCommit,
  forward: [
    { requirement: "signup_closure", source: ["src/app/signup/page.tsx", "src/app/[locale]/signup/page.tsx"], proof: ["scripts/test-access-key-checkout-signup.mjs"] },
    { requirement: "dependency_closure", source: ["package.json", "package-lock.json"], proof: ["npm audit --omit=dev", "npm audit", "npm run build"] },
    { requirement: "environment_contract", source: ["config/runtime-environment-contract.v1.json", ".env.example"], proof: ["scripts/test-runtime-environment-contract.mjs"] },
    { requirement: "provider_readiness_truth", source: ["config/operational-system-inventory.v1.json", "src/lib/integrations/provider-registry.ts"], proof: ["scripts/test-provider-readiness-truth.mjs"] },
    { requirement: "kpi_fail_closed", source: ["src/lib/analytics/kpi-semantic-contract.ts"], proof: ["scripts/test-kpi-semantic-contract.ts"] },
    { requirement: "owner_authority_fail_closed", source: ["config/authority/dealflow-owner-decisions.v1.json"], proof: ["authority:validate", "test:authority", "test:authority:runtime", "test:authority:grants-db"] }
  ]
};
traceability.reverse = traceability.forward.flatMap((row) => row.source.map((source) => ({ source, requirement: row.requirement, proof: row.proof })));
for (const row of traceability.reverse) if (!exists(row.source)) throw new Error(`missing traceability source ${row.source}`);
fs.writeFileSync(path.join(docs, "current-traceability-summary.json"), `${JSON.stringify(traceability, null, 2)}\n`);
console.log(`Current source inventory written: ${records.length} records, ${tracked.length} tracked files, ${classCounts.page} pages, ${classCounts.api_route} API routes, ${classCounts.http_handler} handlers, ${classCounts.migration} migrations.`);
