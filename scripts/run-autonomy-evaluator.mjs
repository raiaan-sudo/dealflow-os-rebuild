#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const campaignArg = process.argv.slice(2).find((arg) => arg.startsWith("--campaign-id="));
const dryRun = args.has("--dry-run") || process.env.AUTONOMY_DRY_RUN_ONLY !== "false";
const executeAssistedApproved = args.has("--execute-assisted-approved");

const report = {
  command: "autonomy:evaluate",
  dryRun,
  executeAssistedApproved,
  campaignId: campaignArg ? campaignArg.split("=").slice(1).join("=") : null,
  defaultPosture: "dry-run/assisted unless AUTONOMY_EXECUTION_ENABLED and scoped execution flags are explicitly enabled",
  sideEffects: {
    metaMutations: false,
    providerGeneration: false,
    stripeCharges: false,
    smsEmail: false,
    freshdeskTickets: false,
  },
  requiredRuntimeEnvNames: [
    "AUTONOMY_EXECUTION_ENABLED",
    "AUTONOMY_AUTOPILOT_ENABLED",
    "AUTONOMY_META_MUTATIONS_ENABLED",
    "AUTONOMY_DRY_RUN_ONLY",
    "AUTONOMY_MAX_ACTIONS_PER_CAMPAIGN_PER_DAY",
    "AUTONOMY_MAX_META_MUTATIONS_PER_CAMPAIGN_PER_DAY",
  ],
};

console.log(JSON.stringify(report, null, 2));
