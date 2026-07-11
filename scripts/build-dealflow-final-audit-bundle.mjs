#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { execFileSync, spawnSync } from "node:child_process";

const DESIGNATED_OUTPUT =
  "/Users/raiaanreza/Documents/Codex/2026-07-10/okay-so-essentially-what-i-need/outputs/dealflow-completion-execution-20260710";
const READ_ONLY_AUDIT_PROMPT =
  "/Users/raiaanreza/Documents/Codex/2026-07-10/okay-so-essentially-what-i-need/outputs/DEALFLOW-ONE-AND-DONE-READ-ONLY-MASTER-AUDIT-PROMPT.md";
const EXECUTION_PROMPT =
  "/Users/raiaanreza/.codex/attachments/838354fc-4cd8-4601-89f3-ba3fb941f4de/pasted-text.txt";

const REQUIRED_ROOT_ARTIFACTS = [
  "00_READ_ME_AND_AUDIT_CONTRACT.md",
  "01_OWNER_TRUTH_REPORT.md",
  "02_SCOPE_COVERAGE_AND_COMPLETENESS.md",
  "03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.csv",
  "03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.json",
  "04_DEPLOYMENT_DOMAIN_ENVIRONMENT_MAP.md",
  "04_DEPLOYMENT_DOMAIN_ENVIRONMENT_MAP.json",
  "05_IMPLEMENTED_ARCHITECTURE_AND_SYSTEM_MAP.md",
  "06_FIRST_PARTY_MODULE_INVENTORY.csv",
  "06_FIRST_PARTY_MODULE_INVENTORY.json",
  "07_ENTRYPOINT_ROUTE_ACTION_WORKER_INVENTORY.csv",
  "07_ENTRYPOINT_ROUTE_ACTION_WORKER_INVENTORY.json",
  "08_PRODUCT_FEATURE_ATLAS.csv",
  "08_PRODUCT_FEATURE_ATLAS.json",
  "09_UI_ACTION_TRACE_MATRIX.csv",
  "10_END_TO_END_WORKFLOW_DOSSIERS.md",
  "11_BUSINESS_RULE_CATALOG.csv",
  "11_BUSINESS_RULE_CATALOG.json",
  "12_STATE_MACHINE_CATALOG.md",
  "13_DATA_MODEL_TENANCY_PRIVACY.md",
  "13_DATA_MODEL_TENANCY_MATRIX.csv",
  "14_INTEGRATION_CONTRACTS_AND_CONFIGURATION.md",
  "14_ENVIRONMENT_FLAG_CONFIG_MATRIX.csv",
  "15_SECURITY_THREAT_MODEL_AND_ATTACK_SURFACE.md",
  "15_SECURITY_CONTROL_MATRIX.csv",
  "16_UI_UX_ACCESSIBILITY_VISUAL_AUDIT.md",
  "16_UI_ROUTE_ROLE_STATE_MATRIX.csv",
  "17_SCREENSHOT_INDEX.csv",
  "18_TEST_COVERAGE_AND_CI_TRUTH.md",
  "18_TEST_TO_FEATURE_RULE_STATE_MATRIX.csv",
  "19_PERFORMANCE_RELIABILITY_OBSERVABILITY_RECOVERY.md",
  "20_DEAD_DUPLICATE_LEGACY_EXCESSIVE_LOGIC.md",
  "21_CONTRADICTIONS_AND_DRIFT.md",
  "22_MASTER_FINDING_AND_DECISION_LEDGER.csv",
  "22_MASTER_FINDING_AND_DECISION_LEDGER.json",
  "23_BLOCKERS_SKIPPED_SAFETY_AND_NOT_PROVEN.md",
  "24_EVIDENCE_LEDGER.jsonl",
  "25_SANITIZED_AUDIT_TRAIL.md",
  "26_GPT_HANDOFF_FOR_PRODUCT_RECONCILIATION.md",
  "dealflow-current-state.snapshot.json",
  "audit-package-manifest.json",
];

const LEDGER_ALLOWED_STATUSES = new Set([
  "STALE_OR_SUPERSEDED_WITH_EVIDENCE",
  "VERIFIED_ALREADY_CORRECT",
  "BLOCKED_BY_EXTERNAL_AUTHORITY",
  "OWNER_APPROVED_OUT_OF_SCOPE",
  "IMPLEMENTED_AND_VERIFIED",
  "NOT_APPLICABLE_WITH_EVIDENCE",
]);

const LEDGER_REQUIRED_FIELDS = [
  "ledger_key",
  "id",
  "object_type",
  "original_claim",
  "canonical_status",
  "root_cause_invariant",
  "implementation_disposition",
  "failing_before_evidence",
  "changed_files_commits",
  "tests",
  "negative_failure_path_proof",
  "integrated_proof",
  "residual_risk",
  "final_status",
];

const SCREENSHOT_SOURCES = [
  {
    source: "docs/dealflow-completion/evidence/visual-baseline/live/agentdealflow-login-390x844.png",
    output: "evidence/screenshots/baseline-agentdealflow-login-390x844.png",
    scope: "production_read_only_public_anonymous",
    viewport: "390x844 requested",
    validityBasis: "allowlisted immutable public baseline capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-baseline/live/agentdealflow-root-1440x900.png",
    output: "evidence/screenshots/baseline-agentdealflow-root-1440x900.png",
    scope: "production_read_only_public_anonymous",
    viewport: "1440x900 requested",
    validityBasis: "allowlisted immutable public baseline capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-baseline/live/clicktoscale-subdomain-1440x900-full.png",
    output: "evidence/screenshots/baseline-clicktoscale-subdomain-1440x900-full.png",
    scope: "production_read_only_public_anonymous",
    viewport: "1440x900 requested; full-page capture",
    validityBasis: "allowlisted immutable public baseline full-page capture; not a rejected candidate tiled capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-baseline/live/onboarding-subdomain-1440x900-full.png",
    output: "evidence/screenshots/baseline-onboarding-subdomain-1440x900-full.png",
    scope: "production_read_only_public_anonymous",
    viewport: "1440x900 requested; full-page capture",
    validityBasis: "allowlisted immutable public baseline full-page capture; not a rejected candidate tiled capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-local/root-390x844.png",
    output: "evidence/screenshots/candidate-root-390x844.png",
    scope: "isolated_candidate_public_anonymous",
    viewport: "390x844 requested",
    validityBasis: "reviewed candidate above-fold root capture with no reported horizontal overflow",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-local/root-1440x900.png",
    output: "evidence/screenshots/candidate-root-1440x900.png",
    scope: "isolated_candidate_public_anonymous",
    viewport: "1440x900 requested",
    validityBasis: "reviewed candidate above-fold root capture with no reported horizontal overflow",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-local/login-390x844.png",
    output: "evidence/screenshots/candidate-login-390x844-control.png",
    scope: "isolated_candidate_public_anonymous",
    viewport: "390x844 requested",
    validityBasis: "reviewed anonymous local login control capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-local/candidate-login-390x844.png",
    output: "evidence/screenshots/candidate-login-390x844.png",
    scope: "isolated_candidate_public_anonymous",
    viewport: "390x844 requested",
    validityBasis: "reviewed anonymous candidate login capture",
  },
  {
    source: "docs/dealflow-completion/evidence/visual-local/candidate-login-1440x900.png",
    output: "evidence/screenshots/candidate-login-1440x900.png",
    scope: "isolated_candidate_public_anonymous",
    viewport: "1440x900 requested",
    validityBasis: "reviewed anonymous candidate login capture",
  },
];

const REJECTED_TILED_SCREENSHOTS = [
  "docs/dealflow-completion/evidence/visual-local/candidate-root-fullpage-390x844.png",
  "docs/dealflow-completion/evidence/visual-local/candidate-root-fullpage-1440x900.png",
];

const BLOCKERS = [
  {
    id: "FINAL-BLK-001",
    area: "foundational_schema",
    status: "BLOCKED_EXTERNAL",
    proof: "Fresh isolated replay stops at 20260426110000_add_campaign_plan_critical_fields.sql statement 0 with SQLSTATE 42P01 because public.campaign_plans does not exist.",
    resolution: "Recover and approve the authoritative foundational schema, then repeat fresh, prior-shape, idempotent, RLS, compatibility, and forward-recovery proof on an isolated target.",
  },
  {
    id: "FINAL-BLK-002",
    area: "migration_recovery",
    status: "NOT_PROVEN",
    proof: "Prior-shape replay, mixed-version compatibility, privileges/RLS integration, and a forward recovery drill are not evidenced.",
    resolution: "Run the documented preflight and forward-recovery portfolio against the authorized isolated schema target.",
  },
  {
    id: "FINAL-BLK-003",
    area: "old_worker_drain",
    status: "BLOCKED_EXTERNAL",
    proof: "No authoritative signed zero-old-worker drain attestation exists for the exact deployment and candidate protocol boundary.",
    resolution: "Generate a recent deployment-bound worker-drain attestation from the approved authority.",
  },
  {
    id: "FINAL-BLK-004",
    area: "deployed_environment",
    status: "BLOCKED_EXTERNAL",
    proof: "No signed exact-deployment environment attestation exists; environment names are inventoried, values are intentionally absent.",
    resolution: "Attest safe boolean states and secret-policy checks for the exact deployment without revealing values.",
  },
  {
    id: "FINAL-BLK-005",
    area: "provider_acceptance",
    status: "SKIPPED_SAFETY",
    proof: "Live Meta, GHL, Stripe, Twilio, and creative-provider acceptance was not authorized and no live effect was attempted.",
    resolution: "Authorize a separately isolated sandbox/canary protocol with explicit effect and spend limits.",
  },
  {
    id: "FINAL-BLK-006",
    area: "independent_surfaces",
    status: "BLOCKED_EXTERNAL",
    proof: "internal.agentdealflow.io, clicktoscale.agentdealflow.io, and onboarding.agentdealflow.io remain independently deployed with unproven source ancestry.",
    resolution: "Provide read-only deployment/source metadata for each surface before reconciliation or edits.",
  },
  {
    id: "FINAL-BLK-007",
    area: "staging_canary",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "No separately authorized staging target or controlled canary exists for this candidate.",
    resolution: "Owner authorizes the exact isolated target, allowed effects, identities, limits, and rollback/forward-recovery operator.",
  },
  {
    id: "FINAL-BLK-008",
    area: "meta_consent_policy",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "Browser Pixel and CAPI code gates fail closed, but no owner/legal consent policy version and collection UX are approved.",
    resolution: "Approve consent purpose, version, retention, revocation, and evidence contract before enablement.",
  },
  {
    id: "FINAL-BLK-009",
    area: "ghl_data_governance",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "Fake-only local GHL contracts exist; production snapshot identity, data ownership, export/deletion, and offboarding policy remain owner/legal decisions.",
    resolution: "Approve the production object manifest and lifecycle policy before real provisioning.",
  },
  {
    id: "FINAL-BLK-010",
    area: "billing_exception_policy",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "Zero-dollar/manual-invoice commercial policy and operator authority are not defined.",
    resolution: "Define the exact commercial state machine and authorized exception owners.",
  },
  {
    id: "FINAL-BLK-011",
    area: "active_workspace_authority",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "The app still defaults to an owned/personal workspace, cannot prove invited-member or multi-workspace selection/switching, and has no owner-approved active-workspace UX/session contract.",
    resolution: "Approve explicit workspace selection, invite fallback, access-key billing-workspace binding, role changes, stale-tab behavior, and authenticated golden journeys.",
  },
  {
    id: "FINAL-BLK-012",
    area: "financial_retention",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "Legacy credit-ledger foreign keys can cascade user deletion or null organization identity; fully append-only financial retention is not proven.",
    resolution: "Owner/legal selects RESTRICT or a transaction-preserving anonymized-surrogate model, then an isolated migration/deletion test proves it.",
  },
  {
    id: "FINAL-BLK-013",
    area: "deletion_execution",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "A sanitized Meta responsibility status exists, but the complete data inventory, deletion procedure, retention exceptions, provider handoff, and completion SLA are not approved or executed.",
    resolution: "Approve the data inventory, deletion/retention procedure, provider responsibilities, proof of completion, and customer-facing SLA.",
  },
  {
    id: "FINAL-BLK-014",
    area: "operator_ownership_sla",
    status: "BLOCKED_OWNER_APPROVAL",
    proof: "Durable operator_action_required states exist without approved queue ownership, response targets, escalation, or communication policy.",
    resolution: "Assign owners and approve severity, response, escalation, reconciliation, and communication rules for every terminal operator state.",
  },
  {
    id: "FINAL-BLK-015",
    area: "independent_release_trust_root",
    status: "BLOCKED_EXTERNAL",
    proof: "The candidate can enforce an external trust-anchor contract locally, but no protected external policy, approved key, or trusted guard-executable digest was supplied.",
    resolution: "Bootstrap the release policy/key and trusted guard digest through protected out-of-band review; do not authorize it from the candidate target.",
  },
];

