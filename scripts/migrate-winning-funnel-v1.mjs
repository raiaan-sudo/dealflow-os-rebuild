#!/usr/bin/env node

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(repoRoot, "src", request.slice(2)), parent, isMain, options);
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const campaignIndex = args.indexOf("--campaign");
const campaignId = campaignIndex >= 0 ? args[campaignIndex + 1] : "local-dry-run-campaign";
const fileIndex = args.indexOf("--file");
const filePath = fileIndex >= 0 ? args[fileIndex + 1] : null;
const require = createRequire(import.meta.url);
const { buildWinningFunnelMigration } = require("../src/lib/funnels/winning-template/migration.ts");

if (mode === "apply" && !campaignId) {
  throw new Error("--apply requires --campaign <id>.");
}

const campaignPlan = filePath
  ? JSON.parse(fs.readFileSync(filePath, "utf8"))
  : {
      market: "Toronto, ON",
      audience: "buyers looking for under-market homes",
      key_offer: "Under-market home list",
      intent: "buyer",
      funnel: {
        headline: "Legacy generated funnel",
        cta: "Click Learn More",
      },
    };

const result = buildWinningFunnelMigration({
  campaignId,
  campaignPlan,
  mode,
});

console.log(JSON.stringify({
  campaignId: result.campaignId,
  mode: result.mode,
  changed: result.changed,
  templateId: result.winningFunnel.funnelTemplateId,
  templateVersion: result.winningFunnel.funnelTemplateVersion,
  archivedLegacyFunnel: Boolean(result.archivedLegacyFunnel),
}, null, 2));

if (mode === "apply") {
  console.log("Apply mode is intentionally local-only in this wrapper. Persist through the approved Supabase migration runner.");
}
