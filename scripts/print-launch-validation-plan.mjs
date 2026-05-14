#!/usr/bin/env node

const commands = [
  "node -v",
  "npm run operator:debt",
  "npm run routes:security",
  "npm run smoke:offline",
  "npm run schema:check",
  "npm run test:creative-media-readiness",
  "npm run test:video-generation-safety",
  "npm run test:marketing-studio-worker",
  "npm run test:higgsfield-provider-selection",
  "npm run test:static-creative-storage",
  "npm run test:static-creative-image-qa",
  "npm run test:static-ad-templates",
  "npm run test:creative-chat-intake",
  "npm run test:provider-cost-watch",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "npm audit --omit=dev --audit-level=high",
  "git diff --check",
  "git diff | rg -i \"(api[_-]?key|secret|token|password|authorization:|bearer |sk_live|sk_test|hf_[a-z0-9])\"",
];

console.log("DealFlow launch validation command sequence");
console.log("Use Node 20. Treat skipped commands as skipped, not passed.");
console.log("");

for (const command of commands) {
  console.log(`- ${command}`);
}

console.log("");
console.log("For production readiness claims, also run the safe smoke and browser proof in docs/production-proof-checklist.md.");
