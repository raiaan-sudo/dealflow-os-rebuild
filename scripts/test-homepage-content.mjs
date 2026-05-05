import { readFileSync } from "node:fs";

const homepage = readFileSync("src/components/marketing/home-command-center.tsx", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");
const loginPage = readFileSync("src/app/(auth)/login/page.tsx", "utf8");

const requiredHomepageSnippets = [
  "Get Access",
  "/login?mode=sign-up",
  "BILLING_PLANS",
  "What gets installed",
  "Pricing",
  "review-first launch path",
];

const forbiddenSnippets = [
  "Book a call",
  "Talk to sales",
  "trusted by",
  "guaranteed leads",
  "guaranteed ROI",
];

for (const snippet of requiredHomepageSnippets) {
  if (!homepage.includes(snippet)) {
    throw new Error(`Homepage is missing required snippet: ${snippet}`);
  }
}

for (const snippet of forbiddenSnippets) {
  if (homepage.toLowerCase().includes(snippet.toLowerCase())) {
    throw new Error(`Homepage includes forbidden unsupported/sales-call copy: ${snippet}`);
  }
}

if (!page.includes("HomeCommandCenter")) {
  throw new Error("Root page must render the public HomeCommandCenter.");
}

if (!loginPage.includes("initialMode")) {
  throw new Error("Login page must support homepage sign-up CTA mode.");
}

console.log("Homepage content checks passed.");
