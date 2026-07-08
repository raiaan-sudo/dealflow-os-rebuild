import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const executionService = readFileSync("src/lib/services/campaign-execution-service.ts", "utf8");
const provider = readFileSync("src/lib/integrations/meta/provider.ts", "utf8");
const instantFormContract = readFileSync("src/lib/integrations/meta/instant-form-contract.ts", "utf8");
const metaExecution = readFileSync("src/lib/integrations/meta/execution.ts", "utf8");

assert.match(executionService, /normalizeLeadFormDestinationMode/, "launch service must normalize destination mode");
assert.match(executionService, /meta_instant_form_disabled/, "instant forms must fail closed when not implemented");
assert.match(executionService, /meta_instant_form_not_implemented/, "enabled-but-unimplemented instant forms must still fail closed");
assert.match(provider, /assertMetaInstantFormEnabled\(\)/, "provider must block instant forms before markMetaPublishing");
assert.ok(
  provider.indexOf("assertMetaInstantFormEnabled()") < provider.indexOf("await markMetaPublishing()"),
  "instant-form block must happen before publishing state or external launch work",
);
assert.match(metaExecution, /link_data/, "website funnel mode still builds link-data website ads");
assert.doesNotMatch(metaExecution, /lead_gen_form_id/, "native leadgen form IDs must not be faked in website-link execution");
assert.match(instantFormContract, /payload_hash/, "instant form contract must version question payloads");
assert.match(instantFormContract, /Unsupported Meta instant form question type/, "unsupported question types must fail before launch");

console.log("Meta instant-form fail-closed contract passed.");
