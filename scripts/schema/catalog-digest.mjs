#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function catalogDigest(catalog) {
  const categories = catalog.categories ?? catalog;
  const categoryDigests = Object.fromEntries(
    Object.entries(categories)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, rows]) => [id, {
        rowCount: Array.isArray(rows) ? rows.length : 0,
        sha256: sha256(stableJson(rows)),
      }]),
  );
  return {
    schemaVersion: "dealflow.catalog-digest.v1",
    categoryCount: Object.keys(categoryDigests).length,
    categoryDigests,
    normalizedCatalogSha256: sha256(stableJson(categories)),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node scripts/schema/catalog-digest.mjs <catalog.json>");
  const catalog = JSON.parse(readFileSync(resolve(path), "utf8"));
  process.stdout.write(`${JSON.stringify(catalogDigest(catalog), null, 2)}\n`);
}
