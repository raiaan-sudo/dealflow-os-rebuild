import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const routePath = "src/app/api/campaigns/create/route.ts";
const routeSource = fs.readFileSync(routePath, "utf8");

class FakeApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadDestinationResolver(resolveReadyGhlDestination, prepareGhlCampaignPersonalization) {
  const sourceFile = ts.createSourceFile(routePath, routeSource, ts.ScriptTarget.Latest, true);
  const declarations = [
    "isSecureHostedDestinationUrl",
    "asGhlAuthorityRows",
    "hasLegacyCommercialActivationAuthority",
    "resolveGhlAwareWebsiteDestination",
  ].map((name) => {
    const declaration = sourceFile.statements.find(
      (statement) =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    assert.ok(declaration, `${name} must exist in ${routePath}`);
    return declaration.getText(sourceFile);
  });
  const compiled = ts.transpileModule(
    `${declarations.join("\n")}\nmodule.exports = { resolveGhlAwareWebsiteDestination };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: routePath,
    },
  ).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    ApiError: FakeApiError,
    resolveReadyGhlDestination,
    prepareGhlCampaignPersonalization,
    URL,
    Promise,
    Error,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context, { filename: `${routePath}#ghl-destination` });
  return context.module.exports.resolveGhlAwareWebsiteDestination;
}

function fakeClient(fixtures = {}) {
  const queries = [];
  const client = {
    queries,
    from(table) {
      const query = {
        table,
        columns: null,
        filters: [],
        limitCount: null,
        select(columns) {
          this.columns = columns;
          return this;
        },
        eq(column, value) {
          this.filters.push([column, value]);
          return this;
        },
        limit(count) {
          this.limitCount = count;
          return this;
        },
        then(resolve, reject) {
          queries.push({
            table: this.table,
            columns: this.columns,
            filters: this.filters.map((filter) => [...filter]),
            limitCount: this.limitCount,
          });
          const fixture = fixtures[this.table] ?? { data: [], error: null };
          return Promise.resolve(fixture).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return client;
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof FakeApiError, `expected ApiError ${code}`);
    assert.equal(error.code, code);
    return true;
  };
}

async function resolveCase({ fixtures, ready, readyError, prepareError }) {
  const client = fakeClient(fixtures);
  const readyCalls = [];
  const prepareCalls = [];
  const resolveDestination = loadDestinationResolver(
    async (input) => {
      readyCalls.push(input);
      if (readyError) throw readyError;
      return ready ?? null;
    },
    async (input) => {
      prepareCalls.push(input);
      if (prepareError) throw prepareError;
      return { personalizationId: "prepared-personalization" };
    },
  );
  const input = {
    client,
    organizationId: "organization-a",
    campaignId: "campaign-a",
    environment: "production",
    legacyDestinationUrl: "https://app.agentdealflow.io/f/legacy-a",
  };
  return { client, readyCalls, prepareCalls, input, resolveDestination };
}

{
  const test = await resolveCase({
    fixtures: {
      commercial_activations: { data: [{ id: "activation-a" }], error: null },
      ghl_provisioning_runs: { data: [{ id: "run-a", state: "ready", last_error_code: null }], error: null },
    },
    ready: {
      personalizationId: "personalization-a",
      locationMappingId: "mapping-a",
      destinationUrl: "https://funnels.example.com/realtor-a",
    },
  });
  assert.equal(
    await test.resolveDestination(test.input),
    "https://funnels.example.com/realtor-a",
    "a verified ready HTTPS GHL destination must win",
  );
  assert.equal(test.readyCalls.length, 1);
  assert.equal(test.readyCalls[0].organizationId, "organization-a");
  assert.equal(test.readyCalls[0].campaignId, "campaign-a");
  assert.equal(test.readyCalls[0].environment, "production");
  assert.equal(test.prepareCalls.length, 1);
  assert.equal(test.prepareCalls[0].campaignId, "campaign-a");
  for (const query of test.client.queries) {
    assert.ok(
      query.filters.some(([column, value]) =>
        column === "organization_id" && value === "organization-a",
      ),
      `${query.table} must be organization fenced`,
    );
    if (query.table.startsWith("ghl_")) {
      assert.ok(
        query.filters.some(([column, value]) =>
          column === "environment" && value === "production",
        ),
        `${query.table} must be environment fenced`,
      );
    }
  }
}

{
  const test = await resolveCase({
    fixtures: {
      commercial_activations: { data: [{ id: "activation-a" }], error: null },
      ghl_provisioning_runs: { data: [{ id: "run-a", state: "ready", last_error_code: null }], error: null },
    },
    ready: null,
    prepareError: new Error("manifest slot conflict that must not be surfaced"),
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_campaign_personalization_blocked"),
  );
  assert.equal(test.readyCalls.length, 0, "a failed campaign preparation must stop before resolution");
}

{
  const test = await resolveCase({
    fixtures: {
      commercial_activations: { data: [{ id: "activation-a" }], error: null },
    },
    ready: null,
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_provisioning_required"),
  );
}

{
  const test = await resolveCase({
    fixtures: {
      ghl_billing_activation_requests: {
        data: [{ id: "request-a", status: "provisioning_requested", blocker_code: null }],
        error: null,
      },
    },
    ready: null,
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_pending"),
  );
}

for (const fixtures of [
  {
    ghl_billing_activation_requests: {
      data: [{ id: "request-a", status: "blocked_configuration", blocker_code: "manifest_missing" }],
      error: null,
    },
  },
  {
    ghl_provisioning_runs: {
      data: [{ id: "run-a", state: "operator_action_required", last_error_code: "provider_uncertain" }],
      error: null,
    },
  },
]) {
  const test = await resolveCase({ fixtures, ready: null });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_blocked"),
  );
}

{
  const test = await resolveCase({
    fixtures: {
      billing_subscriptions: {
        data: [{ metadata: { legacy_commercial_activation_reconciled: true } }],
        error: null,
      },
    },
    ready: null,
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_provisioning_required"),
  );
}

{
  const test = await resolveCase({
    fixtures: {
      ghl_provisioning_runs: {
        data: [{ id: "run-a", state: "requested", last_error_code: null }],
        error: null,
      },
    },
    ready: null,
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_pending"),
  );
}

{
  const test = await resolveCase({
    fixtures: {
      commercial_activations: {
        data: null,
        error: { message: "database unavailable and intentionally not surfaced" },
      },
    },
    ready: null,
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_authority_lookup_failed"),
  );
  assert.equal(test.readyCalls.length, 0, "a failed authority read must stop before destination resolution");
}

{
  const test = await resolveCase({
    fixtures: {},
    readyError: new Error("RPC unavailable and intentionally not surfaced"),
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_resolution_failed"),
  );
}

{
  const test = await resolveCase({
    fixtures: {
      commercial_activations: { data: [{ id: "activation-a" }], error: null },
    },
    ready: {
      personalizationId: "personalization-a",
      locationMappingId: "mapping-a",
      destinationUrl: "http://funnels.example.com/realtor-a",
    },
  });
  await assert.rejects(
    test.resolveDestination(test.input),
    expectCode("ghl_destination_invalid"),
  );
}

{
  const test = await resolveCase({ fixtures: {}, ready: null });
  assert.equal(
    await test.resolveDestination(test.input),
    "https://app.agentdealflow.io/f/legacy-a",
    "only a workspace with no commercial or GHL authority may use the legacy DealFlow funnel",
  );
}

assert.match(
  routeSource,
  /if \(destinationContract\.adDestination === "website"\)[\s\S]*resolveGhlAwareWebsiteDestination/,
  "website campaigns must use the fail-closed GHL-aware resolver",
);
assert.match(
  routeSource,
  /prepareGhlCampaignPersonalization\(\{[\s\S]*campaignId: input\.campaignId/,
  "paid ready website campaigns must prepare an exact campaign-scoped GHL contract",
);
assert.match(routeSource, /campaignId,[\s\S]*environment,[\s\S]*legacyDestinationUrl/);
assert.match(
  routeSource,
  /destinationContract\.adDestination === "meta_instant_form"\s*\? await ensureMetaInstantForm/,
  "Meta Instant Form behavior must remain independently selected",
);

console.log("GHL destination fail-closed contract passed (ready/null/pending/blocked/error/invalid/legacy; no network).\n");
