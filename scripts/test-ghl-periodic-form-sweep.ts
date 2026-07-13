import assert from "node:assert/strict";
import {
  GhlHttpClient,
  GhlSandboxAdapter,
  createEnvironmentGhlCredentialResolver,
  type GhlHttpClientOptions,
} from "../src/lib/integrations/gohighlevel";

const gate = {
  enabled: true,
  providerEnvironment: "sandbox",
  deploymentTarget: "staging" as const,
  nodeEnv: "test",
  vercelEnv: "preview",
  isolatedDatabase: true,
  actualProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  expectedProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  providerAttestation: "DEALFLOW_GHL_SANDBOX_ONLY_V1",
  baseUrl: "https://services.leadconnectorhq.com",
};
const token = `pit-${"x".repeat(40)}`;

function submission(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `submission-${String(index).padStart(4, "0")}`,
    locationId: "location-001",
    contactId: `contact-${String(index).padStart(4, "0")}`,
    formId: "form-001",
    createdAt: "2026-07-13T12:10:00.000Z",
    email: `synthetic-${index}@example.test`,
    others: { custom_question_1: "Seller" },
    ...overrides,
  };
}

function adapter(fetcher: NonNullable<GhlHttpClientOptions["fetcher"]>) {
  return new GhlSandboxAdapter({
    credentialRef: "env:GHL_SANDBOX_LOCATION_TOKEN",
    credentialResolver: createEnvironmentGhlCredentialResolver({ GHL_SANDBOX_LOCATION_TOKEN: token }),
    gate,
    companyId: "sandbox-company",
    httpClient: new GhlHttpClient({ fetcher, sleep: async () => {} }),
  });
}

const input = {
  providerLocationId: "location-001",
  providerFormId: "form-001",
  allowedFieldIds: ["custom_question_1"],
  windowStart: "2026-07-13T12:00:00.000Z",
  windowEnd: "2026-07-13T12:30:00.000Z",
  maxPages: 10,
  maxSubmissions: 1_000,
};

