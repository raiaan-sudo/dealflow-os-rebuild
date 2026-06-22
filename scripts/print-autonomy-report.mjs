#!/usr/bin/env node

const json = process.argv.includes("--json");

const report = {
  product: "DealFlow Pro Autopilot V1",
  posture: "safe default",
  modes: ["manual", "assisted", "auto"],
  autoExecutableSafeActions: [
    "monitor/no-action",
    "create recommendation",
    "classify performance issue",
    "create optimization report",
    "pause clearly losing ad when thresholds pass",
    "reduce budget when spend anomaly or poor performance threshold passes",
    "mark experiment inconclusive/winner/loser",
    "alert operator/customer",
  ],
  approvalRequiredActions: [
    "budget increase",
    "audience/ad set/targeting change",
    "funnel publishing",
    "paid provider generation",
    "new Meta ad from approved creative",
    "credit spend",
  ],
  neverAllowed: [
    "exceed approved budget or campaign cap",
    "bypass credit reservation",
    "mutate unrelated Meta objects",
    "housing targeting policy violations",
    "execute while billing/operator debt/drift/destination/funnel guards fail",
  ],
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.product}: ${report.posture}`);
  console.log(`Modes: ${report.modes.join(", ")}`);
  console.log(`Safe actions: ${report.autoExecutableSafeActions.join("; ")}`);
  console.log(`Approval required: ${report.approvalRequiredActions.join("; ")}`);
}
