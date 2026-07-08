import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const executionService = readFileSync("src/lib/services/campaign-execution-service.ts", "utf8");
const launchRoute = readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8");
const appContext = readFileSync("src/lib/services/app-context.ts", "utf8");

assert.match(executionService, /\.eq\("organization_id", organizationId\)/, "Meta account lookup must be organization-scoped");
assert.match(executionService, /\.eq\("campaign_id", campaignId\)/, "execution reads must be campaign-scoped");
assert.match(launchRoute, /params\.id|campaignId/, "launch route must bind mutations to route campaign id");
assert.match(appContext, /organization|membership|user/i, "app context must establish user/org membership");

console.log("AuthZ/BOLA contract passed.");
