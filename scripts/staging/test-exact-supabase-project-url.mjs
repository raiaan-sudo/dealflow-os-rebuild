#!/usr/bin/env node

import assert from "node:assert/strict";

import { parseExactHostedSupabaseProjectUrl } from "./exact-supabase-project-url.mjs";

for (const valid of [
  "https://exactprojectqibh.supabase.co",
  "https://exactprojectqibh.supabase.co/",
  "https://exactprojectqibh.supabase.co:443/",
]) {
  assert.deepEqual(parseExactHostedSupabaseProjectUrl(valid), {
    projectRef: "exactprojectqibh",
    url: "https://exactprojectqibh.supabase.co",
  });
}

for (const invalid of [
  "http://exactprojectqibh.supabase.co/",
  "https://user:password@exactprojectqibh.supabase.co/",
  "https://exactprojectqibh.supabase.co:444/",
  "https://exactprojectqibh.supabase.co/rest/v1",
  "https://exactprojectqibh.supabase.co/?token=secret",
  "https://exactprojectqibh.supabase.co/#fragment",
  "https://exactprojectqibh.supabase.co.evil.example/",
  "https://supabase.co/",
  " https://exactprojectqibh.supabase.co/",
  "not-a-url",
]) {
  assert.throws(
    () => parseExactHostedSupabaseProjectUrl(invalid),
    /exact hosted HTTPS origin/,
  );
}

console.log(
  "exact Supabase project URL contract: PASS (HTTPS, hosted project hostname, no credentials, noncanonical port, path, query, hash, whitespace, or suffix confusion)",
);
