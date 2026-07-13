import assert from "node:assert/strict";
import fs from "node:fs";
import { isIP } from "node:net";
import vm from "node:vm";
import ts from "typescript";

const file = "src/lib/creative-content-integrity.ts";
const source = fs.readFileSync(file, "utf8");
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const declaration = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "isPublicCreativeAddress",
);
assert.ok(declaration, "creative public-address validator must exist");
const transpiled = ts.transpileModule(
  `${declaration.getText(sourceFile)}\nmodule.exports = { isPublicCreativeAddress };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const context = { module: { exports: {} }, exports: {}, isIP };
context.exports = context.module.exports;
vm.runInNewContext(transpiled, context, { filename: `${file}#isPublicCreativeAddress` });
const { isPublicCreativeAddress } = context.module.exports;

for (const address of [
  "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
  "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
  "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
  "::", "::1", "::ffff:127.0.0.1", "::192.168.1.1", "64:ff9b:1::1",
  "100::1", "fc00::1", "fd00::1", "fe80::1", "ff00::1", "2001:db8::1",
  "2002::1",
]) {
  assert.equal(isPublicCreativeAddress(address), false, `${address} must be blocked`);
}

for (const address of [
  "1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111",
  "2001:4860:4860::8888",
]) {
  assert.equal(isPublicCreativeAddress(address), true, `${address} must remain public`);
}

assert.match(source, /addresses\.some\(\(entry\) => !isPublicCreativeAddress\(entry\.address\)\)/);
assert.match(source, /lookup: \(_hostname, _options, callback\) => callback\(null, resolved\.address, resolved\.family\)/);
assert.match(source, /resolved = await resolvePinnedCreativeUrl\(result\.redirect, lookupDns\)/);
assert.match(source, /MAX_REDIRECTS = 3/);
assert.match(source, /MAX_CREATIVE_BYTES = 12 \* 1024 \* 1024/);

console.log("creative content integrity, private-address, redirect, and DNS pinning tests passed");
