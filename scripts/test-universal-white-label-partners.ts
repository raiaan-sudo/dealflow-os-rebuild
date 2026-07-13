import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_WORKSPACE_BRANDING,
  resolveWorkspaceBrandingConfig,
} from "../src/lib/white-label/workspace-branding-core";

const partnerA = "11000000-0000-4000-8000-000000000001";
const partnerB = "22000000-0000-4000-8000-000000000002";
const childA = "33000000-0000-4000-8000-000000000003";
const childB = "44000000-0000-4000-8000-000000000004";

function resolve(params: {
  workspaceId: string;
  workspacePartnerId: string;
  attributionPartnerId: string;
  configuredPartnerId: string;
  brandName: string;
  productName: string;
  color: string;
}) {
  return resolveWorkspaceBrandingConfig({
    organizationId: params.workspaceId,
    organization: {
      id: params.workspaceId,
      partner_id: params.workspacePartnerId,
    },
    attribution: {
      workspace_id: params.workspaceId,
      partner_id: params.attributionPartnerId,
      active: true,
    },
    partner: {
      id: params.configuredPartnerId,
      brand_name: params.brandName,
      primary_color: params.color,
      powered_by_dealflow: false,
      status: "active",
      deleted_at: null,
    },
    branding: {
      partner_id: params.configuredPartnerId,
      theme_json: { primaryColor: params.color },
      copy_json: {
        brandName: params.brandName,
        productName: params.productName,
      },
    },
  });
}

const brandedA = resolve({
  workspaceId: childA,
  workspacePartnerId: partnerA,
  attributionPartnerId: partnerA,
  configuredPartnerId: partnerA,
  brandName: "Synthetic Partner Alpha",
  productName: "Alpha Ads",
  color: "#1122aa",
});
const brandedB = resolve({
  workspaceId: childB,
  workspacePartnerId: partnerB,
  attributionPartnerId: partnerB,
  configuredPartnerId: partnerB,
  brandName: "Synthetic Partner Beta",
  productName: "Beta Growth",
  color: "#bb2244",
});

assert.deepEqual(
  [brandedA.partnerId, brandedA.productName, brandedA.primaryColor],
  [partnerA, "Alpha Ads", "#1122aa"],
);
assert.deepEqual(
  [brandedB.partnerId, brandedB.productName, brandedB.primaryColor],
  [partnerB, "Beta Growth", "#bb2244"],
);
assert.notEqual(brandedA.productName, brandedB.productName);

for (const crossed of [
  resolve({
    workspaceId: childA,
    workspacePartnerId: partnerA,
    attributionPartnerId: partnerB,
    configuredPartnerId: partnerB,
    brandName: "Synthetic Partner Beta",
    productName: "Beta Growth",
    color: "#bb2244",
  }),
  resolve({
    workspaceId: childB,
    workspacePartnerId: partnerB,
    attributionPartnerId: partnerB,
    configuredPartnerId: partnerA,
    brandName: "Synthetic Partner Alpha",
    productName: "Alpha Ads",
    color: "#1122aa",
  }),
]) {
  assert.deepEqual(crossed, DEFAULT_WORKSPACE_BRANDING);
}

assert.deepEqual(
  resolveWorkspaceBrandingConfig({
    organizationId: childA,
    organization: { id: childA, partner_id: partnerA },
    attribution: { workspace_id: childB, partner_id: partnerA, active: true },
    partner: { id: partnerA, status: "active", deleted_at: null },
  }),
  DEFAULT_WORKSPACE_BRANDING,
  "another child workspace cannot lend its attribution to this child",
);

const serverSource = readFileSync("src/lib/white-label/workspace-branding.ts", "utf8");
assert.match(serverSource, /\.from\("workspace_partner_attribution"\)/);
assert.match(serverSource, /\.eq\("workspace_id", organizationId\)/);
assert.match(serverSource, /\.from\("organizations"\)/);
assert.match(serverSource, /\.eq\("partner_id", partnerId\)/);
assert.match(serverSource, /attributionRows\.length !== 1/);
assert.match(serverSource, /partnerRows\.length !== 1/);
assert.match(serverSource, /brandingRows\.length > 1/);

const whiteLabelMigration = readFileSync(
  "supabase/migrations/20260531160000_create_white_label_partner_infrastructure.sql",
  "utf8",
);
assert.match(
  whiteLabelMigration,
  /partner_configs_billing_owner_check[\s\S]*billing_owner = 'dealflow'/,
  "partner branding must not replace DealFlow's merchant-of-record authority",
);

const supportDelivery = readFileSync(
  "src/lib/integrations/support/delivery-adapter.ts",
  "utf8",
);
assert.match(supportDelivery, /SUPPORT_EXTERNAL_DESTINATION/);
assert.doesNotMatch(
  supportDelivery,
  /partner_support_settings|partner_configs|support_email/,
  "partner branding must not silently redirect the durable support outbox",
);

console.log(
  "universal configuration-driven white-label partners: PASS (two partners, two child workspaces, strict cross-partner/cross-child isolation, DealFlow-owned billing/support authority)",
);
