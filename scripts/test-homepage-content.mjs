import { readFileSync } from "node:fs";

const homepage = readFileSync("src/components/marketing/home-command-center.tsx", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");
const loginPage = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
const loginForm = readFileSync("src/components/auth/login-form.tsx", "utf8");
const productMessages = readFileSync("src/lib/i18n/messages.ts", "utf8");

const requiredHomepageSnippets = [
  "DealFlow OS",
  "Get Access",
  "/login?mode=sign-up",
  "What gets installed",
  "Stop renting a service",
  "Agency vs owned system",
  "Built by operators",
  "Built by ex-agency operators, not another lead vendor",
  "DealFlow OS comes from the infrastructure we built after managing over eight figures in ad spend",
  "This is not a passive KPI screen",
  "ex-agency operators",
  "managed over eight figures in ad spend",
  "custom-coded AI infrastructure",
  "human oversight from the DealFlow team",
  "human oversight",
  "Five modules",
  "Who it is for",
  "Software access",
  "Plan selection and billing stay inside the authenticated software flow.",
  "/privacy",
  "/terms",
  "/data-deletion",
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
  "Pricing",
  "price table",
  "$97/mo",
  "$297/mo",
  "$497/mo",
  "plan=starter",
  "plan=pro",
  "plan=growth",
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

if (!/mode === "sign-in"[\s\S]{0,120}\?\s*t\("auth\.signIn"\)/.test(loginForm)) {
  throw new Error("Login form sign-in action must resolve the localized auth.signIn label.");
}

if (!productMessages.includes('"auth.signIn": "Sign in"')) {
  throw new Error("English message catalog must preserve the canonical Sign in label.");
}

if (loginForm.includes("Launch My Campaign")) {
  throw new Error("Login form must not label sign-in as a campaign launch action.");
}

if (!homepage.includes("try {\n    track(event") || !homepage.includes("} catch {")) {
  throw new Error("Homepage CTA tracking must stay fail-open so analytics cannot block navigation.");
}

console.log("Homepage content checks passed.");
