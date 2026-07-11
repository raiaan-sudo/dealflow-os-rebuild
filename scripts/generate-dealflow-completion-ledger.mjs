import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docs = path.join(root, "docs", "dealflow-completion");
const inputs = path.join(docs, "evidence", "input-audit");
const read = (file) => fs.readFileSync(path.join(inputs, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid argument pair near ${key ?? "<end>"}.`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const generatedAt = args["generated-at"];
const implementationCommit = args["implementation-commit"];

if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
  throw new Error("--generated-at must be an explicit ISO timestamp.");
}
if (!/^[0-9a-f]{40}$/.test(implementationCommit ?? "")) {
  throw new Error("--implementation-commit must be an exact 40-character Git SHA.");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function parseMarkdownTable(text, idPrefix) {
  const lines = text.split(/\r?\n/);
  let headers = null;
  const records = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (!headers && cells.some((cell) => cell === "id")) {
      headers = cells;
      continue;
    }
    if (!headers || cells[0].startsWith("---") || !cells[0].startsWith(idPrefix)) continue;
    records.push(Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""])));
  }

  return records;
}

function parseHeadingSections(text, prefixes) {
  const escaped = prefixes.join("|");
  const expression = new RegExp(`^#{2,3} ((${escaped})-\\d{3}) [—-] (.+)$`, "gm");
  const matches = [...text.matchAll(expression)];
  return matches.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return {
      id: match[1],
      title: match[3].trim(),
      body: text.slice(bodyStart, bodyEnd).trim().replace(/\n{3,}/g, "\n\n"),
    };
  });
}

function sourcePathFromEvidence(value) {
  if (!value) return null;
  const normalized = value.replaceAll("\\", "/");
  const markers = ["/src/", "/scripts/", "/supabase/", "/docs/", "/tests/", "/public/"];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      return normalized.slice(index + 1).split(/[;,:]/)[0];
    }
  }
  if (/^(src|scripts|supabase|docs|tests|public)\//.test(normalized)) {
    return normalized.split(/[;,:]/)[0];
  }
  return null;
}

function sourceExists(value) {
  const relative = sourcePathFromEvidence(value);
  return relative ? fs.existsSync(path.join(root, relative)) : false;
}

const ownerPresent = new Set(["VISION-003","VISION-012","VISION-022","VISION-033","VISION-035","VISION-036","VISION-040","VISION-041","VISION-042","PROTECTED-001","PROTECTED-002","PROTECTED-003","PROTECTED-004","REPORTED-004"]);
const ownerPartial = new Set(["VISION-001","VISION-002","VISION-004","VISION-005","VISION-006","VISION-007","VISION-008","VISION-009","VISION-010","VISION-011","VISION-014","VISION-015","VISION-020","VISION-021","VISION-023","VISION-024","VISION-025","VISION-026","VISION-027","VISION-028","VISION-029","VISION-030","VISION-031","VISION-032","VISION-039","VISION-046","VISION-047","VISION-048","VISION-049","VISION-050","VISION-051"]);
const ownerAbsent = new Set(["VISION-013","VISION-016","VISION-017","VISION-018","VISION-019","VISION-034","VISION-037","VISION-038","VISION-044"]);
const ownerNotApplicable = new Set(["VISION-043","VISION-052"]);
const ownerBlocked = new Set(["VISION-045","REPORTED-001","REPORTED-002","REPORTED-003"]);

const ownerEvidence = {
  "VISION-001":"src/app/page.tsx; src/app/privacy/page.tsx; src/app/api/onboarding/plan/route.ts",
  "VISION-002":"src/app/api/lead-capture/route.ts; src/lib/services/dashboard-service.ts",
  "VISION-003":"src/components/marketing/home-command-center.tsx; src/lib/billing/plans.ts",
  "VISION-004":"src/app/(app)/onboarding/page.tsx; src/app/api/onboarding/plan/route.ts",
  "VISION-005":"src/app/(app)/onboarding/page.tsx; src/app/api/onboarding/plan/route.ts",
  "VISION-006":"src/app/api/integrations/meta/connect/route.ts; src/app/api/integrations/meta/selections/route.ts; src/lib/services/meta-launch-service.ts",
  "VISION-007":"src/app/api/lead-capture/route.ts; src/lib/services/system-job-service.ts",
  "VISION-008":"src/lib/optimization-engine/kpi.ts; src/lib/optimization-engine/rules.ts; src/app/api/autonomy/run/route.ts",
  "VISION-009":"src/components/dashboard/campaign-dashboard-view.tsx; src/app/api/autonomy/_shared.ts",
  "VISION-010":"src/app/(app)/onboarding/page.tsx",
  "VISION-011":"src/lib/services/campaign-plan-service.ts; src/app/(app)/build/creatives/page.tsx",
  "VISION-012":"src/app/(app)/onboarding/page.tsx; src/app/(app)/launch/page.tsx; src/lib/services/meta-launch-service.ts",
  "VISION-013":"canonical tracked-source search: no DST-aware 09:00 America/New_York scheduler",
  "VISION-014":"src/app/api/lead-capture/route.ts; src/lib/services/system-job-service.ts",
  "VISION-015":"src/app/(app)/dashboard/page.tsx",
  "VISION-016":"absent GHL client/provisioning/migration; src/lib/services/fulfillment-monitor-service.ts",
  "VISION-017":"src/lib/services/campaign-persistence.ts; src/app/f/[slug]/page.tsx; no GHL publisher",
  "VISION-018":"src/lib/services/system-job-service.ts; src/lib/services/fulfillment-monitor-service.ts",
  "VISION-019":"no canonical snapshot install/version/verification implementation",
  "VISION-020":"src/proxy.ts; scripts/test-ghl-iframe-embed-security.mjs",
  "VISION-021":"src/proxy.ts; src/lib/services/fulfillment-monitor-service.ts",
  "VISION-022":"src/app/(app)/onboarding/page.tsx",
  "VISION-023":"src/lib/services/billing-service.ts; absent /api/activation/events and /api/billing/status at baseline",
  "VISION-024":"src/app/api/generate-funnel/route.ts; src/lib/services/funnel-engine.ts",
  "VISION-025":"src/lib/services/video-generation-job.ts; src/lib/services/static-creative-asset-service.ts",
  "VISION-026":"src/app/api/generate-creatives/route.ts",
  "VISION-027":"src/lib/optimization-engine/rules.ts; src/app/api/campaigns/[id]/optimize/route.ts; src/app/api/autonomy/run/route.ts",
  "VISION-028":"src/lib/services/campaign-plan-service.ts; src/app/api/generate-funnel/route.ts; src/app/api/autonomy/_shared.ts",
  "VISION-029":"src/app/api/integrations/meta/connect/route.ts; src/lib/services/billing-service.ts",
  "VISION-030":"src/components/layout/feedback-widget.tsx; src/app/api/feedback/route.ts",
  "VISION-031":"src/components/layout/feedback-widget.tsx; no durable support-ticket/outbox schema at baseline",
  "VISION-032":"src/app/(app)/paywall/page.tsx; src/lib/billing/plans.ts; src/app/api/billing/checkout/route.ts",
  "VISION-033":"src/lib/services/billing-service.ts; src/lib/services/access-key-service.ts",
  "VISION-034":"src/lib/services/credit-service.ts; no activation-linked initial-credit grant at baseline",
  "VISION-035":"src/lib/services/credit-service.ts",
  "VISION-036":"src/lib/services/credit-service.ts; src/lib/services/session-cost-guard.ts; supabase/migrations/20260430190000_create_user_credits.sql",
  "VISION-037":"src/lib/services/first-week-success-service.ts; no retention/churn metric model",
  "VISION-038":"src/lib/services/billing-service.ts; no MRR model/dashboard",
  "VISION-039":"src/lib/services/creative-ops-qa-service.ts; src/lib/services/creative-scoring-service.ts; src/lib/copy/offer-consistency.ts",
  "VISION-040":"src/app/globals.css; src/app/(app)/layout.tsx; src/components/layout/sidebar.tsx",
  "VISION-041":"src/app/(app)/onboarding/page.tsx",
  "VISION-042":"src/app/(app)/paywall/page.tsx; src/lib/services/billing-service.ts",
  "VISION-043":"change-control requirement; not a runtime capability",
  "VISION-044":"src/app/f/[slug]/page.tsx; no executable GHL migration/provider path at baseline",
  "VISION-045":"owner estimate; static percentage not derivable",
  "VISION-046":"src/lib/services/app-context.ts; supabase/migrations/20260428170000_harden_rpc_and_tenant_rls.sql; src/lib/white-label/partner-billing-config.ts",
  "VISION-047":"src/app/api/integrations/meta/callback/route.ts; src/lib/services/billing-service.ts; GHL source-of-record absent",
  "VISION-048":"src/app/api/autonomy/_shared.ts; src/lib/services/autonomy-execution-service.ts",
  "VISION-049":"src/lib/services/billing-service.ts; absent activation endpoint at baseline",
  "VISION-050":"docs/dealflow-completion/BASELINE_MANIFEST.md; no baseline guard at immutable HEAD",
  "VISION-051":"src/components/auth/login-form.tsx; src/app/(app)/admin/issues/page.tsx; src/app/api/meta/data-deletion/route.ts; src/app/(app)/admin/command-center/page.tsx",
  "VISION-052":"change-control requirement; not a runtime capability",
  "PROTECTED-001":"src/app/globals.css; src/app/(app)/layout.tsx",
  "PROTECTED-002":"src/app/(app)/onboarding/page.tsx",
  "PROTECTED-003":"src/app/(app)/paywall/page.tsx; src/lib/services/billing-service.ts",
  "PROTECTED-004":"package.json; canonical campaign/funnel/creative/Meta/billing/lead/job/RLS infrastructure",
  "REPORTED-001":"src/app/api/lead-capture/route.ts; src/lib/services/system-job-service.ts; dynamic fixture required",
  "REPORTED-002":"src/app/api/integrations/meta/selections/route.ts; src/app/(app)/launch/page.tsx; provider fixture required",
  "REPORTED-003":"src/app/(app)/dashboard/page.tsx; src/app/api/autonomy/_shared.ts; affected-customer state not accessed",
  "REPORTED-004":"src/app/api/autonomy/run/route.ts; src/app/api/autonomy/_shared.ts; src/lib/services/autonomy-execution-service.ts"
};

const findingConfirmed = new Set(["FIND-001","FIND-002","FIND-003","FIND-004","FIND-005","FIND-007","FIND-008","FIND-009","FIND-010","FIND-011","FIND-012","FIND-013","FIND-015","FIND-016","FIND-019","FIND-020","FIND-021","FIND-022","FIND-023","FIND-024","FIND-027","FIND-028","FIND-029","FIND-031","FIND-032","FIND-033","FIND-034","FIND-036","FIND-040","FIND-041","FIND-042","FIND-047","FIND-048","FIND-049","FIND-050","FIND-051","FIND-053","FIND-056"]);
const findingStale = new Set(["FIND-006","FIND-017","FIND-026","FIND-030","FIND-043"]);
const findingContradicted = new Set(["FIND-014","FIND-018","FIND-025","FIND-052","FIND-054"]);
const findingNotApplicable = new Set(["FIND-039","FIND-044"]);
const findingBlocked = new Set(["FIND-035","FIND-037","FIND-038","FIND-045","FIND-046","FIND-055"]);

const findingCalibration = {
  "FIND-006":"Cited GHL mapping migration/service are absent from canonical HEAD; missing GHL is tracked as a new requirement gap.",
  "FIND-014":"Provider/storage fields in the audited client DTO are absent from canonical HEAD; residual QA fields require narrower review.",
  "FIND-017":"Cited GHL client is absent from canonical HEAD.",
  "FIND-018":"Canonical selection and launch both require generic creative; audited UGC mismatch is absent.",
  "FIND-025":"Canonical Vercel cron directly processes static/video jobs; cited separate Marketing Studio worker is absent.",
  "FIND-026":"No Higgsfield module/provider/temp path exists in canonical HEAD.",
  "FIND-030":"Cited partner_configs policy/migration is absent from canonical HEAD.",
  "FIND-039":"Multiple-checkout governance is resolved for this run by the proven isolated implementation clone.",
  "FIND-043":"Cited partner CRM retry producer/service is absent from canonical HEAD.",
  "FIND-044":"Prior audit probe decision, not canonical product behavior.",
  "FIND-052":"Canonical HEAD contains CI and security workflows.",
  "FIND-054":"Canonical proxy explicitly implements host-based app/apex redirects; source/runtime behavior is no longer contradictory.",
  "FIND-035":"Rendered geometry/assistive impact requires browser proof.",
  "FIND-037":"Cross-browser/zoom/screen-reader/authenticated matrices require isolated runtime fixtures.",
  "FIND-038":"Core deployment/source ancestry was proven by the lead; separately deployed surfaces remain blocked.",
  "FIND-045":"Canonical tests are present; execution evidence is maintained in TEST_AND_PROOF_MATRIX.md.",
  "FIND-046":"Live schema/RLS parity requires approved sanitized database evidence.",
  "FIND-055":"Marketing runtime impact requires measured LCP/CLS/INP/long-task evidence."
};

const overridesPath = path.join(docs, "issue-ledger-overrides.json");
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, "utf8")) : {};
const rows = [];

const proofTemplates = {
  launch_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:launch truth, schedule, provider route, receipt service, fencing migration, and tests",
    tests: "node scripts/test-launch-truth-and-schedule.mjs; node scripts/test-lead-tracking-health.mjs; test:dealflow-completion",
    negative_failure_path_proof: "Query-string success is ignored; due intent, billing, explicit gates, selected assets, PAUSED provider state, lock, and fenced receipt are required.",
    integrated_proof: "Offline/static integration passed; database and provider execution are blocked by NEW-001 and external authorization.",
    residual_risk: "Fresh-schema and live provider acceptance were not performed.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  job_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:system job lease, worker, per-effect ledger, tenant constraints, services, and deterministic tests",
    tests: "node scripts/test-reliability-wave.mjs; node scripts/test-internal-sms-notifications.mjs; test:dealflow-completion",
    negative_failure_path_proof: "Lease generation/token CAS rejects stale writes; successful effects are reused; failed required effects prevent parent completion.",
    integrated_proof: "Deterministic worker/effect tests passed; database execution is blocked by NEW-001.",
    residual_risk: "Ambiguous external provider execution still relies on provider-specific idempotency/reconciliation.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  tenant_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:active-workspace asset/job/lead scoping, server storage deletion, composite tenant constraints, and isolation checks",
    tests: "node scripts/check-tenant-isolation.mjs; node scripts/test-reliability-wave.mjs; routes:security; npm run typecheck",
    negative_failure_path_proof: "Cross-workspace campaign references are rejected by composite keys; ambiguous legacy campaigns fail closed; caller-owned storage RLS is not used for deletion.",
    integrated_proof: "Source/static tenancy checks passed; executable RLS/database proof is blocked by NEW-001.",
    residual_risk: "Authenticated cross-tenant fixture proof was not runnable without a valid migrated database.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  meta_contract_verified: {
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    changed_files_commits: "FILES:central Meta v23 contract, OAuth routes, bearer requests, execution/status services, deletion contract, and tests",
    tests: "node scripts/test-meta-contract-hardening.mjs; node scripts/test-reliability-wave.mjs; test:dealflow-completion",
    negative_failure_path_proof: "Backslash/network-path returns fail; tokens are bearer-only; live writes stay gated and PAUSED; stale/replayed deletion callbacks retain stable responsibility evidence.",
    integrated_proof: "No-network Meta contract suite passed.",
    residual_risk: "Real OAuth scopes, account discovery, CAPI, and provider writes remain externally blocked.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  security_verified: {
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    changed_files_commits: "FILES:route-security AST checks, centralized log sanitization, QA production exclusion, same-origin/error gates, and tests",
    tests: "node scripts/test-security-config-truth.mjs; routes:security; smoke:offline; npm run typecheck",
    negative_failure_path_proof: "Decoy guards fail analysis; QA credential mutation is absent; production 5xx is generic; representative OpenAI/Supabase/Meta/Stripe/GitHub/Twilio secrets are redacted.",
    integrated_proof: "Security/config and route suites passed.",
    residual_risk: "Static route analysis is not a substitute for authenticated adversarial runtime testing.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  lead_safe_verified: {
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    changed_files_commits: "FILES:synthetic no-write load path, loopback load script, durable lead recovery, tenant authority, and tests",
    tests: "node scripts/test-security-config-truth.mjs; node scripts/test-reliability-wave.mjs; smoke:offline",
    negative_failure_path_proof: "Load requests return before lead/tracking/job/provider writes; recovery converges on one lead-side-effect job; non-loopback targets are refused.",
    integrated_proof: "Static and deterministic no-network tests passed.",
    residual_risk: "No production/shared database load was performed.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  onboarding_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:onboarding contract, server draft, deterministic tenant-scoped campaign identity, activation/credit RPC, billing recovery, migration, and tests",
    tests: "node scripts/test-onboarding-activation-billing-contract.mjs; node scripts/test-access-key-commercial-activation.mjs; test:dealflow-completion",
    negative_failure_path_proof: "Unknown fields, non-realtor payloads, budget disagreement, stale navigation, zero/unpaid/noninitial payments, cross-tenant IDs, and duplicate activation are rejected.",
    integrated_proof: "Contract/policy tests passed; database execution is blocked by NEW-001.",
    residual_risk: "Production payment/webhook and concurrency acceptance were intentionally not performed.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  ui_local_verified: {
    canonical_status: "IMPLEMENTED_AND_LOCALLY_VERIFIED",
    changed_files_commits: "FILES:titles, main/skip landmarks, focus states, live regions, selected-state semantics, truthful loading/error copy, and accessibility tests",
    tests: "node scripts/test-accessibility-truth-contract.mjs; smoke:offline; local root/login desktop/mobile browser inspection",
    negative_failure_path_proof: "Missing/failed/unavailable states no longer render false success; keyboard-visible focus and screen-reader live regions are present in source.",
    integrated_proof: "Offline accessibility suite and anonymous local browser views passed.",
    residual_risk: "Authenticated role/error states, screen readers, zoom, and cross-browser matrices remain not proven.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  support_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:support request contract, retry-stable UUID, route, atomic ticket/outbox RPC, fenced processor, and tests",
    tests: "node scripts/test-support-ticket-contract.mjs; npm run typecheck",
    negative_failure_path_proof: "Concurrent/repeated requests recover the same ticket/outbox; authenticated users cannot delete tickets; stale outbox claims are fenced.",
    integrated_proof: "Contract tests passed; database execution is blocked by NEW-001.",
    residual_risk: "External operator mailbox delivery was intentionally not exercised.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  ghl_db_blocked: {
    canonical_status: "FAKE_ONLY_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:GHL fake-only adapter/gates, tenant repository, atomic outbox claim/settlement, PII-free fake lead processor, migration, and tests",
    tests: "node scripts/test-ghl-tenant-provisioning.mjs; npm run typecheck",
    negative_failure_path_proof: "Real adapter is absent; production fake lead execution is denied; claim tokens/generations fence stale settlement; payloads contain no lead PII.",
    integrated_proof: "Deterministic fake-only and isolated fixture-fragment tests passed; full migration-chain execution is blocked by NEW-001.",
    residual_risk: "No sanctioned real provider contract, snapshot identity, permissions, webhooks, rate limits, or live acceptance proof exists.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  release_guard_verified: {
    canonical_status: "IMPLEMENTED_GUARD_VERIFIED_PRODUCTION_ATTESTATION_BLOCKED",
    changed_files_commits: "FILES:guard v4 protected external trust root, candidate-policy digest authorization, exact-deployment environment/drain contract, integration test, and package commands",
    tests: "npm run test:release-guard; final exact-target release guard recorded in external bundle",
    negative_failure_path_proof: "Unsigned, self-signed, unpinned, stale/future, digest-tampered, wrong-target/source/project/deployment, unsafe environment, weak-secret, nonzero drain, dirty tree, and nonexact target evidence all fail closed.",
    integrated_proof: "A runtime test authority passes only through a protected outside-repository policy with an independently supplied digest; target-added self-authorization fails and audit-preview is always non-gating.",
    residual_risk: "The repository production trust policy is intentionally unconfigured; authoritative environment/drain evidence is absent, so release remains NO_GO.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  optimizer_db_blocked: {
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    changed_files_commits: "FILES:versioned optimization safety contract, append-only decision service/migration, POST routes, and tests",
    tests: "node scripts/test-optimization-evidence-safety.mjs; test:dealflow-completion",
    negative_failure_path_proof: "Missing/stale/invalid/unapproved evidence yields HOLD_NO_ACTION; replays do not mutate existing decisions; live actions are constrained false.",
    integrated_proof: "Deterministic policy tests passed; database execution is blocked by NEW-001.",
    residual_risk: "No owner-approved optimization policy is configured.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  partial_csp_blocked: {
    canonical_status: "PARTIAL_SECURITY_HARDENING",
    changed_files_commits: "FILES:nonce-bound script CSP, exact matcher, and surface-specific provider policies",
    tests: "smoke:offline; local CSP header/script nonce inspection",
    negative_failure_path_proof: "script-src omits unsafe-inline and every locally rendered Next script matched the response nonce.",
    integrated_proof: "Anonymous local root returned a matching nonce CSP and script tags.",
    residual_risk: "Framework-managed inline styles still require style-src unsafe-inline.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
};

