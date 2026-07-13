import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createHiggsfieldSourceProxyUrl,
  verifyHiggsfieldSourceProxyRequest,
} from "../src/lib/services/higgsfield-source-proxy";

process.env.INTERNAL_SYSTEM_JOBS_SECRET =
  "Synthetic-Higgsfield-Source-Signing-Authority-20260713-Alpha-9x7Q";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

const now = Date.UTC(2026, 6, 13, 12, 0, 0);
const identity = {
  assetId: "11000000-0000-4000-8000-000000000001",
  dispatchId: "12000000-0000-4000-8000-000000000001",
  organizationId: "13000000-0000-4000-8000-000000000001",
  userId: "14000000-0000-4000-8000-000000000001",
  campaignId: "15000000-0000-4000-8000-000000000001",
};

const signed = createHiggsfieldSourceProxyUrl(identity, now);
const parsed = new URL(signed);
assert.equal(parsed.origin, "https://app.example.test");
assert.equal(
  parsed.pathname,
  `/api/provider-media/higgsfield-source/${identity.assetId}`,
);
assert.deepEqual(
  verifyHiggsfieldSourceProxyRequest({ assetId: identity.assetId, url: parsed, now }),
  identity,
);

for (const mutate of [
  (url: URL) => url.searchParams.set("campaign", "25000000-0000-4000-8000-000000000001"),
  (url: URL) => url.searchParams.set("token", "0".repeat(64)),
  (url: URL) => url.searchParams.set("expires", String(Math.floor(now / 1_000) - 3600)),
]) {
  const hostile = new URL(signed);
  mutate(hostile);
  assert.equal(
    verifyHiggsfieldSourceProxyRequest({ assetId: identity.assetId, url: hostile, now }),
    null,
  );
}
assert.equal(
  verifyHiggsfieldSourceProxyRequest({
    assetId: "99999999-9999-4999-8999-999999999999",
    url: parsed,
    now,
  }),
  null,
);

const route = readFileSync(
  "src/app/api/provider-media/higgsfield-source/[assetId]/route.ts",
  "utf8",
);
for (const marker of [
  "verifyHiggsfieldSourceProxyRequest",
  "downloadVerifiedCreativeImage",
  '.eq("provider_name", "openai")',
  '.eq("operation", "openai_image_generation")',
  '.eq("state", "projected")',
  '"Cache-Control": "private, no-store, max-age=0"',
  '"X-Content-Type-Options": "nosniff"',
]) {
  assert.ok(route.includes(marker), `source proxy route missing ${marker}`);
}

const proxy = readFileSync("src/proxy.ts", "utf8");
assert.match(proxy, /pathname\.startsWith\("\/api\/provider-media\/higgsfield-source\/"\)/);

console.log(
  "Higgsfield first-party source proxy: PASS (exact tenant/campaign/asset/dispatch signature, expiry/tamper denial, projected OpenAI source binding, hardened byte proxy)",
);
