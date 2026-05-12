import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  detectManualCreativeMediaType,
} = require("../src/lib/services/creative-builder-service.ts");

assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image"),
  { contentType: "image/png", extension: "png" },
);
assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), "image"),
  { contentType: "image/jpeg", extension: "jpg" },
);
assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array(Buffer.from("GIF89a")), "thumbnail"),
  { contentType: "image/gif", extension: "gif" },
);
assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array(Buffer.from("RIFFxxxxWEBP")), "image"),
  { contentType: "image/webp", extension: "webp" },
);
assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array(Buffer.from("\u0000\u0000\u0000\u0018ftypisom")), "video"),
  { contentType: "video/mp4", extension: "mp4" },
);
assert.deepEqual(
  detectManualCreativeMediaType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "video"),
  { contentType: "video/webm", extension: "webm" },
);
assert.throws(
  () => detectManualCreativeMediaType(new Uint8Array(Buffer.from("<script>alert(1)</script>")), "image"),
  /supported media type/,
);

console.log("Manual creative upload validation tests passed.");
