#!/usr/bin/env node
import { parseArgs } from "./write-proof-artifact.mjs";

const MISSIONS = {
  bug_fix: {
    risk_tier: "R2",
    required_checks: ["focused regression", "lint", "typecheck", "git diff --check"],
    forbidden_actions: ["unrelated refactors", "production mutation", "deploy without approval"],
    proof_requirements: ["root cause", "files changed", "focused test artifact"],
    recommended_agent_roles: ["Orchestrator", "Repo Investigator", "Implementation Engineer", "Test Engineer"],
    approval_gates: ["deploy", "production mutation", "external side effect"],
  },
  feature_build: {
    risk_tier: "R2",
    required_checks: ["focused tests", "lint", "typecheck", "build"],
    forbidden_actions: ["scope creep", "unsafe production actions"],
    proof_requirements: ["acceptance criteria", "test artifacts", "browser proof when UI is touched"],
    recommended_agent_roles: ["Orchestrator", "Implementation Engineer", "Test Engineer", "Frontend/UX Reviewer"],
    approval_gates: ["deploy", "paid provider", "production side effect"],
  },
  production_audit: {
    risk_tier: "R4",
    required_checks: ["safe production smoke", "operator proof", "artifact registry"],
    forbidden_actions: ["production mutation", "valid lead submission", "send/charge/launch"],
    proof_requirements: ["deploy ID", "alias proof", "safe probe results"],
    recommended_agent_roles: ["Orchestrator", "Production Ops Agent", "Security/Data Integrity Reviewer"],
    approval_gates: ["any R5 action"],
  },
  deployment: {
    risk_tier: "R3",
    required_checks: ["predeploy validation", "postdeploy safe smoke"],
    forbidden_actions: ["deploy without explicit approval"],
    proof_requirements: ["commit SHA", "deploy ID", "rollback target", "postdeploy artifact"],
    recommended_agent_roles: ["Orchestrator", "Production Ops Agent", "Test Engineer"],
    approval_gates: ["deploy", "rollback"],
  },
  browser_proof: {
    risk_tier: "R4",
    required_checks: ["route matrix", "desktop screenshot", "mobile screenshot", "console/overflow checks"],
    forbidden_actions: ["launch", "checkout", "send", "provider generation"],
    proof_requirements: ["screenshots", "routes", "viewport", "auth method"],
    recommended_agent_roles: ["Browser Proof Agent", "Frontend/UX Reviewer"],
    approval_gates: ["destructive click", "external side effect"],
  },
  worker_runtime_repair: {
    risk_tier: "R3",
    required_checks: ["worker dry-run", "operator debt", "fingerprint proof"],
    forbidden_actions: ["live job execution without approval", "provider generation"],
    proof_requirements: ["worker commit", "readiness", "missing env names only"],
    recommended_agent_roles: ["Worker Runtime Agent", "Production Ops Agent"],
    approval_gates: ["worker job execution", "provider call"],
  },
  data_repair: {
    risk_tier: "R5",
    required_checks: ["dry-run inventory", "backup/rollback note", "scoped apply approval"],
    forbidden_actions: ["destructive DB write without approval"],
    proof_requirements: ["row count", "scope", "idempotency", "rollback"],
    recommended_agent_roles: ["Data Integrity Agent", "Security/Data Integrity Reviewer"],
    approval_gates: ["production DB write"],
  },
  security_review: {
    risk_tier: "R2",
    required_checks: ["routes:security", "RLS checks when available", "secret scan"],
    forbidden_actions: ["weakening guards", "printing secrets"],
    proof_requirements: ["threat model", "findings", "test artifacts"],
    recommended_agent_roles: ["Security/Data Integrity Reviewer", "Repo Investigator"],
    approval_gates: ["production probe beyond safe smoke"],
  },
  creative_readiness_bug: {
    risk_tier: "R2",
    required_checks: ["creative readiness tests", "static image QA", "worker tests"],
    forbidden_actions: ["provider generation without approval"],
    proof_requirements: ["Build/Preview/Launch agreement", "asset provenance"],
    recommended_agent_roles: ["Provider/Creative/Worker Agent", "Test Engineer"],
    approval_gates: ["provider job", "production asset mutation"],
  },
  billing_stripe_review: {
    risk_tier: "R4",
    required_checks: ["billing-free-trial", "subscription-lifecycle", "webhook signature rejection"],
    forbidden_actions: ["live charge", "checkout session without approval"],
    proof_requirements: ["billing state", "no-charge audit"],
    recommended_agent_roles: ["Billing/Stripe Agent", "Security/Data Integrity Reviewer"],
    approval_gates: ["Stripe action"],
  },
  meta_launch_review: {
    risk_tier: "R4",
    required_checks: ["launch budget safety", "Meta selection proof", "payload guardrails"],
    forbidden_actions: ["Meta mutation", "launch", "budget/audience change"],
    proof_requirements: ["payload safety", "gate truthfulness"],
    recommended_agent_roles: ["Meta/Launch Agent", "Production Ops Agent"],
    approval_gates: ["Meta write", "launch"],
  },
  frontend_ux_pass: {
    risk_tier: "R2",
    required_checks: ["desktop browser proof", "390px browser proof", "lint"],
    forbidden_actions: ["provider/billing/Meta side effects"],
    proof_requirements: ["screenshots", "route matrix", "console errors"],
    recommended_agent_roles: ["Frontend/UX Reviewer", "Browser Proof Agent"],
    approval_gates: ["customer-affecting production action"],
  },
  incident_response: {
    risk_tier: "R4",
    required_checks: ["current deploy", "safe smoke", "operator proof", "rollback plan"],
    forbidden_actions: ["rollback without approval unless pre-approved"],
    proof_requirements: ["timeline", "impact", "mitigation", "next command"],
    recommended_agent_roles: ["Incident/Rollback Agent", "Production Ops Agent", "Orchestrator"],
    approval_gates: ["rollback", "production mutation"],
  },
  engineering_os_upgrade: {
    risk_tier: "R2",
    required_checks: ["syntax checks", "self-test", "proof verify", "git diff --check"],
    forbidden_actions: ["deploy", "production mutation", "external side effect"],
    proof_requirements: ["artifact registry", "docs", "CI config", "self-test"],
    recommended_agent_roles: ["Orchestrator", "Implementation Engineer", "Test Engineer", "Documentation Agent"],
    approval_gates: ["deploy", "external side effect"],
  },
};

const args = parseArgs();
const missionType = args.type ?? args.missionType ?? "engineering_os_upgrade";
const result = MISSIONS[missionType] ?? {
  risk_tier: "R2",
  required_checks: ["inspect repo", "focused validation", "proof artifact"],
  forbidden_actions: ["unsafe side effects"],
  proof_requirements: ["evidence-backed final report"],
  recommended_agent_roles: ["Orchestrator", "Repo Investigator"],
  approval_gates: ["R5 side effect"],
};

console.log(JSON.stringify({ mission_type: missionType, ...result }, null, 2));

