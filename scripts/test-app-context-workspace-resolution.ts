import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  hasCanonicalOwnerWorkspaceAuthority,
  isWorkspaceBootstrapReadOnly,
  readBusinessProfile,
  resolveMembershipFirstWorkspace,
  WorkspaceSelectionDeniedError,
  WorkspaceSelectionRequiredError,
} from "../src/lib/services/app-context";

type Row = Record<string, unknown>;

class ReadOnlyQuery {
  private filters: Array<[string, unknown]> = [];
  private orderBy: string | null = null;
  private ascending = true;
  private maximum: number | null = null;

  constructor(
    private readonly sourceRows: Row[],
    private readonly recordWrite: () => void,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = column;
    this.ascending = options.ascending !== false;
    return this;
  }

  limit(maximum: number) {
    this.maximum = maximum;
    return this;
  }

  insert() {
    this.recordWrite();
    throw new Error("read-only test client rejected insert");
  }

  upsert() {
    this.recordWrite();
    throw new Error("read-only test client rejected upsert");
  }

  update() {
    this.recordWrite();
    throw new Error("read-only test client rejected update");
  }

  delete() {
    this.recordWrite();
    throw new Error("read-only test client rejected delete");
  }

  private rows() {
    let rows = this.sourceRows.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.orderBy) {
      const column = this.orderBy;
      const direction = this.ascending ? 1 : -1;
      rows = [...rows].sort((left, right) =>
        String(left[column]).localeCompare(String(right[column])) * direction,
      );
    }
    return this.maximum === null ? rows : rows.slice(0, this.maximum);
  }

  async maybeSingle() {
    const rows = this.rows();
    return rows.length <= 1
      ? { data: rows[0] ?? null, error: null }
      : { data: null, error: new Error("Expected at most one row") };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }
}

function createReadOnlyClient(params: {
  memberships?: Row[];
  organizations?: Row[];
  businessProfiles?: Row[];
}) {
  let queryCount = 0;
  let writeAttempts = 0;
  const tables: Record<string, Row[]> = {
    organization_memberships: params.memberships ?? [],
    organizations: params.organizations ?? [],
    business_profiles: params.businessProfiles ?? [],
  };
  return {
    client: {
      from(table: string) {
        queryCount += 1;
        assert.ok(table in tables, `unexpected table: ${table}`);
        return new ReadOnlyQuery(tables[table], () => {
          writeAttempts += 1;
        });
      },
    },
    get queryCount() {
      return queryCount;
    },
    get writeAttempts() {
      return writeAttempts;
    },
  };
}

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER_USER = "10000000-0000-4000-8000-000000000002";
const PAID_ORG = "20000000-0000-4000-8000-000000000001";
const SECOND_ORG = "20000000-0000-4000-8000-000000000002";
const OUTSIDE_ORG = "20000000-0000-4000-8000-000000000003";
const profile = { id: USER, email: "member@example.test" } as any;
const paidOrganization = {
  id: PAID_ORG,
  owner_user_id: OTHER_USER,
  name: "Paid Realty",
  plan_tier: "pro",
};
const memberMembership = {
  id: "30000000-0000-4000-8000-000000000001",
  organization_id: PAID_ORG,
  user_id: USER,
  role: "member",
  created_at: "2026-01-01T00:00:00.000Z",
};
const existingBusinessProfile = {
  id: "40000000-0000-4000-8000-000000000001",
  organization_id: PAID_ORG,
  legal_name: "Paid Realty",
};

async function main() {
{
  const harness = createReadOnlyClient({
    memberships: [memberMembership],
    organizations: [paidOrganization],
    businessProfiles: [existingBusinessProfile],
  });
  const resolved = await resolveMembershipFirstWorkspace(harness.client as any, profile, null);
  assert.equal(resolved?.organization.id, PAID_ORG, "ordinary member must inherit the paid workspace");
  assert.equal(resolved?.organization.plan_tier, "pro");
  assert.equal(resolved?.membership.role, "member", "ordinary member must never be promoted");
  assert.equal(resolved?.organization.owner_user_id, OTHER_USER);
  assert.equal(
    hasCanonicalOwnerWorkspaceAuthority({
      profile,
      organization: resolved!.organization,
      membership: resolved!.membership,
    }),
    false,
    "ordinary membership must not grant owner bootstrap authority",
  );
  assert.equal(
    isWorkspaceBootstrapReadOnly({
      isEmbeddedWorkspace: false,
      isMembershipWorkspace: true,
      profile,
      organization: resolved!.organization,
      membership: resolved!.membership,
    }),
    true,
    "ordinary membership workspace must remain bootstrap-read-only",
  );
  assert.deepEqual(
    await readBusinessProfile(harness.client as any, resolved!.organization),
    existingBusinessProfile,
    "ordinary member context may read the paid workspace business profile",
  );
  assert.equal(harness.writeAttempts, 0, "ordinary member context must perform zero writes");
}

{
  const ownerMembership = { ...memberMembership, role: "owner" };
  const ownerOrganization = { ...paidOrganization, owner_user_id: USER };
  const harness = createReadOnlyClient({
    memberships: [ownerMembership],
    organizations: [ownerOrganization],
  });
  const resolved = await resolveMembershipFirstWorkspace(harness.client as any, profile, null);
  assert.equal(resolved?.organization.id, PAID_ORG, "canonical owner membership must resolve normally");
  assert.equal(resolved?.membership.role, "owner");
  assert.equal(
    hasCanonicalOwnerWorkspaceAuthority({
      profile,
      organization: resolved!.organization,
      membership: resolved!.membership,
    }),
    true,
    "canonical owner must retain bootstrap authority",
  );
  assert.equal(
    isWorkspaceBootstrapReadOnly({
      isEmbeddedWorkspace: false,
      isMembershipWorkspace: true,
      profile,
      organization: resolved!.organization,
      membership: resolved!.membership,
    }),
    false,
    "direct canonical owner must retain bootstrap behavior",
  );
}

{
  const harness = createReadOnlyClient({ memberships: [], organizations: [] });
  assert.equal(
    await resolveMembershipFirstWorkspace(harness.client as any, profile, null),
    null,
    "a genuinely new user must fall through to owner/bootstrap creation",
  );
  assert.equal(
    isWorkspaceBootstrapReadOnly({
      isEmbeddedWorkspace: false,
      isMembershipWorkspace: false,
      profile,
      organization: { ...paidOrganization, owner_user_id: USER } as any,
      membership: { ...memberMembership, role: "owner" } as any,
    }),
    false,
    "a fresh direct user must retain bootstrap behavior",
  );
}

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership],
    organizations: [paidOrganization],
    businessProfiles: [],
  });
  assert.equal(
    isWorkspaceBootstrapReadOnly({
      isEmbeddedWorkspace: true,
      isMembershipWorkspace: false,
      profile,
      organization: paidOrganization as any,
      membership: memberMembership as any,
    }),
    true,
    "verified embedded workspaces must always be bootstrap-read-only",
  );
  assert.equal(
    await readBusinessProfile(harness.client as any, paidOrganization as any),
    null,
    "embedded context with no business profile must return null without creating one",
  );
  assert.equal(harness.writeAttempts, 0, "embedded missing-profile resolution must perform zero writes");
}

