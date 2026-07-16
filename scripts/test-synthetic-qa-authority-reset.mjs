#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  MAX_SYNTHETIC_QA_AUTHORITY_ROWS,
  resetSyntheticQaHarnessAuthority,
} from "./lib/synthetic-qa-authority-reset.mjs";

const QA_USER_ID = "11111111-1111-4111-8111-111111111111";
const FIXED_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const STALE_ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const EXPECTED_MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const EXTRA_MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PARTNER_MEMBERSHIP_ID = "66666666-6666-4666-8666-666666666666";
const CONCURRENT_ORGANIZATION_ID = "77777777-7777-4777-8777-777777777777";

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function createStore(
  {
    ownedOrganizations = [],
    organizationMemberships = [],
    partnerMemberships = [],
  } = {},
  { beforeDelete = null, failDelete = null } = {},
) {
  const state = {
    ownedOrganizations: cloneRows(ownedOrganizations),
    organizationMemberships: cloneRows(organizationMemberships),
    partnerMemberships: cloneRows(partnerMemberships),
    mutations: [],
  };
  let beforeDeleteCalled = false;

  const deleteExact = async (collection, ids) => {
    if (!beforeDeleteCalled && beforeDelete) {
      beforeDeleteCalled = true;
      beforeDelete(state, collection);
    }
    if (failDelete === collection) {
      throw new Error(`synthetic ${collection} delete failure`);
    }
    state.mutations.push({ collection, ids: [...ids] });
    const idSet = new Set(ids);
    const deleted = state[collection].filter(({ id }) => idSet.has(id));
    state[collection] = state[collection].filter(({ id }) => !idSet.has(id));
    return deleted.map(({ id }) => ({ id }));
  };

  return {
    state,
    store: {
      listOwnedOrganizations: async () => cloneRows(state.ownedOrganizations),
      listExtraOrganizationMemberships: async () =>
        cloneRows(state.organizationMemberships),
      listPartnerMemberships: async () => cloneRows(state.partnerMemberships),
      deleteOrganizations: async (ids) =>
        deleteExact("ownedOrganizations", ids),
      deleteOrganizationMemberships: async (ids) =>
        deleteExact("organizationMemberships", ids),
      deletePartnerMemberships: async (ids) =>
        deleteExact("partnerMemberships", ids),
    },
  };
}

async function execute(store) {
  return resetSyntheticQaHarnessAuthority({
    store,
    qaHarnessUserId: QA_USER_ID,
    expectedMembershipId: EXPECTED_MEMBERSHIP_ID,
    expectedFixedOrganizationIds: [FIXED_ORGANIZATION_ID],
  });
}

const exact = createStore({
  ownedOrganizations: [
    { id: STALE_ORGANIZATION_ID, owner_user_id: QA_USER_ID },
  ],
  organizationMemberships: [
    { id: EXTRA_MEMBERSHIP_ID, user_id: QA_USER_ID },
  ],
  partnerMemberships: [
    { id: PARTNER_MEMBERSHIP_ID, user_id: QA_USER_ID },
  ],
});
const exactResult = await execute(exact.store);
assert.deepEqual(exactResult, {
  applied: true,
  removedOwnedOrganizationCount: 1,
  removedOrganizationMembershipCount: 1,
  removedPartnerMembershipCount: 1,
});
assert.deepEqual(
  exact.state.mutations.map(({ collection }) => collection),
  ["partnerMemberships", "organizationMemberships", "ownedOrganizations"],
);
assert.equal(exact.state.ownedOrganizations.length, 0);
assert.equal(exact.state.organizationMemberships.length, 0);
assert.equal(exact.state.partnerMemberships.length, 0);

const replayResult = await execute(exact.store);
assert.deepEqual(replayResult, {
  applied: true,
  removedOwnedOrganizationCount: 0,
  removedOrganizationMembershipCount: 0,
  removedPartnerMembershipCount: 0,
});
assert.equal(exact.state.mutations.length, 3, "An empty replay must not mutate");

const fixed = createStore({
  ownedOrganizations: [
    { id: FIXED_ORGANIZATION_ID, owner_user_id: QA_USER_ID },
  ],
});
await assert.rejects(
  execute(fixed.store),
  /refused a fixed or foreign organization/,
);
assert.equal(fixed.state.mutations.length, 0, "Fixed-ID refusal must precede mutation");

const concurrent = createStore(
  {
    partnerMemberships: [
      { id: PARTNER_MEMBERSHIP_ID, user_id: QA_USER_ID },
    ],
  },
  {
    beforeDelete: (state) => {
      state.ownedOrganizations.push({
        id: CONCURRENT_ORGANIZATION_ID,
        owner_user_id: QA_USER_ID,
      });
    },
  },
);
await assert.rejects(execute(concurrent.store), /did not reach zero elevation/);
assert.deepEqual(
  concurrent.state.ownedOrganizations.map(({ id }) => id),
  [CONCURRENT_ORGANIZATION_ID],
  "A concurrently introduced row must remain untouched for fail-closed detection",
);

const partialFailure = createStore(
  {
    ownedOrganizations: [
      { id: STALE_ORGANIZATION_ID, owner_user_id: QA_USER_ID },
    ],
    organizationMemberships: [
      { id: EXTRA_MEMBERSHIP_ID, user_id: QA_USER_ID },
    ],
    partnerMemberships: [
      { id: PARTNER_MEMBERSHIP_ID, user_id: QA_USER_ID },
    ],
  },
  { failDelete: "organizationMemberships" },
);
await assert.rejects(
  execute(partialFailure.store),
  /synthetic organizationMemberships delete failure/,
);
assert.equal(partialFailure.state.partnerMemberships.length, 0);
assert.equal(partialFailure.state.organizationMemberships.length, 1);
assert.equal(partialFailure.state.ownedOrganizations.length, 1);
assert.deepEqual(
  partialFailure.state.mutations.map(({ collection }) => collection),
  ["partnerMemberships"],
  "A failed operation must stop all later mutations",
);

const overCap = createStore({
  partnerMemberships: Array.from(
    { length: MAX_SYNTHETIC_QA_AUTHORITY_ROWS + 1 },
    (_, index) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
      user_id: QA_USER_ID,
    }),
  ),
});
await assert.rejects(execute(overCap.store), /exceeded the partner memberships safety cap/);
assert.equal(overCap.state.mutations.length, 0, "Safety-cap refusal must precede mutation");

process.stdout.write(
  "synthetic QA authority reset: PASS (bounded preflight, fixed-ID refusal, exact-ID deletion, concurrent-row fail-closed closure, partial-failure stop, and replay idempotence)\n",
);
