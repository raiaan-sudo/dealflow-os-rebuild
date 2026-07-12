#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const file = "src/lib/services/campaign-execution-service.ts";
const source = fs.readFileSync(file, "utf8");
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const declaration = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === "createCampaignExecutionRecord",
);

assert.ok(declaration?.body, "createCampaignExecutionRecord must remain a declared function");
const functionSource = declaration.getText(sourceFile);
const payloadStart = functionSource.indexOf(
  'const payload: Database["public"]["Tables"]["campaign_executions"]["Insert"] = {',
);
const insertStart = functionSource.indexOf('.from("campaign_executions")');

assert.ok(payloadStart >= 0, "campaign execution insert payload must remain explicit and typed");
assert.ok(insertStart > payloadStart, "typed payload must be built before the campaign execution insert");

const payloadSource = functionSource.slice(payloadStart, insertStart);
assert.match(
  functionSource,
  /const \{ supabase, organizationId \} = await requireExecutionContext\(userId\);/,
  "campaign execution creation must resolve the authenticated organization context",
);
assert.match(
  payloadSource,
  /organization_id:\s*organizationId,/,
  "campaign execution inserts must persist organization_id from the authenticated context",
);
assert.equal(
  (payloadSource.match(/organization_id\s*:/g) ?? []).length,
  1,
  "campaign execution payload must bind organization_id exactly once",
);
assert.match(
  functionSource,
  /getOwnedMetaAdAccount\(supabase, organizationId, selectedMetaAdAccountId\)/,
  "Meta account selection must stay fenced to the same organization context",
);
assert.doesNotMatch(
  payloadSource,
  /organization_id:\s*(?:config|metaAccount|userId|campaignId)/,
  "campaign execution organization_id must not come from caller-controlled launch input",
);

console.log("campaign execution tenant insert contract: PASS");
