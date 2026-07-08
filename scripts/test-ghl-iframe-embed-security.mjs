#!/usr/bin/env node

import fs from "node:fs";

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
const nextConfigSource = fs.readFileSync("next.config.mjs", "utf8");
const loginFormSource = fs.readFileSync("src/components/auth/login-form.tsx", "utf8");

const requiredProxyMarkers = [
  "CLICK_TO_SCALE_IFRAME_HOSTS",
  "\"clicktoscale.io\"",
  "\"www.clicktoscale.io\"",
  "DEFAULT_GHL_FRAME_ANCESTORS",
  "https://app.gohighlevel.com",
  "https://*.gohighlevel.com",
  "https://app.leadconnectorhq.com",
  "https://*.leadconnectorhq.com",
  "GHL_IFRAME_ALLOWED_FRAME_ANCESTORS",
  "frame-ancestors ${frameAncestors}",
  "response.headers.delete(\"X-Frame-Options\")",
  "response.headers.set(\"X-Frame-Options\", \"DENY\")",
];

const failures = [];

for (const marker of requiredProxyMarkers) {
  if (!proxySource.includes(marker)) {
    failures.push(`src/proxy.ts is missing required marker: ${marker}`);
  }
}

if (nextConfigSource.includes("X-Frame-Options")) {
  failures.push("next.config.mjs must not set X-Frame-Options globally; it blocks GoHighLevel iframes.");
}

if (!proxySource.includes("if (!CLICK_TO_SCALE_IFRAME_HOSTS.has(host))")) {
  failures.push("src/proxy.ts must keep non-ClickToScale hosts on frame-ancestors 'none'.");
}

if (!loginFormSource.includes("requestEmbeddedAuthStorageAccess")) {
  failures.push("src/components/auth/login-form.tsx must request storage access before iframe auth submission.");
}

if (!loginFormSource.includes("document.requestStorageAccess")) {
  failures.push("src/components/auth/login-form.tsx must support strict browser third-party storage handling.");
}

if (!loginFormSource.includes("window.self !== window.top")) {
  failures.push("src/components/auth/login-form.tsx must detect embedded auth surfaces.");
}

if (failures.length > 0) {
  console.error("GHL iframe embed security regression failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("GHL iframe embed security regression passed.");
