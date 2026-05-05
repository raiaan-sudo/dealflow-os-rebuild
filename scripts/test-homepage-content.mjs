import { readFileSync } from "node:fs";

const homepage = readFileSync("src/components/marketing/home-command-center.tsx", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");
const loginPage = readFileSync("src/app/(auth)/login/page.tsx", "utf8");

const requiredHomepageSnippets = [
  "DealFlow OS",
  "Get Access",
  "/login?mode=sign-up",
  "BILLING_PLANS",
  "What gets installed",
  "Stop renting a service",
  "Agency vs owned system",
  "Built by operators",
  "Built by ex-agency operators, not another lead-gen vendor",
  "ex-agency operators",
  "The founding team has managed over eight figures in ad spend",
  "managed over eight figures in ad spend",
  "custom-coded AI infrastructure",
  "AI builds and coordinates the system",
  "humans oversee quality, strategy, and launch readiness",
  "human oversight",
  "Five modules",
  "Who it is for",
  "Pricing",
  "review-first launch path",
];

const forbiddenSnippets = [
  "Book a call",
  "Talk to sales",
  "trusted by",
  "guaranteed leads",
  "guaranteed ROI",
  "guaranteed appointments",
  "guaranteed closings",
  "15–40 appointments",
  "15-40 appointments",
  "8-figures",
  "100+ agents",
  "limited installs",
  "$250K",
  "$3K",
  "$50K",
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
