#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);

function value(flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1];
}

function required(flag) {
  const result = value(flag);
  if (!result) throw new Error(`Missing required argument ${flag}`);
  return resolve(result);
}

function stable(input) {
  if (Array.isArray(input)) return input.map(stable);
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])]));
}

function json(input) {
  return `${JSON.stringify(stable(input), null, 2)}\n`;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

const forbidden = [
  /\b(?:sbp|sb_secret|sk_live|rk_live)_[A-Za-z0-9_-]{12,}\b/g,
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

function assertSanitized(label, contents) {
  for (const pattern of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(contents)) throw new Error(`${label} contains protected material`);
  }
}

function writeGenerated(path, contents) {
  assertSanitized(path, contents);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
}

const publicCatalogPath = required("--public-catalog");
const may2CatalogPath = required("--may2-catalog");
const may2SqlPath = required("--may2-sql");
const privatePass1Path = required("--private-pass-1");
const privatePass2Path = required("--private-pass-2");
const publicQueryCatalogPath = required("--public-query-catalog");
const privateQueryCatalogPath = required("--private-query-catalog");

const pass1Text = readFileSync(privatePass1Path, "utf8");
const pass2Text = readFileSync(privatePass2Path, "utf8");
if (pass1Text !== pass2Text) throw new Error("Private structural passes are not byte-identical");

const pass = JSON.parse(pass1Text);
if (!Array.isArray(pass.schemaStatements) || pass.schemaStatements.length !== 36) {
  throw new Error("Private authority must contain exactly 36 structural statements");
}
const privateRowCount = pass.schemaStatements.reduce((sum, statement) => {
  if (!statement.id || !Array.isArray(statement.rows) || statement.rowCount !== statement.rows.length) {
    throw new Error("Private authority statement shape is invalid");
  }
  return sum + statement.rows.length;
}, 0);
if (privateRowCount !== 240) throw new Error(`Expected 240 private authority rows, found ${privateRowCount}`);

const capturedCategories = Object.fromEntries(
  pass.schemaStatements.map((statement) => [statement.id, statement.rows]),
);
const privateOwnedFields = [
  "schema_name",
  "type_schema",
  "related_relation_schema",
  "table_schema",
  "relation_schema",
  "sequence_schema",
  "view_schema",
  "routine_schema",
  "object_schema",
];
const isPrivateOwned = (row) => privateOwnedFields.some((field) => row[field] === "private");
const normalizedDependencyRows = (capturedCategories["14a_private_direct_dependencies"] ?? [])
  .map((row) => ({
    dependent_class_catalog: row.dependent_class_catalog,
    dependent_subobject_id: row.dependent_subobject_id,
    dependent_type: row.dependent_type,
    dependent_schema: row.dependent_schema,
    dependent_name: row.dependent_name,
    dependent_identity: row.dependent_identity,
    referenced_class_catalog: row.referenced_class_catalog,
    referenced_subobject_id: row.referenced_subobject_id,
    referenced_type: row.referenced_type,
    referenced_schema: row.referenced_schema,
    referenced_name: row.referenced_name,
    referenced_identity: row.referenced_identity,
    dependency_kind: row.dependency_kind,
  }));
const uniqueNormalizedDependencies = [...new Map(
  normalizedDependencyRows.map((row) => [JSON.stringify(stable(row)), row]),
).values()];
const privateCategories = {};
for (const [id, rows] of Object.entries(capturedCategories)) {
  if (id === "02_extensions") {
    privateCategories[id] = rows;
  } else if (id === "14a_private_direct_dependencies") {
    privateCategories[id] = uniqueNormalizedDependencies;
  } else if (/^14[b-i]_/.test(id)) {
    privateCategories[id] = rows;
  } else if (id === "01b_private_object_class_inventory") {
    privateCategories[id] = rows;
  } else {
    privateCategories[id] = rows.filter(isPrivateOwned);
  }
}
const helperRows = privateCategories["10a_routines"] ?? [];
if (
  helperRows.length !== 1
  || helperRows[0].routine_schema !== "private"
  || helperRows[0].routine_name !== "is_current_user_org_member"
  || helperRows[0].identity_arguments !== "p_organization_id uuid"
) {
  throw new Error("Private membership helper authority is not exact");
}
const privatePolicies = privateCategories["14b_public_policies_referencing_private"] ?? [];
if (privatePolicies.length !== 57 || new Set(privatePolicies.map((row) => row.table_name)).size !== 44) {
  throw new Error("Expected 57 private-helper policies across 44 public tables");
}

const publicCatalog = JSON.parse(readFileSync(publicCatalogPath, "utf8"));
const publicPolicies = new Map(
  (publicCatalog.categories?.["12a_policies"] ?? []).map((row) => [
    `${row.table_schema}.${row.table_name}.${row.policy_name}`,
    row,
  ]),
);
for (const row of privatePolicies) {
  const publicRow = publicPolicies.get(`${row.table_schema}.${row.table_name}.${row.policy_name}`);
  if (!publicRow) throw new Error(`Private dependency policy is absent from public authority: ${row.policy_name}`);
  for (const field of ["permissive", "command_code", "using_expression", "with_check_expression"]) {
    if (JSON.stringify(publicRow[field]) !== JSON.stringify(row[field])) {
      throw new Error(`Public/private policy mismatch: ${row.policy_name}.${field}`);
    }
  }
}

const categories = { ...publicCatalog.categories };
for (const [id, rows] of Object.entries(privateCategories)) {
  if (id === "02_extensions") {
    const byName = new Map((categories[id] ?? []).map((row) => [row.extension_name, row]));
    for (const row of rows) byName.set(row.extension_name, row);
    categories[id] = [...byName.values()].sort((left, right) =>
      left.extension_name.localeCompare(right.extension_name));
  } else if (/^14[a-i]_/.test(id) || id === "01b_private_object_class_inventory") {
    categories[id] = rows;
  } else if (rows.length > 0) {
    categories[id] = [...(categories[id] ?? []), ...rows];
  }
}

const privatePassSha256 = sha256(pass1Text);
const privateAuthority = {
  schemaVersion: "dealflow.private-schema-authority.v1",
  classification: "AUTHORITATIVE_TWO_PASS_PRIVATE_STRUCTURAL_CAPTURE",
  provenance: {
    passSha256: privatePassSha256,
    passesByteIdentical: true,
    statementCount: 36,
    capturedRowCount: 240,
    normalizedDependencyEdgeCount: uniqueNormalizedDependencies.length,
    applicationRowsRead: false,
    productionMutationCount: 0,
  },
  categories: privateCategories,
};
const privateAuthorityText = json(privateAuthority);

const combined = {
  ...publicCatalog,
  classification: "AUTHORITATIVE_CURRENT_PUBLIC_PLUS_PRIVATE_STRUCTURAL_CAPTURE",
  provenance: {
    ...publicCatalog.provenance,
    privateAuthoritySha256: sha256(privateAuthorityText),
    privatePassSha256,
    privatePassesByteIdentical: true,
    privatePolicyRelationshipReconciliation: "57_OF_57_MATCH_ACROSS_44_TABLES",
    applicationRowsRead: false,
    productionMutationCount: 0,
  },
  categories,
};
combined.provenance.combinedCatalogDigestSha256 = sha256(json(categories));

const reconciliationDir = resolve(ROOT, "supabase", "reconciliation");
writeGenerated(resolve(reconciliationDir, "private-schema-authority.v1.json"), privateAuthorityText);
writeGenerated(resolve(reconciliationDir, "authoritative-current-catalog.v1.json"), json(combined));
writeGenerated(resolve(reconciliationDir, "authoritative-public-catalog.v1.json"), json(publicCatalog));

const publicQueryCatalog = await import(pathToFileURL(publicQueryCatalogPath).href);
const privateQueryCatalog = await import(pathToFileURL(privateQueryCatalogPath).href);
const schemaFields = [
  "schema_name", "type_schema", "related_relation_schema", "table_schema", "relation_schema",
  "sequence_schema", "view_schema", "routine_schema", "object_schema",
];
function assertionRecords(source, statements, authorityCategories, scope) {
  return statements
    .filter((statement) => statement.id !== "14_migration_history_fallback")
    .filter((statement) => !(source === "public" && statement.id === "02_extensions"))
    .map((statement) => {
      const rows = authorityCategories[statement.id] ?? [];
      const rowKeys = rows.length > 0 ? Object.keys(rows[0]) : statement.expectedColumns;
      const schemaField = schemaFields.find((field) => rowKeys.includes(field)) ?? null;
      return {
        source,
        id: statement.id,
        category: statement.category,
        sql: statement.sql,
        projection: rowKeys,
        scopeField: schemaField,
        scopeValue: schemaField && source === "public" ? "public" : null,
        expectedRowCount: rows.length,
      };
    });
}
const assertions = [
  ...assertionRecords("public", publicQueryCatalog.QUERY_STATEMENTS, publicCatalog.categories, "public"),
  ...assertionRecords("private", privateQueryCatalog.QUERY_STATEMENTS, privateCategories, "private"),
];
writeGenerated(resolve(reconciliationDir, "catalog-assertion-queries.v1.json"), json({
  schemaVersion: "dealflow.catalog-assertion-queries.v1",
  classification: "STRUCTURAL_PG_CATALOG_ONLY_NO_APPLICATION_ROWS",
  publicQueryCatalogSha256: sha256(readFileSync(publicQueryCatalogPath)),
  privateQueryCatalogSha256: sha256(readFileSync(privateQueryCatalogPath)),
  assertions,
}));

const may2CatalogText = readFileSync(may2CatalogPath, "utf8");
const may2SqlText = readFileSync(may2SqlPath, "utf8");
assertSanitized("May-2 catalog", may2CatalogText);
assertSanitized("May-2 SQL", may2SqlText);
writeGenerated(resolve(reconciliationDir, "may2-baseline-catalog.v1.json"), may2CatalogText);
writeGenerated(resolve(reconciliationDir, "may2-project-bound-schema.sql"), may2SqlText);

process.stdout.write(JSON.stringify({
  status: "AUTHORITY_FIXTURES_WRITTEN",
  privatePassSha256,
  privateAuthoritySha256: sha256(privateAuthorityText),
  combinedCatalogDigestSha256: combined.provenance.combinedCatalogDigestSha256,
  privateStatementCount: 36,
  privateRowCount,
  normalizedDependencyEdgeCount: uniqueNormalizedDependencies.length,
}, null, 2) + "\n");
