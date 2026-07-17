import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasWorkspaceMembership,
  listWorkspaceOptions,
  sanitizeWorkspaceReturnTo,
} from "../src/lib/services/workspace-selection-service.ts";

class Query {
  filters = [];
  allowedIds = null;
  constructor(rows) {
    this.sourceRows = rows;
  }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  in(key, values) { this.allowedIds = [key, new Set(values)]; return this; }
  order() { return this; }
  rows() {
    return this.sourceRows.filter((row) =>
      this.filters.every(([key, value]) => row[key] === value) &&
      (!this.allowedIds || this.allowedIds[1].has(row[this.allowedIds[0]])),
    );
  }
  async maybeSingle() {
    const rows = this.rows();
    return { data: rows.length === 1 ? rows[0] : null, error: null };
  }
  then(resolve, reject) {
    return Promise.resolve({ data: this.rows(), error: null }).then(resolve, reject);
  }
}

const USER = "10000000-0000-4000-8000-000000000001";
const FIRST = "20000000-0000-4000-8000-000000000001";
const SECOND = "20000000-0000-4000-8000-000000000002";
const OUTSIDE = "20000000-0000-4000-8000-000000000003";
const tables = {
  organization_memberships: [
    { organization_id: FIRST, user_id: USER, role: "owner", created_at: "2026-01-01" },
    { organization_id: SECOND, user_id: USER, role: "member", created_at: "2026-01-02" },
    { organization_id: OUTSIDE, user_id: "another-user", role: "owner", created_at: "2026-01-03" },
  ],
  organizations: [
    { id: FIRST, name: "First Realty" },
    { id: SECOND, name: "Second Realty" },
    { id: OUTSIDE, name: "Outside Realty" },
  ],
};
const client = {
  from(table) { return new Query(tables[table] ?? []); },
};

assert.deepEqual(await listWorkspaceOptions(client, USER), [
  { id: FIRST, name: "First Realty", role: "owner" },
  { id: SECOND, name: "Second Realty", role: "member" },
]);
assert.equal(await hasWorkspaceMembership(client, USER, FIRST), true);
assert.equal(await hasWorkspaceMembership(client, USER, OUTSIDE), false);

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/app/api/workspaces/active/route.ts");
const layout = read("src/app/(app)/layout.tsx");
const form = read("src/components/workspace/workspace-selection-form.tsx");
const signOut = read("src/components/layout/sign-out-button.tsx");

assert.equal(sanitizeWorkspaceReturnTo("/dashboard?view=results"), "/dashboard?view=results");
assert.equal(sanitizeWorkspaceReturnTo("https://evil.example/"), "/dashboard");
assert.equal(sanitizeWorkspaceReturnTo("//evil.example/"), "/dashboard");
assert.equal(sanitizeWorkspaceReturnTo("/api/admin"), "/dashboard");
assert.equal(sanitizeWorkspaceReturnTo("/workspace/select"), "/dashboard");
assert.match(route, /assertSameOriginRequest\(request\)/);
assert.ok(
  route.indexOf("if (!(await hasWorkspaceMembership") < route.indexOf("response.cookies.set"),
  "membership authority must be proven before setting the workspace cookie",
);
for (const marker of ['httpOnly: true', 'sameSite: "lax"', 'path: "/"', "secure:"]) {
  assert.ok(route.includes(marker), `workspace cookie must include ${marker}`);
}
assert.match(layout, /WorkspaceSelectionRequiredError/);
assert.match(layout, /WorkspaceSelectionDeniedError/);
assert.match(layout, /redirect\(`/);
assert.match(form, /<label/);
assert.match(form, /<select/);
assert.match(form, /aria-live="polite"/);
assert.match(form, /focus-visible:ring-2/);
assert.match(signOut, /method: "DELETE"/);

console.log("workspace selection contract passed");