const OWNER_DECISIONS = [
  ["DEC-001", "Foundational schema authority", "Identify and approve the authoritative pre-migration schema source; do not synthesize it from a partial chain.", "FINAL-BLK-001"],
  ["DEC-002", "Isolated acceptance target", "Authorize the exact disposable staging/canary project, synthetic identities, allowed effects, and hard spend ceiling.", "FINAL-BLK-007"],
  ["DEC-003", "Deployment attestation authority", "Name the CI/deployment authority permitted to sign exact-commit environment and worker-drain evidence.", "FINAL-BLK-003; FINAL-BLK-004"],
  ["DEC-004", "Meta consent policy", "Approve Pixel/CAPI purpose, policy version, consent UX, withdrawal, retention, and deletion rules.", "FINAL-BLK-008"],
  ["DEC-005", "GHL lifecycle ownership", "Approve snapshot identity, required objects, data controller/processor roles, export, deletion, and offboarding behavior.", "FINAL-BLK-009"],
  ["DEC-006", "Billing exception state", "Define whether zero-dollar, manual invoice, override, and grace states activate service and who may authorize them.", "FINAL-BLK-010"],
  ["DEC-007", "Independent surface ownership", "Provide source/deployment lineage and owner disposition for internal, ClickToScale subdomain, and onboarding subdomain surfaces.", "FINAL-BLK-006"],
  ["DEC-008", "Workspace authority UX", "Approve the customer-facing workspace-selection, former-member, paid-access-key binding, and multi-workspace conflict behavior.", "FINAL-BLK-011"],
  ["DEC-009", "Provider acceptance envelope", "Approve exact sandbox accounts, synthetic records, communication suppression, reconciliation windows, and abort authority.", "FINAL-BLK-005"],
  ["DEC-010", "Release sequence authority", "After blockers clear, approve the exact commit, migration/worker/application order, canary, forward-recovery path, and monitoring owner.", "release_not_executed"],
  ["DEC-011", "Financial retention", "Choose RESTRICT or a transaction-preserving anonymized-surrogate model for legacy billing and credit history.", "FINAL-BLK-012"],
  ["DEC-012", "Deletion execution and SLA", "Approve the data inventory, retention/deletion procedure, provider handoff, completion proof, and customer-facing SLA.", "FINAL-BLK-013"],
  ["DEC-013", "Operator ownership", "Assign queues, response targets, escalation, reconciliation, and communication rules for terminal operator states.", "FINAL-BLK-014"],
  ["DEC-014", "Release trust bootstrap", "Approve a protected external policy/key and trusted guard executable digest outside the candidate repository.", "FINAL-BLK-015"],
].map(([id, title, decision, related]) => ({ id, title, decision, related }));

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const repeatable = new Set(["verification-round-dir"]);
  const allowed = new Set([
    "baseline-sha",
    "baseline-tree",
    "implementation-commit",
    "implementation-tree",
    "started-at",
    "completed-at",
    "generated-at",
    "verification-round-dir",
    "output-dir",
    "include-existing-report",
  ]);
  const result = { "verification-round-dir": [] };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail(`Arguments must be --name value pairs; invalid pair near ${key ?? "<end>"}.`);
    }
    const name = key.slice(2);
    if (!allowed.has(name)) fail(`Unknown argument: --${name}`);
    if (repeatable.has(name)) result[name].push(value);
    else if (Object.hasOwn(result, name)) fail(`Argument may only be supplied once: --${name}`);
    else result[name] = value;
  }
  return result;
}

function requireSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) fail(`${label} must be an exact lowercase 40-character Git object id.`);
  return value;
}

function requireTimestamp(value, label) {
  if (!value || Number.isNaN(Date.parse(value))) fail(`${label} must be an explicit ISO-8601 timestamp.`);
  return new Date(value).toISOString();
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function run(executable, args, options = {}) {
  return execFileSync(executable, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    env: options.env,
    stdio: options.stdio,
  });
}

function git(args, options = {}) {
  return run("git", args, { cwd: options.cwd, encoding: options.encoding, maxBuffer: options.maxBuffer });
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function safeRelative(relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes("\0")) fail(`Unsafe output path: ${relative}`);
  const normalized = path.posix.normalize(relative.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) fail(`Unsafe output path: ${relative}`);
  return normalized;
}

function assertNoSymlinkComponents(target) {
  let current = path.parse(path.resolve(target)).root;
  const parts = path.resolve(target).slice(current.length).split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) fail(`Symlink path component is forbidden: ${current}`);
  }
}

function assertNoSymlinkTree(root) {
  if (!fs.existsSync(root)) return;
  assertNoSymlinkComponents(root);
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`Symlink inside bundle/input tree is forbidden: ${full}`);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
}

function requireRegularLocalFile(file, label = file) {
  assertNoSymlinkComponents(file);
  const stat = fs.statSync(file);
  if (!stat.isFile()) fail(`${label} must be a regular file.`);
  if (stat.size === 0) fail(`${label} is empty/dataless.`);
  if (typeof stat.blocks === "number" && stat.blocks === 0) fail(`${label} is an unmaterialized sparse/dataless file.`);
  return stat;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",");
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","));
  return `${[header, ...lines].join("\n")}\n`;
}

function parseCsv(text, label) {
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
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) fail(`${label} has an unterminated quoted field.`);
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  if (rows.length < 2) fail(`${label} must contain a header and at least one data row.`);
  const width = rows[0].length;
  if (width === 0 || rows.some((candidate) => candidate.length !== width)) fail(`${label} has inconsistent row widths.`);
  return rows;
}

