import assert from "node:assert/strict";
import {
  createPartnerAttributionToken,
  getPartnerAttributionCookieOptions,
  loadVerifiedPartnerDomainContext,
  normalizePartnerDomainHost,
  sanitizeVerifiedPartnerContext,
  verifyPartnerAttributionToken,
} from "../src/lib/white-label/verified-partner-domain";

async function main() {
const partnerId = "10000000-0000-4000-8000-000000000026";
const partner = {
  id: partnerId,
  slug: "verified-partner",
  brand_name: "Verified Partner",
  logo_url: "https://assets.partner.example/logo.png",
  primary_color: "#123abc",
  support_email: "Support@Partner.Example",
  powered_by_dealflow: true,
  status: "active",
  deleted_at: null,
};

assert.equal(normalizePartnerDomainHost("Portal.Partner.Example."), "portal.partner.example");
for (const invalidHost of ["localhost", "partner.example:443", "https://partner.example", "-bad.example", "bad..example"]) {
  assert.equal(normalizePartnerDomainHost(invalidHost), null, `${invalidHost} must fail closed`);
}

const sanitized = sanitizeVerifiedPartnerContext({
  domain: "portal.partner.example",
  domainPartnerId: partnerId,
  partner,
  branding: {
    theme_json: { logoUrl: "javascript:alert(1)", primaryColor: "not-a-color" },
    copy_json: {
      productName: "Partner Ads",
      loginHeadline: "Launch with Partner Ads",
      loginSubheadline: "A verified partner experience.",
      supportEmail: "support@partner.example",
    },
  },
});
assert.ok(sanitized);
assert.equal(sanitized.branding.appName, "Partner Ads");
assert.equal(sanitized.branding.logoUrl, null, "unsafe runtime logos must be removed");
assert.equal(sanitized.branding.supportEmail, "support@partner.example");
assert.equal(sanitizeVerifiedPartnerContext({
  domain: "portal.partner.example",
  domainPartnerId: partnerId,
  partner: { ...partner, status: "disabled" },
}), null);

process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET =
  "sentinel-partner-attribution-signing-key-2026";
const token = await createPartnerAttributionToken(sanitized, 2_000_000_000);
assert.ok(token);
const verified = await verifyPartnerAttributionToken(token, {
  expectedDomain: "portal.partner.example",
  nowSeconds: 2_000_000_030,
});
assert.equal(verified?.partnerId, partnerId);
assert.equal(verified?.partnerSlug, "verified-partner");
assert.equal(await verifyPartnerAttributionToken(`${token}x`, {
  nowSeconds: 2_000_000_030,
}), null, "mutated signatures must fail");
assert.equal(await verifyPartnerAttributionToken(token, {
  expectedDomain: "attacker.example",
  nowSeconds: 2_000_000_030,
}), null, "tokens must remain bound to their exact verified host");
assert.equal(await verifyPartnerAttributionToken(token, {
  nowSeconds: 2_000_086_401,
}), null, "expired attribution must fail");
assert.deepEqual(getPartnerAttributionCookieOptions(true), {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  partitioned: true,
  path: "/",
  maxAge: 86_400,
});
process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET = "a".repeat(64);
assert.equal(
  await createPartnerAttributionToken(sanitized, 2_000_000_000),
  null,
  "low-entropy signing secrets must fail closed",
);
process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET =
  "sentinel-partner-attribution-signing-key-2026";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sentinel-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sentinel-service-role-key-never-real-000000";
const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];
const responseQueue = [
  [{
    partner_id: partnerId,
    domain: "portal.partner.example",
    verification_status: "verified",
    ssl_status: "active",
    deleted_at: null,
  }],
  [partner],
  [{
    theme_json: { logoUrl: "https://assets.partner.example/logo.png" },
    copy_json: { productName: "Partner Ads" },
  }],
];
globalThis.fetch = (async (input: string | URL | Request) => {
  requestedUrls.push(String(input));
  return new Response(JSON.stringify(responseQueue.shift() ?? []), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

try {
  const resolved = await loadVerifiedPartnerDomainContext("portal.partner.example");
  assert.equal(resolved?.partnerId, partnerId);
  assert.equal(resolved?.branding.appName, "Partner Ads");
  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[0], /verification_status=eq\.verified/);
  assert.match(requestedUrls[0], /ssl_status=eq\.active/);

  const duplicateDomainRows = [
    { partner_id: partnerId, domain: "portal.partner.example" },
    { partner_id: partnerId, domain: "portal.partner.example" },
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(duplicateDomainRows), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
  assert.equal(
    await loadVerifiedPartnerDomainContext("portal.partner.example"),
    null,
    "ambiguous domain authority must fail closed",
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("verified partner-domain binding: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