{
  const harness = createReadOnlyClient({
    memberships: [],
    organizations: [{ ...paidOrganization, id: OUTSIDE_ORG }],
  });
  assert.equal(
    await resolveMembershipFirstWorkspace(harness.client as any, profile, null),
    null,
    "a removed member must not retain the former tenant",
  );
}

const secondMembership = {
  ...memberMembership,
  id: "30000000-0000-4000-8000-000000000002",
  organization_id: SECOND_ORG,
  created_at: "2026-01-02T00:00:00.000Z",
};
const secondOrganization = { ...paidOrganization, id: SECOND_ORG, name: "Second Realty" };

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership, secondMembership],
    organizations: [paidOrganization, secondOrganization],
  });
  await assert.rejects(
    () => resolveMembershipFirstWorkspace(harness.client as any, profile, null),
    (error) => error instanceof WorkspaceSelectionRequiredError && error.code === "workspace_selection_required",
    "multiple memberships must fail closed without an explicit selection",
  );
}

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership, secondMembership],
    organizations: [paidOrganization, secondOrganization],
  });
  const resolved = await resolveMembershipFirstWorkspace(
    harness.client as any,
    profile,
    SECOND_ORG,
  );
  assert.equal(resolved?.organization.id, SECOND_ORG, "valid explicit selection must take precedence");
  assert.equal(resolved?.membership.id, secondMembership.id);
}

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership],
    organizations: [paidOrganization, { ...paidOrganization, id: OUTSIDE_ORG }],
  });
  await assert.rejects(
    () => resolveMembershipFirstWorkspace(harness.client as any, profile, OUTSIDE_ORG),
    (error) => error instanceof WorkspaceSelectionDeniedError && error.code === "workspace_selection_denied",
    "a selected cross-tenant workspace must be denied",
  );
}

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership],
    organizations: [paidOrganization],
  });
  await assert.rejects(
    () => resolveMembershipFirstWorkspace(harness.client as any, profile, "not-a-workspace-id"),
    (error) => error instanceof WorkspaceSelectionDeniedError && error.code === "workspace_selection_denied",
    "a malformed header or cookie workspace selection must fail closed",
  );
  assert.equal(harness.queryCount, 0, "malformed workspace IDs must be denied before database access");
}

{
  const harness = createReadOnlyClient({
    memberships: [memberMembership],
    organizations: [paidOrganization],
  });
  const first = await resolveMembershipFirstWorkspace(harness.client as any, profile, null);
  const second = await resolveMembershipFirstWorkspace(harness.client as any, profile, null);
  assert.deepEqual(second, first, "repeated resolution must be idempotent");
  assert.equal(harness.queryCount, 4, "membership resolution must remain read-only");
}

const sourcePath = fileURLToPath(new URL("../src/lib/services/app-context.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const embeddedIndex = source.indexOf("const embeddedWorkspace =");
const membershipIndex = source.indexOf("const membershipWorkspace =", embeddedIndex);
const bootstrapIndex = source.indexOf("await ensureWorkspace(bootstrapSupabase, profile)", membershipIndex);
assert.ok(embeddedIndex >= 0 && embeddedIndex < membershipIndex && membershipIndex < bootstrapIndex);
assert.match(source, /claimPendingAccessKeyForCurrentUser\(context\)/);
assert.match(source, /applyVerifiedPartnerAttribution/);
assert.match(source, /assertAccountDeletionWorkspaceAccess/);
assert.match(source, /ensureBusinessProfile\(bootstrapSupabase, organization, profile\)/);
assert.equal(
  source.match(/if \(!workspaceBootstrapIsReadOnly\)/g)?.length,
  2,
  "access-key claiming and demo seeding must both require owner bootstrap authority",
);
assert.match(
  source,
  /isEmbeddedWorkspace: Boolean\(embeddedWorkspace\)[\s\S]*?workspaceBootstrapIsReadOnly[\s\S]*?readBusinessProfile\(bootstrapSupabase, organization\)[\s\S]*?: await ensureBusinessProfile/,
);

console.log("app-context workspace resolution: 11/11 scenarios passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