function addRow(input) {
  const key = input.ledger_key ?? `${input.object_type}:${input.id}`;
  const selectedOverride = overrides[key] ?? overrides[input.id] ?? {};
  const rawOverride = {
    ...(selectedOverride.proof_template
      ? proofTemplates[selectedOverride.proof_template] ?? {}
      : {}),
    ...selectedOverride,
  };
  delete rawOverride.proof_template;
  const override = {
    ...rawOverride,
    ...(typeof rawOverride.changed_files_commits === "string" && rawOverride.changed_files_commits.startsWith("FILES:")
      ? {
          changed_files_commits: `${implementationCommit}; ${rawOverride.changed_files_commits.slice("FILES:".length).trim()}`,
        }
      : {}),
  };
  const inputChangedFiles =
    typeof input.changed_files_commits === "string" && input.changed_files_commits.startsWith("FILES:")
      ? `${implementationCommit}; ${input.changed_files_commits.slice("FILES:".length).trim()}`
      : input.changed_files_commits;
  const row = {
    ledger_key: key,
    id: input.id,
    object_type: input.object_type,
    original_claim: input.original_claim ?? "",
    canonical_status: input.canonical_status ?? "EVIDENCE_BLOCKED_WITHOUT_STRONGER_CLAIM",
    root_cause_invariant: input.root_cause_invariant ?? "",
    affected_surface_files_data: input.affected_surface_files_data ?? "",
    owner_requirement: input.owner_requirement ?? "",
    implementation_disposition: input.implementation_disposition ?? "RECONCILE",
    failing_before_evidence: input.failing_before_evidence ?? "",
    changed_files_commits: inputChangedFiles ?? "No candidate change is mapped to this accounting row.",
    tests: input.tests ?? "No dedicated executable proof is mapped; see the final disposition and residual risk.",
    negative_failure_path_proof: input.negative_failure_path_proof ?? "No stronger negative-path claim is made beyond the cited canonical evidence or blocker.",
    integrated_proof: input.integrated_proof ?? "Reconciled in the integrated ledger without promoting source presence to runtime proof.",
    residual_risk: input.residual_risk ?? "",
    final_status: input.final_status ?? "BLOCKED_BY_EXTERNAL_AUTHORITY",
    ...override,
  };
  const requiredFallbacks = {
    original_claim: `${input.id} is a tracked DealFlow requirement or audit disposition.`,
    canonical_status: "EVIDENCE_BLOCKED_WITHOUT_STRONGER_CLAIM",
    root_cause_invariant:
      "The cited requirement must remain evidence-bound; source presence alone cannot establish runtime, tenant, provider, customer, or release truth.",
    implementation_disposition: "RECONCILE_WITH_CITED_EVIDENCE_AND_FINAL_DISPOSITION",
    failing_before_evidence:
      "The canonical input did not contain stronger executable evidence for this row.",
    changed_files_commits:
      "No candidate change is mapped to this accounting row.",
    tests:
      "No dedicated executable proof is mapped; see the final disposition and residual risk.",
    negative_failure_path_proof:
      "No stronger negative-path claim is made beyond the cited canonical evidence or blocker.",
    integrated_proof:
      "Reconciled in the integrated ledger without promoting source presence to runtime proof.",
    residual_risk:
      row.final_status === "IMPLEMENTED_AND_VERIFIED"
        ? "Proof is limited to the cited candidate profile; deployment, provider, customer, and uncited variants are not inferred."
        : row.final_status === "VERIFIED_ALREADY_CORRECT"
          ? "The cited behavior is preserved, but uncited runtime, provider, customer, and regression variants remain outside this proof."
          : row.final_status === "STALE_OR_SUPERSEDED_WITH_EVIDENCE"
            ? "The superseded behavior could recur through an unproven source or deployment until complete ancestry and release evidence are established."
            : row.final_status === "OWNER_APPROVED_OUT_OF_SCOPE"
              ? "A future scope or owner-decision change requires this disposition and its safety boundary to be revalidated."
              : row.final_status === "NOT_APPLICABLE_WITH_EVIDENCE"
                ? "Applicability must be rechecked if product scope, provider contracts, data flows, or deployment ownership change."
                : "The cited runtime, external, provider, deployment, or owner evidence remains unavailable and prevents a stronger conclusion.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  };
  for (const [field, fallback] of Object.entries(requiredFallbacks)) {
    if (typeof row[field] !== "string" || !row[field].trim()) {
      row[field] = fallback;
    }
  }
  rows.push(row);
}

const ownerSections = parseHeadingSections(read("DEALFLOW-OWNER-VISION-LEDGER.md"), ["VISION","PROTECTED","REPORTED"]);
for (const record of ownerSections) {
  const canonicalStatus = ownerPresent.has(record.id)
    ? "PROVEN_PRESENT"
    : ownerPartial.has(record.id)
      ? "PARTIAL"
      : ownerAbsent.has(record.id)
        ? "ABSENT"
        : ownerNotApplicable.has(record.id)
          ? "NOT_APPLICABLE"
          : ownerBlocked.has(record.id)
            ? "BLOCKED_DYNAMIC"
            : "EVIDENCE_BLOCKED_WITHOUT_STRONGER_CLAIM";
  const finalStatus = canonicalStatus === "PROVEN_PRESENT"
    ? "VERIFIED_ALREADY_CORRECT"
    : canonicalStatus === "NOT_APPLICABLE"
      ? "OWNER_APPROVED_OUT_OF_SCOPE"
      : canonicalStatus === "BLOCKED_DYNAMIC"
        ? "BLOCKED_BY_EXTERNAL_AUTHORITY"
        : "BLOCKED_BY_EXTERNAL_AUTHORITY";
  addRow({
    id: record.id,
    object_type: record.id.split("-")[0],
    original_claim: `${record.title}. ${record.body}`,
    canonical_status: canonicalStatus,
    root_cause_invariant: canonicalStatus === "PARTIAL" || canonicalStatus === "ABSENT" ? "Approved owner outcome is incomplete or missing in canonical source." : "",
    affected_surface_files_data: ownerEvidence[record.id] ?? "See canonical source reconciliation.",
    owner_requirement: record.id,
    implementation_disposition: canonicalStatus === "PROVEN_PRESENT" ? "PRESERVE_AND_REGRESSION_PROTECT" : canonicalStatus === "NOT_APPLICABLE" ? "CHANGE_CONTROL_ONLY" : "CONTROLLED_WAVE_OR_EXPLICIT_BLOCKER",
    failing_before_evidence: ownerEvidence[record.id] ?? "",
    residual_risk: canonicalStatus === "BLOCKED_DYNAMIC" ? "Requires isolated runtime or authorized external evidence." : "",
    final_status: finalStatus,
  });
}

const findingLedger = readJson("22_MASTER_FINDING_AND_DECISION_LEDGER.json").records;
for (const finding of findingLedger) {
  const canonicalStatus = findingConfirmed.has(finding.id)
    ? "CONFIRMED_CANONICAL"
    : findingStale.has(finding.id)
      ? "STALE_NOT_PRESENT"
      : findingContradicted.has(finding.id)
        ? "CONTRADICTED_BY_CANONICAL"
        : findingNotApplicable.has(finding.id)
          ? "NOT_APPLICABLE"
          : findingBlocked.has(finding.id)
            ? "BLOCKED_DYNAMIC"
            : "EVIDENCE_BLOCKED_WITHOUT_STRONGER_CLAIM";
  const finalStatus = canonicalStatus === "STALE_NOT_PRESENT"
    ? "STALE_OR_SUPERSEDED_WITH_EVIDENCE"
    : canonicalStatus === "CONTRADICTED_BY_CANONICAL"
      ? "VERIFIED_ALREADY_CORRECT"
      : canonicalStatus === "NOT_APPLICABLE"
        ? "NOT_APPLICABLE_WITH_EVIDENCE"
        : canonicalStatus === "BLOCKED_DYNAMIC"
          ? "BLOCKED_BY_EXTERNAL_AUTHORITY"
          : "BLOCKED_BY_EXTERNAL_AUTHORITY";
  addRow({
    id: finding.id,
    object_type: "FINDING",
    original_claim: `${finding.title}. ${finding.current_behavior}`,
    canonical_status: canonicalStatus,
    root_cause_invariant: finding.root_cause,
    affected_surface_files_data: finding.evidence,
    owner_requirement: finding.owner_decision,
    implementation_disposition: canonicalStatus === "CONFIRMED_CANONICAL" ? "FIX_OR_EVIDENCE_BACKED_BLOCK" : canonicalStatus,
    failing_before_evidence: findingCalibration[finding.id] ?? finding.evidence,
    residual_risk: finding.contradictions_unknowns,
    final_status: finalStatus,
  });
}

for (const record of parseMarkdownTable(read("23_BLOCKERS_SKIPPED_SAFETY_AND_NOT_PROVEN.md"), "BLK-")) {
  const resolvedStale = new Set(["BLK-001","BLK-002","BLK-003","BLK-004","BLK-016","BLK-017"]);
  const resolvedVerified = new Set(["BLK-005","BLK-006"]);
  const resolvedCore = new Set([...resolvedStale, ...resolvedVerified]);
  const finalStatus = resolvedStale.has(record.id)
    ? "STALE_OR_SUPERSEDED_WITH_EVIDENCE"
    : resolvedVerified.has(record.id)
      ? "VERIFIED_ALREADY_CORRECT"
      : record.id === "BLK-021"
        ? "OWNER_APPROVED_OUT_OF_SCOPE"
        : "BLOCKED_BY_EXTERNAL_AUTHORITY";
  addRow({id:record.id,object_type:"BLOCKER",original_claim:record.exact_blocker,canonical_status:resolvedCore.has(record.id)?"RESOLVED_OR_RECALIBRATED":"ACTIVE_BOUNDARY",root_cause_invariant:record.area,affected_surface_files_data:record.resolution_evidence,implementation_disposition:"PRESERVE_EXACT_BLOCKER_OR_RESOLUTION",failing_before_evidence:record.exact_blocker,residual_risk:record.status,final_status:finalStatus});
}

for (const record of parseMarkdownTable(read("21_CONTRADICTIONS_AND_DRIFT.md"), "CONTRA-")) {
  const related = record.related_evidence;
  const stale = [...findingStale, ...findingContradicted].some((id) => related.includes(id));
  addRow({id:record.id,object_type:"CONTRADICTION",original_claim:record.contradiction,canonical_status:stale?"STALE_OR_RESOLVED":"CONFIRMED_OR_REQUIRES_PROOF",affected_surface_files_data:related,implementation_disposition:stale?"CLOSE_WITH_CANONICAL_EVIDENCE":"FIX_WITH_RELATED_FINDING",failing_before_evidence:related,final_status:stale?"STALE_OR_SUPERSEDED_WITH_EVIDENCE":"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of parseMarkdownTable(read("20_DEAD_DUPLICATE_LEGACY_EXCESSIVE_LOGIC.md"), "DEBT-")) {
  const inScope = new Set(["DEBT-012","DEBT-015","DEBT-016","DEBT-017","DEBT-018","DEBT-019"]);
  const stale = new Set(["DEBT-013","DEBT-014"]);
  addRow({id:record.id,object_type:"DEBT",original_claim:record.description,canonical_status:stale.has(record.id)?"STALE_NONCANONICAL":inScope.has(record.id)?"CONFIRMED_CANONICAL":"PRESERVED_OUTSIDE_PRODUCT_DIFF",root_cause_invariant:record.classification,affected_surface_files_data:record.evidence,implementation_disposition:inScope.has(record.id)?"CONTROLLED_WAVE":"NO_DELETION_OR_CLEANUP_AUTHORIZED",failing_before_evidence:record.evidence,final_status:stale.has(record.id)?"STALE_OR_SUPERSEDED_WITH_EVIDENCE":inScope.has(record.id)?"BLOCKED_BY_EXTERNAL_AUTHORITY":"OWNER_APPROVED_OUT_OF_SCOPE"});
}

for (const record of readJson("08_PRODUCT_FEATURE_ATLAS.json").records) {
  const ownerOutOfScope = record.id === "FEAT-036" || record.id === "FEAT-037";
  const publicVerified = new Set(["FEAT-001","FEAT-002","FEAT-004"]);
  addRow({id:record.id,object_type:"FEATURE",original_claim:`${record.name}. ${record.current_verified_behavior}`,canonical_status:"CANONICAL_RECONCILIATION_RECORDED",affected_surface_files_data:record.related_routes_workflows,implementation_disposition:"PRESERVE_OR_RECONCILE_WITH_OWNER_MATRIX",failing_before_evidence:record.problems_or_contradictions,owner_requirement:record.owner_question,residual_risk:ownerOutOfScope?"Experimental suite is preserved but not promoted into the core product.":publicVerified.has(record.id)?"Public build/browser proof only; authenticated variants are tracked separately.":"Feature-level dynamic acceptance is blocked by NEW-001 and/or explicit external authority.",final_status:ownerOutOfScope?"OWNER_APPROVED_OUT_OF_SCOPE":publicVerified.has(record.id)?"VERIFIED_ALREADY_CORRECT":"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of parseHeadingSections(read("10_END_TO_END_WORKFLOW_DOSSIERS.md"), ["FLOW"])) {
  const outOfScope = record.id === "FLOW-015" || record.id === "FLOW-016";
  addRow({id:record.id,object_type:"WORKFLOW",original_claim:`${record.title}. ${record.body}`,canonical_status:outOfScope?"OWNER_APPROVED_OUT_OF_SCOPE":"REQUIRES_GOLDEN_JOURNEY_PROOF",implementation_disposition:outOfScope?"DO_NOT_PROMOTE":"PROVE_WITH_SYNTHETIC_FIXTURES",failing_before_evidence:record.body,final_status:outOfScope?"OWNER_APPROVED_OUT_OF_SCOPE":"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of readJson("11_BUSINESS_RULE_CATALOG.json").records) {
  const truthStatus = String(record.truth_status ?? "").toUpperCase();
  const finalStatus = truthStatus === "CONFIRMED"
    ? "VERIFIED_ALREADY_CORRECT"
    : truthStatus === "CONTRADICTED"
      ? "STALE_OR_SUPERSEDED_WITH_EVIDENCE"
      : "BLOCKED_BY_EXTERNAL_AUTHORITY";
  addRow({id:record.id,object_type:"RULE",original_claim:record.rule,canonical_status:record.truth_status,root_cause_invariant:record.source_of_truth,affected_surface_files_data:record.evidence_or_gap,implementation_disposition:"PRESERVE_OR_RECONCILE",failing_before_evidence:record.evidence_or_gap,final_status:finalStatus});
}

for (const record of parseMarkdownTable(read("12_STATE_MACHINE_CATALOG.md"), "STATE-")) {
  const stale = record.id === "STATE-008";
  addRow({id:record.id,object_type:"STATE_MACHINE",original_claim:`${record.name ?? record.machine ?? record["state machine"] ?? ""}: ${record.states ?? record.transitions ?? Object.values(record)[2] ?? ""}`,canonical_status:stale?"STALE_NONCANONICAL":"REQUIRES_TRANSITION_PROOF",affected_surface_files_data:Object.values(record).join("; "),implementation_disposition:stale?"REPLACE_WITH_NEW_GHL_FOUNDATION":"MODEL_AND_TEST",failing_before_evidence:Object.values(record).join("; "),final_status:stale?"STALE_OR_SUPERSEDED_WITH_EVIDENCE":"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of parseCsv(read("13_DATA_MODEL_TENANCY_MATRIX.csv"))) {
  addRow({id:record.id,object_type:"DATA_ENTITY",original_claim:`${record.entity}: ${record.purpose}`,canonical_status:sourceExists(record.observed_control)?"SOURCE_PRESENT_LIVE_SCHEMA_UNPROVEN":"LIVE_SCHEMA_NOT_PROVEN",root_cause_invariant:record.intended_tenant_key,affected_surface_files_data:record.observed_control,implementation_disposition:"LOCAL_MIGRATION_RLS_AND_FIXTURE_PROOF",failing_before_evidence:record.live_schema_status,residual_risk:record.sensitivity,final_status:"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of parseMarkdownTable(read("14_INTEGRATION_CONTRACTS_AND_CONFIGURATION.md"), "INT-")) {
  const stale = record.id === "INT-004" || record.id === "INT-006" || record.id === "INT-010" || record.id === "INT-011";
  addRow({id:record.id,object_type:"INTEGRATION",original_claim:Object.values(record).join("; "),canonical_status:stale?"STALE_OR_MISSING_CANONICAL_INTEGRATION":"CONTRACT_PRESENT_LIVE_PROOF_BLOCKED",affected_surface_files_data:Object.values(record).join("; "),implementation_disposition:"OFFLINE_CONTRACT_FIXTURE_OR_EXTERNAL_BLOCK",failing_before_evidence:Object.values(record).join("; "),final_status:stale?"STALE_OR_SUPERSEDED_WITH_EVIDENCE":"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

for (const record of parseCsv(read("09_UI_ACTION_TRACE_MATRIX.csv"))) {
  const present = sourceExists(record.key_evidence);
  addRow({id:record.id,object_type:"UI_ACTION",original_claim:`${record.family}: ${record.trigger} -> ${record.downstream_consequence}`,canonical_status:present?"SOURCE_PRESENT":"STALE_NONCANONICAL_SOURCE",affected_surface_files_data:record.key_evidence,implementation_disposition:present?"PRESERVE_AND_TEST":"CLOSE_AS_STALE",failing_before_evidence:record.key_evidence,residual_risk:present?`${record.mutation_classification}; authenticated/provider action was not executed under the safety boundary.`:record.mutation_classification,final_status:present?"BLOCKED_BY_EXTERNAL_AUTHORITY":"STALE_OR_SUPERSEDED_WITH_EVIDENCE"});
}

const correctedCandidateEntrypoints = {
  "ROUTE-056": {
    canonical_status: "CANDIDATE_SOURCE_AND_OFFLINE_CONTRACT_PRESENT",
    changed_files_commits: "FILES:activation event route, activation policy, tenant-scoped migration, and onboarding/billing contract tests",
    tests: "node scripts/test-onboarding-activation-billing-contract.mjs; npm run typecheck",
    negative_failure_path_proof: "Unauthenticated, cross-tenant, unknown event, and passive-render activation writes are denied.",
    integrated_proof: "Offline contract passed; full-chain and production Stripe acceptance remain blocked.",
    residual_risk: "Fresh migration replay and authenticated production runtime are not proven.",
  },
  "ROUTE-065": {
    canonical_status: "CANDIDATE_SOURCE_AND_AUTHORITATIVE_BILLING_CONTRACT_PRESENT",
    changed_files_commits: "FILES:billing status route, authoritative Stripe projection service, runtime-mode fencing, and billing tests",
    tests: "node scripts/test-onboarding-activation-billing-contract.mjs; npm run test:stripe-runtime-mode; npm run test:stripe-webhook-disposable-db",
    negative_failure_path_proof: "Unknown prices, mixed modes, stale metadata, cross-tenant reads, and ambiguous provider refresh fail closed.",
    integrated_proof: "Offline and disposable-database billing tests passed; live Stripe/deployed configuration proof is absent.",
    residual_risk: "No production Stripe API or webhook acceptance was authorized.",
  },
};

for (const record of readJson("07_ENTRYPOINT_ROUTE_ACTION_WORKER_INVENTORY.json").records) {
  const present = fs.existsSync(path.join(root, record.source_path));
  const correction = correctedCandidateEntrypoints[record.id] ?? {};
  addRow({ledger_key:`ENTRYPOINT:${record.id}`,id:record.id,object_type:"ENTRYPOINT",original_claim:`${record.kind} ${record.runtime_path}`,canonical_status:present?"SOURCE_PRESENT":"STALE_NONCANONICAL_SOURCE",affected_surface_files_data:record.source_path,implementation_disposition:present?"PRESERVE_AND_ROUTE_TEST":"CLOSE_AS_STALE",failing_before_evidence:record.notes,residual_risk:present?`${record.side_effect_class}; source/build/static route proof does not substitute for blocked authenticated/database/provider runtime proof.`:record.side_effect_class,final_status:present?"BLOCKED_BY_EXTERNAL_AUTHORITY":"STALE_OR_SUPERSEDED_WITH_EVIDENCE",...correction});
}

const candidateRouteDeltas = [
  ["ROUTE-174", "API_ROUTE", "/api/campaigns/:id/schedule-launch", "src/app/api/campaigns/[id]/schedule-launch/route.ts", "Durable tenant-bound scheduled-launch intent; provider execution remains gated."],
  ["ROUTE-175", "API_ROUTE", "/api/integrations/meta/leadgen/routes", "src/app/api/integrations/meta/leadgen/routes/route.ts", "Authenticated exact-workspace native-form route provisioning; provider form creation is not implied."],
  ["ROUTE-176", "API_ROUTE", "/api/meta/leadgen/webhook", "src/app/api/meta/leadgen/webhook/route.ts", "Signed native Meta lead ingestion and durable reconciliation; live provider acceptance is pending."],
  ["ROUTE-177", "API_ROUTE", "/api/access-keys/reveal-ack", "src/app/api/access-keys/reveal-ack/route.ts", "Same-origin rate-limited acknowledgement atomically consumes a successfully delivered access-key reveal."],
];
for (const [id, kind, runtimePath, sourcePath, note] of candidateRouteDeltas) {
  addRow({
    ledger_key: `ENTRYPOINT:${id}`,
    id,
    object_type: "ENTRYPOINT",
    original_claim: `${kind} ${runtimePath}`,
    canonical_status: fs.existsSync(path.join(root, sourcePath))
      ? "CANDIDATE_SOURCE_AND_LOCAL_CONTRACT_PRESENT"
      : "CANDIDATE_SOURCE_MISSING",
    affected_surface_files_data: sourcePath,
    implementation_disposition: "PRESERVE_AND_PROVE_WITH_ISOLATED_ROUTE_DATABASE_FIXTURES",
    failing_before_evidence: note,
    tests:
      id === "ROUTE-176"
        ? "npm run test:meta-leadgen"
        : id === "ROUTE-177"
          ? "npm run test:access-key-security-disposable-db; npm run routes:security"
          : "npm run test:manual-launch-disposable-db; npm run test:meta-leadgen",
    negative_failure_path_proof: "Missing authentication/signature, wrong tenant/provider identity, replay, ambiguity, and disabled provider authority fail closed.",
    integrated_proof: "Candidate source and isolated contracts are mapped; no live provider route was invoked.",
    residual_risk: note,
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  });
}

for (const record of parseCsv(read("16_UI_ROUTE_ROLE_STATE_MATRIX.csv"))) {
  addRow({ledger_key:`UIROUTE:${record.route_id}`,id:record.route_id,object_type:"UI_ROUTE_STATE",original_claim:`${record.route_pattern}: ${record.actor_role}; ${record.meaningful_states}`,canonical_status:"SOURCE_INVENTORY_REQUIRES_RUNTIME_ROLE_PROOF",affected_surface_files_data:record.source_scope,implementation_disposition:"ISOLATED_BROWSER_ROLE_STATE_MATRIX",failing_before_evidence:record.blocker,residual_risk:record.runtime_proof,final_status:"BLOCKED_BY_EXTERNAL_AUTHORITY"});
}

const canonicalPackageScripts = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {}),
);
const baselinePassedScripts = new Set(["test:media-buyer","test:media-buying-upgrades","test:media-buyer-regression","test:static-ad-templates","test:homepage","smoke:offline","test:access-key-checkout-signup","test:public-funnel-thank-you","test:lead-tracking-health","test:ghl-iframe-embed-security","test:production-route-contract","test:internal-sms","lint","typecheck","build","plan:validate","plan:writes:check","routes:security"]);
for (const record of parseCsv(read("18_TEST_TO_FEATURE_RULE_STATE_MATRIX.csv"))) {
  const canonicalInventory = /\/dealflow-os-rebuild\/package\.json(?::|$)/.test(record.evidence);
  const present = canonicalInventory && canonicalPackageScripts.has(record.script_name);
  const passed = baselinePassedScripts.has(record.script_name);
  addRow({id:record.id,object_type:"TEST",original_claim:`${record.script_name}: ${record.classification}`,canonical_status:passed&&present?"CANONICAL_FINAL_PASS":present?"CANONICAL_PRESENT_WITH_PRECISE_EXECUTION_BLOCKER":"STALE_NONCANONICAL_TEST",affected_surface_files_data:record.evidence,implementation_disposition:passed&&present?"PRESERVE_FINAL_PROOF":present?"MAKE_HERMETIC_OR_RETAIN_PRECISE_BLOCKER":"CLOSE_AS_STALE",failing_before_evidence:record.safety_reason,tests:passed&&present?"Final isolated rerun; see TEST_AND_PROOF_MATRIX.md":"Not executed under the final safe profile; exact prerequisite is retained in the source test inventory and proof matrix.",residual_risk:record.related_features_rules_states,final_status:passed&&present?"VERIFIED_ALREADY_CORRECT":present?"BLOCKED_BY_EXTERNAL_AUTHORITY":"STALE_OR_SUPERSEDED_WITH_EVIDENCE"});
}

const candidateTestDeltas = [
  ["TEST-094", "test:dealflow-completion", "scripts/test-dealflow-completion.mjs"],
  ["TEST-095", "test:reliability-wave", "scripts/test-reliability-wave.mjs"],
  ["TEST-096", "test:security-config-truth", "scripts/test-security-config-truth.mjs"],
  ["TEST-097", "test:accessibility-truth", "scripts/test-accessibility-truth-contract.mjs"],
  ["TEST-098", "test:onboarding-activation-billing", "scripts/test-onboarding-activation-billing-contract.mjs"],
  ["TEST-099", "test:access-key-commercial-activation", "scripts/test-access-key-commercial-activation.mjs"],
  ["TEST-100", "test:access-key-security-disposable-db", "scripts/test-access-key-security-disposable-db.mjs"],
  ["TEST-101", "test:ghl-tenant-provisioning", "scripts/test-ghl-tenant-provisioning.mjs"],
  ["TEST-102", "test:ghl-disposable-db", "scripts/test-ghl-disposable-db.mjs"],
  ["TEST-103", "test:launch-truth-and-schedule", "scripts/test-launch-truth-and-schedule.mjs"],
  ["TEST-104", "test:manual-launch-fencing", "scripts/test-manual-launch-fencing.mjs"],
  ["TEST-105", "test:scheduler-disposable-db", "scripts/test-scheduler-disposable-db.mjs"],
  ["TEST-106", "test:meta-contract-hardening", "scripts/test-meta-contract-hardening.mjs"],
  ["TEST-107", "test:meta-tenant-fencing", "scripts/test-meta-tenant-fencing.mjs"],
  ["TEST-108", "test:meta-leadgen-contract", "scripts/test-meta-leadgen-contract.mjs"],
  ["TEST-109", "test:meta-leadgen-disposable-db", "scripts/test-meta-leadgen-disposable-db.mjs"],
  ["TEST-110", "test:financial-integrity-disposable-db", "scripts/test-financial-integrity-disposable-db.mjs"],
  ["TEST-111", "test:stripe-webhook-disposable-db", "scripts/test-stripe-webhook-disposable-db.mjs"],
  ["TEST-112", "test:stripe-runtime-mode", "scripts/test-stripe-runtime-mode-contract.mjs"],
  ["TEST-113", "test:campaign-entitlement-disposable-db", "scripts/test-campaign-entitlement-disposable-db.mjs"],
  ["TEST-114", "test:creative-lead-disposable-db", "scripts/test-creative-lead-disposable-db.mjs"],
  ["TEST-115", "test:lead-effect-fencing-db", "scripts/test-lead-effect-fencing-disposable-db.mjs"],
  ["TEST-116", "test:sms-receipts", "scripts/test-sms-receipt-hardening.mjs"],
  ["TEST-117", "test:support-ticket-contract", "scripts/test-support-ticket-contract.mjs"],
  ["TEST-118", "test:support-outbox-disposable-db", "scripts/test-support-outbox-disposable-db.mjs"],
  ["TEST-119", "test:optimization-evidence-safety", "scripts/test-optimization-evidence-safety.mjs"],
  ["TEST-120", "test:migration-read-only-contract", "scripts/test-migration-read-only-contract.mjs"],
  ["TEST-121", "test:release-guard", "scripts/test-release-guard.mjs"],
  ["TEST-122", "test:client-ip-contract", "scripts/test-client-ip-contract.mjs"],
  ["TEST-123", "test:access-key-binding", "scripts/test-access-key-binding-contract.mjs"],
  ["TEST-124", "test:manual-launch-reachability", "scripts/test-manual-launch-reachability.mjs"],
];
for (const [id, scriptName, sourcePath] of candidateTestDeltas) {
  addRow({
    id,
    object_type: "TEST",
    original_claim: `${scriptName}: candidate completion proof`,
    canonical_status: "CANDIDATE_EXECUTABLE_PROOF_PRESENT_AND_PASSED",
    affected_surface_files_data: sourcePath,
    implementation_disposition: "RUN_ON_EXACT_FINAL_COMMIT_AND_RETAIN_SANITIZED_LOG",
    failing_before_evidence: "Absent from the prior TEST-001 through TEST-093 audit inventory.",
    changed_files_commits: `FILES:${sourcePath}`,
    tests: `node ${sourcePath}`,
    negative_failure_path_proof: "The suite contains explicit denial, replay, ambiguity, tenant, fence, or fail-closed cases for its mapped surface.",
    integrated_proof: "Targeted local execution passed before the final integrated exact-commit rerun.",
    residual_risk: "Passing local proof does not establish production/provider behavior or repair NEW-001.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  });
}

const candidateDataDeltas = [
  ["DATA-042", "onboarding_drafts", "20260710180000_activation_onboarding_contract.sql"],
  ["DATA-043", "activation_journey_events", "20260710180000_activation_onboarding_contract.sql"],
  ["DATA-044", "commercial_activations", "20260710180000_activation_onboarding_contract.sql"],
  ["DATA-045", "ghl_workspace_tenants", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-046", "ghl_installations", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-047", "ghl_snapshot_manifests", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-048", "ghl_location_mappings", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-049", "ghl_provisioning_runs", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-050", "ghl_provider_outbox", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-051", "ghl_provider_receipts", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-052", "ghl_lead_effect_events", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-053", "ghl_operator_requests", "20260710170000_create_ghl_tenant_provisioning_foundation.sql"],
  ["DATA-054", "system_job_effects", "20260710234500_harden_jobs_lead_effects_meta_deletion.sql"],
  ["DATA-055", "meta_data_deletion_requests", "20260710234500_harden_jobs_lead_effects_meta_deletion.sql"],
  ["DATA-056", "campaign_launch_records", "20260710235000_create_launch_receipts_optimizer_support.sql"],
  ["DATA-057", "campaign_launch_provider_receipts", "20260710235500_schedule_launch_claim_fencing.sql"],
  ["DATA-058", "optimization_decisions", "20260710235000_create_launch_receipts_optimizer_support.sql"],
  ["DATA-059", "support_tickets", "20260710235000_create_launch_receipts_optimizer_support.sql"],
  ["DATA-060", "support_notification_outbox", "20260710235000_create_launch_receipts_optimizer_support.sql"],
  ["DATA-061", "support_operator_inbox", "20260710235000_create_launch_receipts_optimizer_support.sql"],
  ["DATA-062", "inbound_sms_receipts", "20260710235600_harden_sms_delivery_receipts.sql"],
  ["DATA-063", "meta_oauth_states", "20260710235800_harden_meta_oauth_state.sql"],
  ["DATA-064", "credit_top_up_intents", "20260710235970_harden_stripe_protocol_and_credit_intents.sql"],
  ["DATA-065", "meta_leadgen_routes", "20260710235990_create_meta_leadgen_ingestion.sql"],
  ["DATA-066", "meta_leadgen_events", "20260710235990_create_meta_leadgen_ingestion.sql"],
  ["DATA-067", "meta_leadgen_effect_receipts", "20260710235990_create_meta_leadgen_ingestion.sql"],
  ["DATA-068", "organization_user_credits", "20260710235991_harden_financial_integrity.sql"],
  ["DATA-069", "credit_scope_migration_blockers", "20260710235991_harden_financial_integrity.sql"],
  ["DATA-070", "billing_access_keys_claim_and_reveal_fences", "20260710235993_harden_access_key_claim_delivery.sql"],
];
for (const [id, entity, migrationFile] of candidateDataDeltas) {
  addRow({
    id,
    object_type: "DATA_ENTITY",
    original_claim: `${entity}: candidate tenant/fencing data contract`,
    canonical_status: "CANDIDATE_MIGRATION_AND_DISPOSABLE_FRAGMENT_PRESENT",
    root_cause_invariant: "organization_id and user/campaign/provider identity must be exact, immutable where required, and mutation-authority fenced.",
    affected_surface_files_data: `supabase/migrations/${migrationFile}`,
    implementation_disposition: "PRESERVE_AND_PROVE_IN_FULL_FRESH_AND_PRIOR_SCHEMA_REPLAY",
    failing_before_evidence: "Not present in the prior DATA-001 through DATA-041 inventory.",
    tests: "Candidate disposable-database suites; full fresh replay remains NEW-001.",
    negative_failure_path_proof: "Direct DML, cross-tenant identities, stale fences, replay collisions, and ambiguous legacy scope fail closed where applicable.",
    integrated_proof: "Migration fragment and isolated database proofs do not constitute a passing repository-wide migration chain.",
    residual_risk: "NEW-001 and read-only target preflight block deployment of this schema.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  });
}

const candidateStateMachineDeltas = [
  ["STATE-017", "Commercial activation", "payment_observed -> authoritative_payment_verified -> activated_once -> entitlement_reconciled"],
  ["STATE-018", "GHL provisioning", "requested -> fake_only_queued -> receipt_or_operator_action; live_ready blocked"],
  ["STATE-019", "System job lease", "queued -> claimed_v2 -> heartbeat -> succeeded/retry/operator_action_required"],
  ["STATE-020", "Support outbox", "ticket_committed -> claimed -> receipt_recorded -> delivered/retry/operator_action_required"],
  ["STATE-021", "Meta launch lineage", "intent -> claimed_generation -> input_snapshot_bound -> paused_receipts -> provider_paused/operator_action_required"],
  ["STATE-022", "Meta native leadgen", "signed_event -> exact_route -> canonical_lead -> suppressed_effects/reconciliation"],
  ["STATE-023", "Provider usage", "attempt_reserved -> provider_ambiguous/succeeded/failed -> exactly_once_settlement_or_compensation"],
  ["STATE-024", "Access-key reveal", "checkout_preclaim -> paid_activation -> claim_reconciliation_lease -> reveal_delivery_lease -> browser_ack -> irrecoverable"],
  ["STATE-025", "Stripe webhook", "signed_event -> v2_claim -> authoritative_refresh -> atomic_projection -> fenced_settlement/retry"],
];
for (const [id, name, states] of candidateStateMachineDeltas) {
  addRow({
    id,
    object_type: "STATE_MACHINE",
    original_claim: `${name}: ${states}`,
    canonical_status: "CANDIDATE_TRANSITION_CONTRACT_PRESENT",
    affected_surface_files_data: "Candidate services, migrations, and mapped deterministic/disposable tests.",
    implementation_disposition: "PRESERVE_TRANSITION_FENCES_AND_PROVE_EXACT_FINAL_COMMIT",
    failing_before_evidence: "State machine was missing, ambiguous, mutable, or incompletely fenced at baseline.",
    tests: "Mapped candidate contract and disposable-database suites.",
    negative_failure_path_proof: "Stale generation, replay collision, cross-tenant identity, ambiguous provider result, and direct mutation cannot create a later success.",
    integrated_proof: "Local transition proof only; production/provider and full migration-chain acceptance remain absent.",
    residual_risk: "External acceptance and NEW-001 independently keep release at NO_GO.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  });
}

for (const record of readJson("03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.json").records) {
  addRow({id:record.id,object_type:"REPOSITORY_CANDIDATE",original_claim:`${record.kind}: ${record.path}`,canonical_status:"NONCANONICAL_PRESERVED_CANDIDATE",affected_surface_files_data:`${record.branch}; ${record.head}; ${record.remote_sanitized}`,implementation_disposition:"DO_NOT_IMPORT_WHOLESALE",failing_before_evidence:record.blocker,residual_risk:record.status_counts,final_status:"STALE_OR_SUPERSEDED_WITH_EVIDENCE"});
}

const newIssues = [
  {
    id: "NEW-001",
    original_claim: "The tracked migration chain has no foundational base-schema migration and cannot replay into a fresh database.",
    canonical_status: "CONFIRMED_LOCAL_FAILURE",
    root_cause_invariant: "Every migration chain must create its referenced base relations before altering or constraining them.",
    affected_surface_files_data: "supabase/migrations/20260426110000_add_campaign_plan_critical_fields.sql; all later migrations",
    implementation_disposition: "BLOCK_RELEASE_UNTIL_AUTHORITATIVE_BASE_SCHEMA_IS_RECOVERED",
    failing_before_evidence: "Disposable local Supabase replay failed at statement 0 with SQLSTATE 42P01: public.campaign_plans does not exist.",
    tests: "Fresh disposable Supabase migration replay: FAIL (expected blocker captured).",
    negative_failure_path_proof: "No linked/shared database was used; replay stopped on the first missing relation.",
    integrated_proof: "docs/dealflow-completion/MIGRATION_AND_ROLLBACK.md",
    residual_risk: "No migration, RLS, mixed-version, or rollback claim is release-valid.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-002",
    original_claim: "The verified baseline stored 09:00 Eastern launch intent but had no due-schedule consumer.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Scheduled provider intent requires atomic due claiming, fencing, retry, and an explicit execution authority gate.",
    affected_surface_files_data: "src/lib/services/scheduled-campaign-launch-service.ts; src/lib/scheduled-launch-gate.ts; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql; src/app/api/internal/system-jobs/route.ts",
    implementation_disposition: "PRESERVE_FAIL_CLOSED_SCHEDULED_EXECUTOR",
    failing_before_evidence: "Baseline cron processed system jobs only and never claimed campaign_launch_records.",
    changed_files_commits: "FILES:scheduled launch service, gate, internal runner, launch services, migration, and deterministic tests",
    tests: "node scripts/test-launch-truth-and-schedule.mjs; npm run typecheck; test:dealflow-completion",
    negative_failure_path_proof: "Default-false scheduled and Meta live gates; NODE_ENV=test is categorically denied; lease-loss paths are fenced.",
    integrated_proof: "Offline contract and source integration passed; DB execution is blocked by NEW-001.",
    residual_risk: "No real provider or database runtime acceptance was performed.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-003",
    original_claim: "The verified baseline had no GHL tenant schema, provider outbox consumer, or lead-effect delivery path.",
    canonical_status: "FAKE_ONLY_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Tenant provisioning and lead delivery require exclusive mapping, atomic claim, fencing, append-only receipts, and provider idempotency.",
    affected_surface_files_data: "src/lib/integrations/gohighlevel; src/lib/services/ghl-*.ts; supabase/migrations/20260710170000_create_ghl_tenant_provisioning_foundation.sql",
    implementation_disposition: "KEEP_FAKE_ONLY_UNTIL_DATABASE_AND_PROVIDER_ACCEPTANCE",
    failing_before_evidence: "Canonical baseline source search found no executable GHL foundation.",
    changed_files_commits: "FILES:GHL fake adapter, write gate, repository, provisioning/lead/outbox services, schema migration, and tests",
    tests: "node scripts/test-ghl-tenant-provisioning.mjs; npm run typecheck",
    negative_failure_path_proof: "Real adapter remains unavailable; fake execution makes zero network calls and production fake lead processing is denied.",
    integrated_proof: "Deterministic fake-only contract passed; DB execution is blocked by NEW-001.",
    residual_risk: "Agency permissions, snapshot publication, webhooks, rate limits, and live acceptance remain external.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-004",
    original_claim: "Optimizer evaluations were not durably recorded as immutable, policy-digested decisions.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Every evaluation must produce one append-only shadow decision whose digest covers the versioned policy contract.",
    affected_surface_files_data: "src/lib/services/optimization-decision-service.ts; src/lib/optimization-engine/safety-policy.ts; autonomy and optimize routes; 20260710235000 migration",
    implementation_disposition: "PRESERVE_SHADOW_ONLY_APPEND_ONLY_DECISIONS",
    failing_before_evidence: "Baseline optimizer returned recommendations without a durable decision ledger.",
    changed_files_commits: "FILES:optimization safety policy, immutable decision service, routes, migration, and tests",
    tests: "node scripts/test-optimization-evidence-safety.mjs",
    negative_failure_path_proof: "Unapproved policy yields HOLD_NO_ACTION; live_action_performed is constrained false; replay is insert-ignore-and-fetch.",
    integrated_proof: "Source and deterministic policy tests passed; DB trigger execution is blocked by NEW-001.",
    residual_risk: "No owner-approved thresholds exist, so all current evaluations safely hold.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-005",
    original_claim: "Support submission lacked atomic ticket/outbox persistence, request idempotency, and a fenced consumer.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "One user request must create or recover one ticket and one durable operator notification through a fenced outbox.",
    affected_surface_files_data: "src/lib/support-ticket-contract.ts; feedback route/widget; support-ticket-service.ts; 20260710235000 migration; internal runner",
    implementation_disposition: "PRESERVE_ATOMIC_IDEMPOTENT_SUPPORT_OUTBOX",
    failing_before_evidence: "Baseline feedback was non-durable and retry could duplicate or lose operator notification.",
    changed_files_commits: "FILES:support contract, client, route, service, outbox processor, migration, and tests",
    tests: "node scripts/test-support-ticket-contract.mjs; npm run typecheck",
    negative_failure_path_proof: "One UUID is reused across client retry; SQL unique key and atomic RPC recover concurrent duplicates; lease token fences delivery.",
    integrated_proof: "Source and contract tests passed; DB execution is blocked by NEW-001.",
    residual_risk: "External mailbox delivery was intentionally not exercised.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-006",
    original_claim: "No executable release guard bound ancestry, exact target, clean state, signed proof planes, old-worker drain, and deployed environment truth.",
    canonical_status: "GUARD_IMPLEMENTED_PRODUCTION_AUTHORITY_ABSENT",
    root_cause_invariant: "Release evidence must be signed by an authority pinned in a protected outside-repository policy whose independently supplied digest authorizes the informational candidate-policy digest, for one clean exact HEAD and one exact deployment with all six proof planes present.",
    affected_surface_files_data: "scripts/generate-release-guard.mjs; scripts/test-release-guard.mjs; docs/dealflow-completion/release-trust-policy.json; package.json",
    implementation_disposition: "KEEP_NO_GO_UNTIL_REAL_AUTHORITY_AND_ALL_SIGNED_EVIDENCE_EXIST",
    failing_before_evidence: "Only narrative release instructions existed.",
    changed_files_commits: "FILES:signed deterministic release guard, unconfigured production trust policy, adversarial tests, and package commands",
    tests: "npm run test:release-guard",
    negative_failure_path_proof: "Fabricated, unsigned, self-signed, stale, mismatched, unsafe, dirty, nonexact, and nonzero-drain evidence fails closed without leaking values.",
    integrated_proof: "Test authority verification passes only when pinned; production policy has no invented authority and therefore cannot pass release mode.",
    residual_risk: "Final exact-commit structural preview plus authoritative production environment/drain evidence remain absent.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-007",
    original_claim: "Script CSP is now nonce-bound and surface-specific, but framework-managed inline styles still require unsafe-inline.",
    canonical_status: "PARTIAL_SECURITY_HARDENING",
    root_cause_invariant: "Executable inline content must be nonce/hash-bound and provider allowances should be limited by surface.",
    affected_surface_files_data: "src/proxy.ts",
    implementation_disposition: "DO_NOT_CLAIM_FULL_CSP_CLOSURE",
    failing_before_evidence: "Baseline shared one broad script/style unsafe-inline policy across marketing and app surfaces.",
    changed_files_commits: "FILES:per-request nonce CSP propagation and marketing/public/authenticated surface policies",
    tests: "smoke:offline; local HTML nonce/header inspection",
    negative_failure_path_proof: "script-src omits unsafe-inline and script-src-attr is none; every rendered Next script carried the response nonce.",
    integrated_proof: "Local root response matched nonce header to script tags.",
    residual_risk: "style-src unsafe-inline remains and requires a separate framework-compatible style strategy.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-008",
    original_claim: "The baseline lacked a native Meta Instant Form golden journey and mixed website-form and native-form behavior.",
    canonical_status: "WEBSITE_FORM_CONTRACT_CORRECTED_NATIVE_IMPLEMENTATION_LOCALLY_VERIFIED",
    root_cause_invariant: "UI copy, persisted destination, provider launch, webhook ingestion, and lead destination must describe one end-to-end path.",
    affected_surface_files_data: "onboarding page; prepaywall preview; campaign-destination.ts; launch route",
    implementation_disposition: "PRESERVE_WEBSITE_FORM_TRUTH_AND_NEW_034_NATIVE_INGESTION_CONTRACT",
    failing_before_evidence: "The baseline/candidate wording mixed a website form with native Meta form behavior and no leadgen webhook existed.",
    changed_files_commits: "FILES:website-form destination/copy correction plus separately tracked native leadgen candidate in NEW-034",
    tests: "test:dealflow-completion; smoke:offline; npm run test:meta-leadgen",
    negative_failure_path_proof: "Website-form destinations are no longer mislabeled as native; native events require signed exact-route ingestion before persistence.",
    integrated_proof: "Website-form truth is corrected; native-form contract and disposable-database proof are tracked in NEW-034.",
    residual_risk: "Live Meta form/page permissions, subscriptions, payload variants, and end-to-end acceptance remain external.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-009",
    original_claim: "Rollback was not executable because the forward migration chain failed before reaching candidate migrations.",
    canonical_status: "ROLLBACK_NOT_EXECUTED",
    root_cause_invariant: "A release candidate needs proven forward compatibility and a rehearsed rollback/recovery path.",
    affected_surface_files_data: "all candidate migrations; docs/dealflow-completion/MIGRATION_AND_ROLLBACK.md",
    implementation_disposition: "NO_GO_UNTIL_FORWARD_AND_ROLLBACK_DRILLS_PASS",
    failing_before_evidence: "Fresh replay stopped at the first baseline migration; no candidate schema state existed to roll back.",
    tests: "Rollback drill: SKIPPED because prerequisite forward replay failed.",
    negative_failure_path_proof: "No destructive rollback was attempted against any shared or linked database.",
    integrated_proof: "Precise prerequisite and safe rerun commands are documented.",
    residual_risk: "Unknown rollback behavior independently forces NO_GO.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-010",
    original_claim: "Three independently deployed DealFlow surfaces have no safely proven source ancestry in the available canonical checkout.",
    canonical_status: "BLOCKED_EXTERNAL_SOURCE_ANCESTRY",
    root_cause_invariant: "A deployed surface cannot be audited or modified as canonical without source-to-deployment ancestry proof.",
    affected_surface_files_data: "internal.agentdealflow.io; clicktoscale.agentdealflow.io; onboarding.agentdealflow.io",
    implementation_disposition: "EXCLUDE_FROM_CANDIDATE_AND_REQUEST_AUTHORITATIVE_SOURCE",
    failing_before_evidence: "Read-only deployment/domain mapping found distinct live surfaces without matching canonical ancestry.",
    tests: "Read-only deployment/domain inventory only.",
    negative_failure_path_proof: "No domain, provider, deployment, or configuration mutation was attempted.",
    integrated_proof: "Excluded-surfaces register in release candidate manifest.",
    residual_risk: "Behavior and vulnerabilities on those surfaces remain unreviewed.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-011",
    original_claim: "Creative assets could carry mutable or attacker-controlled storage identity, allowing deletion to escape the owning campaign prefix or cross tenant boundaries.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "A creative asset's bucket, path, organization, user, campaign, and provider identity must be immutable, mutually constrained, and re-derived from trusted persisted state before deletion.",
    affected_surface_files_data: "src/lib/services/creative-asset-storage-identity.ts; src/lib/services/creative-builder-service.ts; src/app/api/assets/[id]/route.ts; supabase/migrations/20260710235700_protect_creative_asset_storage_identity.sql",
    implementation_disposition: "PRESERVE_IMMUTABLE_TENANT_SCOPED_STORAGE_IDENTITY",
    failing_before_evidence: "Adversarial review proved the baseline delete path trusted persisted metadata without a database-enforced bucket/path/campaign identity contract.",
    changed_files_commits: "FILES:creative storage identity helper, asset service/routes/types, protective migration, and unit/disposable-database tests",
    tests: "npm run test:creative-storage-lead-retry; npm run test:creative-lead-disposable-db",
    negative_failure_path_proof: "Traversal, wrong bucket, wrong campaign prefix, mutable identity, collaborator cross-campaign access, and non-admin manual insertion are rejected; legacy ambiguous rows fail closed.",
    integrated_proof: "Isolated PostgreSQL constraint/RLS proof passed; full repository migration-chain integration remains blocked by NEW-001.",
    residual_risk: "Read-only preflight must pass on the future target database before this constraint migration can be applied.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-012",
    original_claim: "A queued failed-lead retry could resolve by a mutable funnel slug and cross campaign or tenant identity during replay.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "A retry must bind the original lead, organization, user, and canonical campaign ID before every write and provider-effect boundary.",
    affected_surface_files_data: "src/lib/leads/retry-scope.ts; src/lib/services/lead-handler-service.ts; src/app/api/internal/system-jobs/route.ts; supabase/migrations/20260710235750_fence_lead_campaign_tenant_identity.sql",
    implementation_disposition: "PRESERVE_CANONICAL_COMPOSITE_LEAD_RETRY_FENCE",
    failing_before_evidence: "Adversarial replay showed a queued payload could rely on a slug rather than the original campaign identity.",
    changed_files_commits: "FILES:lead retry scope helper, lead/job handlers, composite tenant migration, and unit/disposable-database tests",
    tests: "npm run test:creative-storage-lead-retry; npm run test:creative-lead-disposable-db",
    negative_failure_path_proof: "Slug drift is ignored; mismatched parent organization/user/campaign is rejected before persistence and rechecked before child effects.",
    integrated_proof: "Composite foreign-key and replay tests passed in isolated PostgreSQL; the full chain remains blocked by NEW-001.",
    residual_risk: "The preflight intentionally blocks migration if historical lead/campaign tenant identities disagree.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-013",
    original_claim: "Outbound and inbound SMS receipts allowed non-monotonic callback state, ambiguous active claims, and partial compliance effects across a crash boundary.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Every SMS request and callback must be digest-bound, monotonically settled, tenant-fenced, and compliance state plus receipt completion must commit atomically.",
    affected_surface_files_data: "src/lib/services/sms-service.ts; src/app/api/sms/twilio/route.ts; src/lib/services/lead-handler-service.ts; supabase/migrations/20260710235600_harden_sms_delivery_receipts.sql",
    implementation_disposition: "PRESERVE_MONOTONIC_FENCED_SMS_RECEIPTS_AND_ATOMIC_COMPLIANCE",
    failing_before_evidence: "Disposable replay reproduced late queued callbacks regressing sent state and exposed a crash window between STOP/START lead state and inbound receipt completion.",
    changed_files_commits: "FILES:SMS service, Twilio route, lead handler, receipt migration, package aliases, and crash/replay regression tests",
    tests: "npm run test:sms-receipts; npm run test:internal-sms; node scripts/test-security-config-truth.mjs",
    negative_failure_path_proof: "Late callbacks cannot regress state; digest collisions, stale/wrong/null fences, cross-tenant settlement, post-commit crash replays, and blocked non-compliance messages fail safely without provider or conversation writes.",
    integrated_proof: "Disposable PostgreSQL concurrency/fencing/atomic STOP-START replay passed; full-chain integration remains blocked by NEW-001.",
    residual_risk: "No Twilio sandbox/live callback was exercised and outbound lead automation remains categorically disabled.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-014",
    original_claim: "Authenticated users could forge or rewrite support ticket/outbox state and a notification could be reported delivered without a durable receipt.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Support creation is one atomic user-scoped RPC; subsequent delivery is service-role fenced and successful only with a durable receipt.",
    affected_surface_files_data: "src/lib/services/support-ticket-service.ts; src/lib/services/internal-launch-monitor.ts; supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
    implementation_disposition: "PRESERVE_USER_SCOPED_ATOMIC_SUPPORT_AND_RECEIPT_TRUTH",
    failing_before_evidence: "Independent adversarial review found direct authenticated ticket mutation and a false-delivery path after the initial support tranche.",
    changed_files_commits: "FILES:support service/monitor, constrained migration policies/grants, and support contract tests",
    tests: "node scripts/test-support-ticket-contract.mjs; node scripts/test-security-config-truth.mjs; npm run test:dealflow-completion",
    negative_failure_path_proof: "Direct insert/update, other-user visibility, missing receipt, unresolved-age filtering, oversized/invalid category/path payloads, and stale lease settlement are rejected.",
    integrated_proof: "Static and deterministic contract proof passed; full SQL transaction execution is blocked by NEW-001.",
    residual_risk: "External mailbox delivery was intentionally not exercised.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-015",
    original_claim: "The QA authentication harness did not strictly prove isolated Supabase project identity and exact profile-to-auth-session identity.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED",
    root_cause_invariant: "A QA harness may run only against an exact isolated project and must return a session for the one proven non-owner auth user mapped by profile ID.",
    affected_surface_files_data: "src/app/api/internal/qa-auth-session/route.ts; src/lib/security/supabase-isolation.ts; .env.example",
    implementation_disposition: "PRESERVE_EXACT_PROJECT_AND_USER_SESSION_ATTESTATION",
    failing_before_evidence: "Adversarial URL and identity cases exposed spoofable project forms and insufficient profile/session binding.",
    changed_files_commits: "FILES:QA route, Supabase isolation parser, environment example, and security contract tests",
    tests: "node scripts/test-security-config-truth.mjs; npm run routes:security; npm run test:dealflow-completion",
    negative_failure_path_proof: "Credentials, paths, queries, fragments, hosted nonstandard ports, spoofed suffixes, owner roles, missing auth users, and mismatched session users fail closed.",
    integrated_proof: "Deterministic isolation/route contract suite and route AST guard passed without opening a session or contacting an external project.",
    residual_risk: "Authenticated browser journey still requires an explicitly isolated test project and credentials.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-016",
    original_claim: "The shared frame-ancestor policy could admit unintended vendor origins or frame authenticated surfaces outside the approved onboarding embed.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED",
    root_cause_invariant: "Framing is default-deny; only the designated onboarding surface may accept exact configured deployment origins, never wildcards or a shared vendor host.",
    affected_surface_files_data: "src/proxy.ts; scripts/test-ghl-iframe-embed-security.mjs",
    implementation_disposition: "PRESERVE_SURFACE_SPECIFIC_EXACT_ORIGIN_FRAME_POLICY",
    failing_before_evidence: "Adversarial policy review found a shared origin configuration could broaden clickjacking exposure.",
    changed_files_commits: "FILES:surface-specific CSP/frame policy and behavioral iframe regression tests",
    tests: "npm run test:ghl-iframe-embed-security; npm run smoke:offline",
    negative_failure_path_proof: "Default, authenticated, shared-vendor, wildcard, duplicate, malformed, and wrong-host cases are denied; only the exact onboarding case is allowed.",
    integrated_proof: "Behavioral policy tests and local CSP response inspection passed.",
    residual_risk: "Configured production embed origins still require owner review before any environment change.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-017",
    original_claim: "Load-test tooling could be pointed at a non-loopback or shared database and could create synthetic lead records or provider effects.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED",
    root_cause_invariant: "Performance proof must be loopback-only, explicitly gated, isolated-project-attested, capped, fake-identity-only, and no-write before provider/data mutation.",
    affected_surface_files_data: "scripts/load-test.mjs; src/app/api/lead-capture/route.ts; src/lib/security/supabase-isolation.ts; .env.example",
    implementation_disposition: "PRESERVE_LOOPBACK_AND_NO_WRITE_LOAD_GUARDS",
    failing_before_evidence: "Adversarial review found the baseline load path lacked the full endpoint/database/provider isolation contract.",
    changed_files_commits: "FILES:load harness, lead-capture no-write branch, exact isolation helper, environment contract, and security tests",
    tests: "LOAD_BASE_URL=http://127.0.0.1:3100 LOAD_REQUESTS=100 LOAD_CONCURRENCY=20 npm run load:routes; node scripts/test-security-config-truth.mjs",
    negative_failure_path_proof: "Non-loopback URLs, URL credentials/components, missing gates/secrets/project refs, enabled provider flags, non-example identities, and excess request counts are refused.",
    integrated_proof: "Production build served 100/100 loopback read-only route requests with 0 errors and 271 ms p95 under SCHEMA_VALIDATION_MODE=warn.",
    residual_risk: "Lead-capture load execution itself remains blocked because a fully migrated isolated database cannot be constructed under NEW-001.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-018",
    original_claim: "Optimizer idempotency did not cover the complete policy authority contract and policy digests varied with object-key insertion order.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Equivalent policies must hash canonically and every authority-relevant field must be covered by the immutable decision idempotency key and persisted evidence.",
    affected_surface_files_data: "src/lib/services/optimization-decision-service.ts; src/lib/optimization-engine/safety-policy.ts; supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
    implementation_disposition: "PRESERVE_CANONICAL_FULL_POLICY_DIGEST",
    failing_before_evidence: "Independent adversarial review found key-order instability and policy fields outside the replay key.",
    changed_files_commits: "FILES:canonical digest/idempotency logic, full authority persistence, migration constraints, and optimizer safety tests",
    tests: "node scripts/test-optimization-evidence-safety.mjs; npm run test:dealflow-completion",
    negative_failure_path_proof: "Reordered equivalent policy objects converge; any authority-field change produces a distinct key; unapproved or incomplete policy remains HOLD_NO_ACTION.",
    integrated_proof: "Deterministic policy/digest contract passed; database immutability execution remains blocked by NEW-001.",
    residual_risk: "No owner-approved production threshold policy exists, so live action remains disabled.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-019",
    original_claim: "Authenticated members could forge campaign launch records, provider recovery could select an ambiguous object, and a crash could occur before newly returned provider IDs were durably receipted.",
    canonical_status: "IMPLEMENTED_IN_CANDIDATE_DATABASE_RUNTIME_BLOCKED",
    root_cause_invariant: "Launch intents are owner/membership validated through one constrained RPC; provider IDs are append-only receipts written before lease rechecks; recovery is paginated, parent-bound, and ambiguity-intolerant.",
    affected_surface_files_data: "src/app/api/campaigns/create/route.ts; src/lib/services/scheduled-campaign-launch-service.ts; src/lib/services/campaign-launch-audit-service.ts; supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
    implementation_disposition: "PRESERVE_SERVER_ONLY_LAUNCH_RECEIPTS_AND_AMBIGUITY_FENCE",
    failing_before_evidence: "Independent adversarial review proved authenticated launch-record mutation and found response/lease plus paginated-name-recovery gaps.",
    changed_files_commits: "FILES:launch route/services, constrained schedule RPC/grants, receipt/claim migrations, contract and disposable-database tests",
    tests: "node scripts/test-launch-truth-and-schedule.mjs; npm run test:scheduler-disposable-db",
    negative_failure_path_proof: "Direct authenticated mutation/TRUNCATE, wrong owner, invalid schedule, cursor loop, repeated/multiple parent matches, future generation, duplicate worker, stale lease, and sixth claim fail closed.",
    integrated_proof: "Fresh network-disabled PostgreSQL 17.6 proof passed collaborator ownership, idempotency, claim recovery/cap, stale receipt recovery, future rejection, append-only enforcement, and TRUNCATE denial.",
    residual_risk: "No Meta provider/sandbox execution was performed and the repository-wide migration chain remains blocked by NEW-001.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-020",
    original_claim: "The disabled GET surface for the dynamic optimize route lacked direct handler-level authentication evidence.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED",
    root_cause_invariant: "Every private dynamic route method, including a static denial response, must establish authenticated context at the handler boundary.",
    affected_surface_files_data: "src/app/api/campaigns/[id]/optimize/route.ts; scripts/check-route-security.mjs",
    implementation_disposition: "PRESERVE_HANDLER_LEVEL_AUTHENTICATION_ON_DENIED_DYNAMIC_METHOD",
    failing_before_evidence: "Final route AST audit failed specifically for GET /api/campaigns/[id]/optimize with no reachable ownership/authentication evidence.",
    changed_files_commits: "FILES:optimize GET authenticated-context guard and retained route AST proof",
    tests: "npm run routes:security; node scripts/test-optimization-evidence-safety.mjs; npm run typecheck",
    negative_failure_path_proof: "Unauthenticated direct invocation cannot receive even the static method-denial contract; POST continues to bind the campaign through getCampaignById.",
    integrated_proof: "Route security checker passed every public/internal/mutation/dynamic ownership case after the fix.",
    residual_risk: "No authenticated remote runtime was used.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-021",
    original_claim: "Lead child effects could be claimed or settled by a worker whose parent job lease had expired or been superseded.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_IN_DISPOSABLE_DATABASE",
    root_cause_invariant: "Every required child effect must bind the exact parent worker, unpredictable token, monotonic generation, live expiry, tenant, and its own execution token at claim and settlement.",
    affected_surface_files_data: "src/lib/services/lead-effect-aggregation-service.ts; supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql; scripts/test-lead-effect-fencing-disposable-db.mjs",
    implementation_disposition: "PRESERVE_PARENT_AND_CHILD_LEASE_FENCES",
    failing_before_evidence: "Independent review found stale parent ownership was not part of the complete child-effect mutation authority.",
    changed_files_commits: "FILES:lead-effect aggregation service, parent-fenced claim/settle RPCs, direct-DML revocation, reliability and disposable-database tests",
    tests: "npm run test:lead-effect-fencing-db; node scripts/test-reliability-wave.mjs",
    negative_failure_path_proof: "Wrong worker, expired parent, stale generation settlement, uncertain in-flight replay, direct service-role DML, and cross-tenant identities fail closed; succeeded effects are immutable and reused.",
    integrated_proof: "Network-disabled PostgreSQL 17.6 replay passed three parent generations, a delayed stale completion, successful reuse, and operator-required uncertain outcome.",
    residual_risk: "Actual provider idempotency and reconciliation remain provider-specific and were not exercised live.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-022",
    original_claim: "Replacing the system-job claim RPC under its old signature allowed an older app instance to claim work while ignoring the new lease fields.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_IN_DISPOSABLE_DATABASE",
    root_cause_invariant: "Only an explicitly versioned worker protocol may claim jobs after lease fencing is introduced; legacy claimers must fail before ownership is granted.",
    affected_surface_files_data: "src/lib/services/system-job-service.ts; supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql; scripts/test-lead-effect-fencing-disposable-db.mjs",
    implementation_disposition: "DROP_V1_AND_REQUIRE_EXPLICIT_V2_PROTOCOL",
    failing_before_evidence: "Independent mixed-version review showed an old worker could ignore token/generation/heartbeat fields and overlap a reclaimed provider call.",
    changed_files_commits: "FILES:versioned system-job claim call, v1 RPC removal, explicit protocol-version validation, and mixed-version negative database test",
    tests: "npm run test:lead-effect-fencing-db; node scripts/test-reliability-wave.mjs; npm run smoke:offline",
    negative_failure_path_proof: "The v1 signature is absent after migration, protocol versions other than 2 are rejected, and a valid v2 claim returns a tokenized live generation lease.",
    integrated_proof: "Network-disabled PostgreSQL proved old-signature failure without a database crash and one valid v2 fenced claim.",
    residual_risk: "A future rollout must drain already-running old workers before this migration; no database migration can recall a provider request already in flight.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-023",
    original_claim: "Manual Meta launch used a fixed campaign lock without a renewable durable intent claim or generation-fenced completion.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "Manual provider launch requires one due tenant-bound intent, renewable token/generation ownership, pre-gate provider receipts, ambiguity-intolerant recovery, and fenced terminal writes.",
    affected_surface_files_data: "src/app/api/campaigns/[id]/launch/route.ts; src/lib/services/campaign-launch-audit-service.ts; src/app/api/campaigns/create/route.ts; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
    implementation_disposition: "PRESERVE_RENEWABLE_MANUAL_LAUNCH_CLAIM_AND_RECEIPT_RECOVERY",
    failing_before_evidence: "Independent review found a long provider call could outlive the fixed lock and a stale request could write success after replacement.",
    changed_files_commits: "FILES:manual launch route, launch audit service, provider receipt hooks, manual claim/complete/fail RPCs, and tests",
    tests: "npm run test:manual-launch-fencing; npm run test:scheduler-disposable-db; node scripts/test-launch-truth-and-schedule.mjs",
    negative_failure_path_proof: "Not-due/missing intent, duplicate active owner, stale token/generation/expiry, ambiguous or future receipts, conflicting resume IDs, and stale completion fail closed; durable success replays read-only.",
    integrated_proof: "Offline contract and network-disabled PostgreSQL manual/scheduled claim tests passed without Meta requests.",
    residual_risk: "No Meta sandbox or live object creation was authorized; live acceptance remains external.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-024",
    original_claim: "The scheduled Meta worker preflight could fall through browser-session state rather than the exact claimed organization.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "A queue worker has no browser actor; campaign, billing, credentials, persisted account selection, and provider preflight must all bind the claim's organization and authoritative campaign user.",
    affected_surface_files_data: "src/app/api/campaigns/create/route.ts; src/lib/integrations/meta/service.ts; src/lib/services/scheduled-campaign-launch-service.ts; scripts/test-meta-tenant-fencing.mjs",
    implementation_disposition: "PRESERVE_NO_SESSION_ORGANIZATION_SCOPED_META_PREFLIGHT",
    failing_before_evidence: "Independent review found a session-derived preflight call in the internal scheduled path.",
    changed_files_commits: "FILES:organization-scoped Meta credentials/preflight, internal actor launch path, scheduled dispatcher, and tenant-fencing tests",
    tests: "npm run test:meta-tenant-fencing; node scripts/test-meta-contract-hardening.mjs; npm run test:scheduler-disposable-db",
    negative_failure_path_proof: "Wrong-organization credentials are rejected before lookup and the queue preflight test fails if app context or browser Supabase session is touched.",
    integrated_proof: "No-network tenant test passed one exact admin lookup for the claimed organization and zero session lookups.",
    residual_risk: "Provider account ownership and scopes remain unverified without authorized Meta acceptance.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-025",
    original_claim: "Meta OAuth state was cookie-bound but not durably bound to the initiating user and organization across a session switch.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "OAuth state is unpredictable, hash-only at rest, short-lived, one-time, and consumable only by the same authenticated user and organization before token exchange.",
    affected_surface_files_data: "src/lib/integrations/meta/oauth-state.ts; src/app/api/integrations/meta/connect/route.ts; src/app/api/integrations/meta/callback/route.ts; supabase/migrations/20260710235800_harden_meta_oauth_state.sql",
    implementation_disposition: "PRESERVE_USER_WORKSPACE_BOUND_ONE_TIME_OAUTH_STATE",
    failing_before_evidence: "Independent review found a valid cookie state could be returned under a different signed-in workspace before the callback resolved ownership.",
    changed_files_commits: "FILES:OAuth state service, connect/callback routes, one-time state migration, tenant and disposable-database tests",
    tests: "npm run test:meta-tenant-fencing; npm run test:scheduler-disposable-db; node scripts/test-meta-contract-hardening.mjs",
    negative_failure_path_proof: "Wrong workspace, wrong user, expiry, malformed hash, replay, unsafe return path, and token exchange before durable consumption are rejected.",
    integrated_proof: "Offline session-switch/replay contract and network-disabled PostgreSQL one-time consumption tests passed.",
    residual_risk: "Real OAuth consent, scopes, and token exchange were intentionally not exercised.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-026",
    original_claim: "Stripe webhook stale-claim recovery could be won or settled by more than one worker because reclaim authority was not compare-and-swap fenced.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_IN_DISPOSABLE_DATABASE",
    root_cause_invariant: "Webhook processing ownership must use one unpredictable token, monotonic generation, unexpired lease, compare-and-swap reclaim, and fenced settlement.",
    affected_surface_files_data: "src/lib/services/billing-service.ts; src/app/api/billing/webhook/route.ts; supabase/migrations/20260710235900_fence_stripe_webhook_processing.sql",
    implementation_disposition: "PRESERVE_STRIPE_WEBHOOK_CAS_RECLAIM_AND_SETTLEMENT",
    failing_before_evidence: "Independent concurrency review found stale observed state could be reclaimed without a unique current owner fence.",
    changed_files_commits: "FILES:billing webhook claim/settle logic, token/generation migration, handler wiring, and disposable concurrency tests",
    tests: "npm run test:stripe-webhook-disposable-db; node scripts/test-onboarding-activation-billing-contract.mjs",
    negative_failure_path_proof: "Concurrent fresh claims have one winner; stale observed timestamps/tokens/generations and expired or superseded settlement fail closed; event identity collisions are rejected.",
    integrated_proof: "Network-disabled PostgreSQL concurrent claim, reclaim, and stale-settlement suite passed.",
    residual_risk: "A future rollout must coordinate older application versions that still possess service-role direct DML privileges.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-027",
    original_claim: "Stale Stripe metadata could over-entitle or under-entitle a customer when the current subscription item price disagreed.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Current recognized subscription-item price is authoritative; ambiguity and unknown price identities fail closed, while metadata fallback requires an explicit reconciled legacy marker.",
    affected_surface_files_data: "src/lib/billing/stripe-plan-resolution.ts; src/lib/services/billing-service.ts; scripts/test-onboarding-activation-billing-contract.mjs",
    implementation_disposition: "PRESERVE_CURRENT_PRICE_AUTHORITY_AND_FAIL_CLOSED_AMBIGUITY",
    failing_before_evidence: "Independent billing review found stale upgrade/downgrade metadata could disagree with the current price item.",
    changed_files_commits: "FILES:strict Stripe plan resolver, billing integration, and decision-table tests",
    tests: "node scripts/test-onboarding-activation-billing-contract.mjs; npm run typecheck",
    negative_failure_path_proof: "Unknown price, multiple active items, duplicate configured prices, stale metadata, and unmarked legacy fallback are rejected.",
    integrated_proof: "Deterministic billing contract passed current-price precedence and every ambiguity case.",
    residual_risk: "Actual Stripe product/price configuration values require owner-controlled environment acceptance.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-028",
    original_claim: "Normal and onboarding campaign creation paths could race past the one-preview entitlement and directly insert additional campaigns.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_IN_DISPOSABLE_DATABASE",
    root_cause_invariant: "Every campaign create is one tenant/member-checked transaction that locks the organization, derives entitlement from persisted billing, counts, and inserts; exact identity replay and updates are exempt.",
    affected_surface_files_data: "src/lib/services/campaign-creation-entitlement-service.ts; src/lib/services/campaign-persistence.ts; src/lib/services/campaign-plan-persistence-service.ts; supabase/migrations/20260710235950_gate_campaign_creation_entitlement.sql",
    implementation_disposition: "PRESERVE_ATOMIC_AUTHORITATIVE_CAMPAIGN_CREATION_GATE",
    failing_before_evidence: "Independent review found both direct INSERT paths lacked a billing/count gate and concurrent requests could each observe zero campaigns.",
    changed_files_commits: "FILES:campaign creation service, both persistence paths, direct-insert revocation migration, package command, and disposable database test",
    tests: "npm run test:campaign-entitlement-disposable-db; npm run typecheck; npm run routes:security",
    negative_failure_path_proof: "Unknown billing second create, concurrent unpaid race, active but ineligible tier, direct service-role insert, non-member user, and cross-tenant ID collision fail closed; eligible Pro and exact replay pass.",
    integrated_proof: "Network-disabled PostgreSQL produced exactly one unpaid race winner, two eligible paid campaigns, immutable same-ID replay, and correct tenant denials.",
    residual_risk: "The full repository migration chain remains blocked by NEW-001, so deployment is not authorized.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-029",
    original_claim: "Anonymous client-error telemetry remained reachable by default even though same-origin headers do not authenticate ingestion.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Untrusted anonymous telemetry is default-off and returns no ingestion surface unless an explicit public flag is reviewed and enabled.",
    affected_surface_files_data: "src/app/api/client-errors/route.ts; .env.example; scripts/test-security-config-truth.mjs",
    implementation_disposition: "PRESERVE_DEFAULT_OFF_UNTRUSTED_TELEMETRY",
    failing_before_evidence: "Audit and adversarial review confirmed forged Origin was not an authentication boundary.",
    changed_files_commits: "FILES:client-error route default-off gate, environment contract, and security tests",
    tests: "node scripts/test-security-config-truth.mjs; npm run routes:security; npm run test:dealflow-completion",
    negative_failure_path_proof: "Missing or false public flag returns 404 before persistence; malicious instructions remain untrusted and sanitized when the optional surface is explicitly enabled.",
    integrated_proof: "Security/config and route suites passed with the anonymous surface absent by default.",
    residual_risk: "Enabling the flag later requires an explicit abuse and retention review.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-030",
    original_claim: "Passive onboarding render could emit an activation event and persist draft/navigation state before a user action.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Hydration and observational routing are read-only; durable draft writes and completion telemetry begin only after explicit user interaction.",
    affected_surface_files_data: "src/app/(app)/onboarding/page.tsx; scripts/test-onboarding-activation-billing-contract.mjs",
    implementation_disposition: "PRESERVE_USER_ACTION_BOUND_DRAFT_AND_TELEMETRY_WRITES",
    failing_before_evidence: "Audit found onboarding page-view effects changed activation telemetry and browser storage during nominal rendering.",
    changed_files_commits: "FILES:onboarding interaction revision gate, removal of draft/navigation browser persistence, and contract tests",
    tests: "node scripts/test-onboarding-activation-billing-contract.mjs; npm run typecheck; npm run lint",
    negative_failure_path_proof: "Initial hydration, billing read, server draft recovery, and automatic plan routing cannot increment the persistence revision; legacy PII storage is only removed defensively.",
    integrated_proof: "Onboarding contract passed no passive activation event, no draft/navigation localStorage set/get, and explicit-interaction persistence gating.",
    residual_risk: "Legacy PII key deletion is an intentional privacy-protective local mutation, not product telemetry.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-031",
    original_claim: "The route timeout helper stopped awaiting but did not cancel the underlying database/provider operation.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Timeout-wrapped work accepts an AbortSignal, the helper aborts on timeout, and callers propagate that signal into abortable boundaries or use durable reconciliation.",
    affected_surface_files_data: "src/lib/api/route.ts; src/app/api/integrations/meta/status/route.ts; src/lib/integrations/meta/service.ts; scripts/test-meta-contract-hardening.mjs",
    implementation_disposition: "PRESERVE_ABORTABLE_TIMEOUT_FACTORY_CONTRACT",
    failing_before_evidence: "FIND-024 reproduced Promise.race returning while the original operation continued.",
    changed_files_commits: "FILES:timeout factory/AbortController contract, Meta status propagation, Supabase abort signal, and tests",
    tests: "node scripts/test-meta-contract-hardening.mjs; npm run typecheck; npm run lint",
    negative_failure_path_proof: "A timed-out task observes an aborted signal, late completion cannot be returned as success, and the helper rejects non-factory call sites at compile time.",
    integrated_proof: "Offline Meta contract and TypeScript checks passed the abort propagation path.",
    residual_risk: "Non-abortable external effects still require their separate durable idempotency/reconciliation contracts.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-032",
    original_claim: "A retried Meta launch could combine provider objects created from different mutable account, targeting, budget, destination, or creative inputs.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "The first live claim binds one canonical non-secret launch-input snapshot and digest; every receipt and terminal write must share that immutable lineage.",
    affected_surface_files_data: "src/lib/meta-launch-input-snapshot.ts; src/app/api/campaigns/create/route.ts; src/lib/services/campaign-launch-audit-service.ts; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
    implementation_disposition: "PRESERVE_IMMUTABLE_LAUNCH_INPUT_LINEAGE",
    failing_before_evidence: "Independent review proved generation one could create partial objects under configuration A and generation two could resume those IDs under configuration B.",
    changed_files_commits: "FILES:canonical launch snapshot/digest, pre-provider bind, receipt lineage, completion constraints, and two-generation mismatch tests",
    tests: "npm run test:manual-launch-fencing; npm run test:scheduler-disposable-db; node scripts/test-launch-truth-and-schedule.mjs",
    negative_failure_path_proof: "A second generation with changed account/input becomes operator_action_required before any new provider POST; mixed-digest receipts cannot complete.",
    integrated_proof: "No-network contract and disposable PostgreSQL lineage tests passed.",
    residual_risk: "No Meta provider object was created and provider acceptance remains external.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-033",
    original_claim: "Provider-usage reserve/settle and credit compensation could replay, overwrite terminal state, refund ambiguously, or cross organization/user scope.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_IN_DISPOSABLE_DATABASE",
    root_cause_invariant: "One organization+user+attempt reserves once, terminal settlement is compare-and-swap monotonic, ambiguous outcomes reconcile without refund, and compensation has one durable identity.",
    affected_surface_files_data: "src/lib/services/credit-service.ts; src/lib/services/session-cost-guard.ts; supabase/migrations/20260710235991_harden_financial_integrity.sql",
    implementation_disposition: "PRESERVE_TENANT_SCOPED_PROVIDER_USAGE_CAS_AND_EXACTLY_ONCE_COMPENSATION",
    failing_before_evidence: "Adversarial financial review found unconditional terminal overwrites, transport-ambiguity refunds, double-refund exposure, and user-only credit scope.",
    changed_files_commits: "FILES:organization-user credit scope, v2 provider-usage attempt RPCs, atomic Stripe billing projection, migration blockers, and concurrency tests",
    tests: "npm run test:financial-integrity-disposable-db; npm run test:stripe-webhook-disposable-db; npm run typecheck",
    negative_failure_path_proof: "Cross-tenant membership, reused attempt with changed identity, stale settlement, late contradictory completion, duplicate compensation, and ambiguous provider response fail closed.",
    integrated_proof: "Network-disabled PostgreSQL concurrency and replay suite passed.",
    residual_risk: "Historical credit-scope preflight and full migration replay remain blocked by NEW-001.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-034",
    original_claim: "Native Meta Instant Form ingestion and exact page/form-to-campaign route provisioning were absent from the canonical baseline.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "A signed Meta lead event must resolve one active page+form route, persist one canonical tenant-bound lead, suppress unauthorized effects, and reconcile ambiguity without duplicate provider or customer actions.",
    affected_surface_files_data: "src/app/api/meta/leadgen/webhook/route.ts; src/app/api/integrations/meta/leadgen/routes/route.ts; src/lib/services/meta-leadgen-ingestion-service.ts; supabase/migrations/20260710235990_create_meta_leadgen_ingestion.sql",
    implementation_disposition: "PRESERVE_SIGNED_EXACT_ROUTE_NATIVE_LEADGEN_AND_RECONCILIATION",
    failing_before_evidence: "Baseline had no signed leadgen webhook, canonical provider route, dedupe event ledger, or reconciliation state.",
    changed_files_commits: "FILES:native leadgen contract/service/routes, tenant-fenced migration, system-job reconciliation, and tests",
    tests: "npm run test:meta-leadgen; npm run typecheck; npm run routes:security",
    negative_failure_path_proof: "Invalid signature/body, unknown or ambiguous route, provider identity collision, replay, direct DML, max attempts, and forbidden effects are designed to fail closed.",
    integrated_proof: "Offline webhook/route contract and network-disabled PostgreSQL route, dedupe, reconciliation, effect-suppression, RLS, direct-DML, and replay tests passed; no live Meta event was accepted.",
    residual_risk: "Live subscription, form/page permissions, payload variants, and provider acceptance remain external even after local proof.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-035",
    original_claim: "Meta CAPI and browser Pixel effects could be inferred from environment enablement without current policy-version consent evidence, and skipped CAPI work could be labeled queued.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Advertising tracking runs only when the exact current consent-policy evidence and explicit default-off gate both pass; persisted tracking state must describe queued, suppressed, failed, and sent truthfully.",
    affected_surface_files_data: "src/lib/services/lead-effect-aggregation-service.ts; src/lib/services/system-job-service.ts; src/lib/integrations/meta/conversions.ts; src/lib/meta-pixel-consent.ts; public funnel pages; .env.example",
    implementation_disposition: "PRESERVE_FAIL_CLOSED_VERSIONED_META_TRACKING_CONSENT",
    failing_before_evidence: "Environment-only CAPI enablement and unconditional capi_queued tracking could overstate consent and delivery; browser Pixel had no versioned cookie gate.",
    changed_files_commits: "FILES:CAPI consent evidence, effect-policy intersection, truthful tracking events, Pixel cookie/policy control, default-off flags, and tests",
    tests: "node scripts/test-reliability-wave.mjs; node scripts/test-meta-contract-hardening.mjs; node scripts/test-security-config-truth.mjs; npm run test:lead-tracking-health",
    negative_failure_path_proof: "Missing, expired, future, mismatched, revoked, or wrong-policy consent suppresses CAPI/Pixel before provider dispatch and records no false queued success.",
    integrated_proof: "No-network policy and source integration tests passed.",
    residual_risk: "Owner/legal consent wording, version, retention, withdrawal, and production configuration are not approved.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-036",
    original_claim: "The one-time Meta OAuth authorization code exchange inherited generic retry behavior and could be replayed after an ambiguous response.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "A one-time OAuth code is sent at most once; any transport or non-success ambiguity stops before extension and requires a fresh authorization flow.",
    affected_surface_files_data: "src/lib/integrations/meta/request.ts; src/app/api/integrations/meta/callback/route.ts; scripts/test-meta-contract-hardening.mjs",
    implementation_disposition: "PRESERVE_ZERO_RETRY_ONE_TIME_CODE_EXCHANGE",
    failing_before_evidence: "Generic POST retry semantics could resend a consumed code after a network or 5xx ambiguity.",
    changed_files_commits: "FILES:OAuth exchange purpose split, zero-retry ambiguity error, callback sequencing, and fetch-count tests",
    tests: "node scripts/test-meta-contract-hardening.mjs; npm run typecheck",
    negative_failure_path_proof: "Network failure and 5xx each produce meta_oauth_code_exchange_ambiguous after exactly one fetch and no token-extension call.",
    integrated_proof: "No-network deterministic request tests passed.",
    residual_risk: "Real OAuth consent, code exchange, long-lived token extension, and scope acceptance were not exercised.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-037",
    original_claim: "Production lead capture could accept Cloudflare Turnstile test credentials or lack an exact allowed-hostname contract.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Production lead capture requires non-test site and secret keys, exact normalized allowed hostnames, expected action, and a verified response before persistence.",
    affected_surface_files_data: "src/lib/security/turnstile.ts; src/app/api/lead-capture/route.ts; .env.example; scripts/test-security-config-truth.mjs",
    implementation_disposition: "PRESERVE_PRODUCTION_TURNSTILE_KEY_AND_HOSTNAME_FAIL_CLOSED_GATE",
    failing_before_evidence: "Baseline example test keys and implicit host assumptions could not prove production anti-bot configuration.",
    changed_files_commits: "FILES:Turnstile configuration validator, response hostname/action checks, closed environment example, and negative tests",
    tests: "node scripts/test-security-config-truth.mjs; npm run typecheck; npm run routes:security",
    negative_failure_path_proof: "Test keys, missing/foreign hostname, wrong action, unsuccessful response, missing token, and configuration ambiguity fail before lead persistence.",
    integrated_proof: "Offline configuration and synthetic response tests passed.",
    residual_risk: "The exact deployed key/hostname states require signed environment attestation and remain absent.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-038",
    original_claim: "Placeholder or low-entropy Meta encryption, access-key, and internal runner secrets could satisfy non-empty checks, and internal runner fallback authority was ambiguous.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Sensitive gates accept only high-entropy non-placeholder secrets; internal runner secrets are explicit, deduplicated, and independently attested without exposing values.",
    affected_surface_files_data: "src/lib/env.ts; src/lib/security/internal-system-jobs-auth.ts; .env.example; scripts/test-security-config-truth.mjs",
    implementation_disposition: "PRESERVE_STRONG_SECRET_POLICY_AND_EXPLICIT_INTERNAL_RUNNER_AUTHORITY",
    failing_before_evidence: "Any nonempty Meta token key and placeholder-like access/internal secrets could reach sensitive code paths.",
    changed_files_commits: "FILES:strong-secret validator, Meta/access/internal environment readers, internal runner authentication, default-empty example, and tests",
    tests: "node scripts/test-security-config-truth.mjs; npm run typecheck; npm run lint",
    negative_failure_path_proof: "Short, repeated, known-placeholder, low-character-class, missing, and conflicting secret inputs fail closed; values are never logged or emitted.",
    integrated_proof: "Offline decision matrix and route contract passed.",
    residual_risk: "Actual deployed secret-strength booleans are not signed/attested and values were correctly not inspected.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-039",
    original_claim: "Access-key checkout could strand paid activation, overwrite concurrent reveal handoffs, or irreversibly consume ciphertext before browser delivery.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "One exact owner workspace holds a renewable reconciliation lease; each paid checkout has a session-derived browser handoff; ciphertext remains recoverable until a successfully rendered delivery is acknowledged, then becomes irrecoverable atomically.",
    affected_surface_files_data: "src/lib/services/access-key-service.ts; src/lib/access-key-reveal-cookie.ts; src/app/api/access-keys/reveal-ack/route.ts; supabase/migrations/20260710235992_harden_access_key_reveal_claim.sql; supabase/migrations/20260710235993_harden_access_key_claim_delivery.sql; scripts/test-access-key-security-disposable-db.mjs",
    implementation_disposition: "PRESERVE_RECOVERABLE_CLAIM_AND_TWO_PHASE_REVEAL_DELIVERY",
    failing_before_evidence: "Adversarial review found an unreachable claimed-row recovery branch, global-cookie overwrite, ciphertext deletion before decrypt/delivery, and flaky disposable readiness.",
    changed_files_commits: "FILES:exact claim reconciliation lease/generation, deterministic same-email preclaim, session-derived capped cookies, begin/release/ack reveal delivery, integrity verification, public partner-checkout scope, migration, and tests",
    tests: "npm run test:access-key-security-disposable-db; npm run test:access-key-checkout-signup; node scripts/test-access-key-commercial-activation.mjs",
    negative_failure_path_proof: "Wrong user/organization/session/email, unpaid checkout, concurrent claimant, stale lease/generation, failed decrypt/hash verification, stale acknowledgement, duplicate consumption, and direct secret reads fail closed; unacknowledged delivery can retry only after its bounded lease.",
    integrated_proof: "Offline contracts and repeated network-disabled PostgreSQL access-key concurrency/recovery tests passed.",
    residual_risk: "No live Stripe checkout or production secret delivery was authorized.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-040",
    original_claim: "Stripe test/live object modes could mix in production and subscription webhooks could project stale event payloads when authoritative retrieval was ambiguous.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "Production uses validated live keys/objects only; explicit test mode is nonproduction-only; current subscription retrieval precedes atomic projection and ambiguity remains retryable without state change.",
    affected_surface_files_data: "src/lib/env.ts; src/lib/services/billing-service.ts; src/lib/services/access-key-service.ts; scripts/test-stripe-runtime-mode-contract.mjs; scripts/test-stripe-webhook-disposable-db.mjs",
    implementation_disposition: "PRESERVE_STRIPE_RUNTIME_MODE_AND_AUTHORITATIVE_REFRESH_FENCE",
    failing_before_evidence: "An implicit test key or event/object livemode mismatch could enter production, and retrieval failure could fall back to stale webhook ordering.",
    changed_files_commits: "FILES:Stripe runtime/key mode validation, object livemode fences, authoritative-only refresh, retryable failure settlement, and tests",
    tests: "npm run test:stripe-runtime-mode; npm run test:stripe-webhook-disposable-db; node scripts/test-security-config-truth.mjs",
    negative_failure_path_proof: "Production forced-test mode, wrong key slot/prefix, mixed-livemode objects, retrieval ambiguity, and metadata-inflated credit intent fail closed without billing projection.",
    integrated_proof: "Offline runtime matrix and disposable PostgreSQL reclaim/no-projection tests passed.",
    residual_risk: "Actual production Stripe keys, endpoint mode, products/prices, retrieval, and webhook delivery remain externally unverified.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-041",
    original_claim: "Release-mode build/test/schema/visual/drain JSON could be fabricated by the caller and no exact-deployment environment attestation existed.",
    canonical_status: "IMPLEMENTED_GUARD_VERIFIED_PRODUCTION_AUTHORITY_ABSENT",
    root_cause_invariant: "Every release evidence class is target/source/run/time/digest bound and Ed25519-verified against a protected external authority; the external policy authorizes the candidate-policy digest and environment/drain identify one exact deployment.",
    affected_surface_files_data: "scripts/generate-release-guard.mjs; scripts/test-release-guard.mjs; docs/dealflow-completion/release-trust-policy.json",
    implementation_disposition: "KEEP_PRODUCTION_TRUST_POLICY_UNCONFIGURED_UNTIL_REAL_AUTHORITY_IS_OWNER_APPROVED",
    failing_before_evidence: "Version-one evidence trusted caller-authored executed/status/log fields and unsigned zero-worker counts.",
    changed_files_commits: "FILES:signed release evidence v2, guard v4, protected external trust policy/digest contract, informational candidate policy, exact-deployment environment/drain claims, and adversarial tests",
    tests: "npm run test:release-guard; npm run typecheck; targeted ESLint",
    negative_failure_path_proof: "Unsigned, self-signed, unpinned, stale/future, digest-tampered, wrong-source/project/deployment, unsafe flag, weak secret, test Turnstile, wrong Stripe mode, and nonzero drain evidence fail closed.",
    integrated_proof: "Runtime-generated Ed25519 evidence passes only through a protected external policy/digest; target-added self-signed authority fails, authorized rotation is tested, and no production external policy was supplied.",
    residual_risk: "Trusted production authority, exact deployed environment, and signed zero-old-worker evidence are absent; real release mode is NO_GO.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-042",
    original_claim: "The Meta data-deletion confirmation page lacked durable public status truth and could imply deletion completion after accepting responsibility.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED_RESPONSIBILITY_ONLY",
    root_cause_invariant: "A confirmation code exposes only sanitized durable responsibility status; acceptance, queued work, completion, failure, and freshness are distinct and no unperformed deletion is claimed.",
    affected_surface_files_data: "src/lib/services/meta-deletion-service.ts; src/app/api/meta/data-deletion/route.ts; src/app/data-deletion/page.tsx; supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql",
    implementation_disposition: "PRESERVE_PUBLIC_STATUS_TRUTH_AND_BLOCK_COMPLETION_CLAIMS_WITHOUT_EXECUTED_DELETION",
    failing_before_evidence: "Baseline callback returned an acknowledgment URL without a durable, replay-safe public responsibility state.",
    changed_files_commits: "FILES:durable deletion responsibility/status service, confirmation page truth states, freshness/replay checks, and tests",
    tests: "node scripts/test-meta-contract-hardening.mjs; node scripts/test-reliability-wave.mjs",
    negative_failure_path_proof: "Malformed/forged/stale/future/replayed requests, unknown confirmation, storage failure, and incomplete work never render completed.",
    integrated_proof: "Signed-request and status decision tests passed offline; no customer/provider data was deleted.",
    residual_risk: "The actual data inventory, deletion/anonymization execution, retention exceptions, provider handoff, and SLA require owner/legal approval.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-043",
    original_claim: "A user with membership in multiple workspaces has no fully proven explicit workspace-selection and session-switch journey across every route, job, billing, and provider boundary.",
    canonical_status: "OPEN_OWNER_AND_AUTHENTICATED_RUNTIME_BLOCKER",
    root_cause_invariant: "The active workspace is explicit, user-selected or deterministically singular, server-authoritative, and carried unchanged through every mutation and asynchronous effect.",
    affected_surface_files_data: "src/lib/services/app-context.ts; app layout/navigation; campaign, billing, Meta, GHL, lead, asset, and job services",
    implementation_disposition: "REQUIRE_OWNER_WORKSPACE_SELECTION_CONTRACT_AND_ISOLATED_MULTI_WORKSPACE_BROWSER_DB_PROOF",
    failing_before_evidence: "Static tenant fences exist, but no authorized authenticated browser fixture proved selection, switching, stale tabs, role changes, and background work end to end.",
    changed_files_commits: "No candidate UI selection contract is claimed complete.",
    tests: "Static tenant checks and disposable database suites only; authenticated multi-workspace journey blocked.",
    negative_failure_path_proof: "Candidate services generally fail closed on mismatch, but the complete UI/session selection lifecycle is not proven.",
    integrated_proof: "Precise gap retained without inventing a workspace policy.",
    residual_risk: "Wrong-workspace display or mutation remains possible on an untested route; owner decision materially changes the UX and session contract.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-044",
    original_claim: "Consent, data retention, export, deletion, GHL/Meta processor roles, and provider offboarding rules are not owner/legal approved.",
    canonical_status: "OPEN_LEGAL_POLICY_BLOCKER",
    root_cause_invariant: "Every collected field and provider effect has a lawful purpose, versioned consent where required, retention/deletion schedule, export path, processor ownership, and auditable withdrawal/offboarding behavior.",
    affected_surface_files_data: "lead capture, Meta CAPI/Pixel, Meta leadgen, GHL provisioning/sync, support/telemetry, deletion responsibility, audit logs",
    owner_requirement: "Approve consent text/version, data inventory, retention periods, deletion exceptions, processor/controller roles, export/offboarding obligations, and provider-specific terms.",
    implementation_disposition: "NO_PRODUCTION_ENABLEMENT_UNTIL_OWNER_LEGAL_POLICY_IS_VERSIONED",
    failing_before_evidence: "No authoritative policy/version was supplied; the candidate correctly leaves tracking/provider paths disabled or blocked.",
    changed_files_commits: "FILES:default-off consent gates and truthful blocked states only; no legal policy invented",
    tests: "Consent fail-closed tests pass; legal sufficiency is not a software test.",
    negative_failure_path_proof: "Absent/mismatched consent and policy versions suppress tracking; public-lead CAPI has no producer and is intentionally unreachable; deletion does not claim completion.",
    integrated_proof: "Technical default-off controls preserve the blocker. Pixel has a versioned browser control, but CAPI collection, expiry, and withdrawal are not claimed implemented; owner/legal approval remains external.",
    residual_risk: "Production collection or provider enablement without this policy creates privacy, contractual, and customer-trust risk.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-045",
    original_claim: "Operator response times, retry ceilings, dead-letter ownership, deletion completion SLA, support escalation, and provider-ambiguity resolution are not owner approved.",
    canonical_status: "OPEN_OWNER_OPERATING_POLICY_BLOCKER",
    root_cause_invariant: "Every operator_action_required or durable pending state has a named owner, severity, response target, escalation, customer communication rule, and safe terminal outcome.",
    affected_surface_files_data: "system jobs; launch records; GHL outbox; support outbox; Meta deletion; Meta leadgen reconciliation; billing/provider usage ambiguity",
    owner_requirement: "Approve operator queues, response/retention SLAs, escalation ownership, and customer-facing status/communication policy.",
    implementation_disposition: "KEEP_LIVE_AUTOMATION_DISABLED_UNTIL_OPERATING_POLICY_IS_APPROVED",
    failing_before_evidence: "Code can expose durable operator states, but no authoritative staffing or response policy was provided.",
    changed_files_commits: "No SLA or customer communication was invented or sent.",
    tests: "Terminalization and operator-state tests only; staffing/SLA acceptance is external.",
    negative_failure_path_proof: "Bounded retries stop rather than loop or claim success; unresolved ambiguity remains visible.",
    integrated_proof: "Technical terminal states are present while policy ownership remains explicit.",
    residual_risk: "Without ownership and SLA, durable failures can remain unresolved and customer expectations cannot be stated truthfully.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-046",
    original_claim: "Production release prerequisites remain absent despite local candidate controls and tests.",
    canonical_status: "NO_GO_EXTERNAL_PROOF_SET_INCOMPLETE",
    root_cause_invariant: "Release requires one exact candidate with passing full migration/recovery, authoritative worker drain/environment evidence, isolated staging, provider acceptance, domain ancestry, and owner policy approvals.",
    affected_surface_files_data: "fresh migration replay; release guard; deployment/environment; Meta/GHL/Twilio/Stripe/creative; independent domains; staging; consent/retention/SLA decisions",
    implementation_disposition: "DO_NOT_DEPLOY_OR_ENABLE_PROVIDERS",
    failing_before_evidence: "Fresh replay fails at the first migration; no rollback drill, signed old-worker drain, deployed env attestation, staging, live-provider acceptance, or independent-domain source ancestry exists.",
    changed_files_commits: "Candidate local controls only; no external mutation performed.",
    tests: "See TEST_AND_PROOF_MATRIX.md and release guard; missing external proof is not relabeled as pass.",
    negative_failure_path_proof: "The unconfigured production trust policy and exact blocker register force NO_GO.",
    integrated_proof: "Every safely discoverable local surface is accounted for; absent external authority remains precise.",
    residual_risk: "Deploying would cross unproven schema, worker, environment, provider, domain, privacy, and operating-policy boundaries.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-047",
    original_claim: "Manual and scheduled Meta launch completion could drift from the immutable launch snapshot, validate a reloaded provider selection, or lose exact terminal error/operator truth.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "Preflight, provider mutation, lineage receipts, tracking metadata, completion, and terminal errors all bind to one persisted launch-input digest and exact credential selection.",
    affected_surface_files_data: "src/lib/meta-launch-input-snapshot.ts; src/app/api/campaigns/create/route.ts; src/lib/integrations/meta/service.ts; src/lib/services/scheduled-campaign-launch-service.ts; src/lib/services/campaign-launch-audit-service.ts; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
    implementation_disposition: "PRESERVE_EXACT_IMMUTABLE_META_LAUNCH_INPUT_BINDING",
    failing_before_evidence: "Adversarial review proved that reloaded mutable selection/config data could be validated or reported after a different immutable launch snapshot had been bound.",
    changed_files_commits: "FILES:destination-host snapshot field, exact-credential preflight, snapshot-change denial, digest-only completion, stored-snapshot tracking derivation, terminal code/operator propagation, migration, and tests",
    tests: "node scripts/test-manual-launch-fencing.mjs; npm run test:scheduler-disposable-db; node scripts/test-launch-truth-and-schedule.mjs; npm run typecheck",
    negative_failure_path_proof: "Changed connection/account/page/pixel/token, destination-host mismatch, wrong digest, late completion, and terminal bind mismatch fail closed and retain exact operator-visible error codes.",
    integrated_proof: "Offline manual-launch contract and fresh network-disabled PostgreSQL scheduler lineage tests passed.",
    residual_risk: "No live Meta launch was performed; provider acceptance, exact deployed configuration, and PAUSED delivery state remain externally unverified.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-048",
    original_claim: "A renewable system-job lease token/generation was included in paid provider idempotency keys, permitting a reclaimed job to obtain a new spend identity.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_OFFLINE_AND_DISPOSABLE_DATABASE_CONTRACT",
    root_cause_invariant: "A logical paid provider operation has one job-stable idempotency key independent of renewable lease ownership.",
    affected_surface_files_data: "src/lib/services/system-job-service.ts; scripts/test-reliability-wave.mjs; scripts/test-financial-integrity-disposable-db.mjs",
    implementation_disposition: "PRESERVE_JOB_STABLE_PAID_PROVIDER_IDEMPOTENCY",
    failing_before_evidence: "Adversarial review found static and video generation keys containing renewable lease values, allowing duplicate provider attempts after a valid reclaim.",
    changed_files_commits: "FILES:job-stable static/video provider idempotency keys and negative contract/database assertions excluding lease token and generation",
    tests: "node scripts/test-reliability-wave.mjs; npm run test:financial-integrity-disposable-db; targeted ESLint",
    negative_failure_path_proof: "Lease renewal, expiry, reclaim, or generation change cannot alter the provider operation identity; a second reserve resolves the existing attempt instead of creating paid work.",
    integrated_proof: "Offline worker-contract checks and network-disabled PostgreSQL financial integrity tests passed.",
    residual_risk: "No paid creative provider was called and provider-side reconciliation behavior remains externally unverified.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-049",
    original_claim: "The Meta connect route could request a hard-coded OAuth scope set that omitted native lead retrieval authority.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "The connect route consumes the validated configured scope set and refuses startup when the exact required OAuth permissions for selected assets, webhooks, and lead retrieval are absent.",
    affected_surface_files_data: "src/app/api/integrations/meta/connect/route.ts; src/lib/env.ts; scripts/test-meta-contract-hardening.mjs",
    implementation_disposition: "PRESERVE_VALIDATED_EXACT_META_OAUTH_SCOPE_CONTRACT",
    failing_before_evidence: "Adversarial review found a route-local scope list without leads_retrieval, diverging from native leadgen requirements.",
    changed_files_commits: "FILES:validated environment scope consumption, required pages_manage_metadata/leads_retrieval permissions, fail-closed configuration, and contract tests",
    tests: "node scripts/test-meta-contract-hardening.mjs; targeted ESLint; npm run typecheck",
    negative_failure_path_proof: "Missing required scopes or a route-local hard-coded substitute fails before redirecting to Meta.",
    integrated_proof: "Deterministic source and configuration contract tests passed.",
    residual_risk: "No real Meta consent screen, permission grant, app review, token exchange, or lead retrieval was authorized.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-050",
    original_claim: "Public rate limiting trusted the first caller-supplied X-Forwarded-For value without an explicit deployment-proxy contract.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED_FOR_VERCEL",
    root_cause_invariant: "Production client identity is derived only from the platform-authenticated Vercel forwarding header; unknown production proxy topology falls back to an anonymous shared key rather than trusting spoofable input.",
    affected_surface_files_data: "src/lib/api/client-ip.ts; src/lib/api/rate-limit.ts; scripts/test-client-ip-contract.mjs; docs/dealflow-completion/SECURITY_CONFIG_TRUTH_TRANCHE.md",
    implementation_disposition: "PRESERVE_EXPLICIT_NORMALIZED_VERCEL_CLIENT_IP_AUTHORITY",
    failing_before_evidence: "Adversarial review showed arbitrary X-Forwarded-For prefixes could select independent rate-limit buckets.",
    changed_files_commits: "FILES:IPv4/IPv6/port normalization, Vercel-only trusted header selection, unknown-production anonymous fallback, offline matrix, and completion-suite registration",
    tests: "npm run test:client-ip-contract; npm run routes:security; npm run lint",
    negative_failure_path_proof: "Spoofed generic forwarding headers, malformed/obfuscated values, ports, and unknown production proxy context do not create attacker-selected buckets.",
    integrated_proof: "Deterministic client-IP and route-security matrices passed against the documented Vercel contract.",
    residual_risk: "A future non-Vercel proxy/CDN requires an explicit trusted-hop contract before production use; the candidate is not deployed.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-051",
    original_claim: "Any active workspace member could provision a native Meta leadgen route for a campaign, and the service-role RPC did not independently recheck actor authority.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "Route provisioning requires the organization owner, the still-active campaign owner, or an active exact-admin member; the database rechecks authorization and removes the actor-less overload.",
    affected_surface_files_data: "src/lib/services/meta-leadgen-route-service.ts; supabase/migrations/20260710235990_create_meta_leadgen_ingestion.sql; scripts/test-meta-leadgen-contract.mjs; scripts/test-meta-leadgen-disposable-db.mjs",
    implementation_disposition: "PRESERVE_SERVICE_AND_DATABASE_META_LEADGEN_ROUTE_RBAC",
    failing_before_evidence: "Adversarial review proved an ordinary member could bind a route and membership removal could race a service-only mutation.",
    changed_files_commits: "FILES:owner/campaign-owner/admin service gate, actor-bound RPC, active-membership recheck, unsafe-overload removal, exact privilege denial, and tests",
    tests: "npm run test:meta-leadgen; npm run routes:security; node scripts/check-tenant-isolation.mjs; npm run typecheck",
    negative_failure_path_proof: "Ordinary member, removed campaign owner, cross-tenant actor, direct RPC caller, and actor-less overload fail; organization owner, active campaign owner, and exact admin pass.",
    integrated_proof: "Contract checks and a fresh network-disabled PostgreSQL RBAC/privilege suite passed.",
    residual_risk: "No live Meta Page/form subscription or signed provider delivery was authorized.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-052",
    original_claim: "Server-side Meta CAPI has no public consent-evidence producer, expiry contract, or withdrawal propagation and therefore cannot truthfully be called ready.",
    canonical_status: "INTENTIONALLY_UNREACHABLE_PENDING_OWNER_LEGAL_CONSENT_CONTRACT",
    root_cause_invariant: "CAPI remains suppressed until explicit form collection, server-stamped versioned evidence, expiry, withdrawal, and downstream suppression/deletion semantics are approved and proven.",
    affected_surface_files_data: "src/lib/integrations/meta/conversions.ts; src/lib/meta-pixel-consent.ts; public lead form; consent/retention policy",
    owner_requirement: "Approve CAPI purpose/text/version, evidence fields, expiry, withdrawal propagation, retention, deletion, and processor terms before any collection path is implemented or enabled.",
    implementation_disposition: "KEEP_CAPI_DEFAULT_OFF_AND_UNREACHABLE",
    failing_before_evidence: "Source tracing found no producer for the advertisingConsent object required by the server-side conversion path.",
    changed_files_commits: "FILES:truth documentation and default-off suppression only; no consent or legal policy was invented",
    tests: "Consent fail-closed contract tests; source tracing; legal sufficiency is not a software test.",
    negative_failure_path_proof: "Environment enablement without exact current consent evidence still suppresses CAPI.",
    integrated_proof: "The absence is accounted for as a hard blocker rather than being relabeled as production readiness.",
    residual_risk: "Any future collection or enablement without the approved contract creates privacy, contractual, and deletion-obligation risk.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-053",
    original_claim: "The financial ledger is mutation-protected but legacy user and organization deletion foreign keys can cascade or null historical attribution, so full append-only retention is not proven.",
    canonical_status: "OPEN_OWNER_LEGAL_RETENTION_MODEL_BLOCKER",
    root_cause_invariant: "Financial history survives subject/workspace deletion under an owner/legal-approved retention model using restriction or a durable anonymized surrogate without silently destroying attribution.",
    affected_surface_files_data: "user_credit_ledger and related financial foreign keys; deletion/account-offboarding policy; migration and recovery portfolio",
    owner_requirement: "Choose and approve RESTRICT versus durable anonymized-surrogate retention, exceptions, access controls, retention period, export, and deletion behavior.",
    implementation_disposition: "DO_NOT_CHANGE_LEGACY_DELETION_SEMANTICS_WITHOUT_OWNER_LEGAL_AUTHORITY",
    failing_before_evidence: "Schema review found ON DELETE CASCADE for the user link and SET NULL organization behavior that conflicts with an unconditional append-only-retention claim.",
    changed_files_commits: "FILES:systems-of-record and billing-truth caveats only; no destructive or policy-bearing migration was invented",
    tests: "Static schema/foreign-key review; legal retention sufficiency and migration recovery are external.",
    negative_failure_path_proof: "The audit no longer treats trigger-level mutation protection as proof that deletion cannot erase or de-identify history.",
    integrated_proof: "The exact schema-policy conflict is retained in the blocker and owner-decision register.",
    residual_risk: "Account/workspace deletion may destroy or detach financial attribution until a reviewed retention design is implemented and migration-tested.",
    final_status: "BLOCKED_BY_EXTERNAL_AUTHORITY",
  },
  {
    id: "NEW-054",
    original_claim: "An arbitrary one-segment partner slug could render DealFlow-hosted checkout branding before the partner was proven active and nondeleted.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "Checkout metadata and visible branding derive only from one exact server-resolved active, nondeleted partner; an unresolved, disabled, malformed, inactive, or deleted slug renders no checkout.",
    affected_surface_files_data: "src/app/p/[partnerSlug]/checkout/page.tsx; src/lib/services/access-key-service.ts; scripts/test-access-key-binding-contract.mjs",
    implementation_disposition: "PRESERVE_SHARED_SERVER_PARTNER_RESOLUTION_BEFORE_RENDER",
    failing_before_evidence: "Independent review proved a URL-derived brand and payment call-to-action rendered on a first-party domain even when no partner row existed.",
    changed_files_commits: "FILES:shared active/nondeleted partner resolver, page and metadata not-found gates, stored-slug-only branding, and adversarial contract tests",
    tests: "npm run test:access-key-binding; npm run test:access-key-checkout-signup; targeted ESLint",
    negative_failure_path_proof: "Missing, malformed, inactive, deleted, mismatched, feature-disabled, and database-error cases do not render URL-derived partner branding or an actionable checkout.",
    integrated_proof: "Offline server resolver/page contract tests passed without a provider or customer action.",
    residual_risk: "No production partner page, checkout, or provider acceptance was exercised; partner naming policy remains an owner content responsibility.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-055",
    original_claim: "A valid signed Stripe checkout could activate or return the wrong access-key entitlement because row, client-reference, customer, subscription, plan, and price bindings were not all revalidated.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_OFFLINE_AND_DISPOSABLE_DATABASE_CONTRACT",
    root_cause_invariant: "Before activation or any settled-status return, the signed checkout, expanded customer, current subscription, persisted row, single quantity-one recurring price, internal plan, and partner snapshot agree exactly; only an all-null created row may use a fenced recovery CAS.",
    affected_surface_files_data: "src/lib/billing/access-key-checkout-binding.ts; src/lib/services/access-key-service.ts; src/app/access-key/success/page.tsx; scripts/test-access-key-binding-contract.mjs; scripts/test-access-key-security-disposable-db.mjs",
    implementation_disposition: "PRESERVE_IMMUTABLE_END_TO_END_STRIPE_ACCESS_KEY_BINDING",
    failing_before_evidence: "Independent review found activation selected by session metadata alone and returned already-settled rows before checking stored checkout/customer/subscription/price identity.",
    changed_files_commits: "FILES:pure binding validator, authoritative expanded checkout/current subscription verification, pre-return settled-row validation, single-item/no-pagination price contract, all-null-only recovery CAS, success-page fail-closed behavior, and tests",
    tests: "npm run test:access-key-binding; npm run test:access-key-checkout-signup; node scripts/test-access-key-commercial-activation.mjs; npm run test:access-key-security-disposable-db",
    negative_failure_path_proof: "Wrong key/client reference/session/customer/subscription/plan/price/partner, multiple or truncated items, non-unit quantity, nonrecurring price, partial persisted identity, incomplete payment, and settled-row mismatch fail before entitlement return or mutation.",
    integrated_proof: "Adversarial pure contracts and network-disabled PostgreSQL claim/reveal recovery tests passed; the narrow created-row recovery uses exact null/identity compare-and-set fencing.",
    residual_risk: "No live Stripe checkout, customer, subscription, webhook, or secret reveal was authorized; deployed product/price configuration remains externally unattested.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-056",
    original_claim: "A Meta create timeout, unknown response, 2xx without an ID, or provider-receipt persistence failure could be classified as retryable and create a duplicate PAUSED provider object after a stale name lookup.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_DISPOSABLE_DATABASE_AND_OFFLINE_CONTRACT",
    root_cause_invariant: "Every campaign/ad-set/creative/ad POST is armed under the exact launch lease and object key immediately before mutation; only a matching durable receipt or an explicit bounded provider rejection clears the arm, while every other outcome terminalizes to operator reconciliation and cannot be reclaimed.",
    affected_surface_files_data: "src/app/api/campaigns/create/route.ts; src/app/api/campaigns/[id]/launch/route.ts; src/lib/services/campaign-launch-audit-service.ts; src/lib/services/scheduled-campaign-launch-service.ts; src/lib/scheduled-launch-gate.ts; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql; scripts/test-manual-launch-fencing.mjs; scripts/test-scheduler-disposable-db.mjs",
    implementation_disposition: "PRESERVE_PER_STAGE_PRE_POST_MUTATION_ARM_AND_OPERATOR_ONLY_AMBIGUITY",
    failing_before_evidence: "Independent review proved deterministic names were only lookup identities, not provider-enforced idempotency keys, while 408/503/unknown and reclaimable manual failure states could issue another POST.",
    changed_files_commits: "FILES:four-stage pre-POST arm callbacks, explicit rejection classifier, receipt-bound settlement, exact operator error propagation, pending-mutation claim/release/fail terminalization, old-worker denial, and adversarial database/contract tests",
    tests: "npm run test:manual-launch-fencing; node scripts/test-launch-truth-and-schedule.mjs; npm run test:scheduler-disposable-db; npm run typecheck",
    negative_failure_path_proof: "Unknown worker, wrong lease/generation/stage/key, timeout, transport error, throttle/conflict/server error, empty or 2xx-without-ID response, receipt/settlement failure, expired pending claim, and ambiguous lookup cannot clear or reclaim the mutation; an exact explicit provider rejection can retry.",
    integrated_proof: "Offline four-stage source contracts and network-disabled PostgreSQL arm/settle/expiry/reclaim/operator-identity scenarios passed.",
    residual_risk: "No Meta object was created; provider-side visibility latency, exact error taxonomy, and reconciliation acceptance require a separately authorized sandbox/canary before enablement.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-057",
    original_claim: "An internally consistent but corrupted access-key row could repeat an unknown tier or wrong price through Stripe metadata, and an already-expanded event session could avoid authoritative checkout/customer refresh.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "The persisted tier is one exact allowed internal tier, its snapshot equals the runtime-configured Stripe price, and every activation unconditionally refreshes the exact Checkout Session with expanded customer before comparing the immutable envelope and current subscription.",
    affected_surface_files_data: "src/lib/billing/access-key-checkout-binding.ts; src/lib/services/access-key-service.ts; scripts/test-access-key-binding-contract.mjs",
    implementation_disposition: "PRESERVE_CONFIGURED_TIER_PRICE_AUTHORITY_AND_UNCONDITIONAL_CHECKOUT_REFRESH",
    failing_before_evidence: "Cross-review proved arbitrary repeated tier/price strings could self-agree and expanded incoming event objects skipped current Checkout Session retrieval.",
    changed_files_commits: "FILES:strict stored-tier parser, configured-price authority check, unconditional expanded Checkout refresh, incoming/current envelope comparison, and adversarial tests",
    tests: "npm run test:access-key-binding; npm run test:access-key-checkout-signup; node scripts/test-access-key-commercial-activation.mjs; npm run typecheck",
    negative_failure_path_proof: "Unknown tier, missing configured price, internally repeated wrong tier-price, stale expanded session/customer, refreshed identity drift, and current subscription mismatch fail before activation or settled-row return.",
    integrated_proof: "Pure adversarial binding tests and service source/runtime-contract tests passed with a fake provider and no network.",
    residual_risk: "Exact deployed Stripe keys/products/prices and live provider freshness remain externally unattested.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-058",
    original_claim: "The access-key success URL first rendered checkout-complete/key-ready claims without verification, then conflated a verified paid checkout with whether a key was available for delivery in this browser and overclaimed prior reveal history.",
    canonical_status: "IMPLEMENTED_AND_OFFLINE_VERIFIED",
    root_cause_invariant: "The UI models checkout verification and current key-delivery availability independently: verified+available, verified+unavailable, and unverified states use distinct copy, and no prior reveal/acknowledgement or payment-confirmation state is inferred without durable evidence.",
    affected_surface_files_data: "src/lib/access-key-success-truth.ts; src/app/access-key/success/page.tsx; scripts/test-access-key-binding-contract.mjs",
    implementation_disposition: "PRESERVE_THREE_STATE_CHECKOUT_VERIFICATION_AND_KEY_DELIVERY_TRUTH",
    failing_before_evidence: "Cross-review showed errors collapsed to null while ready copy remained; a second review then showed rawKey null can follow a verified checkout after prior acknowledgement or an active delivery lease, making checkout-not-verified/no-prior-reveal/refresh-Stripe copy false.",
    changed_files_commits: "FILES:pure three-state truth function, verified-checkout versus key-availability integration, unsupported reveal/confirmation copy removal, and executed state-matrix tests",
    tests: "npm run test:access-key-binding; npm run test:access-key-checkout-signup; npm run lint",
    negative_failure_path_proof: "Missing/invalid/error handoffs are unverified; verified checkout with consumed/leased/unavailable delivery remains verified but not currently revealable; only exact raw-key+delivery-token+session renders ready; no state asserts whether a prior reveal occurred without evidence.",
    integrated_proof: "Executed pure state-matrix and page-integration contracts passed; no payment or key was created.",
    residual_risk: "Authenticated/browser/provider acceptance of every payment transition remains blocked.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-059",
    original_claim: "A crashed manual Meta worker with an expired armed mutation could not reach the SQL ambiguity terminalizer because the route precheck excluded processing records.",
    canonical_status: "IMPLEMENTED_AND_VERIFIED_WITH_ROUTE_SERVICE_AND_DISPOSABLE_DATABASE_CONTRACT",
    root_cause_invariant: "The manual route admits processing records only to the exact fenced claim RPC; active leases remain unavailable, expired pending mutations terminalize to operator action, non-due work never claims, and no provider dispatch occurs before the persisted code/ID is surfaced.",
    affected_surface_files_data: "src/lib/services/campaign-launch-audit-service.ts; src/app/api/campaigns/[id]/launch/route.ts; scripts/test-manual-launch-reachability.mjs; scripts/test-manual-launch-fencing.mjs; supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
    implementation_disposition: "PRESERVE_MANUAL_ROUTE_TO_SQL_AMBIGUITY_TERMINALIZER_REACHABILITY",
    failing_before_evidence: "Cross-review showed the precheck returned campaign_launch_not_scheduled before claim, leaving an expired pending mutation stuck in processing unless the separately gated scheduler ran.",
    changed_files_commits: "FILES:processing-state precheck admission, authoritative null-claim terminal lookup, exact operator error response, route/service fake proof, and completion-suite registration",
    tests: "npm run test:manual-launch-reachability; npm run test:manual-launch-fencing; npm run test:scheduler-disposable-db; npm run typecheck; npm run lint",
    negative_failure_path_proof: "Expired pending reaches terminalization and returns 409 with exact code/launch ID while provider calls remain zero; active processing stays claim-unavailable and future/non-due work never invokes the claim RPC.",
    integrated_proof: "Route/service fake proof and network-disabled PostgreSQL terminalization/reclaim denial passed.",
    residual_risk: "No live Meta provider recovery or operator reconciliation was performed; the production operating owner/SLA remains blocked.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-060",
    original_claim: "The first exact-seal verification round exposed two legacy lexical regressions that contradicted the hardened Turnstile submit gate and immutable Meta launch credential boundary.",
    canonical_status: "STALE_ASSERTIONS_UPDATED_AND_EXACT_COMMANDS_PASSED",
    root_cause_invariant: "Regression tests must assert the current safety contract: configured Turnstile blocks submission until an exact token/action/site-key path exists, and manual Meta launch delegates exact workspace credential validation to the immutable snapshot-bound service rather than reloading mutable credentials in the outer route.",
    affected_surface_files_data: "scripts/test-public-funnel-thank-you.mjs; scripts/test-lead-tracking-health.mjs; docs/dealflow-completion/evidence/verification/superseded-exact-seal-round.json",
    implementation_disposition: "PRESERVE_STRONGER_CURRENT_CONTRACT_ASSERTIONS_AND_RESTART_EXACT_SEAL_PROOF",
    failing_before_evidence: "Seal 3057235213a78551dcf98037b1dbbe31ddaf6762 completed 30/32 commands; only these two source-string assertions failed while the associated hardened product contracts and dedicated tests passed.",
    changed_files_commits: "FILES:Turnstile disabled/token/action/site-key assertions, immutable Meta service-bound credential/order assertions, and sanitized superseded-round evidence",
    tests: "npm run test:public-funnel-thank-you; node scripts/test-lead-tracking-health.mjs; npm run typecheck; npm run lint",
    negative_failure_path_proof: "The updated tests fail if configured Turnstile no longer blocks an unverified submit, if the token/action/site-key contract disappears, if the outer manual route reloads mutable Meta credentials, or if atomic completion precedes immutable launch execution.",
    integrated_proof: "Both formerly failing exact commands passed directly; the superseded 30/32 round is retained and the complete final portfolio is restarted on a later exact seal.",
    residual_risk: "Lexical contracts complement but do not replace live browser/provider acceptance; final exact-seal repeat evidence remains required in the external bundle.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
  {
    id: "NEW-061",
    original_claim: "The final bundle generator sanitized a valid quoted CSV as raw text, allowing an inline environment-value redaction to consume one structural closing quote and invalidate the staged ledger copy.",
    canonical_status: "IMPLEMENTED_AND_GENERATOR_EXECUTION_VERIFIED",
    root_cause_invariant: "Structured CSV artifacts are parsed before sanitization, every decoded cell is sanitized independently, the result is re-encoded with CSV quoting, and the encoded output is parsed again before staging.",
    affected_surface_files_data: "scripts/build-dealflow-final-audit-bundle.mjs; scripts/generate-dealflow-completion-ledger.mjs; docs/dealflow-completion/requirement-proof-ledger.csv",
    implementation_disposition: "PRESERVE_PARSE_SANITIZE_REENCODE_REPARSE_CSV_BOUNDARY",
    failing_before_evidence: "The first final bundle pass failed closed with candidate/implementation-docs/requirement-proof-ledger.csv has an unterminated quoted field; the source CSV independently parsed as 863 rows with 16 consistent columns.",
    changed_files_commits: "FILES:cell-aware CSV sanitization, mandatory post-sanitization CSV parse, and permanent ledger disposition",
    tests: "node --check scripts/build-dealflow-final-audit-bundle.mjs; exact first-pass and report-inclusive bundle generation; final bundle CSV parse and SHA256SUMS verification",
    negative_failure_path_proof: "A cell containing SCHEMA_VALIDATION_MODE=warn. no longer lets the redactor consume the CSV closing quote; malformed source or post-sanitization CSV still fails closed before publication.",
    integrated_proof: "The exact generator processes the complete 863-row source ledger, validates every staged CSV, publishes only after validation, and the final checksum review reparses every bundled CSV.",
    residual_risk: "The bundle remains a point-in-time sanitized artifact; this structural fix does not convert any production, provider, schema, or authority blocker to a pass.",
    final_status: "IMPLEMENTED_AND_VERIFIED",
  },
];

for (const issue of newIssues) {
  addRow({
    ...issue,
    object_type: "NEW_ISSUE",
    ledger_key: `NEW_ISSUE:${issue.id}`,
  });
}

rows.sort((left, right) => left.ledger_key.localeCompare(right.ledger_key, "en", { numeric: true }));

const allowedFinalStatuses = new Set([
  "IMPLEMENTED_AND_VERIFIED",
  "VERIFIED_ALREADY_CORRECT",
  "NOT_APPLICABLE_WITH_EVIDENCE",
  "STALE_OR_SUPERSEDED_WITH_EVIDENCE",
  "OWNER_APPROVED_OUT_OF_SCOPE",
  "BLOCKED_BY_EXTERNAL_AUTHORITY",
]);
const proofRequiredStatuses = new Set([
  "IMPLEMENTED_AND_VERIFIED",
]);
for (const row of rows) {
  if (!allowedFinalStatuses.has(row.final_status)) {
    throw new Error(`Invalid final status for ${row.ledger_key}: ${row.final_status}`);
  }
  if (proofRequiredStatuses.has(row.final_status)) {
    for (const field of [
      "changed_files_commits",
      "tests",
      "negative_failure_path_proof",
      "integrated_proof",
    ]) {
      const value = String(row[field] ?? "").trim();
      if (!value || /^(none|not proven|not yet integrated|not executed)$/i.test(value)) {
        throw new Error(`${row.ledger_key} is ${row.final_status} but ${field} has placeholder proof.`);
      }
    }
  }
}

const counts = {};
for (const row of rows) {
  counts[row.object_type] = (counts[row.object_type] ?? 0) + 1;
}
const finalStatusCounts = {};
for (const row of rows) {
  finalStatusCounts[row.final_status] = (finalStatusCounts[row.final_status] ?? 0) + 1;
}

const output = {
  schema_version: 1,
  overall_verdict: "NO_GO",
  generated_at: new Date(generatedAt).toISOString(),
  canonical_baseline: "d37c50945ff7004d700301fc89c15eb9273dac5b",
  candidate_implementation_commit: implementationCommit,
  row_count: rows.length,
  object_type_counts: counts,
  final_status_counts: finalStatusCounts,
  rows,
};
fs.writeFileSync(path.join(docs, "requirement-proof-ledger.json"), `${JSON.stringify(output, null, 2)}\n`);

const csvHeaders = Object.keys(rows[0]);
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
fs.writeFileSync(path.join(docs, "requirement-proof-ledger.csv"), `${csvHeaders.join(",")}\n${rows.map((row) => csvHeaders.map((header) => quote(row[header])).join(",")).join("\n")}\n`);

const summaryRows = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `| ${type} | ${count} |`).join("\n");
const statusRows = Object.entries(finalStatusCounts).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `| ${status} | ${count} |`).join("\n");
const detailedRows = rows.map((row) => `| ${row.ledger_key} | ${row.canonical_status} | ${row.final_status} | ${row.original_claim.replaceAll("|", "\\|").replace(/\s+/g, " ").slice(0, 220)} | ${row.affected_surface_files_data.replaceAll("|", "\\|").replace(/\s+/g, " ").slice(0, 180)} |`).join("\n");
const markdown = `# DealFlow issue and requirement-to-proof ledger\n\nOverall verdict: \`NO_GO\`\nCanonical baseline: \`${output.canonical_baseline}\`\nCandidate implementation commit: \`${output.candidate_implementation_commit}\`\nRows: ${rows.length}\n\nThe JSON and CSV companions contain the complete permanent-fix fields, proof columns, changed-file/test overrides and residual-risk text. No tracked ID family is omitted. Source presence is not treated as behavioral proof; every unexecuted surface carries a precise blocker.\n\n## Object counts\n\n| Object type | Count |\n|---|---:|\n${summaryRows}\n\n## Final disposition counts\n\n| Final disposition | Count |\n|---|---:|\n${statusRows}\n\n## Complete ID register\n\n| Ledger key | Canonical status | Final disposition | Original claim | Evidence/surface |\n|---|---|---|---|---|\n${detailedRows}\n`;
fs.writeFileSync(path.join(docs, "ISSUE_LEDGER.md"), markdown);
fs.writeFileSync(path.join(docs, "traceability-summary.json"), `${JSON.stringify({overall_verdict:"NO_GO",generated_at:output.generated_at,candidate_implementation_commit:implementationCommit,row_count:rows.length,object_type_counts:counts,final_status_counts:finalStatusCounts}, null, 2)}\n`);

console.log(JSON.stringify({ rowCount: rows.length, objectTypeCounts: counts, finalStatusCounts }, null, 2));
