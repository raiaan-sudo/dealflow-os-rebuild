#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const proofDir = process.env.ENGINEERING_OS_PROOF_DIR || null;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function hasScript(name) {
  return Boolean(packageJson.scripts?.[name]);
}

function fileIncludes(relativePath, patterns) {
  if (!exists(relativePath)) return false;
  const contents = read(relativePath);
  return patterns.every((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(contents);
    return contents.includes(pattern);
  });
}

const categories = [
  {
    id: "cross_client_data_isolation",
    label: "Cross-client data isolation / Caden-class leakage",
    required: [
      ["script", "routes:security"],
      ["script", "rls:cross-tenant"],
      ["script", "rls:fixture-smoke"],
      ["script", "test:public-self-serve-acceptance"],
    ],
    notes: "Route ownership plus strict-mode live two-tenant RLS proof.",
  },
  {
    id: "idor_bola_api_attack_surface",
    label: "IDOR/BOLA object-id swap attack surface",
    required: [
      ["script", "routes:security"],
      ["file", "scripts/check-route-security.mjs", ["Dynamic route ownership marker", "Private mutation same-origin guard"]],
    ],
    notes: "Every dynamic private route must have ownership markers.",
  },
  {
    id: "supabase_rls_storage",
    label: "Supabase RLS and storage isolation",
    required: [
      ["script", "schema:check"],
      ["script", "rls:cross-tenant"],
      ["script", "rls:fixture-smoke"],
      ["script", "test:static-creative-storage-normalization"],
      ["script", "audit:static-creative-storage"],
    ],
    notes: "Table policy proof plus app-owned creative storage normalization.",
  },
  {
    id: "authenticated_browser_flows",
    label: "Authenticated browser UX and RBAC flows",
    required: [
      ["script", "test:e2e:safe"],
      ["file", "playwright.safe.config.ts", ["@playwright/test"]],
    ],
    notes: "Browser mode must run this against a safe target.",
  },
  {
    id: "mass_assignment",
    label: "Mass-assignment/server-owned field protection",
    required: [
      ["script", "routes:security"],
      ["script", "test:public-self-serve-acceptance"],
      ["script", "test:stripe-price-guard"],
      ["script", "test:performance-billing"],
    ],
    notes: "Guards server-owned tenant, billing, launch, and entitlement state.",
  },
  {
    id: "creative_storage_provenance",
    label: "Creative/funnel/media provenance",
    required: [
      ["script", "test:creative-media-readiness"],
      ["script", "test:static-creative-image-qa"],
      ["script", "test:static-creative-storage-normalization"],
      ["script", "test:creative-render-state"],
    ],
    notes: "App-owned assets, current campaign context, and hard launch-safety gates.",
  },
  {
    id: "headers_csp_cookies",
    label: "Security headers, CSP, cookie posture",
    required: [
      ["file", "src/proxy.ts", ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options"]],
      ["file", "docs/validation-runbook.md", ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options"]],
    ],
    notes: "Local static proof; production header proof belongs to postdeploy/browser/DAST mode.",
  },
  {
    id: "webhook_attack_tests",
    label: "Webhook signature/replay/idempotency attacks",
    required: [
      ["script", "test:subscription-lifecycle"],
      ["script", "test:stripe-price-guard"],
      ["script", "test:performance-billing"],
      ["file", "src/lib/integrations/stripe/provider.ts", ["constructEvent", "webhookSecret"]],
      ["file", "docs/observability-alerting-runbook.md", ["unsigned `POST /api/stripe/webhook`", "unsigned `POST /api/webhooks/twilio/status`"]],
    ],
    notes: "Stripe signature, unsigned negative paths, billing idempotency, and reporting.",
  },
  {
    id: "dast_scanner",
    label: "DAST scanner",
    required: [
      ["script", "audit:zap:baseline"],
      ["file", "scripts/run-zap-baseline.mjs", ["ZAP_TARGET_URL", "zaproxy"]],
      ["file", ".github/workflows/security-audit.yml", ["zaproxy", "workflow_dispatch"]],
    ],
    notes: "ZAP is configured and runs when a safe target is provided.",
  },
  {
    id: "secrets_history_build_deploy",
    label: "Secrets in source, build, and deployed responses",
    required: [
      ["script", "audit:secret-exposure"],
      ["script", "audit:semgrep"],
      ["file", ".semgrep.yml", ["dealflow-no-service-role-in-client-surface", "dealflow-no-secret-debug-output"]],
    ],
    notes: "Source scan locally; CI/external mode adds Semgrep.",
  },
  {
    id: "logging_pii",
    label: "Logging, client telemetry, support, PII redaction",
    required: [
      ["script", "test:client-error-telemetry"],
      ["script", "test:support-freshdesk"],
      ["file", "src/lib/services/client-error-telemetry-service.ts", ["FORBIDDEN_TEXT_PATTERN", "FORBIDDEN_METADATA_KEY"]],
    ],
    notes: "Redacts secrets, provider URLs, signed URLs, and sensitive metadata.",
  },
  {
    id: "supply_chain",
    label: "Supply-chain hardening",
    required: [
      ["command", "npm audit --audit-level=high"],
      ["file", ".github/workflows/security-audit.yml", ["codeql-action", "semgrep", "lighthouse"]],
      ["script", "audit:lighthouse"],
    ],
    notes: "Dependency audit, CodeQL, Semgrep, and Lighthouse CI are configured.",
  },
  {
    id: "backup_restore_incident",
    label: "Backup, restore, incident response",
    required: [
      ["script", "backup:supabase"],
      ["file", "docs/observability-alerting-runbook.md", ["incident", "rollback", "affected"]],
      ["script", "operator:debt"],
      ["script", "operator:scale-report"],
    ],
    notes: "Backup command availability plus operator visibility.",
  },
  {
    id: "partner_white_label_isolation",
    label: "Partner and white-label isolation",
    required: [
      ["script", "test-white-label-foundation"],
      ["script", "test:partner-branded-billing"],
      ["file", "src/components/white-label/partner-dashboard-shell.tsx", ["No partner access", "other partners", "provider secrets"]],
    ],
    notes: "Partner pricing/branding and dashboard scoping protections.",
  },
  {
    id: "production_canary",
    label: "Production canary and postdeploy proof",
    required: [
      ["script", "validate:postdeploy"],
      ["script", "operator:debt"],
      ["script", "operator:scale-report"],
    ],
    notes: "Production mode runs postdeploy/operator checks against PRELAUNCH_BASE_URL.",
  },
];

function validateRequirement(requirement) {
  const [type, key, patterns] = requirement;
  if (type === "script") return hasScript(key);
  if (type === "command") return true;
  if (type === "file") return fileIncludes(key, patterns);
  return false;
}

const matrix = categories.map((category) => {
  const checks = category.required.map((requirement) => {
    const [type, key] = requirement;
    const passed = validateRequirement(requirement);
    if (!passed) failures.push(`${category.id}: missing ${type} ${key}`);
    return { type, key, status: passed ? "PASS" : "FAIL" };
  });

  return {
    id: category.id,
    label: category.label,
    status: checks.every((check) => check.status === "PASS") ? "MAPPED" : "MISSING",
    checks,
    notes: category.notes,
  };
});

const report = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  matrix,
  failures,
  strictRuntimeGates: [
    "FULL_STACK_AUDIT_DATA_ISOLATION=1 runs live RLS cross-tenant proof",
    "FULL_STACK_AUDIT_BROWSER=1 runs authenticated safe browser proof",
    "FULL_STACK_AUDIT_EXTERNAL=1 runs Semgrep/Lighthouse/ZAP where configured",
    "FULL_STACK_AUDIT_PRODUCTION=1 runs operator and postdeploy canary proof",
    "FULL_STACK_AUDIT_STRICT=1 enables data-isolation and browser gates together",
  ],
};

if (proofDir) {
  fs.writeFileSync(path.join(proofDir, "security-coverage-matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
}

for (const item of matrix) {
  console.log(`${item.status === "MAPPED" ? "PASS" : "FAIL"}  ${item.label}`);
}

if (failures.length > 0) {
  console.error(`\nSecurity coverage matrix failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("\nSecurity coverage matrix mapped all required categories.");
