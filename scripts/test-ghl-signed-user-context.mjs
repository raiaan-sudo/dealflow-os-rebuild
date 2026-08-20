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

const secret = "sentinel-secure-ghl-app-shared-secret-2026-alpha";
const encrypted = "U2FsdGVkX18BAgMEBQYHCLd87gnU1Y77L4zdV/BE8khn16X8DY+UUE7TQaaOtSW0KjgXlbeQdhufEb8ZhlITbGMSVWitw/UN0G21u0l6ouvrez+65FJfuisfzn84GEKY+tY2DA9CB+cfBF7U6z1s9NDhk5+7x+Vsym5F46O3mK4QCasOtf8+F28JJmuY6reeHTjUnj+Nt59PqqjcLZnlIRA7GxZhq08SoAmcAxSoVK4=";
const draftEncrypted = "U2FsdGVkX18BAgMEBQYHCLd87gnU1Y77L4zdV/BE8khn16X8DY+UUE7TQaaOtSW0KjgXlbeQdhufEb8ZhlITbGMSVWitw/UN0G21u0l6ouvrez+65FJfuisfzn84GEKY+tY2DA9CB+cfBF7U6z1s9NDhk5+7x+Vsym5F46O3mK4QCasOtf8+F28JJmuY6reeHTjUnj+Nt59PqqjcLZnlIUtd+IDjrjXaZIqH8fpS2N0=";
const context = {
  userId: "ghl_user_123",
  companyId: "ghl_company_123",
  activeLocation: "ghl_location_123",
  email: "Realtor@Partner.Example",
  appStatus: "live",
  role: "user",
};
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
    draftEncrypted,
    secret,
  ),
  null,
  "non-live app context must fail closed",
);
assert.deepEqual(
  decryptGhlSignedUserContext(
    draftEncrypted,
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