function sanitizeRemote(remote) {
  return String(remote ?? "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/https:\/\/[^/@]+@github\.com\//, "https://github.com/")
    .replace(/[?#].*$/, "");
}

function sanitizeText(input, repoRoot) {
  const home = os.homedir();
  return String(input ?? "")
    .replaceAll(repoRoot, "[ISOLATED_CANDIDATE_WORKTREE]")
    .replaceAll(home, "[USER_HOME]")
    .replace(/\/(?:private\/)?tmp\/[A-Za-z0-9._/-]+/g, "[DISPOSABLE_LOCAL_WORKDIR]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?<![A-Za-z0-9])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?![A-Za-z0-9])/g, "[REDACTED_PHONE]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(authorization\s*:\s*basic\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/(^|\n)(cookie|set-cookie)\s*:[^\n]*/gi, "$1$2: [REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@[^\s"'<>]+/gi, "[REDACTED_CREDENTIAL_URL]")
    .replace(/\b(?:sk|rk)_(?:live|test|proj)_[A-Za-z0-9_-]+\b/g, "[REDACTED_PROVIDER_KEY]")
    .replace(/\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_PROVIDER_TOKEN]")
    .replace(/\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]+\b/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_ACCESS_KEY]")
    .replace(/(^|\n)([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE)[A-Z0-9_]*)\s*=\s*[^\r\n]*/g, "$1$2=[REDACTED]")
    .replace(/(^|[\s(])([A-Z][A-Z0-9_]{2,})=([^\s),;]+)/g, "$1$2=[REDACTED]")
    .replace(/("(?:token|secret|password|cookie|authorization|credential|api[_-]?key|private[_-]?key)"\s*:\s*")[^"]*(")/gi, "$1[REDACTED]$2");
}

function sanitizeStructured(value, repoRoot, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeStructured(item, repoRoot, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeStructured(child, repoRoot, childKey)]));
  }
  if (typeof value !== "string") return value;
  if (/(?:^|_)(?:token|secret|password|cookie|authorization|credential|api_key|private_key)(?:$|_)/i.test(key)) return "[REDACTED]";
  return sanitizeText(value, repoRoot);
}

function assertNoObviousSecret(buffer, relative) {
  if (/\.(?:png|jpg|jpeg|gif|webp)$/i.test(relative)) return;
  const text = buffer.toString("utf8");
  const forbidden = [
    [/(authorization\s*:\s*(?:bearer|basic)\s+)(?!\[REDACTED\])\S+/i, "authorization value"],
    [/postgres(?:ql)?:\/\/(?!\[REDACTED\])[^\s"']+/i, "database URL"],
    [/\b(?:sk|rk)_(?:live|test|proj)_[A-Za-z0-9_-]+\b/, "provider key"],
    [/\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/, "Meta token"],
    [/\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]+\b/, "Supabase secret"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) fail(`${relative} contains a possible unsanitized ${label}.`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function gitShowText(repoRoot, commit, relative) {
  return git(["show", `${commit}:${relative}`], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
}

function gitShowBuffer(repoRoot, commit, relative) {
  return git(["show", `${commit}:${relative}`], { cwd: repoRoot, encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
}

function trackedEntries(repoRoot, commit) {
  const output = git(["ls-tree", "-r", "-l", "-z", commit], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  return output.split("\0").filter(Boolean).map((record) => {
    const match = record.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\s+([\d-]+)\t(.+)$/s);
    if (!match) fail(`Unable to parse Git tree record: ${record.slice(0, 120)}`);
    return { mode: match[1], type: match[2], oid: match[3], bytes: match[4] === "-" ? null : Number(match[4]), path: match[5] };
  });
}

function languageFor(relative) {
  const extension = path.extname(relative).toLowerCase();
  return ({
    ".ts": "TypeScript", ".tsx": "TypeScript/React", ".js": "JavaScript", ".jsx": "JavaScript/React",
    ".mjs": "JavaScript module", ".cjs": "CommonJS", ".sql": "SQL", ".css": "CSS",
    ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".sh": "Shell",
  })[extension] ?? (extension.slice(1) || "other");
}

function moduleClass(relative) {
  if (relative.startsWith("src/app/api/")) return "api_route";
  if (relative.startsWith("src/app/")) return "ui_or_metadata_route";
  if (relative.startsWith("src/components/")) return "component";
  if (relative.startsWith("src/lib/")) return "service_or_library";
  if (relative.startsWith("supabase/migrations/")) return "database_migration";
  if (relative.startsWith("scripts/")) return /(?:^|\/)(?:test|check|smoke|regress|validate)-/.test(relative) ? "test_or_check" : "operator_script";
  if (relative.startsWith("tests/")) return "test";
  if (relative.startsWith(".github/workflows/")) return "ci_workflow";
  return "configuration_or_entry";
}

function isFirstPartyModule(entry) {
  if (entry.type !== "blob") return false;
  if (/^(?:src|scripts|tests|supabase\/migrations|\.github\/workflows)\//.test(entry.path)) {
    return /\.(?:[cm]?[jt]sx?|sql|css|ya?ml|sh)$/.test(entry.path);
  }
  return /^(?:proxy|middleware|next\.config|eslint\.config|playwright\.config|vitest\.config).+\.(?:[cm]?[jt]s|ya?ml)$/.test(entry.path);
}

function routeFromPath(relative) {
  let route = relative.replace(/^src\/app\//, "").replace(/\/(?:page|route)\.[^.]+$/, "");
  route = route.split("/").filter((part) => !/^\(.+\)$/.test(part)).join("/");
  return `/${route}`.replace(/\/$/, "") || "/";
}

function extractRouteMethods(repoRoot, commit, relative) {
  const source = gitShowText(repoRoot, commit, relative);
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map((match) => match[1]);
}

function collectEntrypoints(repoRoot, commit, entries, packageJson) {
  const rows = [];
  const add = (kind, relative, route, methods, trigger) => rows.push({ kind, path: relative, route_or_name: route, methods, trigger });
  for (const entry of entries) {
    const relative = entry.path;
    if (/^src\/app\/.+\/page\.(?:tsx?|jsx?)$/.test(relative) || /^src\/app\/page\.(?:tsx?|jsx?)$/.test(relative)) {
      add("page", relative, routeFromPath(relative), "GET/render", "browser_navigation");
    } else if (/^src\/app\/.+\/route\.(?:tsx?|jsx?)$/.test(relative)) {
      const methods = extractRouteMethods(repoRoot, commit, relative);
      const route = routeFromPath(relative);
      const kind = /\/internal\/|\/cron\//.test(relative) ? "worker_or_internal_route" : "api_route";
      add(kind, relative, route, methods.join("|"), /\/internal\/|\/cron\//.test(relative) ? "cron_or_authorized_operator" : "http_request");
    } else if (/^scripts\/.+\.(?:mjs|js|ts|sh)$/.test(relative)) {
      add(/(?:^|\/)(?:test|check|smoke|regress|validate)-/.test(relative) ? "test_entrypoint" : "operator_entrypoint", relative, path.basename(relative), "CLI", "explicit_local_command");
    } else if (/^\.github\/workflows\/.+\.ya?ml$/.test(relative)) {
      add("ci_workflow", relative, path.basename(relative), "workflow", "repository_event_or_manual_dispatch");
    } else if (/^(?:src\/)?(?:proxy|middleware)\.(?:ts|js)$/.test(relative)) {
      add("request_proxy", relative, "request proxy", "HTTP", "matched_request");
    }
  }
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    add("package_script", "package.json", name, "CLI", sanitizeText(command, repoRoot));
  }
  return rows.sort((a, b) => `${a.kind}:${a.path}:${a.route_or_name}`.localeCompare(`${b.kind}:${b.path}:${b.route_or_name}`))
    .map((row, index) => ({ id: `ENTRY-CUR-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function collectEnvironmentNames(repoRoot, commit, entries) {
  const names = new Map();
  const add = (name, relative, source) => {
    if (!/^[A-Z][A-Z0-9_]+$/.test(name)) return;
    const record = names.get(name) ?? { name, sources: new Set(), declarations: new Set() };
    record.sources.add(relative);
    record.declarations.add(source);
    names.set(name, record);
  };
  const grep = spawnSync("git", ["grep", "-n", "-I", "-E", "process\\.env\\.[A-Z][A-Z0-9_]*|import\\.meta\\.env\\.[A-Z][A-Z0-9_]*", commit, "--", "src", "scripts", "*.ts", "*.tsx", "*.js", "*.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (![0, 1].includes(grep.status)) fail(`Git environment-name scan failed: ${grep.stderr || grep.error?.message}`);
  for (const line of (grep.stdout ?? "").split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^[^:]+:(.+?):\d+:(.*)$/);
    if (!match) continue;
    for (const envMatch of match[2].matchAll(/(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)/g)) add(envMatch[1], match[1], "source_reference");
  }
  for (const envFile of entries.filter((entry) => /(^|\/)\.env(?:\.[^/]+)?\.example$|^\.env\.example$/.test(entry.path))) {
    const content = gitShowText(repoRoot, commit, envFile.path);
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
      if (match) add(match[1], envFile.path, "example_name_only");
    }
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).map((record) => ({
    name: record.name,
    classification: /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|SID)$/.test(record.name) ? "sensitive_name_value_not_collected" : /^(?:ALLOW|ENABLE|DISABLE|.*_MODE|.*_ENABLED)/.test(record.name) ? "feature_or_safety_flag_name_only" : "configuration_name_only",
    source_count: record.sources.size,
    source_paths: [...record.sources].sort().join("; "),
    discovery: [...record.declarations].sort().join("; "),
    value_collected: false,
  }));
}

function collectTests(entries, packageJson, verification) {
  const fileRows = entries.filter((entry) => entry.type === "blob" && (
    /^(?:tests|test)\//.test(entry.path) ||
    /(?:^|\/)(?:test|check|smoke|regress|validate)-[^/]+\.(?:[cm]?[jt]s|tsx?|sh)$/.test(entry.path) ||
    /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(entry.path)
  )).map((entry) => ({ kind: "test_file", name: path.basename(entry.path), path: entry.path, command: "see package scripts or direct node invocation" }));
  const scriptRows = Object.entries(packageJson.scripts ?? {}).filter(([name]) => /(?:test|lint|typecheck|build|smoke|check|validate)/.test(name)).map(([name, command]) => ({
    kind: "package_script",
    name,
    path: "package.json",
    command: `npm run ${name}`,
    implementation: sanitizeText(command, process.cwd()),
  }));
  const observedCommands = new Map();
  for (const round of verification.rounds) {
    for (const record of round.records) {
      const key = record.command;
      const observed = observedCommands.get(key) ?? [];
      observed.push({ round: round.round, status: record.status, exitCode: record.exitCode, durationMs: record.durationMs });
      observedCommands.set(key, observed);
    }
  }
  return [...fileRows, ...scriptRows].sort((a, b) => `${a.kind}:${a.path}:${a.name}`.localeCompare(`${b.kind}:${b.path}:${b.name}`)).map((row, index) => ({
    id: `TEST-CUR-${String(index + 1).padStart(3, "0")}`,
    ...row,
    observed_rounds: observedCommands.has(row.command) ? JSON.stringify(observedCommands.get(row.command)) : "not_directly_mapped",
  }));
}

function loadVerificationRound(directory, repoRoot, ordinal) {
  const absolute = path.resolve(directory);
  assertNoSymlinkTree(absolute);
  const summaryPath = path.join(absolute, "verification-summary.json");
  requireRegularLocalFile(summaryPath, `verification round ${ordinal} summary`);
  const raw = parseJson(fs.readFileSync(summaryPath, "utf8"), summaryPath);
  if (!Array.isArray(raw.records) || raw.records.length === 0) fail(`Verification round ${ordinal} has no command records.`);
  const records = raw.records.map((record, index) => {
    if (!record.command || !Number.isInteger(record.exitCode) || !["passed", "failed", "blocked", "skipped"].includes(record.status)) {
      fail(`Verification round ${ordinal} record ${index + 1} has an invalid command/exit/status.`);
    }
    const logName = safeRelative(record.log);
    if (logName.includes("/")) fail(`Verification log must be a direct child of its round directory: ${record.log}`);
    const logPath = path.join(absolute, logName);
    requireRegularLocalFile(logPath, `verification round ${ordinal} log ${logName}`);
    const log = sanitizeText(fs.readFileSync(logPath, "utf8"), repoRoot);
    return {
      command: sanitizeText(record.command, repoRoot),
      workingDirectory: "isolated_candidate_worktree",
      safeEnvironmentProfile: "provider_credentials_application_secrets_and_environment_values_omitted",
      startedAt: requireTimestamp(record.startedAt, `round ${ordinal} record ${index + 1} startedAt`),
      completedAt: requireTimestamp(record.completedAt, `round ${ordinal} record ${index + 1} completedAt`),
      durationMs: Number(record.durationMs),
      exitCode: record.exitCode,
      status: record.status,
      log: `${String(index + 1).padStart(2, "0")}-${path.basename(logName)}`,
      logText: log,
    };
  });
  const roundId = String(raw.round ?? ordinal);
  if (!/^[A-Za-z0-9_.-]+$/.test(roundId)) fail(`Verification round ${ordinal} has an unsafe round id.`);
  return {
    round: roundId,
    runtime: sanitizeText(raw.runtime ?? "not_recorded", repoRoot),
    platform: sanitizeText(raw.platform ?? "not_recorded", repoRoot),
    startedAt: requireTimestamp(raw.startedAt ?? records[0].startedAt, `round ${ordinal} startedAt`),
    completedAt: requireTimestamp(raw.completedAt ?? records.at(-1).completedAt, `round ${ordinal} completedAt`),
    records,
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePng(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) fail(`${label} is not a PNG.`);
  let offset = 8;
  let width;
  let height;
  const idat = [];
  let sawIend = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > buffer.length) fail(`${label} contains a truncated ${type} chunk.`);
    const expectedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = crc32(buffer.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) fail(`${label} contains an invalid ${type} CRC.`);
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (length !== 13) fail(`${label} has an invalid IHDR length.`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (!width || !height) fail(`${label} has invalid dimensions.`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = crcOffset + 4;
  }
  if (!width || !height || idat.length === 0 || !sawIend) fail(`${label} is missing required PNG chunks.`);
  try {
    const decoded = zlib.inflateSync(Buffer.concat(idat));
    if (decoded.length === 0) fail(`${label} decoded to no image bytes.`);
  } catch (error) {
    fail(`${label} IDAT decode failed: ${error.message}`);
  }
  return { width, height };
}

function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function preparePng(buffer, label, stagingDirectory) {
  if (isPng(buffer)) {
    const dimensions = decodePng(buffer, label);
    return { buffer, ...dimensions, transcoded: false };
  }
  const input = path.join(stagingDirectory, `${crypto.randomUUID()}.input`);
  const output = path.join(stagingDirectory, `${crypto.randomUUID()}.png`);
  fs.writeFileSync(input, buffer, { mode: 0o600 });
  const conversion = spawnSync("/usr/bin/sips", ["-s", "format", "png", input, "--out", output], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: os.homedir() },
  });
  fs.rmSync(input, { force: true });
  if (conversion.status !== 0 || !fs.existsSync(output)) fail(`Failed to transcode ${label} to PNG: ${conversion.stderr || conversion.stdout}`);
  const png = fs.readFileSync(output);
  fs.rmSync(output, { force: true });
  const dimensions = decodePng(png, label);
  return { buffer: png, ...dimensions, transcoded: true };
}

function markdownTable(rows, columns) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${columns.map((column) => escape(column.label)).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => escape(row[column.key])).join(" | ")} |`),
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
const baselineSha = requireSha(args["baseline-sha"], "--baseline-sha");
const baselineTree = requireSha(args["baseline-tree"], "--baseline-tree");
const implementationCommit = requireSha(args["implementation-commit"], "--implementation-commit");
const implementationTree = requireSha(args["implementation-tree"], "--implementation-tree");
const startedAt = requireTimestamp(args["started-at"], "--started-at");
const completedAt = requireTimestamp(args["completed-at"], "--completed-at");
const generatedAt = requireTimestamp(args["generated-at"], "--generated-at");
const includeExistingReport = args["include-existing-report"] === "true";
if (args["include-existing-report"] && !["true", "false"].includes(args["include-existing-report"])) fail("--include-existing-report must be true or false.");
if (Date.parse(startedAt) > Date.parse(completedAt)) fail("--started-at must not be later than --completed-at.");
if (Date.parse(generatedAt) < Date.parse(startedAt) || Date.parse(generatedAt) > Date.parse(completedAt)) fail("--generated-at must be within the audit start/completion interval.");

const repoRoot = path.resolve(git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() }).trim());
const outputDir = path.resolve(args["output-dir"] ?? "");
if (outputDir !== path.resolve(DESIGNATED_OUTPUT)) fail(`--output-dir must equal the designated bundle directory exactly: ${DESIGNATED_OUTPUT}`);
if (isInside(repoRoot, outputDir)) fail("The audit bundle must be outside the DealFlow repository.");
assertNoSymlinkComponents(repoRoot);
assertNoSymlinkComponents(path.dirname(outputDir));
assertNoSymlinkTree(outputDir);

const roundDirectories = args["verification-round-dir"];
if (roundDirectories.length < 2) fail("Supply at least two --verification-round-dir arguments for clean-repeat proof.");
if (new Set(roundDirectories.map((directory) => path.resolve(directory))).size !== roundDirectories.length) fail("Verification round directories must be unique.");
const verification = { rounds: roundDirectories.map((directory, index) => loadVerificationRound(directory, repoRoot, index + 1)) };

const head = git(["rev-parse", "HEAD"], { cwd: repoRoot }).trim();
const headTree = git(["rev-parse", "HEAD^{tree}"], { cwd: repoRoot }).trim();
if (git(["rev-parse", `${baselineSha}^{tree}`], { cwd: repoRoot }).trim() !== baselineTree) fail("Supplied baseline tree does not match the baseline commit.");
if (git(["rev-parse", `${implementationCommit}^{tree}`], { cwd: repoRoot }).trim() !== implementationTree) fail("Supplied implementation tree does not match the implementation commit.");
const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", baselineSha, implementationCommit], { cwd: repoRoot });
if (ancestry.status !== 0) fail("Implementation commit is not a descendant of the canonical baseline.");
const sealAncestry = spawnSync("git", ["merge-base", "--is-ancestor", implementationCommit, head], { cwd: repoRoot });
if (sealAncestry.status !== 0) fail("Current documentation/bundle-seal HEAD must equal or descend from the supplied implementation commit.");
const postImplementationChanges = git(["diff", "--name-only", implementationCommit, head], { cwd: repoRoot }).split(/\r?\n/).filter(Boolean);
const disallowedPostImplementationChanges = postImplementationChanges.filter((relative) =>
  !relative.startsWith("docs/dealflow-completion/") &&
  relative !== "scripts/build-dealflow-final-audit-bundle.mjs"
);
if (disallowedPostImplementationChanges.length > 0) {
  fail(`Commits after the supplied implementation commit contain non-documentation/product changes: ${disallowedPostImplementationChanges.join(", ")}`);
}
const statusBefore = git(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot });
if (statusBefore.trim()) fail("The candidate worktree must be clean before bundle generation.");

for (const promptPath of [READ_ONLY_AUDIT_PROMPT, EXECUTION_PROMPT]) requireRegularLocalFile(promptPath, "controlling prompt");
const promptProvenance = [
  { id: "read_only_master_audit_prompt", byteSize: fs.statSync(READ_ONLY_AUDIT_PROMPT).size, sha256: sha256(fs.readFileSync(READ_ONLY_AUDIT_PROMPT)), controllingLines: "required artifact bundle 771-890" },
  { id: "isolated_execution_prompt", byteSize: fs.statSync(EXECUTION_PROMPT).size, sha256: sha256(fs.readFileSync(EXECUTION_PROMPT)), controllingLines: "final evidence and handoff 647-704" },
];

const preservedReport = new Map();
if (includeExistingReport) {
  for (const relative of ["artifact.json", "report.html", "report-delivery-receipt.json"]) {
    const full = path.join(outputDir, relative);
    requireRegularLocalFile(full, `existing ${relative}`);
    preservedReport.set(relative, fs.readFileSync(full));
  }
}

const entries = trackedEntries(repoRoot, implementationCommit);
const sealEntries = head === implementationCommit ? entries : trackedEntries(repoRoot, head);
const entryPaths = new Set(entries.map((entry) => entry.path));
const packageJson = parseJson(gitShowText(repoRoot, implementationCommit, "package.json"), "package.json at implementation commit");
const modules = entries.filter(isFirstPartyModule).map((entry, index) => ({
  id: `MODULE-CUR-${String(index + 1).padStart(4, "0")}`,
  path: entry.path,
  classification: moduleClass(entry.path),
  language: languageFor(entry.path),
  byte_size: entry.bytes,
  git_blob_oid: entry.oid,
  implementation_commit: implementationCommit,
  content_copied_to_bundle: false,
}));
const entrypoints = collectEntrypoints(repoRoot, implementationCommit, entries, packageJson);
const environmentNames = collectEnvironmentNames(repoRoot, implementationCommit, entries);

const docsRoot = path.join(repoRoot, "docs", "dealflow-completion");
const inputAuditRoot = path.join(docsRoot, "evidence", "input-audit");
const originalManifestPath = path.join(inputAuditRoot, "audit-package-manifest.json");
requireRegularLocalFile(originalManifestPath, "materialized original audit manifest");
const originalManifest = parseJson(fs.readFileSync(originalManifestPath, "utf8"), originalManifestPath);
if (!Array.isArray(originalManifest.required_files) || originalManifest.required_files.length !== 41) fail("Original audit manifest must declare exactly 41 required artifacts.");
const originalManifestByPath = new Map(originalManifest.required_files.map((record) => [record.path, record]));
const originalMaterialized = [];
const originalMissing = [];
for (const relative of REQUIRED_ROOT_ARTIFACTS.filter((item) => item !== "audit-package-manifest.json")) {
  const expected = originalManifestByPath.get(relative);
  if (!expected) fail(`Original audit manifest omits ${relative}.`);
  const source = path.join(inputAuditRoot, relative);
  if (!fs.existsSync(source)) {
    originalMissing.push({ path: relative, status: "BLOCKED_CONTENT_NOT_LOCAL", expectedByteSize: expected.byte_size, expectedSha256: expected.sha256 });
    continue;
  }
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size === 0 || (typeof stat.blocks === "number" && stat.blocks === 0)) {
    originalMissing.push({ path: relative, status: "BLOCKED_CONTENT_NOT_LOCAL", expectedByteSize: expected.byte_size, expectedSha256: expected.sha256 });
    continue;
  }
  const buffer = fs.readFileSync(source);
  if (buffer.length !== expected.byte_size || sha256(buffer) !== expected.sha256) fail(`Materialized original audit input does not match its manifest: ${relative}`);
  originalMaterialized.push({ path: relative, buffer, byteSize: buffer.length, sha256: sha256(buffer), status: "MATERIALIZED_HASH_MATCH" });
}
if (originalMaterialized.length !== 25 || originalMissing.length !== 15) {
  fail(`Original audit materialization must remain exactly 25 matching non-self files and 15 missing files; observed ${originalMaterialized.length}/${originalMissing.length}.`);
}

const ledgerPath = path.join(docsRoot, "requirement-proof-ledger.json");
const ledgerCsvPath = path.join(docsRoot, "requirement-proof-ledger.csv");
requireRegularLocalFile(ledgerPath, "current requirement proof ledger");
requireRegularLocalFile(ledgerCsvPath, "current requirement proof ledger CSV");
const ledger = parseJson(fs.readFileSync(ledgerPath, "utf8"), ledgerPath);
if (ledger.candidate_implementation_commit !== implementationCommit) fail("Current requirement-proof ledger is not sealed to the supplied implementation commit.");
if (!Array.isArray(ledger.rows) || ledger.rows.length !== ledger.row_count) fail("Current requirement-proof ledger row count is inconsistent.");
const ledgerKeys = new Set();
for (const row of ledger.rows) {
  for (const field of LEDGER_REQUIRED_FIELDS) if (typeof row[field] !== "string" || row[field].trim() === "") fail(`Ledger row ${row.ledger_key ?? row.id ?? "unknown"} is missing ${field}.`);
  if (!LEDGER_ALLOWED_STATUSES.has(row.final_status)) fail(`Ledger row ${row.ledger_key} has disallowed final status ${row.final_status}.`);
  if (ledgerKeys.has(row.ledger_key)) fail(`Duplicate ledger key: ${row.ledger_key}`);
  ledgerKeys.add(row.ledger_key);
}
const computedObjectCounts = Object.fromEntries([...new Set(ledger.rows.map((row) => row.object_type))].sort().map((type) => [type, ledger.rows.filter((row) => row.object_type === type).length]));
const computedStatusCounts = Object.fromEntries([...LEDGER_ALLOWED_STATUSES].sort().map((status) => [status, ledger.rows.filter((row) => row.final_status === status).length]));
if (canonicalJson(computedObjectCounts) !== canonicalJson(ledger.object_type_counts)) fail("Ledger object_type_counts do not match rows.");
if (canonicalJson(computedStatusCounts) !== canonicalJson(ledger.final_status_counts)) fail("Ledger final_status_counts do not match rows.");
const ledgerCsvText = fs.readFileSync(ledgerCsvPath, "utf8");
if (parseCsv(ledgerCsvText, ledgerCsvPath).length - 1 !== ledger.rows.length) fail("Ledger CSV row count does not match JSON.");

const originalFindingLedger = parseJson(fs.readFileSync(path.join(inputAuditRoot, "22_MASTER_FINDING_AND_DECISION_LEDGER.json"), "utf8"), "original finding ledger");
const originalFindingMap = new Map(originalFindingLedger.records.map((record) => [record.id, record]));
const topFindingIds = originalFindingLedger.top_10_ids;
const topFindings = topFindingIds.map((id) => {
  const original = originalFindingMap.get(id);
  const current = ledger.rows.find((row) => row.object_type === "FINDING" && row.id === id);
  if (!original || !current) fail(`Top finding ${id} is missing from original/current evidence.`);
  return {
    id,
    title: original.title,
    originalSeverity: original.severity,
    originalDomain: original.domain,
    candidateDisposition: current.final_status,
    proof: current.integrated_proof,
    residualRisk: current.residual_risk,
  };
});

const baselineManifest = parseJson(fs.readFileSync(path.join(docsRoot, "baseline-manifest.json"), "utf8"), "baseline manifest");
if (baselineManifest.canonical.baseline_commit !== baselineSha || baselineManifest.canonical.baseline_tree !== baselineTree) fail("Baseline manifest does not match supplied baseline commit/tree.");
const deploymentRows = baselineManifest.surfaces.map((surface, index) => ({ id: `DEP-CUR-${String(index + 1).padStart(3, "0")}`, ...surface }));
const migrationEvidencePath = path.join(docsRoot, "evidence", "migration", "fresh-replay-result.json");
const migrationEvidence = parseJson(fs.readFileSync(migrationEvidencePath, "utf8"), "fresh migration replay evidence");
if (migrationEvidence.release_effect !== "NO_GO" || migrationEvidence.sqlstate !== "42P01" || migrationEvidence.first_failing_migration !== "20260426110000_add_campaign_plan_critical_fields.sql") {
  fail("Fresh replay evidence does not match the known fail-closed migration blocker.");
}

const branch = git(["branch", "--show-current"], { cwd: repoRoot }).trim();
const remote = sanitizeRemote(git(["remote", "get-url", "origin"], { cwd: repoRoot }).trim());
const changedFiles = git(["diff", "--name-status", "--find-renames", baselineSha, implementationCommit], { cwd: repoRoot }).split(/\r?\n/).filter(Boolean).map((line) => {
  const [status, ...files] = line.split("\t");
  return { status, path: files.at(-1), priorPath: files.length > 1 ? files[0] : "" };
});
const commits = git(["log", "--reverse", "--format=%H%x09%cI%x09%s", `${baselineSha}..${head}`], { cwd: repoRoot }).split(/\r?\n/).filter(Boolean).map((line) => {
  const [commit, timestamp, ...subject] = line.split("\t");
  return { commit, timestamp, subject: sanitizeText(subject.join("\t"), repoRoot) };
});
const tests = collectTests(entries, packageJson, verification);

const verificationTotals = verification.rounds.reduce((totals, round) => {
  for (const record of round.records) totals[record.status] = (totals[record.status] ?? 0) + 1;
  return totals;
}, { passed: 0, failed: 0, blocked: 0, skipped: 0 });
const nondeterministicCommands = [];
const commandOutcomes = new Map();
for (const round of verification.rounds) {
  for (const record of round.records) {
    const statuses = commandOutcomes.get(record.command) ?? new Set();
    statuses.add(record.status);
    commandOutcomes.set(record.command, statuses);
  }
}
for (const [command, statuses] of commandOutcomes) if (statuses.size > 1) nondeterministicCommands.push({ command, statuses: [...statuses].sort().join("|") });

const objectRows = (type) => ledger.rows.filter((row) => row.object_type === type);
const featureRows = objectRows("FEATURE");
const uiActionRows = objectRows("UI_ACTION");
const workflowRows = objectRows("WORKFLOW");
const ruleRows = objectRows("RULE");
const stateRows = objectRows("STATE_MACHINE");
const dataRows = objectRows("DATA_ENTITY");
const integrationRows = objectRows("INTEGRATION");
const uiRouteRows = objectRows("UI_ROUTE_STATE");
const testLedgerRows = objectRows("TEST");
const contradictionRows = objectRows("CONTRADICTION");
const debtRows = objectRows("DEBT");
const blockerRows = objectRows("BLOCKER");

const counts = {
  repository_records: 1,
  package_manifests: entries.filter((entry) => /(^|\/)package\.json$/.test(entry.path)).length,
  tracked_files: entries.length,
  changed_files: changedFiles.length,
  candidate_commits: commits.length,
  first_party_modules: modules.length,
  entrypoints: entrypoints.length,
  environment_names: environmentNames.length,
  current_test_entrypoints: tests.length,
  ledger_rows: ledger.rows.length,
  features: featureRows.length,
  ui_actions: uiActionRows.length,
  workflows: workflowRows.length,
  rules: ruleRows.length,
  state_machines: stateRows.length,
  data_entities: dataRows.length,
  integrations: integrationRows.length,
  ui_route_states: uiRouteRows.length,
  ledger_tests: testLedgerRows.length,
  contradictions: contradictionRows.length,
  debt_items: debtRows.length,
  inherited_blockers: blockerRows.length,
  final_release_blockers: BLOCKERS.length,
  owner_decisions: OWNER_DECISIONS.length,
  deployment_surfaces: deploymentRows.length,
  screenshots: SCREENSHOT_SOURCES.length,
  verification_rounds: verification.rounds.length,
  verification_commands: verification.rounds.reduce((sum, round) => sum + round.records.length, 0),
  verification_passed: verificationTotals.passed,
  verification_failed: verificationTotals.failed,
  verification_blocked: verificationTotals.blocked,
  verification_skipped: verificationTotals.skipped,
  nondeterministic_commands: nondeterministicCommands.length,
  original_audit_materialized_inputs: originalMaterialized.length,
  original_audit_missing_inputs: originalMissing.length,
};

const outputFiles = new Map();
function addFile(relative, data, options = {}) {
  const safe = safeRelative(relative);
  if (outputFiles.has(safe)) fail(`Duplicate output file: ${safe}`);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
  if (buffer.length === 0) fail(`Refusing to stage empty output: ${safe}`);
  if (!options.originalSanitizedAudit) assertNoObviousSecret(buffer, safe);
  outputFiles.set(safe, { buffer, mode: options.mode ?? 0o600, originalSanitizedAudit: Boolean(options.originalSanitizedAudit) });
}
function addJson(relative, value) {
  addFile(relative, `${JSON.stringify(value, null, 2)}\n`);
}

for (const original of originalMaterialized) addFile(`inputs/audit-bundle/${original.path}`, original.buffer, { originalSanitizedAudit: true });
addFile("inputs/audit-bundle/audit-package-manifest.json", fs.readFileSync(originalManifestPath), { originalSanitizedAudit: true });
for (const supplemental of ["DEALFLOW-CURRENT-VS-DESIRED-RECONCILIATION.md", "DEALFLOW-OWNER-VISION-LEDGER.md", "DEALFLOW-PRE-IMPLEMENTATION-SCOPE-PREVIEW.md"]) {
  const full = path.join(inputAuditRoot, supplemental);
  requireRegularLocalFile(full, supplemental);
  addFile(`inputs/execution-handoff/${supplemental}`, sanitizeText(fs.readFileSync(full, "utf8"), repoRoot));
}
addJson("inputs/original-audit-missing-register.json", {
  schemaVersion: "dealflow.original-audit-missing-register.v1",
  generatedAt,
  originalAuditManifestSha256: sha256(fs.readFileSync(originalManifestPath)),
  materializedMatchingNonSelfCount: originalMaterialized.length,
  missingNonSelfCount: originalMissing.length,
  materialized: originalMaterialized.map(({ path: itemPath, byteSize, sha256: digest, status }) => ({ path: itemPath, byteSize, sha256: digest, status })),
  missing: originalMissing,
  rule: "Missing original artifacts were not recreated or represented as original evidence; current root artifacts are a separately labeled integrated audit layer.",
});
addFile("inputs/original-audit-missing-register.md", `# Original audit input availability\n\nThe original sanitized audit manifest is present and valid. Exactly **${originalMaterialized.length}** non-self required artifacts are locally materialized and match their recorded byte size and SHA-256. Exactly **${originalMissing.length}** remain unavailable/dataless and were not fabricated.\n\n${markdownTable(originalMissing, [
  { key: "path", label: "Missing original artifact" },
  { key: "status", label: "Status" },
  { key: "expectedByteSize", label: "Expected bytes" },
  { key: "expectedSha256", label: "Expected SHA-256" },
])}\n`);
addJson("inputs/controlling-prompt-provenance.json", {
  schemaVersion: "dealflow.controlling-prompt-provenance.v1",
  generatedAt,
  prompts: promptProvenance,
  contentCopied: false,
  note: "Only hashes, sizes, and controlling line ranges are retained; prompt contents remain at the user-provided sources.",
});

for (const round of verification.rounds) {
  const roundName = `verification-round-${safeRelative(round.round).replace(/[^A-Za-z0-9_.-]/g, "_")}`;
  const sanitizedRecords = round.records.map(({ logText, ...record }) => record);
  addJson(`evidence/sanitized-output/${roundName}/verification-summary.json`, {
    schemaVersion: "dealflow.final-verification.sanitized.v1",
    round: round.round,
    runtime: round.runtime,
    platform: round.platform,
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    commandCount: sanitizedRecords.length,
    passedCount: sanitizedRecords.filter((record) => record.status === "passed").length,
    failedCount: sanitizedRecords.filter((record) => record.status === "failed").length,
    blockedCount: sanitizedRecords.filter((record) => record.status === "blocked").length,
    skippedCount: sanitizedRecords.filter((record) => record.status === "skipped").length,
    records: sanitizedRecords,
  });
  for (const record of round.records) addFile(`evidence/sanitized-output/${roundName}/${record.log}`, record.logText);
}
addJson("evidence/sanitized-output/verification-round-summaries.json", {
  schemaVersion: "dealflow.final-verification.rounds.v1",
  generatedAt,
  roundCount: verification.rounds.length,
  totals: verificationTotals,
  nondeterministicCommands,
  rounds: verification.rounds.map((round) => ({
    round: round.round,
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    commandCount: round.records.length,
    passedCount: round.records.filter((record) => record.status === "passed").length,
    failedCount: round.records.filter((record) => record.status === "failed").length,
    blockedCount: round.records.filter((record) => record.status === "blocked").length,
    skippedCount: round.records.filter((record) => record.status === "skipped").length,
  })),
});

const candidateDocEntries = sealEntries.filter((entry) => entry.type === "blob" && /^docs\/dealflow-completion\/[^/]+\.(?:md|json|csv)$/.test(entry.path));
for (const entry of candidateDocEntries) {
  const content = gitShowText(repoRoot, head, entry.path);
  const relative = entry.path.replace(/^docs\/dealflow-completion\//, "");
  if (entry.path.endsWith(".json")) addJson(`candidate/implementation-docs/${relative}`, sanitizeStructured(parseJson(content, entry.path), repoRoot));
  else addFile(`candidate/implementation-docs/${relative}`, sanitizeText(content, repoRoot));
}
const candidateEvidenceEntries = sealEntries.filter((entry) => entry.type === "blob" && /^docs\/dealflow-completion\/evidence\//.test(entry.path) && !/\/input-audit\//.test(entry.path) && !/\/visual-(?:baseline|local)\//.test(entry.path) && /\.(?:md|json|sql)$/.test(entry.path));
for (const entry of candidateEvidenceEntries) {
  const content = gitShowText(repoRoot, head, entry.path);
  const relative = entry.path.replace(/^docs\/dealflow-completion\/evidence\//, "");
  if (entry.path.endsWith(".json")) addJson(`evidence/sanitized-output/candidate-evidence/${relative}`, sanitizeStructured(parseJson(content, entry.path), repoRoot));
  else addFile(`evidence/sanitized-output/candidate-evidence/${relative}`, sanitizeText(content, repoRoot));
}

addJson("candidate/canonical-provenance.json", {
  schemaVersion: "dealflow.candidate-provenance.v1",
  generatedAt,
  repository: "raiaan-sudo/dealflow-os-rebuild",
  remote,
  branch,
  baseline: { commit: baselineSha, tree: baselineTree },
  implementation: { commit: implementationCommit, tree: implementationTree },
  documentationSeal: { commit: head, tree: headTree, postImplementationPaths: postImplementationChanges },
  ancestry: { baselineIsAncestor: true },
  worktree: { cleanBeforeBundle: true, localPathRetained: false },
  deployment: "NOT_EXECUTED",
  externalMutation: false,
});
addJson("candidate/changed-files.json", { schemaVersion: "dealflow.changed-files.v1", baselineSha, implementationCommit, count: changedFiles.length, records: changedFiles });
addFile("candidate/changed-files.csv", toCsv(changedFiles, ["status", "path", "priorPath"]));
addJson("candidate/local-commits.json", { schemaVersion: "dealflow.local-commits.v1", baselineSha, implementationCommit, documentationSealCommit: head, count: commits.length, records: commits });
addJson("inventories/current-test-entrypoints.json", { schemaVersion: "dealflow.current-tests.v1", generatedAt, count: tests.length, records: tests });
addFile("inventories/current-test-entrypoints.csv", toCsv(tests, ["id", "kind", "name", "path", "command", "implementation", "observed_rounds"]));
addJson("blocker-register.json", { schemaVersion: "dealflow.final-blockers.v1", generatedAt, verdict: "NO_GO", count: BLOCKERS.length, records: BLOCKERS });
addFile("blocker-register.csv", toCsv(BLOCKERS, ["id", "area", "status", "proof", "resolution"]));
addJson("owner-decision-register.json", { schemaVersion: "dealflow.owner-decisions.v1", generatedAt, count: OWNER_DECISIONS.length, records: OWNER_DECISIONS });
addFile("owner-decision-register.csv", toCsv(OWNER_DECISIONS, ["id", "title", "decision", "related"]));

const repositoryRows = [{
  id: "REPO-CANDIDATE-001",
  role: "canonical isolated implementation candidate",
  repository: "raiaan-sudo/dealflow-os-rebuild",
  remote,
  branch,
  baseline_commit: baselineSha,
  baseline_tree: baselineTree,
  implementation_commit: implementationCommit,
  implementation_tree: implementationTree,
  documentation_seal_commit: head,
  documentation_seal_tree: headTree,
  ancestry: "BASELINE_IS_ANCESTOR",
  worktree_state: "CLEAN_AT_GENERATION",
  package_name: packageJson.name,
  package_version: packageJson.version ?? "not_declared",
  tracked_files: entries.length,
  first_party_modules: modules.length,
  disposition: "CANDIDATE_ONLY_NOT_DEPLOYED",
}];

addFile("00_READ_ME_AND_AUDIT_CONTRACT.md", `# DealFlow completion audit contract\n\n**Lead verdict: NO_GO. Deployment and every external/customer/provider mutation were NOT EXECUTED.**\n\nThis directory is the complete sanitized output for two linked but distinct scopes:\n\n1. The original exhaustive audit was strictly read-only and remains incomplete where its source files were iCloud-dataless. Its ${originalMaterialized.length} materialized non-self artifacts are preserved byte-for-byte under \`inputs/audit-bundle/\`; the ${originalMissing.length} unavailable artifacts are listed, never fabricated.\n2. The later attached execution prompt authorized implementation only in the isolated candidate worktree. Candidate source, migrations, local commits, disposable-database tests, and documents changed there; production, providers, customer records, shared databases, configuration, deployment, communications, and spend did not.\n\n## Proof language\n\n- \`CONFIRMED\`: directly supported by retained source/evidence.\n- \`ASSUMED\`: explicitly bounded inference.\n- \`NOT_PROVEN\`: evidence is insufficient.\n- \`SKIPPED_SAFETY\`: execution was intentionally omitted to prevent external effects.\n- \`BLOCKED_EXTERNAL\`: required authoritative/external evidence is unavailable.\n- \`BLOCKED_OWNER_APPROVAL\`: a policy or authority decision is required.\n\nPassing local tests prove the isolated candidate under their recorded fixture profile. They do not prove deployment, current production environment values, provider acceptance, worker drain, customer state, or migration compatibility. The fresh migration chain is known-broken and independently forces NO_GO.\n\n## Bundle integrity\n\n- Every regular artifact is non-empty and local/materialized.\n- No symlink is allowed.\n- JSON, JSONL, CSV, and PNG files are parsed/decoded during generation.\n- \`audit-package-manifest.json\` hashes every regular file except itself and \`SHA256SUMS\`; \`SHA256SUMS\` hashes the manifest and every regular file except itself. This split avoids a circular hash dependency.\n- Source code, environment values, cookies, credentials, customer/provider rows, and raw secret-scanner output are excluded. Inventories retain names, paths, counts, Git object IDs, and evidence references only.\n`);

addFile("01_OWNER_TRUTH_REPORT.md", `# DealFlow owner truth report\n\n## Executive answer\n\nDealFlow now has a materially hardened **isolated source candidate**, but it is **NO_GO for controlled acceptance or deployment**. The candidate descends from the proven core production baseline; none of its changes are deployed. The first tracked migration cannot build a fresh database because the authoritative foundational schema is missing. Signed deployed-environment and old-worker-drain attestations, independent-surface lineage, and live provider acceptance are also absent.\n\n## What DealFlow objectively is today\n\nThe canonical core is a Next.js SaaS application for campaign planning, funnel/creative generation, launch orchestration, lead capture/effects, billing/credits, integrations, and operator workflows. Core production aliases map to Vercel project \`dealflow-os-rebuild\` at baseline commit \`${baselineSha}\`. The candidate at \`${implementationCommit}\` is local-only and contains the implementation/proof tranches documented under \`candidate/implementation-docs/\`.\n\nThree separately deployed surfaces remain outside proven source ancestry: \`internal.agentdealflow.io\`, \`clicktoscale.agentdealflow.io\`, and \`onboarding.agentdealflow.io\`. They were inspected only through safe evidence and were not modified.\n\n## Current counts\n\n${markdownTable(Object.entries(counts).map(([metric, value]) => ({ metric, value })), [
  { key: "metric", label: "Metric" }, { key: "value", label: "Count" },
])}\n\n## Highest-impact findings\n\n${markdownTable(topFindings, [
  { key: "id", label: "ID" }, { key: "originalSeverity", label: "Original severity" }, { key: "originalDomain", label: "Area" }, { key: "title", label: "Original finding" }, { key: "candidateDisposition", label: "Candidate disposition" }, { key: "residualRisk", label: "Residual risk" },
])}\n\nThe integrated ledger is the disposition authority. An \`IMPLEMENTED_AND_VERIFIED\` row means candidate-local proof only unless its integrated proof explicitly names a live read-only source. A \`BLOCKED_BY_EXTERNAL_AUTHORITY\` row is not a pass.\n\n## Confirmed working within proof scope\n\n- Canonical core baseline-to-candidate ancestry is mechanically proven.\n- The candidate test portfolio was run in ${verification.rounds.length} recorded rounds using a safe environment profile; exact commands, durations, exit codes, and sanitized logs are retained.\n- Candidate browser evidence covers only public/anonymous states. No authenticated account, customer row, provider record, form submission, communication, or spend was used.\n- Candidate controls and dispositions are traceable through ${ledger.rows.length} ledger rows with no omitted proof fields.\n\n## Confirmed broken or release-blocking\n\n- Fresh migration replay fails at \`${migrationEvidence.first_failing_migration}\`, statement ${migrationEvidence.statement_index}, SQLSTATE \`${migrationEvidence.sqlstate}\`: \`${migrationEvidence.safe_error}\`.\n- Prior-shape/idempotent/mixed-version/RLS/forward-recovery proof is incomplete.\n- Exact deployed kill-switch/secret-policy state and zero-old-worker drain lack authoritative signed evidence.\n- Live provider acceptance and the three independent surfaces remain unproven.\n\n## Code-only, deployed-but-unproven, configured-but-unusable, documented-only\n\n- **Code-only:** every change between baseline and candidate until an exact deployment is separately authorized and evidenced.\n- **Deployed baseline, candidate-unproven:** the canonical core aliases still map to the baseline deployment/source chain, not this candidate.\n- **Configured-but-unusable:** any provider/configuration named in source without authoritative account, flag, reachability, permission, functional, and freshness evidence.\n- **Documented-only:** release/recovery sequences labeled \`NOT EXECUTED\`, plus any policy awaiting owner/legal approval.\n\n## Owner decisions\n\n${markdownTable(OWNER_DECISIONS, [
  { key: "id", label: "ID" }, { key: "title", label: "Decision" }, { key: "decision", label: "Exact question/action" }, { key: "related", label: "Related" },
])}\n\n## Final readiness\n\n| Product area | Verdict | Boundary |\n| --- | --- | --- |\n| Canonical source candidate | CANDIDATE_LOCAL_ONLY | Proven ancestry; not deployed |\n| Database/migrations | NO_GO | Fresh chain fails; compatibility/recovery incomplete |\n| Meta/GHL/Twilio/creative providers | NO_GO | Offline/fake proof only; live acceptance skipped |\n| Billing/credits | NO_GO | Candidate integrity proof does not establish deployed/provider truth |\n| Jobs/workers | NO_GO | Candidate fencing exists; signed old-worker drain absent |\n| Public anonymous UI | PARTIAL_LOCAL_PROOF | Bounded screenshots; authenticated and assistive matrices incomplete |\n| Independent surfaces | BLOCKED_EXTERNAL | Source ancestry unavailable |\n| Overall | **NO_GO** | No deployment authorization |\n`);

addFile("02_SCOPE_COVERAGE_AND_COMPLETENESS.md", `# Scope coverage and completeness\n\n## Scope split\n\n| Scope | Allowed mutations | Evidence retained | Completion truth |\n| --- | --- | --- | --- |\n| Original master audit | Sanitized output bundle only | ${originalMaterialized.length} exact original artifacts plus manifest | ${originalMissing.length} original artifacts remain precisely blocked; not fabricated |\n| Isolated implementation | Candidate worktree source, local commits, disposable local fixtures, sanitized bundle | exact commit/tree, changed-file list, docs, tests, browser evidence | locally complete subject to explicit blockers |\n| Production/providers/customers | None | safe read-only provenance only | not mutated; acceptance not inferred |\n\n## Inventory coverage\n\n- ${entries.length} tracked files at the exact implementation commit.\n- ${modules.length} current first-party code/config/migration modules inventoried without copying source.\n- ${entrypoints.length} current pages, API/internal routes, scripts, CI workflows, proxy, and package scripts inventoried.\n- ${environmentNames.length} environment/configuration names inventoried; zero values retained.\n- ${tests.length} current test/check/build entrypoints inventoried, plus ${testLedgerRows.length} normalized test ledger rows.\n- ${deploymentRows.length} domain/surface records reconciled against the canonical baseline manifest.\n- ${SCREENSHOT_SOURCES.length} allowlisted public/anonymous screenshots converted to real PNG and decoded.\n\n## Exact gaps\n\n${markdownTable(BLOCKERS, [
  { key: "id", label: "ID" }, { key: "area", label: "Area" }, { key: "status", label: "Status" }, { key: "proof", label: "Exact blocker" },
])}\n\nCompleteness means every safely discoverable surface is represented or has a blocker; it does not convert blocked authority into success.\n`);

addFile("03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.csv", toCsv(repositoryRows, Object.keys(repositoryRows[0])));
addJson("03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.json", {
  schemaVersion: "dealflow.repository-inventory.v2",
  generatedAt,
  count: repositoryRows.length,
  records: repositoryRows,
  originalAuditInventory: "inputs/audit-bundle/03_REPOSITORY_WORKTREE_PACKAGE_INVENTORY.json",
  note: "The original multi-checkout inventory is retained separately; this root record identifies the exact canonical candidate used for implementation/proof.",
});

addJson("04_DEPLOYMENT_DOMAIN_ENVIRONMENT_MAP.json", {
  schemaVersion: "dealflow.deployment-map.v2",
  generatedAt,
  verdict: "NO_GO",
  baselineDeploymentStillCurrentForCandidateComparison: true,
  candidateDeployed: false,
  counts: { surfaces: deploymentRows.length, canonicalCore: deploymentRows.filter((row) => row.gate === "CANONICAL_CORE_PROVEN").length, blockedExternal: deploymentRows.filter((row) => row.gate === "BLOCKED_EXTERNAL").length, environmentNamesOnly: environmentNames.length, environmentValues: 0 },
  records: deploymentRows,
});
addFile("04_DEPLOYMENT_DOMAIN_ENVIRONMENT_MAP.md", `# Deployment, domain, and environment map\n\n**Candidate deployment: NOT EXECUTED. Environment values: NOT COLLECTED.**\n\n${markdownTable(deploymentRows.map((row) => ({ ...row, project: row.project ?? "not_proven", deployment: row.deployment ?? "not_proven", source_commit: row.source_commit ?? "not_proven" })), [
  { key: "domain", label: "Domain" }, { key: "host", label: "Host" }, { key: "project", label: "Project" }, { key: "deployment", label: "Runtime deployment" }, { key: "source_commit", label: "Source commit" }, { key: "gate", label: "Gate" },
])}\n\nThe core mapping establishes the production baseline only. It does not claim that implementation commit \`${implementationCommit}\` is deployed. The exact configuration-name inventory is in \`14_ENVIRONMENT_FLAG_CONFIG_MATRIX.csv\`; no value or secret-strength inference is made without the signed deployment attestation.\n`);

addFile("05_IMPLEMENTED_ARCHITECTURE_AND_SYSTEM_MAP.md", `# Implemented architecture and system map\n\n## Production truth versus candidate truth\n\n\`public aliases -> Vercel dealflow-os-rebuild -> baseline ${baselineSha.slice(0, 12)}\` is the proven production core.\n\n\`baseline -> isolated candidate ${implementationCommit.slice(0, 12)} -> local tests/docs\` is the implementation/proof chain. There is no arrow from the candidate to production because deployment was not executed.\n\n## Candidate subsystem map\n\n| Subsystem | Candidate responsibility | Proof boundary |\n| --- | --- | --- |\n| Identity/tenant authority | explicit organization/workspace membership and resource scoping | local source/disposable DB only |\n| Commercial activation | activation, entitlement, plan/billing projection, credit/provider-usage fencing | no live Stripe/provider acceptance |\n| Campaign/creative/funnel | persisted plans/assets and job ownership | no live creative-provider publication |\n| Meta | OAuth, encrypted connection truth, immutable launch snapshot/receipts, PAUSED-only launch semantics, leadgen ingestion, consent gates | no live Meta writes/acceptance |\n| Lead effects | durable per-effect states for CRM, SMS, CAPI and support paths | no customer communication/CRM effect |\n| GHL | fake-only provisioning/outbox/snapshot contracts | real provider intentionally absent |\n| Jobs/workers | lease generation/token CAS, retries, terminal sweeps, reconciliation | zero-old-worker production drain unproven |\n| Release trust | exact candidate provenance and signed evidence policy | no authoritative production signature/attestation |\n\nSystems-of-record and protocol details are copied under \`candidate/implementation-docs/\`. No source code is embedded in this bundle.\n`);

const moduleColumns = ["id", "path", "classification", "language", "byte_size", "git_blob_oid", "implementation_commit", "content_copied_to_bundle"];
addFile("06_FIRST_PARTY_MODULE_INVENTORY.csv", toCsv(modules, moduleColumns));
addJson("06_FIRST_PARTY_MODULE_INVENTORY.json", { schemaVersion: "dealflow.module-inventory.v2", generatedAt, implementationCommit, selection: "tracked first-party code, migrations, tests/checks, CI and runtime configuration; docs/assets/dependencies/generated output excluded", count: modules.length, records: modules });

const entryColumns = ["id", "kind", "path", "route_or_name", "methods", "trigger"];
addFile("07_ENTRYPOINT_ROUTE_ACTION_WORKER_INVENTORY.csv", toCsv(entrypoints, entryColumns));
addJson("07_ENTRYPOINT_ROUTE_ACTION_WORKER_INVENTORY.json", { schemaVersion: "dealflow.entrypoint-inventory.v2", generatedAt, implementationCommit, count: entrypoints.length, records: entrypoints });

function normalizedLedgerRows(rows) {
  return rows.map((row) => ({ id: row.id, current_verified_behavior: row.canonical_status, original_claim: row.original_claim, evidence_or_tests: row.tests, negative_path: row.negative_failure_path_proof, integrated_proof: row.integrated_proof, problems_or_unknowns: row.residual_risk, final_status: row.final_status, related_key: row.ledger_key }));
}
const featureAtlas = normalizedLedgerRows(featureRows);
addFile("08_PRODUCT_FEATURE_ATLAS.csv", toCsv(featureAtlas, Object.keys(featureAtlas[0])));
addJson("08_PRODUCT_FEATURE_ATLAS.json", { schemaVersion: "dealflow.feature-atlas.v2", generatedAt, implementationCommit, count: featureAtlas.length, records: featureAtlas });

const uiActions = normalizedLedgerRows(uiActionRows);
addFile("09_UI_ACTION_TRACE_MATRIX.csv", toCsv(uiActions, Object.keys(uiActions[0])));

addFile("10_END_TO_END_WORKFLOW_DOSSIERS.md", `# End-to-end workflow dossiers\n\nEvery workflow below is a normalized current-candidate disposition. Local proof does not imply live provider/customer execution.\n\n${workflowRows.map((row) => `## ${row.id} — ${row.original_claim}\n\n- Current behavior/status: ${row.canonical_status}\n- Actors/prerequisites/states: see affected scope and integrated proof in \`22_MASTER_FINDING_AND_DECISION_LEDGER.json\`.\n- Tests/evidence: ${row.tests}\n- Negative/failure proof: ${row.negative_failure_path_proof}\n- Integrated proof: ${row.integrated_proof}\n- Problems/unknowns: ${row.residual_risk}\n- Final disposition: \`${row.final_status}\`\n`).join("\n")}\n`);

const businessRules = normalizedLedgerRows(ruleRows);
addFile("11_BUSINESS_RULE_CATALOG.csv", toCsv(businessRules, Object.keys(businessRules[0])));
addJson("11_BUSINESS_RULE_CATALOG.json", { schemaVersion: "dealflow.business-rules.v2", generatedAt, implementationCommit, count: businessRules.length, records: businessRules });

addFile("12_STATE_MACHINE_CATALOG.md", `# State machine catalog\n\n${stateRows.map((row) => `## ${row.id} — ${row.original_claim}\n\n- Candidate status: ${row.canonical_status}\n- Required invariant/failure boundary: ${row.root_cause_invariant}\n- Negative-path proof: ${row.negative_failure_path_proof}\n- Integrated proof: ${row.integrated_proof}\n- Residual risk: ${row.residual_risk}\n- Final disposition: \`${row.final_status}\`\n`).join("\n")}\n\nState transitions requiring a provider, shared database, deployment, or customer identity remain unproven unless explicitly described as a local fixture.\n`);

const dataMatrix = normalizedLedgerRows(dataRows);
addFile("13_DATA_MODEL_TENANCY_MATRIX.csv", toCsv(dataMatrix, Object.keys(dataMatrix[0])));
addFile("13_DATA_MODEL_TENANCY_PRIVACY.md", `# Data model, tenancy, and privacy\n\n## Current candidate boundary\n\nThe candidate adds/strengthens explicit organization scope, membership checks, composite tenant keys, service/RPC boundaries, immutable/replay-safe receipts, and direct-DML denial across high-risk launch, billing, credit, SMS, GHL, support, and job flows. Exact entity dispositions are in the companion matrix.\n\n## What is not proven\n\n- A fresh canonical schema cannot be constructed from the tracked migration chain.\n- Prior-shape migration, privilege/RLS, mixed-version, and forward-recovery integration remain blocked.\n- No production/shared row, customer identity, cookie, provider record, or raw database log was accessed.\n- Legal adequacy, retention, consent, export, offboarding, and deletion policy require owner/specialist approval.\n\n## Data entity accounting\n\n${markdownTable(dataMatrix.slice(0, 40), [
  { key: "id", label: "Entity ID" }, { key: "original_claim", label: "Entity/claim" }, { key: "current_verified_behavior", label: "Candidate status" }, { key: "final_status", label: "Disposition" },
])}\n\nThe complete ${dataMatrix.length}-row inventory is in \`13_DATA_MODEL_TENANCY_MATRIX.csv\`.\n`);

const integrations = normalizedLedgerRows(integrationRows);
addFile("14_INTEGRATION_CONTRACTS_AND_CONFIGURATION.md", `# Integration contracts and configuration\n\n${integrationRows.map((row) => `## ${row.id} — ${row.original_claim}\n\n- Candidate status: ${row.canonical_status}\n- Contract tests: ${row.tests}\n- Negative/failure proof: ${row.negative_failure_path_proof}\n- Integrated proof: ${row.integrated_proof}\n- Residual/live boundary: ${row.residual_risk}\n- Disposition: \`${row.final_status}\`\n`).join("\n")}\n\nConfiguration names are inventoried separately. Values, account identities, enabled states, permissions, reachability, functional acceptance, freshness, and production parity are not inferred.\n`);
addFile("14_ENVIRONMENT_FLAG_CONFIG_MATRIX.csv", toCsv(environmentNames, ["name", "classification", "source_count", "source_paths", "discovery", "value_collected"]));

const securityKeywords = /security|tenant|auth|privacy|secret|token|billing|credit|stripe|meta|twilio|sms|ghl|provider|consent|launch|rls|csp|abuse|deletion|spend|financial|environment|release|webhook/i;
const securityRows = ledger.rows.filter((row) => ["FINDING", "NEW_ISSUE", "RULE"].includes(row.object_type) && securityKeywords.test(`${row.original_claim} ${row.root_cause_invariant} ${row.residual_risk}`)).map((row) => ({ id: row.id, object_type: row.object_type, control_or_risk: row.original_claim, candidate_status: row.canonical_status, negative_proof: row.negative_failure_path_proof, integrated_proof: row.integrated_proof, residual_risk: row.residual_risk, final_status: row.final_status }));
addFile("15_SECURITY_CONTROL_MATRIX.csv", toCsv(securityRows, Object.keys(securityRows[0])));
addFile("15_SECURITY_THREAT_MODEL_AND_ATTACK_SURFACE.md", `# Security threat model and attack surface\n\n## Protected assets and trust boundaries\n\nTenant/customer data, membership authority, billing/credits/provider usage, provider credentials, campaign launch/spend, CRM/communications, deletion requests, job ownership, release provenance, and operator evidence are high-impact assets. Boundaries include browser-to-server, user-to-organization, service-role-to-RPC, webhook/provider-to-ingestion, worker claim-to-completion, source-to-deployment, and configuration-name-to-deployed-state.\n\n## Candidate control themes\n\n- Exact organization/resource checks plus database constraints and narrow RPCs.\n- Signed webhook/request validation, replay/dedupe, durable receipts, idempotency and CAS fencing.\n- Provider actions default off/fake-only/PAUSED as applicable.\n- Fail-closed consent, entitlement, configuration, and provider-readiness truth.\n- Encrypted provider token storage and stronger secret-policy validation without retaining values.\n- Signed release-evidence policy designed to reject caller-authored fabricated proof.\n\n## Residual release threats\n\n${markdownTable(BLOCKERS, [
  { key: "id", label: "ID" }, { key: "area", label: "Threat/control gap" }, { key: "status", label: "Status" }, { key: "proof", label: "Evidence" },
])}\n\nNo vulnerability was exploited. No live provider action, customer-row access, destructive database action, communication, billing action, or secret extraction was attempted. The complete normalized control set is in \`15_SECURITY_CONTROL_MATRIX.csv\`.\n`);

addFile("16_UI_UX_ACCESSIBILITY_VISUAL_AUDIT.md", `# UI, UX, accessibility, and visual audit\n\n## Evidence boundary\n\nThe nine retained images are public/anonymous only: four allowlisted immutable production baselines and five reviewed local candidate/control captures (root narrow/desktop, candidate login narrow/desktop, and a narrow anonymous login control). Candidate root/login captures were reviewed at narrow and desktop requested viewports, with no reported horizontal overflow and no browser-console errors in the bounded capture session. Actual decoded image dimensions—not filename claims—are recorded in \`17_SCREENSHOT_INDEX.csv\`.\n\n## Confirmed limitations\n\n- No authenticated customer/admin/provider-connected/error-state browser matrix was executed.\n- No production form submission, login, signup, password reset, provider connection, launch, CRM action, or communication occurred.\n- Chromium-family evidence does not certify Firefox, WebKit, screen reader, touch, print, 200/400 percent zoom, or Core Web Vitals.\n- Full-page baseline subdomain images prove rendered public appearance only; their source ancestry remains blocked.\n\n## Candidate truth\n\nAccessibility and launch-success truth changes are represented in the integrated ledger and candidate docs. Local visual evidence cannot prove production deployment. The two rejected tiled candidate full-page filenames are hard-denied by the generator and must be absent; they are not counted or copied.\n`);
const uiRouteMatrix = normalizedLedgerRows(uiRouteRows);
addFile("16_UI_ROUTE_ROLE_STATE_MATRIX.csv", toCsv(uiRouteMatrix, Object.keys(uiRouteMatrix[0])));

addFile("18_TEST_COVERAGE_AND_CI_TRUTH.md", `# Test coverage and CI truth\n\n## Exact executed portfolio\n\n${verification.rounds.map((round) => `### Verification round ${round.round}\n\n- Started: ${round.startedAt}\n- Completed: ${round.completedAt}\n- Commands: ${round.records.length}\n- Passed: ${round.records.filter((record) => record.status === "passed").length}\n- Failed: ${round.records.filter((record) => record.status === "failed").length}\n- Blocked: ${round.records.filter((record) => record.status === "blocked").length}\n- Skipped: ${round.records.filter((record) => record.status === "skipped").length}\n\n${markdownTable(round.records.map(({ command, status, exitCode, durationMs, log }) => ({ command, status, exitCode, durationMs, log })), [
  { key: "command", label: "Command" }, { key: "status", label: "Status" }, { key: "exitCode", label: "Exit" }, { key: "durationMs", label: "Duration ms" }, { key: "log", label: "Sanitized log" },
])}`).join("\n\n")}\n\n## Repetition and nondeterminism\n\n${nondeterministicCommands.length === 0 ? "No command changed outcome across the supplied verification rounds." : markdownTable(nondeterministicCommands, [{ key: "command", label: "Command" }, { key: "statuses", label: "Observed statuses" }])}\n\n## Limits\n\nThese are local/offline/disposable-database checks under the recorded safe profile. They do not establish deployed environment, live provider, customer-data, production schema, migration compatibility, signed worker drain, or controlled-canary acceptance. The fresh migration replay failure remains an independent NO_GO regardless of other pass counts.\n`);
const testMatrix = normalizedLedgerRows(testLedgerRows);
addFile("18_TEST_TO_FEATURE_RULE_STATE_MATRIX.csv", toCsv(testMatrix, Object.keys(testMatrix[0])));

addFile("19_PERFORMANCE_RELIABILITY_OBSERVABILITY_RECOVERY.md", `# Performance, reliability, observability, and recovery\n\n## Candidate-local controls\n\nLease generation/token CAS, heartbeat/terminal sweeps, per-effect receipts, idempotency, ambiguous-result handling, provider-protocol drains, campaign-scoped runtime state, and forward-only recovery documentation are represented in the candidate ledger/docs and exact tests. Best-effort logging is not treated as authoritative business state.\n\n## Release-blocking recovery truth\n\n- Fresh schema replay fails before the candidate migrations can be trusted.\n- No prior-shape/idempotent/mixed-version/RLS integration or forward-recovery drill is retained.\n- No signed zero-old-worker drain exists at the protocol boundary.\n- The proven production baseline is not automatically a safe rollback after contract/schema changes; the documented path is forward recovery and is labeled NOT EXECUTED.\n\n## Performance/observability limits\n\nBuild/test durations are retained in verification summaries. No production load, customer traffic, Core Web Vitals, queue lag, provider latency, or alert-delivery SLO was measured. No logs containing customer/provider/private payloads were collected.\n`);

addFile("20_DEAD_DUPLICATE_LEGACY_EXCESSIVE_LOGIC.md", `# Dead, duplicate, legacy, and excessive logic\n\nThe original audit's multi-checkout/debt evidence is preserved under \`inputs/audit-bundle/\`. The integrated candidate ledger contains ${debtRows.length} debt dispositions. These are evidence-backed simplification candidates, not authorization to delete or rewrite systems.\n\n${markdownTable(normalizedLedgerRows(debtRows), [
  { key: "id", label: "ID" }, { key: "original_claim", label: "Debt/candidate" }, { key: "current_verified_behavior", label: "Current status" }, { key: "problems_or_unknowns", label: "Residual/unknown" }, { key: "final_status", label: "Disposition" },
])}\n\nNo repository, deployment, surface, feature, customer data, or provider record was deleted.\n`);

addFile("21_CONTRADICTIONS_AND_DRIFT.md", `# Contradictions and drift\n\n${markdownTable(normalizedLedgerRows(contradictionRows), [
  { key: "id", label: "ID" }, { key: "original_claim", label: "Contradiction" }, { key: "current_verified_behavior", label: "Candidate status" }, { key: "integrated_proof", label: "Integrated proof" }, { key: "problems_or_unknowns", label: "Residual" }, { key: "final_status", label: "Disposition" },
])}\n\nThe most important remaining truth split is deliberate: the production core is proven at the baseline commit, while the hardened candidate is local and not deployed. Documentation, source, test, provider, environment, schema, and runtime proof are separate planes throughout this bundle.\n`);

addFile("22_MASTER_FINDING_AND_DECISION_LEDGER.csv", ledgerCsvText);
addJson("22_MASTER_FINDING_AND_DECISION_LEDGER.json", ledger);

addFile("23_BLOCKERS_SKIPPED_SAFETY_AND_NOT_PROVEN.md", `# Blockers, skipped safety, and not proven\n\n**Verdict: NO_GO.** These are exact proof/authority boundaries, not generic remaining work.\n\n${markdownTable(BLOCKERS, [
  { key: "id", label: "ID" }, { key: "area", label: "Area" }, { key: "status", label: "Classification" }, { key: "proof", label: "Exact evidence/blocker" }, { key: "resolution", label: "Required resolution evidence" },
])}\n\n## Separate classification lists\n\n- **CONFIRMED:** core baseline/candidate ancestry; exact local commit/tree; candidate ledger/docs; supplied test-round outcomes; fresh migration failure; public/anonymous screenshot bytes/dimensions.\n- **ASSUMED:** none promoted to release evidence; any inference remains within individual ledger residual-risk text.\n- **NOT_PROVEN:** fresh/prior/idempotent/mixed-version/RLS/forward-recovery compatibility; authenticated browser roles; cross-engine/assistive/performance matrix; production provider/runtime freshness.\n- **SKIPPED_SAFETY:** live providers, shared/production database, real lead/customer records, communications, billing/spend, deploy, DNS/alias/configuration change, destructive/exploit testing.\n- **BLOCKED_EXTERNAL:** signed deployment/environment/worker evidence; authoritative foundational schema; independent-surface source lineage; provider acceptance.\n- **BLOCKED_OWNER_APPROVAL:** staging/canary authority and exact owner/legal policies listed in \`owner-decision-register.json\`.\n`);

const evidenceRecords = [];
const evidenceAdd = (record) => evidenceRecords.push({ schemaVersion: "dealflow.evidence.v1", ...record });
evidenceAdd({ id: "EVID-FINAL-001", timestamp: generatedAt, type: "git_provenance", status: "CONFIRMED", artifact: "candidate/canonical-provenance.json", claim: `Implementation ${implementationCommit} descends from baseline ${baselineSha}.`, limitation: "Does not prove deployment." });
evidenceAdd({ id: "EVID-FINAL-002", timestamp: migrationEvidence.evidence_time_utc, type: "migration_replay", status: "CONFIRMED", artifact: "evidence/sanitized-output/candidate-evidence/migration/fresh-replay-result.json", claim: `${migrationEvidence.first_failing_migration} failed with ${migrationEvidence.sqlstate}: ${migrationEvidence.safe_error}.`, limitation: "Disposable local replay only; no shared/production database used." });
let evidenceOrdinal = 3;
for (const round of verification.rounds) {
  for (const record of round.records) {
    evidenceAdd({ id: `EVID-FINAL-${String(evidenceOrdinal++).padStart(3, "0")}`, timestamp: record.completedAt, type: "verification_command", status: record.status === "passed" ? "CONFIRMED" : "NOT_PROVEN", artifact: `evidence/sanitized-output/verification-round-${round.round}/${record.log}`, claim: `${record.command} exited ${record.exitCode} after ${record.durationMs} ms.`, limitation: "Safe local environment; no live provider/customer/deployment inference." });
  }
}
for (const blocker of BLOCKERS) evidenceAdd({ id: `EVID-FINAL-${String(evidenceOrdinal++).padStart(3, "0")}`, timestamp: generatedAt, type: "blocker", status: blocker.status, artifact: "blocker-register.json", claim: blocker.proof, limitation: blocker.resolution });
for (const original of originalMaterialized) evidenceAdd({ id: `EVID-FINAL-${String(evidenceOrdinal++).padStart(3, "0")}`, timestamp: generatedAt, type: "original_audit_input", status: "CONFIRMED", artifact: `inputs/audit-bundle/${original.path}`, claim: `Original sanitized audit input matches ${original.sha256}.`, limitation: "Original audit scope; current candidate disposition is separate." });
addFile("24_EVIDENCE_LEDGER.jsonl", `${evidenceRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);

addFile("25_SANITIZED_AUDIT_TRAIL.md", `# Sanitized audit trail\n\n| Timestamp | Event | Mutation boundary | Evidence |\n| --- | --- | --- | --- |\n| ${startedAt} | Combined autonomous audit/implementation run began | Original audit read-only; later source changes isolated | controlling prompt hashes |\n| ${baselineManifest.evidence_cut_utc} | Canonical core baseline fixed | read-only provenance | baseline manifest |\n| ${migrationEvidence.evidence_time_utc} | Fresh disposable migration replay stopped | isolated local database only; no shared/project link | fresh replay result |\n${verification.rounds.map((round) => `| ${round.completedAt} | Verification round ${round.round} completed (${round.records.length} commands) | safe local profile | sanitized round summary |`).join("\n")}\n| ${generatedAt} | Candidate/bundle evidence cut sealed | output bundle only | manifest/checksums |\n| ${completedAt} | Authorized run completion boundary | no deployment/provider/customer mutation | final handoff |\n\n## Sanitization and non-mutation\n\n- Raw credentials, tokens, cookies, environment values, private keys, database URLs, customer/provider rows, communications, and raw secret-scanner output are excluded.\n- Original audit inputs were already sanitized and are retained byte-for-byte for hash continuity. Candidate docs/logs are re-sanitized during copying.\n- No source code is copied; current inventories contain paths, counts, sizes, classifications, and Git blob IDs only.\n- No production/shared database, provider, CRM, Stripe, Meta, GHL, Twilio, customer record, DNS, alias, deployment, or environment setting was written.\n- No vulnerability was exploited. Synthetic/disposable fixture proof is never relabeled as live acceptance.\n`);

addFile("26_GPT_HANDOFF_FOR_PRODUCT_RECONCILIATION.md", `# GPT handoff for product reconciliation\n\n## Do not collapse the proof planes\n\n- Production core truth: baseline commit \`${baselineSha}\`, tree \`${baselineTree}\`.\n- Candidate truth: implementation commit \`${implementationCommit}\`, tree \`${implementationTree}\`, local-only and not deployed. Documentation/bundle-seal commit \`${head}\`, tree \`${headTree}\`, is the clean descendant containing only completion documentation and this generator.\n- Original audit truth: preserved under \`inputs/audit-bundle/\` with ${originalMissing.length} unavailable original artifacts explicitly registered.\n- Overall verdict: **NO_GO**.\n\nThe normalized machine handoff is \`dealflow-current-state.snapshot.json\`; the complete row-level disposition authority is \`22_MASTER_FINDING_AND_DECISION_LEDGER.json\`. Together they contain current behavior, proof tier/evidence, prerequisites/states through related ledger rows, problems/contradictions, complexity/debt, unknowns, and owner questions without requiring repository source rereading.\n\n## Reconciliation rules for the next GPT\n\n1. Ask for Raiaan's intended state before recommending keep/change/remove.\n2. Do not treat \`IMPLEMENTED_AND_VERIFIED\` as deployed/live unless the row's integrated proof explicitly says so.\n3. Preserve the immutable baseline/candidate/source-to-deploy distinction.\n4. Treat every final blocker as a gate; never convert unavailable evidence to zero/pass.\n5. Do not authorize release until the foundational schema portfolio, signed exact-deployment environment/worker evidence, and controlled provider acceptance are complete.\n6. Keep independent surfaces excluded until source ancestry is proven.\n7. Do not expose or request raw secrets/customer data; ask for sanitized attestations and synthetic fixtures.\n\n## Highest-leverage owner decisions\n\n${markdownTable(OWNER_DECISIONS, [
  { key: "id", label: "ID" }, { key: "title", label: "Decision" }, { key: "decision", label: "Needed input" }, { key: "related", label: "Related" },
])}\n`);

const snapshot = {
  schemaVersion: "dealflow.current-state.v2",
  generatedAt,
  audit: {
    startedAt,
    completedAt,
    status: "COMPLETE_WITH_PRECISE_BLOCKERS",
    overallReadiness: "NO_GO",
    originalAuditScope: "STRICTLY_READ_ONLY_INCOMPLETE_WHERE_INPUTS_DATALESS",
    candidateScope: "ISOLATED_IMPLEMENTATION_AND_LOCAL_PROOF_ONLY",
    deployment: "NOT_EXECUTED",
    externalMutation: false,
  },
  provenance: { repository: "raiaan-sudo/dealflow-os-rebuild", remote, branch, baselineSha, baselineTree, implementationCommit, implementationTree, documentationSealCommit: head, documentationSealTree: headTree, baselineIsAncestor: true, implementationIsAncestorOfDocumentationSeal: true },
  counts,
  ledgerStatusCounts: ledger.final_status_counts,
  originalFindingSeverityCounts: originalFindingLedger.severity_counts,
  currentSeverityRecalibration: "NOT_AVAILABLE_FOR_ALL_CANDIDATE_NEW_ISSUES; original severity counts are retained separately and not presented as final candidate severity counts",
  deploymentSurfaces: deploymentRows,
  environmentNames: environmentNames.map((record) => record.name),
  normalized: {
    features: featureAtlas,
    uiActions,
    workflows: normalizedLedgerRows(workflowRows),
    rules: businessRules,
    stateMachines: normalizedLedgerRows(stateRows),
    dataEntities: dataMatrix,
    integrations,
    uiRouteStates: uiRouteMatrix,
    tests: testMatrix,
    contradictions: normalizedLedgerRows(contradictionRows),
    debt: normalizedLedgerRows(debtRows),
  },
  blockers: BLOCKERS,
  ownerDecisions: OWNER_DECISIONS,
  topFindings,
  safety: { sourceCopied: false, secretValuesRetained: false, cookiesRetained: false, customerProviderRowsRetained: false, sharedOrProductionDatabaseUsed: false, productionOrProviderMutation: false, communicationsSent: false, moneySpent: false, vulnerabilityExploited: false },
};
addJson("dealflow-current-state.snapshot.json", snapshot);

const reportStatusRows = Object.entries(ledger.final_status_counts).map(([status, count]) => ({ status, count, totalRows: ledger.rows.length, implementationCommit, verdict: "NO_GO" })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
const reportBlockerRows = BLOCKERS.map((blocker) => ({ id: blocker.id, area: blocker.area, status: blocker.status, evidence: blocker.proof, requiredResolution: blocker.resolution }));
const reportInput = {
  surface: "report",
  manifest: {
    version: 1,
    surface: "report",
    title: "DealFlow Completion Audit — NO_GO",
    description: "Answer-first owner report for the exact isolated DealFlow candidate and its release blockers.",
    generatedAt,
    cards: [],
    charts: [{
      id: "ledger_disposition_chart",
      title: "Integrated ledger dispositions",
      subtitle: `All ${ledger.rows.length} normalized rows at the exact candidate commit`,
      type: "bar",
      dataset: "ledger_status_counts",
      sourceId: "integrated_ledger",
      encodings: {
        x: { field: "status", type: "nominal", label: "Final disposition" },
        y: { field: "count", type: "quantitative", label: "Rows", format: "number" },
        tooltip: [{ field: "count", type: "quantitative", label: "Rows", format: "number" }, { field: "totalRows", type: "quantitative", label: "Total rows", format: "number" }],
      },
      valueFormat: "number",
      layout: "full",
      maxRows: 10,
    }],
    tables: [{
      id: "release_blocker_table",
      title: "Release blockers and authority decisions",
      subtitle: "Current exact blockers; none is converted to a pass",
      dataset: "release_blockers",
      sourceId: "blocker_register",
      density: "spacious",
      layout: "full",
      defaultSort: { field: "id", direction: "asc" },
      columns: [
        { field: "id", label: "ID" },
        { field: "area", label: "Area" },
        { field: "status", label: "Status" },
        { field: "evidence", label: "Evidence" },
        { field: "requiredResolution", label: "Required resolution" },
      ],
    }],
    sources: [
      { id: "integrated_ledger", label: "Integrated requirement and proof ledger", path: "22_MASTER_FINDING_AND_DECISION_LEDGER.json" },
      { id: "blocker_register", label: "Final blocker register", path: "blocker-register.json" },
      { id: "verification_summaries", label: "Sanitized verification round summaries", path: "evidence/sanitized-output/verification-round-summaries.json" },
      { id: "migration_replay", label: "Fresh migration replay result", path: "evidence/sanitized-output/candidate-evidence/migration/fresh-replay-result.json" },
    ],
    blocks: [
      { id: "report_title", type: "markdown", layout: "full", body: "# DealFlow Completion Audit — NO_GO" },
      { id: "executive_summary", type: "markdown", layout: "full", body: "## Executive Summary\n\n- **The candidate is not releasable.** It is an isolated, hardened source candidate; no candidate change is deployed.\n- **Database authority is the first hard gate.** Fresh migration replay fails because the tracked chain assumes a foundational table that it never creates.\n- **Production trust is incomplete by design.** Exact deployed environment state, old-worker drain, live providers, and three independent surfaces lack authoritative evidence.\n- **No external mutation occurred.** No deployment, provider/customer record, CRM, communication, billing action, shared database write, configuration change, or spend was performed." },
      { id: "decision_answer", type: "markdown", layout: "full", body: "## The only honest release decision is NO_GO\n\nThe local candidate and repeated safe verification materially improve the code-side control plane, but release readiness requires all proof planes. The fresh schema failure alone blocks acceptance; the remaining authority and live-proof gaps reinforce the same decision." },
      { id: "ledger_interpretation", type: "markdown", layout: "full", sourceId: "integrated_ledger", body: "## Candidate work is fully dispositioned, not fully deployable\n\nRead the chart as accounting, not a readiness score. Every normalized requirement, finding, blocker, contradiction, debt item, workflow, rule, state, data entity, integration, route/action and test has one allowed final disposition. Rows blocked by external authority remain blockers even when their candidate code path is implemented." },
      { id: "ledger_disposition_block", type: "chart", layout: "full", chartId: "ledger_disposition_chart" },
      { id: "blocker_interpretation", type: "markdown", layout: "full", body: "## Release blockers are concrete and independently resolvable\n\nThe table separates missing evidence from owner policy. Resolve the foundational schema and isolated recovery proof first; then bind signed environment/worker evidence to the exact deployment; only then authorize bounded provider acceptance." },
      { id: "release_blocker_block", type: "table", layout: "full", tableId: "release_blocker_table" },
      { id: "recommended_next_steps", type: "markdown", layout: "full", body: "## Recommended next steps\n\n1. Recover and approve the authoritative foundational schema.\n2. Run fresh, prior-shape, idempotent, mixed-version, RLS/privilege and forward-recovery proof on a separately authorized isolated target.\n3. Produce signed exact-deployment environment and zero-old-worker-drain attestations.\n4. Resolve the owner/legal decisions in the decision register.\n5. Authorize bounded provider canaries only after the preceding gates pass." },
      { id: "further_questions", type: "markdown", layout: "full", body: "## Further Questions\n\n- Which artifact is the authoritative foundational schema before the first tracked migration?\n- Who is permitted to sign deployment and worker-drain evidence?\n- What exact consent, GHL lifecycle, billing-exception and workspace-authority policies should the product enforce?\n- Which repositories/deployments own the three independently deployed subdomains?" },
      { id: "caveats", type: "markdown", layout: "full", body: "## Caveats and Assumptions\n\nLocal/offline/disposable tests do not prove deployed behavior. Public screenshots do not prove authenticated, provider-connected, assistive-technology, cross-engine or performance states. Original audit files that remain dataless are registered as unavailable and were not reconstructed. The report is a bounded snapshot, not a live connection." },
    ],
  },
  snapshot: {
    version: 1,
    generatedAt,
    status: "blocked",
    datasets: { ledger_status_counts: reportStatusRows, release_blockers: reportBlockerRows },
    accessIssues: BLOCKERS.slice(0, 6).map((blocker) => ({ id: blocker.id.toLowerCase(), scope: blocker.area, sourceId: blocker.id === "FINAL-BLK-001" ? "migration_replay" : "blocker_register", dataset: "release_blockers", message: blocker.proof })),
  },
  sources: [
    { id: "integrated_ledger", label: "Integrated requirement and proof ledger", path: "22_MASTER_FINDING_AND_DECISION_LEDGER.json" },
    { id: "blocker_register", label: "Final blocker register", path: "blocker-register.json" },
    { id: "verification_summaries", label: "Sanitized verification round summaries", path: "evidence/sanitized-output/verification-round-summaries.json" },
    { id: "migration_replay", label: "Fresh migration replay result", path: "evidence/sanitized-output/candidate-evidence/migration/fresh-replay-result.json" },
  ],
};
addJson("report-input.json", reportInput);

const screenshotSourceBuffers = SCREENSHOT_SOURCES.map((record) => {
  if (!entryPaths.has(record.source)) fail(`Allowlisted screenshot is not present at the implementation commit: ${record.source}`);
  return { ...record, sourceBuffer: gitShowBuffer(repoRoot, implementationCommit, record.source) };
});

for (const rejected of REJECTED_TILED_SCREENSHOTS) {
  if (entryPaths.has(rejected) || fs.existsSync(path.join(repoRoot, rejected))) {
    fail(`Rejected tiled candidate screenshot must not be present or bundled: ${rejected}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const stagingRoot = path.join(outputDir, ".bundle-build");
if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
const imageStaging = path.join(stagingRoot, ".image-conversion");
fs.mkdirSync(imageStaging, { recursive: true, mode: 0o700 });
let bundlePublished = false;
process.on("exit", () => {
  if (!bundlePublished && fs.existsSync(stagingRoot)) {
    try {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    } catch {
      // Preserve the original generation failure; a later run rejects or removes
      // this in-bundle staging directory before rebuilding.
    }
  }
});

const screenshotIndex = [];
for (const source of screenshotSourceBuffers) {
  const prepared = preparePng(source.sourceBuffer, source.source, imageStaging);
  addFile(source.output, prepared.buffer);
  screenshotIndex.push({
    id: `SHOT-${String(screenshotIndex.length + 1).padStart(3, "0")}`,
    path: source.output,
    scope: source.scope,
    requested_viewport: source.viewport,
    validity_basis: source.validityBasis,
    actual_width_px: prepared.width,
    actual_height_px: prepared.height,
    format: "PNG",
    source_capture_transcoded_to_png: prepared.transcoded,
    sha256: sha256(prepared.buffer),
    contains_customer_or_authenticated_data: false,
  });
}
fs.rmSync(imageStaging, { recursive: true, force: true });
addFile("17_SCREENSHOT_INDEX.csv", toCsv(screenshotIndex, ["id", "path", "scope", "requested_viewport", "validity_basis", "actual_width_px", "actual_height_px", "format", "source_capture_transcoded_to_png", "sha256", "contains_customer_or_authenticated_data"]));
for (const screenshot of screenshotIndex) evidenceAdd({ id: `EVID-FINAL-${String(evidenceOrdinal++).padStart(3, "0")}`, timestamp: generatedAt, type: "screenshot", status: "CONFIRMED", artifact: screenshot.path, claim: `Decoded PNG ${screenshot.actual_width_px}x${screenshot.actual_height_px}; ${screenshot.scope}.`, limitation: "Public/anonymous bounded visual evidence only." });
// Refresh the JSONL now that screenshot evidence has been added.
outputFiles.set("24_EVIDENCE_LEDGER.jsonl", { buffer: Buffer.from(`${evidenceRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8"), mode: 0o600, originalSanitizedAudit: false });

if (includeExistingReport) {
  const artifact = parseJson(preservedReport.get("artifact.json").toString("utf8"), "existing artifact.json");
  if (canonicalJson(artifact) !== canonicalJson(reportInput)) fail("Existing artifact.json does not exactly match the newly generated canonical report input.");
  const receipt = parseJson(preservedReport.get("report-delivery-receipt.json").toString("utf8"), "existing report delivery receipt");
  if (!receipt.stages || !["passed", "structural_only"].includes(receipt.stages.verification)) fail("Existing report delivery receipt does not show successful portable verification.");
  const html = preservedReport.get("report.html").toString("utf8");
  if (!/<html\b/i.test(html) || !/<meta[^>]+color-scheme/i.test(html) || /<script[^>]+src\s*=|<link[^>]+href\s*=\s*["']https?:/i.test(html)) fail("Existing report.html is not a self-contained portable report.");
  addFile("artifact.json", preservedReport.get("artifact.json"));
  addFile("report.html", preservedReport.get("report.html"));
  addJson("report-delivery-receipt.json", sanitizeStructured({ ...receipt, html: "report.html" }, repoRoot));
}

for (const required of REQUIRED_ROOT_ARTIFACTS.filter((item) => item !== "audit-package-manifest.json")) if (!outputFiles.has(required)) fail(`Required root artifact was not generated: ${required}`);

function validateReportArtifact(artifact) {
  if (artifact.surface !== "report" || artifact.manifest?.surface !== "report") fail("report-input.json must use the report surface.");
  if (artifact.snapshot?.status !== "blocked" || !Array.isArray(artifact.snapshot.accessIssues) || artifact.snapshot.accessIssues.length === 0) fail("report-input.json must expose blocked access issues.");
  const first = artifact.manifest.blocks?.[0];
  const second = artifact.manifest.blocks?.[1];
  if (first?.type !== "markdown" || first.body !== `# ${artifact.manifest.title}`) fail("The first report block must be an H1 matching the manifest title.");
  if (second?.type !== "markdown" || !second.body.startsWith("## Executive Summary")) fail("Executive Summary must be the first narrative section after the title.");
  const sourceIds = new Set(artifact.manifest.sources.map((source) => source.id));
  for (const source of artifact.manifest.sources) {
    if (!source.path || path.isAbsolute(source.path) || source.path.includes("..") || /^[a-z]+:\/\//i.test(source.path)) fail(`Unsafe report source path: ${source.path}`);
  }
  for (const item of [...(artifact.manifest.cards ?? []), ...(artifact.manifest.charts ?? []), ...(artifact.manifest.tables ?? [])]) if (!item.sourceId || !sourceIds.has(item.sourceId)) fail(`Quantitative report element ${item.id} lacks a valid sourceId.`);
  if ((artifact.manifest.charts ?? []).length === 0) fail("Report must contain a native chart.");
}
validateReportArtifact(reportInput);

const preManifestFileRecords = [...outputFiles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([relative, record]) => ({ path: relative, byteSize: record.buffer.length, sha256: sha256(record.buffer) }));
const auditManifest = {
  schemaVersion: "dealflow.audit-package-manifest.v2",
  generatedAt,
  auditStatus: "COMPLETE_WITH_PRECISE_BLOCKERS",
  readinessVerdict: "NO_GO",
  designatedOutput: "dealflow-completion-execution-20260710",
  canonical: { repository: "raiaan-sudo/dealflow-os-rebuild", branch, baselineSha, baselineTree, implementationCommit, implementationTree, documentationSealCommit: head, documentationSealTree: headTree, baselineIsAncestor: true, implementationIsAncestorOfDocumentationSeal: true },
  scope: { originalAudit: "STRICTLY_READ_ONLY", candidate: "ISOLATED_LOCAL_IMPLEMENTATION", productionProviderCustomerMutation: false },
  counts,
  ledgerStatusCounts: ledger.final_status_counts,
  requiredArtifactCount: REQUIRED_ROOT_ARTIFACTS.length,
  requiredArtifacts: REQUIRED_ROOT_ARTIFACTS.map((relative) => relative === "audit-package-manifest.json" ? { path: relative, required: true, status: "SELF_HASH_EXCLUDED; HASHED_BY_SHA256SUMS" } : { path: relative, required: true, status: "GENERATED_AND_HASHED", ...preManifestFileRecords.find((record) => record.path === relative) }),
  hashAlgorithm: "SHA-256",
  hashScope: "files[] hashes every regular file present before manifest sealing except audit-package-manifest.json and SHA256SUMS. SHA256SUMS hashes this manifest and every regular file except SHA256SUMS.",
  files: preManifestFileRecords,
  originalAuditInputs: { materializedMatchingNonSelf: originalMaterialized.length, missingNonSelf: originalMissing.length, missingRegister: "inputs/original-audit-missing-register.json" },
  report: includeExistingReport ? { status: "PORTABLE_REPORT_INCLUDED_AND_HASHED", artifact: "artifact.json", html: "report.html", receipt: "report-delivery-receipt.json" } : { status: "CANONICAL_INPUT_READY; PORTABLE_REPORT_NOT_YET_INCLUDED", input: "report-input.json", secondPass: "Rerun with identical arguments plus --include-existing-report true after canonical delivery." },
  safety: snapshot.safety,
};
addJson("audit-package-manifest.json", auditManifest);
const checksumLines = [...outputFiles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([relative, record]) => `${sha256(record.buffer)}  ${relative}`);
addFile("SHA256SUMS", `${checksumLines.join("\n")}\n`);

function writeStagedFiles() {
  for (const [relative, record] of outputFiles) {
    const full = path.join(stagingRoot, relative);
    if (!isInside(stagingRoot, full)) fail(`Staged output escaped bundle root: ${relative}`);
    fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
    fs.writeFileSync(full, record.buffer, { mode: record.mode });
  }
}

function validateStagedBundle() {
  assertNoSymlinkTree(stagingRoot);
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`Symlink in staged bundle: ${full}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
      else fail(`Non-regular bundle entry: ${full}`);
    }
  };
  walk(stagingRoot);
  for (const full of files) {
    const relative = path.relative(stagingRoot, full).replaceAll(path.sep, "/");
    const stat = fs.statSync(full);
    if (stat.size === 0 || (typeof stat.blocks === "number" && stat.blocks === 0)) fail(`Empty/dataless staged artifact: ${relative}`);
    const buffer = fs.readFileSync(full);
    assertNoObviousSecret(buffer, relative);
    if (relative.endsWith(".json")) parseJson(buffer.toString("utf8"), relative);
    if (relative.endsWith(".jsonl")) {
      const lines = buffer.toString("utf8").split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) fail(`${relative} has no JSONL records.`);
      lines.forEach((line, index) => parseJson(line, `${relative}:${index + 1}`));
    }
    if (relative.endsWith(".csv")) parseCsv(buffer.toString("utf8"), relative);
    if (relative.endsWith(".png")) decodePng(buffer, relative);
  }
  for (const required of REQUIRED_ROOT_ARTIFACTS) if (!fs.existsSync(path.join(stagingRoot, required))) fail(`Missing required staged artifact: ${required}`);
  const manifest = parseJson(fs.readFileSync(path.join(stagingRoot, "audit-package-manifest.json"), "utf8"), "staged audit manifest");
  for (const record of manifest.files) {
    const buffer = fs.readFileSync(path.join(stagingRoot, safeRelative(record.path)));
    if (buffer.length !== record.byteSize || sha256(buffer) !== record.sha256) fail(`Manifest mismatch: ${record.path}`);
  }
  for (const line of fs.readFileSync(path.join(stagingRoot, "SHA256SUMS"), "utf8").split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) fail(`Invalid SHA256SUMS line: ${line}`);
    const relative = safeRelative(match[2]);
    if (relative === "SHA256SUMS") fail("SHA256SUMS must not hash itself.");
    if (sha256(fs.readFileSync(path.join(stagingRoot, relative))) !== match[1]) fail(`SHA256SUMS mismatch: ${relative}`);
  }
}

writeStagedFiles();
validateStagedBundle();
// Publish only after the staged bundle validates. The prior first-pass bundle is
// kept intact until this point, which makes the report-inclusive second pass
// safe even when verification inputs also lived under the designated output.
for (const entry of fs.readdirSync(outputDir)) {
  if (entry === path.basename(stagingRoot)) continue;
  const existing = path.join(outputDir, entry);
  if (fs.lstatSync(existing).isSymbolicLink()) fail(`Refusing to replace symlinked prior bundle entry: ${existing}`);
  fs.rmSync(existing, { recursive: true, force: true });
}
for (const entry of fs.readdirSync(stagingRoot)) {
  const destination = path.join(outputDir, entry);
  if (fs.existsSync(destination)) fail(`Validated publish destination unexpectedly exists: ${destination}`);
  fs.renameSync(path.join(stagingRoot, entry), destination);
}
fs.rmSync(stagingRoot, { recursive: true, force: true });
bundlePublished = true;
assertNoSymlinkTree(outputDir);
const statusAfter = git(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot });
if (statusAfter !== statusBefore) fail("Repository status changed during external bundle generation.");

process.stdout.write(`${JSON.stringify({
  ok: true,
  outputDirectory: outputDir,
  verdict: "NO_GO",
  implementationCommit,
  implementationTree,
  documentationSealCommit: head,
  documentationSealTree: headTree,
  fileCount: [...outputFiles.keys()].length,
  reportIncluded: includeExistingReport,
  originalAuditInputs: { materialized: originalMaterialized.length, missing: originalMissing.length },
  verification: { rounds: verification.rounds.length, ...verificationTotals, nondeterministic: nondeterministicCommands.length },
}, null, 2)}\n`);
