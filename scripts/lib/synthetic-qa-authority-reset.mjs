const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_SYNTHETIC_QA_AUTHORITY_ROWS = 100;

function normalizedRows(rows, label) {
  if (!Array.isArray(rows)) {
    throw new Error(`The synthetic QA authority reset received invalid ${label}`);
  }
  if (rows.length > MAX_SYNTHETIC_QA_AUTHORITY_ROWS) {
    throw new Error(`The synthetic QA authority reset exceeded the ${label} safety cap`);
  }
  const normalized = rows.map((row) => {
    if (!row || typeof row !== "object" || !UUID_PATTERN.test(row.id ?? "")) {
      throw new Error(`The synthetic QA authority reset received malformed ${label}`);
    }
    return row;
  });
  const ids = normalized.map(({ id }) => id).sort();
  if (new Set(ids).size !== ids.length) {
    throw new Error(`The synthetic QA authority reset received duplicate ${label}`);
  }
  return { rows: normalized, ids };
}

function exactDeletedIds(rows, expectedIds, label) {
  const actual = normalizedRows(rows, `${label} deletion receipt`).ids;
  if (JSON.stringify(actual) !== JSON.stringify(expectedIds)) {
    throw new Error(`The synthetic QA authority reset did not remove the exact ${label}`);
  }
}

function assertStore(store) {
  for (const method of [
    "listOwnedOrganizations",
    "listExtraOrganizationMemberships",
    "listPartnerMemberships",
    "deleteOrganizations",
    "deleteOrganizationMemberships",
    "deletePartnerMemberships",
  ]) {
    if (typeof store?.[method] !== "function") {
      throw new Error(`The synthetic QA authority reset store lacks ${method}`);
    }
  }
}

export async function resetSyntheticQaHarnessAuthority({
  store,
  qaHarnessUserId,
  expectedMembershipId,
  expectedFixedOrganizationIds,
}) {
  assertStore(store);
  if (
    !UUID_PATTERN.test(qaHarnessUserId ?? "") ||
    !UUID_PATTERN.test(expectedMembershipId ?? "")
  ) {
    throw new Error("The synthetic QA authority reset identity is malformed");
  }
  const fixedOrganizationIds = new Set(expectedFixedOrganizationIds ?? []);
  if (
    fixedOrganizationIds.size === 0 ||
    [...fixedOrganizationIds].some((id) => !UUID_PATTERN.test(id))
  ) {
    throw new Error("The synthetic QA authority reset fixed organization set is malformed");
  }

  // Discover and validate every cleanup class before the first mutation.
  const [ownedResult, organizationMembershipResult, partnerMembershipResult] =
    await Promise.all([
      store.listOwnedOrganizations(),
      store.listExtraOrganizationMemberships(),
      store.listPartnerMemberships(),
    ]);
  const ownedOrganizations = normalizedRows(
    ownedResult,
    "owned organizations",
  );
  const extraOrganizationMemberships = normalizedRows(
    organizationMembershipResult,
    "extra organization memberships",
  );
  const partnerMemberships = normalizedRows(
    partnerMembershipResult,
    "partner memberships",
  );

  if (
    ownedOrganizations.rows.some(
      ({ id, owner_user_id: ownerUserId }) =>
        ownerUserId !== qaHarnessUserId || fixedOrganizationIds.has(id),
    )
  ) {
    throw new Error(
      "The synthetic QA authority reset refused a fixed or foreign organization",
    );
  }
  if (
    extraOrganizationMemberships.rows.some(
      ({ id, user_id: userId }) =>
        userId !== qaHarnessUserId || id === expectedMembershipId,
    ) ||
    partnerMemberships.rows.some(
      ({ user_id: userId }) => userId !== qaHarnessUserId,
    )
  ) {
    throw new Error("The synthetic QA authority reset refused a foreign membership");
  }

  // Memberships are removed first so organization deletion cannot cascade past
  // an exact deletion receipt. Every mutation remains bound to its preflight ID
  // snapshot; a concurrent row is left untouched and caught by final closure.
  if (partnerMemberships.ids.length > 0) {
    exactDeletedIds(
      await store.deletePartnerMemberships(partnerMemberships.ids),
      partnerMemberships.ids,
      "partner memberships",
    );
  }
  if (extraOrganizationMemberships.ids.length > 0) {
    exactDeletedIds(
      await store.deleteOrganizationMemberships(
        extraOrganizationMemberships.ids,
      ),
      extraOrganizationMemberships.ids,
      "organization memberships",
    );
  }
  if (ownedOrganizations.ids.length > 0) {
    exactDeletedIds(
      await store.deleteOrganizations(ownedOrganizations.ids),
      ownedOrganizations.ids,
      "organizations",
    );
  }

  const [ownedAfter, extraMembershipsAfter, partnerMembershipsAfter] =
    await Promise.all([
      store.listOwnedOrganizations(),
      store.listExtraOrganizationMemberships(),
      store.listPartnerMemberships(),
    ]);
  if (
    normalizedRows(ownedAfter, "owned organizations after reset").ids.length !== 0 ||
    normalizedRows(
      extraMembershipsAfter,
      "extra organization memberships after reset",
    ).ids.length !== 0 ||
    normalizedRows(partnerMembershipsAfter, "partner memberships after reset").ids
      .length !== 0
  ) {
    throw new Error("The synthetic QA authority reset did not reach zero elevation");
  }

  return Object.freeze({
    applied: true,
    removedOwnedOrganizationCount: ownedOrganizations.ids.length,
    removedOrganizationMembershipCount: extraOrganizationMemberships.ids.length,
    removedPartnerMembershipCount: partnerMemberships.ids.length,
  });
}
