import assert from "node:assert/strict";

import {
  GHL_SANDBOX_PROVIDER_ATTESTATION,
  GhlHttpClient,
  GhlSandboxAdapter,
  createEnvironmentGhlCredentialResolver,
} from "../src/lib/integrations/gohighlevel";

const sandboxGate = {
  enabled: true,
  providerEnvironment: "sandbox" as const,
  deploymentTarget: "staging" as const,
  nodeEnv: "test",
  vercelEnv: "preview",
  isolatedDatabase: true,
  actualProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  expectedProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  providerAttestation: GHL_SANDBOX_PROVIDER_ATTESTATION,
  baseUrl: "https://services.leadconnectorhq.com",
};
const token = `pit-${"w".repeat(40)}`;
const credentialResolver = createEnvironmentGhlCredentialResolver({
  GHL_SANDBOX_LOCATION_WRITE_TOKEN: token,
});

function adapterFor(fetcher: typeof fetch) {
  return new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_LOCATION_WRITE_TOKEN",
    credentialResolver,
    gate: sandboxGate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({ fetcher, sleep: async () => {} }),
  });
}

const lead = {
  id: "lead-synthetic-001",
  organizationId: "organization-synthetic-001",
  firstName: "Synthetic",
  lastName: "Lead",
  name: "Synthetic Lead",
  email: "synthetic@example.test",
  phone: null,
  source: "DealFlow synthetic test",
};

const operations = [
  {
    name: "contact_upsert",
    invoke: (adapter: GhlSandboxAdapter) => adapter.upsertContact({
      idempotencyKey: "write-contact-001",
      providerLocationId: "location-synthetic-001",
      lead,
    }),
  },
  {
    name: "opportunity_upsert",
    invoke: (adapter: GhlSandboxAdapter) => adapter.upsertOpportunity({
      idempotencyKey: "write-opportunity-001",
      providerLocationId: "location-synthetic-001",
      providerContactId: "contact-synthetic-001",
      pipelineId: "pipeline-synthetic-001",
      stageId: "stage-synthetic-001",
      opportunityName: "Synthetic opportunity",
    }),
  },
  {
    name: "tag_apply",
    invoke: (adapter: GhlSandboxAdapter) => adapter.applyTag({
      idempotencyKey: "write-tag-001",
      providerLocationId: "location-synthetic-001",
      providerContactId: "contact-synthetic-001",
      tag: "dealflow-synthetic",
    }),
  },
  {
    name: "workflow_enroll",
    invoke: (adapter: GhlSandboxAdapter) => adapter.enrollWorkflow({
      idempotencyKey: "write-workflow-001",
      providerLocationId: "location-synthetic-001",
      providerContactId: "contact-synthetic-001",
      workflowId: "workflow-synthetic-001",
    }),
  },
  {
    name: "appointment_create",
    invoke: (adapter: GhlSandboxAdapter) => adapter.syncAppointment({
      idempotencyKey: "write-appointment-001",
      providerLocationId: "location-synthetic-001",
      providerContactId: "contact-synthetic-001",
      calendarId: "calendar-synthetic-001",
      startTime: "2030-01-15T15:00:00.000Z",
      endTime: "2030-01-15T15:30:00.000Z",
      title: "Synthetic appointment",
    }),
  },
] as const;

async function main() {
for (const status of [408, 429, 500, 503]) {
  for (const operation of operations) {
    let calls = 0;
    const adapter = adapterFor(async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "synthetic ambiguous provider response" }), {
        status,
        headers: { "content-type": "application/json", "retry-after": "1" },
      });
    });
    const result = await operation.invoke(adapter);
    assert.equal(calls, 1, `${operation.name} must never retry a dispatched ${status} write`);
    assert.equal(result.outcome, "uncertain", `${operation.name} ${status} must require reconciliation`);
    assert.equal(result.providerMutationAttempted, true);
    assert.equal(JSON.stringify(result).includes(token), false);
  }
}

