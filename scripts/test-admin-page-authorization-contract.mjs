#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adminRoot = path.join(process.cwd(), "src/app/(app)/admin");

function collectAdminPages(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectAdminPages(absolutePath);
    return entry.isFile() && entry.name === "page.tsx" ? [absolutePath] : [];
  });
}

const adminPages = collectAdminPages(adminRoot).sort();
assert.ok(adminPages.length > 0, "at least one internal admin page must exist");

for (const absolutePath of adminPages) {
  const relativePath = path.relative(process.cwd(), absolutePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const defaultExportIndex = source.indexOf("export default async function");
  assert.ok(defaultExportIndex >= 0, `${relativePath} must use an async server page`);

  const serverPageSource = source.slice(defaultExportIndex);
  const guardIndex = serverPageSource.indexOf("await assertInternalOperatorAccess()");
  assert.ok(guardIndex >= 0, `${relativePath} must require internal operator access`);
  assert.match(
    serverPageSource,
    /error instanceof ApiError && error\.status === 403/,
    `${relativePath} must classify non-operator access explicitly`,
  );
  assert.match(
    serverPageSource,
    /notFound\(\)/,
    `${relativePath} must hide the internal surface from non-operators`,
  );

  const privilegedRead = /(?:list[A-Z]\w*ForAdmin|load[A-Z]\w*|createAdminClient)\s*\(/g;
  privilegedRead.lastIndex = 0;
  const firstPrivilegedRead = privilegedRead.exec(serverPageSource);
  if (firstPrivilegedRead) {
    assert.ok(
      guardIndex < firstPrivilegedRead.index,
      `${relativePath} must authorize before its first privileged read`,
    );
  }
}

console.log(`admin page authorization contract: PASS (${adminPages.length}/${adminPages.length} pages fail closed)`);
