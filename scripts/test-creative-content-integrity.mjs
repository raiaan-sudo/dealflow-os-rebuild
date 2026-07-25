import assert from "node:assert/strict";
import fs from "node:fs";
import { isIP } from "node:net";
import vm from "node:vm";
import ts from "typescript";

const file = "src/lib/security/public-network-address.ts";
const source = fs.readFileSync(file, "utf8");
const creativeSource = fs.readFileSync("src/lib/creative-content-integrity.ts", "utf8");
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const declaration = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "isPublicNetworkAddress",
);
assert.ok(declaration, "creative public-address validator must exist");
const transpiled = ts.transpileModule(
  `${declaration.getText(sourceFile)}\nmodule.exports = { isPublicNetworkAddress };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const context = { module: { exports: {} }, exports: {}, isIP };
context.exports = context.module.exports;
vm.runInNewContext(transpiled, context, { filename: `${file}#isPublicCreativeAddress` });
const { isPublicNetworkAddress } = context.module.exports;

for (const address of [
  "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
  "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
  "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
  "::", "::1", "::ffff:127.0.0.1", "::192.168.1.1", "64:ff9b:1::1",
  "100::1", "fc00::1", "fd00::1", "fe80::1", "ff00::1", "2001:db8::1",
  "2002::1",
]) {
  assert.equal(isPublicNetworkAddress(address), false, `${address} must be blocked`);
}

for (const address of [
  "1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111",
  "2001:4860:4860::8888",
]) {
  assert.equal(isPublicNetworkAddress(address), true, `${address} must remain public`);
}

assert.match(creativeSource, /addresses\.some\(\(entry\) => !isPublicCreativeAddress\(entry\.address\)\)/);
assert.match(creativeSource, /lookup: createPinnedDnsLookup\(resolved\)/);
assert.match(creativeSource, /resolved = await resolvePinnedCreativeUrl\(result\.redirect, lookupDns\)/);
assert.match(creativeSource, /MAX_REDIRECTS = 3/);
assert.match(creativeSource, /MAX_CREATIVE_BYTES = 12 \* 1024 \* 1024/);

console.log("creative content integrity, private-address, redirect, and DNS pinning tests passed");