async function main() {
  const captured: string[] = [];
  const coarse = adapter(async (url, init) => {
    captured.push(String(url));
    assert.equal(String(init?.method), "GET");
    assert.equal((init?.headers as Record<string, string>).Version, "v3");
    return new Response(JSON.stringify({
      submissions: [
        submission(1, { createdAt: "2026-07-13T11:00:00.000Z" }),
        submission(2),
        submission(3, { createdAt: "2026-07-13T13:00:00.000Z" }),
      ],
      meta: { total: 3, currentPage: 1, nextPage: null, prevPage: null },
    }), { status: 200, headers: { "x-request-id": "request-coarse" } });
  });
  const coarseResult = await coarse.readPeriodicFormSubmissionWindow(input);
  assert.equal(coarseResult.outcome, "succeeded");
  if (coarseResult.outcome !== "succeeded") throw new Error("expected coarse success");
  assert.deepEqual(coarseResult.submissions.map((row) => row.providerSubmissionId), ["submission-0002"]);
  assert.equal(coarseResult.observedTotal, 3);
  assert.equal(coarseResult.pageCount, 1);
  const coarseUrl = new URL(captured[0]);
  assert.equal(coarseUrl.searchParams.has("q"), false, "periodic sweep must never use the contact q filter");
  assert.equal(coarseUrl.searchParams.get("limit"), "100");
  assert.equal(coarseUrl.searchParams.get("startAt"), "2026-07-12");
  assert.equal(coarseUrl.searchParams.get("endAt"), "2026-07-14");

  const pages = Array.from({ length: 101 }, (_, index) => submission(index + 10));
  const fullPagination = adapter(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    const rows = page === 1 ? pages.slice(0, 100) : pages.slice(100);
    return new Response(JSON.stringify({
      submissions: rows,
      meta: { total: 101, currentPage: page, nextPage: page === 1 ? 2 : null, prevPage: page === 1 ? null : 1 },
    }), { status: 200, headers: { "x-request-id": `request-page-${page}` } });
  });
  const fullResult = await fullPagination.readPeriodicFormSubmissionWindow(input);
  assert.equal(fullResult.outcome, "succeeded");
  if (fullResult.outcome !== "succeeded") throw new Error("expected paginated success");
  assert.equal(fullResult.submissions.length, 101);
  assert.equal(fullResult.requestCount, 2);
  assert.equal(fullResult.pageCount, 2);

  const unstable = adapter(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    const total = page === 1 ? 101 : 102;
    return new Response(JSON.stringify({
      submissions: page === 1 ? pages.slice(0, 100) : [pages[100], submission(999)],
      meta: { total, currentPage: page, nextPage: page === 1 ? 2 : null, prevPage: page === 1 ? null : 1 },
    }), { status: 200 });
  });
  const unstableResult = await unstable.readPeriodicFormSubmissionWindow(input);
  assert.equal(unstableResult.outcome, "retryable_failure");
  assert.equal(unstableResult.errorCode, "ghl_periodic_form_sweep_pagination_unstable");
  const stableRetry = await fullPagination.readPeriodicFormSubmissionWindow(input);
  assert.equal(stableRetry.outcome, "succeeded", "same closed window must succeed once provider pagination stabilizes");

  const duplicateDrift = adapter(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return new Response(JSON.stringify({
      submissions: page === 1 ? pages.slice(0, 100) : [pages[0]],
      meta: { total: 101, currentPage: page, nextPage: page === 1 ? 2 : null, prevPage: page === 1 ? null : 1 },
    }), { status: 200 });
  });
  const duplicateResult = await duplicateDrift.readPeriodicFormSubmissionWindow(input);
  assert.equal(duplicateResult.outcome, "retryable_failure");
  assert.equal(duplicateResult.errorCode, "ghl_periodic_form_sweep_duplicate_submission");

  const conflict = adapter(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return new Response(JSON.stringify({
      submissions: page === 1 ? pages.slice(0, 100) : [{ ...pages[0], email: "changed@example.test" }],
      meta: { total: 101, currentPage: page, nextPage: page === 1 ? 2 : null, prevPage: page === 1 ? null : 1 },
    }), { status: 200 });
  });
  const conflictResult = await conflict.readPeriodicFormSubmissionWindow(input);
  assert.equal(conflictResult.outcome, "operator_action_required");
  assert.equal(conflictResult.errorCode, "ghl_periodic_form_sweep_submission_identity_conflict");

  const empty = adapter(async () => new Response(JSON.stringify({
    submissions: [], meta: { total: 0, currentPage: 1, nextPage: null, prevPage: null },
  }), { status: 200 }));
  const emptyResult = await empty.readPeriodicFormSubmissionWindow(input);
  assert.equal(emptyResult.outcome, "succeeded");
  if (emptyResult.outcome !== "succeeded") throw new Error("expected empty success");
  assert.equal(emptyResult.submissions.length, 0);

  const wrongLocation = adapter(async () => new Response(JSON.stringify({
    submissions: [submission(1, { locationId: "location-wrong" })],
    meta: { total: 1, currentPage: 1, nextPage: null, prevPage: null },
  }), { status: 200 }));
  const wrongLocationResult = await wrongLocation.readPeriodicFormSubmissionWindow(input);
  assert.equal(wrongLocationResult.outcome, "operator_action_required");

  const capped = adapter(async () => new Response(JSON.stringify({
    submissions: pages.slice(0, 100),
    meta: { total: 1001, currentPage: 1, nextPage: 2, prevPage: null },
  }), { status: 200 }));
  const cappedResult = await capped.readPeriodicFormSubmissionWindow(input);
  assert.equal(cappedResult.outcome, "operator_action_required");
  assert.equal(cappedResult.errorCode, "ghl_periodic_form_sweep_work_cap_exceeded");

  // Deterministic conservative capacity: 300 locations x two active forms =
  // 600 routes. Twenty-five just-in-time workers at the worst 30s/read provide
  // 50 route windows/minute, completing 750 within the 15m cadence (25% headroom).
  const routes = 300 * 2;
  const worstCaseWindowsPerMinute = 25 * (60 / 30);
  assert.equal(worstCaseWindowsPerMinute, 50);
  assert.ok(worstCaseWindowsPerMinute * 15 >= routes * 1.25);
  assert.equal(75 >= Math.ceil(routes / 15), true, "per-invocation cap must exceed sustained due-route rate");

  console.log("GHL periodic form sweep contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