for (const status of [408, 429, 500, 503]) {
  for (const mode of ["create", "update"] as const) {
    let calls = 0;
    const adapter = adapterFor(async (_url, init) => {
      calls += 1;
      if (init?.method === "GET") {
        return new Response(JSON.stringify({
          customValues: mode === "update"
            ? [{ id: "custom-value-synthetic-001", name: "dealflow.headline", value: "Old" }]
            : [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "synthetic ambiguous provider response" }), {
        status,
        headers: { "content-type": "application/json", "retry-after": "1" },
      });
    });
    const result = await adapter.applyCustomValues({
      providerLocationId: "location-synthetic-001",
      values: { "dealflow.headline": "New" },
    });
    assert.equal(calls, 2, `custom-value ${mode} must perform one read and one non-retried write`);
    assert.equal(result.outcome, "uncertain", `custom-value ${mode} ${status} must require reconciliation`);
    assert.equal(result.providerMutationAttempted, true);
    assert.equal(JSON.stringify(result).includes(token), false);
  }
}

for (const operation of operations) {
  let calls = 0;
  const adapter = adapterFor(async () => {
    calls += 1;
    throw new Error("synthetic network loss after write dispatch");
  });
  const result = await operation.invoke(adapter);
  assert.equal(calls, 1, `${operation.name} transport ambiguity must not retry`);
  assert.equal(result.outcome, "uncertain");
  assert.equal(result.providerMutationAttempted, true);
}

{
  let calls = 0;
  const adapter = adapterFor(async (_url, init) => {
    calls += 1;
    if (init?.method === "GET") {
      return new Response(JSON.stringify({ customValues: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("synthetic network loss after custom-value write dispatch");
  });
  const result = await adapter.applyCustomValues({
    providerLocationId: "location-synthetic-001",
    values: { "dealflow.headline": "New" },
  });
  assert.equal(calls, 2);
  assert.equal(result.outcome, "uncertain");
  assert.equal(result.providerMutationAttempted, true);
}

for (const status of [408, 503]) {
  let calls = 0;
  const adapter = adapterFor(async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: "synthetic read outage" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await adapter.applyCustomValues({
    providerLocationId: "location-synthetic-001",
    values: { "dealflow.headline": "New" },
  });
  assert.equal(calls, 3, "safe custom-value discovery GET retains bounded read retries");
  assert.equal(result.outcome, "retryable_failure");
  assert.equal(result.providerMutationAttempted, false);
}

{
  let calls = 0;
  const adapter = new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_LOCATION_MISSING_TOKEN",
    credentialResolver: createEnvironmentGhlCredentialResolver({}),
    gate: sandboxGate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({
      fetcher: async () => {
        calls += 1;
        throw new Error("provider request must not run without a credential");
      },
      sleep: async () => {},
    }),
  });
  const result = await adapter.applyCustomValues({
    providerLocationId: "location-synthetic-001",
    values: { "dealflow.headline": "New" },
  });
  assert.equal(calls, 0, "credential resolution must fail before any provider request");
  assert.equal(result.outcome, "operator_action_required");
  assert.equal(result.providerMutationAttempted, false);
}

{
  let calls = 0;
  const adapter = adapterFor(async () => {
    calls += 1;
    throw new Error("synthetic custom-value discovery network outage");
  });
  const result = await adapter.applyCustomValues({
    providerLocationId: "location-synthetic-001",
    values: { "dealflow.headline": "New" },
  });
  assert.equal(calls, 3, "safe custom-value discovery transport retries stay bounded");
  assert.equal(result.outcome, "retryable_failure");
  assert.equal(result.providerMutationAttempted, false);
}

for (const operation of operations) {
  let calls = 0;
  const adapter = adapterFor(async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: "synthetic deterministic rejection" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await operation.invoke(adapter);
  assert.equal(calls, 1);
  assert.equal(result.outcome, "operator_action_required");
}

console.log("GHL endpoint write-ambiguity contract: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
