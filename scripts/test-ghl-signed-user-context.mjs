#!/usr/bin/env node

import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/lib/integrations/gohighlevel/signed-user-context.ts",
  "utf8",
).replace('import "server-only";\n', "");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const loadedModule = { exports: {} };
new Function("require", "module", "exports", output)(
  (specifier) => {
    if (specifier === "node:crypto") return nodeCrypto;
    throw new Error(`Unexpected signed-context import: ${specifier}`);
  },
  loadedModule,
  loadedModule.exports,
);
const { decryptGhlSignedUserContext } = loadedModule.exports;

function derive(passphrase, salt) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  while (Buffer.concat(blocks).length < 48) {
    previous = nodeCrypto.createHash("md5")
      .update(Buffer.concat([previous, Buffer.from(passphrase), salt]))
      .digest();
    blocks.push(previous);
  }
  const material = Buffer.concat(blocks);
  return { key: material.subarray(0, 32), iv: material.subarray(32, 48) };
}

function encryptCryptoJsEnvelope(value, secret) {
  const salt = Buffer.from("0102030405060708", "hex");
  const { key, iv } = derive(secret, salt);
  const cipher = nodeCrypto.createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from("Salted__"), salt, ciphertext]).toString("base64");
}

const secret = "sentinel-secure-ghl-app-shared-secret-2026-alpha";
const context = {
  userId: "ghl_user_123",
  companyId: "ghl_company_123",
  activeLocation: "ghl_location_123",
  email: "Realtor@Partner.Example",
  appStatus: "live",
  role: "user",
};
const encrypted = encryptCryptoJsEnvelope(context, secret);
assert.deepEqual(decryptGhlSignedUserContext(encrypted, secret), {
  userId: context.userId,
  companyId: context.companyId,
  activeLocation: context.activeLocation,
  email: "realtor@partner.example",
  appStatus: "live",
});
assert.equal(
  decryptGhlSignedUserContext(encrypted, `${secret}-wrong`),
  null,
  "a different app secret must not decrypt signed context",
);
assert.equal(
  decryptGhlSignedUserContext(
    encryptCryptoJsEnvelope({ ...context, appStatus: "draft" }, secret),
    secret,
  ),
  null,
  "non-live app context must fail closed",
);
assert.deepEqual(
  decryptGhlSignedUserContext(
    encryptCryptoJsEnvelope({ ...context, appStatus: "draft" }, secret),
    secret,
    { allowDraft: true },
  ),
  {
    userId: context.userId,
    companyId: context.companyId,
    activeLocation: context.activeLocation,
    email: "realtor@partner.example",
    appStatus: "draft",
  },
  "an explicit isolated-staging caller may accept the provider draft context",
);
assert.equal(decryptGhlSignedUserContext("not-an-envelope", secret), null);
assert.equal(
  decryptGhlSignedUserContext(`${encrypted.slice(0, -4)}AAAA`, secret),
  null,
  "tampered ciphertext must fail closed",
);

console.log("HighLevel signed user-context decryption and validation: PASS");
