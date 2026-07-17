#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  EXPECTED_DECISION_IDS,
  EXPECTED_REQUIREMENT_IDS,
  loadCanonicalPacket,
  validateOwnerDecisionPacket,
} from "./validate-owner-decision-authority.mjs";

function clone(value) {
  return structuredClone(value);
}

function validateWithoutRepository(packet) {
  return validateOwnerDecisionPacket(packet, { checkRepository: false });
}

function expectFailure(packet, marker) {
  const result = validateWithoutRepository(packet);
  assert.equal(result.ok, false, `expected failure containing ${marker}`);
  assert(
    result.errors.some((error) => error.includes(marker)),
    `expected error containing ${marker}; received ${JSON.stringify(result.errors)}`,
  );
}

const canonical = loadCanonicalPacket();
const canonicalResult = validateOwnerDecisionPacket(canonical);
assert.equal(canonicalResult.ok, true, JSON.stringify(canonicalResult.errors, null, 2));
assert.equal(canonicalResult.summary.decisions, 43);
assert.equal(canonicalResult.summary.unresolved, 43);
assert.equal(canonicalResult.summary.approved, 0);
assert.equal(canonicalResult.summary.requirements, 53);
assert.equal(canonicalResult.summary.productionReleaseAuthorized, false);
assert.deepEqual(
  [...canonical.decisions.map((decision) => decision.id)].sort(),
  [...EXPECTED_DECISION_IDS].sort(),
);
assert.deepEqual(
  [...canonical.planBinding.requirementIds].sort(),
  [...EXPECTED_REQUIREMENT_IDS].sort(),
);

const missingDecision = clone(canonical);
missingDecision.decisions.pop();
missingDecision.counts.total = 42;
missingDecision.counts.unresolved = 42;
expectFailure(missingDecision, "decision count must be 43");

const duplicateDecision = clone(canonical);
duplicateDecision.decisions[42].id = duplicateDecision.decisions[41].id;
expectFailure(duplicateDecision, "decision IDs must be unique");

const changedSafeDefault = clone(canonical);
changedSafeDefault.decisions[0].safeDefault = "ALLOW";
expectFailure(changedSafeDefault, "safe default changed");

const inventedUnresolvedSelection = clone(canonical);
inventedUnresolvedSelection.decisions[0].selectedValue = "invented approval";
expectFailure(inventedUnresolvedSelection, "unresolved decision selected a value");

const inventedApprover = clone(canonical);
inventedApprover.decisions[0].approver.identityRef = "owner@example.invalid";
expectFailure(inventedApprover, "unresolved decision has an approver identity");

const missingRequirement = clone(canonical);
missingRequirement.planBinding.requirementIds.pop();
missingRequirement.planBinding.requirementCount = 52;
expectFailure(missingRequirement, "requirement count must be 53");

const unknownAffectedRequirement = clone(canonical);
unknownAffectedRequirement.decisions[0].affectedRequirementIds.push("UNKNOWN-REQUIREMENT-001");
expectFailure(unknownAffectedRequirement, "unknown affected requirement");

const productionAuthorityClaim = clone(canonical);
productionAuthorityClaim.globalPolicy.productionReleaseAuthorized = true;
expectFailure(productionAuthorityClaim, "packet must not authorize production release");

const falsePacketSignature = clone(canonical);
falsePacketSignature.signatureStatus = "EXTERNALLY_SIGNED";
falsePacketSignature.packetDigest = "a".repeat(64);
expectFailure(falsePacketSignature, "tracked template must never claim a signature");

const legacySelfBinding = clone(canonical);
legacySelfBinding.candidateBinding.bindingType = "SOURCE_CANDIDATE_AUTHORITY_OVERLAY";
legacySelfBinding.candidateBinding.commit = "b".repeat(40);
expectFailure(legacySelfBinding, "detached authority binding type changed");

const missingDetachedWarning = clone(canonical);
missingDetachedWarning.candidateBinding.trackedSuccessorRequiresNewDetachedAuthority = false;
expectFailure(missingDetachedWarning, "tracked successor authority warning is missing");

const fullyApprovedShape = clone(canonical);
for (const decision of fullyApprovedShape.decisions) {
  decision.status = "APPROVED";
  decision.selectedValue = { signedDecisionReference: `decision/${decision.id}` };
  decision.effectiveAt = "2026-07-17T00:00:00.000Z";
  decision.reviewAt = null;
  decision.approver = {
    role: "AUTHORIZED_OWNER_OR_COUNSEL",
    identityRef: `identity/${decision.id}`,
    approvedAt: "2026-07-17T00:00:00.000Z",
    signatureRef: `signature/${decision.id}`,
  };
  decision.activationGates = ["SIGNED_SELECTION_ACTIVE"];
}
fullyApprovedShape.counts.unresolved = 0;
fullyApprovedShape.counts.approved = 43;
fullyApprovedShape.packetStatus = "APPROVED";
fullyApprovedShape.signatureStatus = "EXTERNALLY_SIGNED";
fullyApprovedShape.packetDigest = "d".repeat(64);
expectFailure(
  fullyApprovedShape,
  "tracked template must remain unresolved; approvals belong only in the detached signed envelope",
);

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS",
      canonicalDecisions: 43,
      canonicalUnresolved: 43,
      controllingRequirements: 53,
      negativeCases: 12,
      approvedShapeCase: "REJECTED_TRACKED_APPROVAL_MUST_BE_DETACHED",
    },
    null,
    2,
  )}\n`,
);
