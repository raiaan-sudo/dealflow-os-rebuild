#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/scan-release-secrets.mjs", "utf8");

assert.match(source, /git", \["ls-files", "-co", "--exclude-standard", "-z"\]/);
assert.match(source, /private_key_pem/);
assert.match(source, /openai_or_stripe_secret/);
assert.match(source, /supabase_secret/);
assert.match(source, /github_token/);
assert.match(source, /slack_token/);
assert.match(source, /meta_access_token/);
assert.match(source, /credentialed_database_url/);
assert.match(source, /values suppressed/);
assert.match(source, /values never emitted/);
assert.match(source, /isDeclaredTestFixture/);
assert.match(source, /sentinel\|fixture\|example\|test-only\|localhost/);
assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*source/);

console.log("release secret scan contract: PASS");
