import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
process.env.STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS = "example.com,api.openai.com";

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
  evaluateStaticCreativeImageQa,
} = require("../src/lib/services/static-creative-image-qa.ts");

function svgData(body, attrs = "width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"") {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`)}`;
}

async function qa(name, body, extra = {}) {
  return evaluateStaticCreativeImageQa({
    campaignId: "test-campaign",
    creativeId: name,
    imageUrl: svgData(body),
    prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic homebuyer lifestyle photo with natural light.",
    negativePrompt: "no text; no final ad; no dashboard; no listing sheet",
    campaignContext: {
      market: "Austin",
      campaignType: "buyer",
      audience: "first-time buyers",
      offer: "approval-first home shortlist",
      propertyType: "homes",
      cta: "See Homes That Match",
    },
    ...extra,
  });
}

const clean = await qa(
  "clean-background",
  `
    <defs>
      <linearGradient id="g"><stop offset="0" stop-color="#c9ddcf"/><stop offset="1" stop-color="#8fb2d8"/></linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <circle cx="380" cy="130" r="80" fill="#fff7" />
    <path d="M40 380 C 150 300, 250 330, 470 250 L 512 512 L 0 512 Z" fill="#385f45"/>
  `,
);
assert.equal(clean.decision, "accept", "clean realistic background accepted");
assert.equal(clean.usable, true);

const flyer = await qa(
  "text-heavy-flyer",
  `
    <rect width="512" height="512" fill="#fff"/>
    ${Array.from({ length: 12 }, (_, i) => `<text x="48" y="${50 + i * 32}" font-size="24">LIMITED OFFER BUY NOW ${i}</text>`).join("")}
    <rect x="110" y="430" width="290" height="52" rx="24" fill="#111"/>
    <text x="165" y="464" font-size="24" fill="#fff">CLICK HERE</text>
  `,
);
assert.equal(flyer.decision, "reject", "text-heavy flyer rejected");
assert.equal(flyer.mode, "background_only", "background-only QA remains the default");
assert.ok(flyer.reasons.includes("text_heavy"));
assert.ok(flyer.reasons.includes("button_or_fake_cta_detected"));

const listingSheet = await qa(
  "fake-listing-sheet",
  `
    <rect width="512" height="512" fill="#fff"/>
    <text x="40" y="52" font-size="34">$899,000 FEATURED LISTING</text>
    <text x="40" y="100" font-size="22">3 bed | 2 bath | 1,850 sqft | MLS 12345</text>
    <text x="40" y="150" font-size="18">Property details, open house, price history, taxes</text>
    <rect x="40" y="190" width="430" height="240" fill="#eee"/>
  `,
);
assert.equal(listingSheet.decision, "reject", "fake listing sheet rejected");
assert.ok(listingSheet.reasons.includes("listing_sheet_detected"));

const dashboard = await qa(
  "dashboard-ui",
  `
    <rect width="512" height="512" fill="#f8fafc"/>
    <text x="32" y="48" font-size="28">Dashboard</text>
    <rect x="32" y="80" width="132" height="90" fill="#fff" stroke="#ccd"/>
    <text x="48" y="128" font-size="18">Pipeline</text>
    <rect x="190" y="80" width="132" height="90" fill="#fff" stroke="#ccd"/>
    <text x="206" y="128" font-size="18">Analytics</text>
    <rect x="348" y="80" width="132" height="90" fill="#fff" stroke="#ccd"/>
    <text x="364" y="128" font-size="18">Report</text>
  `,
);
assert.equal(dashboard.decision, "reject", "dashboard/UI screenshot rejected");
assert.ok(dashboard.reasons.includes("ui_or_dashboard_layout"));

const chartTable = await qa(
  "chart-table",
  `
    <rect width="512" height="512" fill="#fff"/>
    <text x="42" y="52" font-size="26">ROI TABLE</text>
    ${Array.from({ length: 7 }, (_, i) => `<line x1="40" x2="472" y1="${90 + i * 45}" y2="${90 + i * 45}" stroke="#111"/>`).join("")}
    ${Array.from({ length: 5 }, (_, i) => `<line y1="90" y2="360" x1="${40 + i * 108}" x2="${40 + i * 108}" stroke="#111"/>`).join("")}
    <text x="58" y="132" font-size="18">Yield</text><text x="168" y="132" font-size="18">Rent</text><text x="278" y="132" font-size="18">Metric</text>
  `,
);
assert.equal(chartTable.decision, "reject", "chart/table image rejected");
assert.ok(chartTable.reasons.includes("chart_or_table_detected"));

const hugeHeadline = await qa(
  "huge-headline",
  `
    <rect width="512" height="512" fill="#fff"/>
    <text x="26" y="250" font-size="64">GET HOMES NOW</text>
  `,
);
assert.equal(hugeHeadline.decision, "reject", "huge fake headline rejected");
assert.ok(hugeHeadline.reasons.includes("text_heavy"));

const gibberish = await qa(
  "gibberish-text",
  `
    <rect width="512" height="512" fill="#fff"/>
    <text x="42" y="150" font-size="36">XQZ PLOM BRRT GLIP</text>
    <text x="42" y="210" font-size="28">ZXQ CVBNM QWER</text>
  `,
);
assert.equal(gibberish.decision, "reject", "gibberish text rejected");
assert.ok(gibberish.reasons.includes("gibberish_text_detected"));

const incidental = await qa(
  "small-incidental-mark",
  `
    <rect width="512" height="512" fill="#d9e8d5"/>
    <circle cx="270" cy="190" r="110" fill="#f7efe0"/>
    <text x="70" y="460" font-size="8" fill="#777">12</text>
  `,
);
assert.equal(incidental.decision, "accept", "small incidental visual artifact is not treated like a finished ad");

const promptRisk = await qa(
  "finished-ad-prompt",
  `<rect width="512" height="512" fill="#dbeafe"/>`,
  {
    prompt: "Create a finished paid social creative with an ad layout, CTA button, and proof modules.",
  },
);
assert.equal(promptRisk.decision, "reject", "provider finished-ad prompt risk rejected");
assert.ok(promptRisk.reasons.includes("provider_returned_finished_ad"));

const cleanFinishedAd = await qa(
  "clean-finished-ad",
  `
    <rect width="512" height="512" fill="#f7f3eb"/>
    <rect x="28" y="28" width="456" height="456" rx="18" fill="#ffffff"/>
    <rect x="48" y="58" width="416" height="220" rx="14" fill="#d9e8d5"/>
    <circle cx="374" cy="154" r="76" fill="#a8c4e8"/>
    <text x="56" y="332" font-size="34">See Homes That Match</text>
    <text x="56" y="372" font-size="18">Private shortlist for qualified buyers</text>
    <rect x="56" y="410" width="178" height="42" rx="21" fill="#183a2b"/>
    <text x="86" y="437" font-size="18" fill="#fff">Learn More</text>
  `,
  {
    mode: "finished_ad",
    prompt: "Create a finished paid social creative with a clean headline, offer, and CTA.",
    campaignContext: {
      cta: "Learn More",
      offer: "Private shortlist",
    },
  },
);
assert.equal(cleanFinishedAd.decision, "accept", "clean finished ad accepted in finished_ad QA mode");
assert.equal(cleanFinishedAd.mode, "finished_ad");

const missingRequiredCta = await qa(
  "finished-ad-missing-cta",
  `
    <rect width="512" height="512" fill="#f7f3eb"/>
    <text x="56" y="332" font-size="34">See Homes That Match</text>
    <text x="56" y="372" font-size="18">Private shortlist for qualified buyers</text>
  `,
  {
    mode: "finished_ad",
    prompt: "Create a finished paid social creative.",
    campaignContext: {
      cta: "Learn More",
      offer: "Private shortlist",
    },
  },
);
assert.equal(missingRequiredCta.decision, "reject", "finished_ad missing required CTA rejected");
assert.ok(missingRequiredCta.reasons.includes("required_cta_missing"));

const misspelledBrand = await qa(
  "finished-ad-misspelled-brand",
  `
    <rect width="512" height="512" fill="#f7f3eb"/>
    <text x="56" y="92" font-size="28">REMAX Realty</text>
    <text x="56" y="332" font-size="34">See Homes That Match</text>
    <text x="86" y="437" font-size="18">Learn More</text>
  `,
  {
    mode: "finished_ad",
    prompt: "Create a finished RE/MAX paid social creative.",
    campaignContext: {
      cta: "Learn More",
    },
  },
);
assert.equal(misspelledBrand.decision, "reject", "finished_ad misspelled brokerage rejected");
assert.ok(misspelledBrand.reasons.includes("brand_misspelled"));

const finishedAdGibberish = await qa(
  "finished-ad-gibberish",
  `
    <rect width="512" height="512" fill="#fff"/>
    <text x="42" y="150" font-size="36">XQZ PLOM BRRT GLIP</text>
    <text x="42" y="210" font-size="28">ZXQ CVBNM QWER</text>
  `,
  {
    mode: "finished_ad",
    prompt: "Create a finished paid social creative.",
  },
);
assert.equal(finishedAdGibberish.decision, "reject", "finished_ad QA still rejects gibberish text");
assert.ok(finishedAdGibberish.reasons.includes("gibberish_text_detected"));

const opaqueFinishedAd = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "opaque-finished-ad",
  imageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
  mode: "finished_ad",
  prompt: "Create a finished paid social creative.",
});
assert.equal(opaqueFinishedAd.decision, "reject", "uninspectable finished_ad raster fails closed");
assert.ok(opaqueFinishedAd.reasons.includes("finished_ad_text_unverified"));

const previousVisionEnabled = process.env.FINISHED_AD_VISION_QA_ENABLED;
const previousAiKey = process.env.AI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
const previousAiModel = process.env.AI_MODEL;
const originalFetchForVision = globalThis.fetch;

process.env.FINISHED_AD_VISION_QA_ENABLED = "true";
process.env.AI_API_KEY = "test-vision-key";
process.env.OPENAI_API_KEY = "";
process.env.AI_MODEL = "gpt-4o-mini";

globalThis.fetch = async () =>
  new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            readableTextSamples: ["Private shortlist", "Learn More"],
            hasGibberish: false,
            hasFakeUi: false,
            hasListingOrDashboard: false,
            hasChartOrTable: false,
            brandMisspelled: false,
            requiredCtaPresent: true,
            requiredOfferPresent: true,
          }),
        },
      },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });
const visionAccepted = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "vision-accepted-finished-ad",
  imageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
  mode: "finished_ad",
  prompt: "Create a finished paid social creative.",
  campaignContext: {
    cta: "Learn More",
    offer: "Private shortlist",
  },
});
assert.equal(visionAccepted.decision, "accept", "vision-inspected JPEG finished_ad can be accepted");
assert.deepEqual(visionAccepted.detectedTextSamples, ["Private shortlist", "Learn More"]);

globalThis.fetch = async () =>
  new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            readableTextSamples: [
              "YOUR FIRST TORONTO HOME IS CLOSER THAN YOU THINK",
              "See if you may qualify with a 600+ credit score",
              "CHECK MY OPTIONS",
            ],
            hasGibberish: false,
            hasFakeUi: false,
            hasListingOrDashboard: false,
            hasChartOrTable: false,
            brandMisspelled: false,
            requiredCtaPresent: true,
            requiredOfferPresent: true,
          }),
        },
      },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });
const visionAcceptedSoftenedCredit = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "vision-accepted-credit-finished-ad",
  imageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
  mode: "finished_ad",
  prompt: "Create a finished paid social creative with CTA Check My Options.",
  campaignContext: {
    cta: "Check My Options",
    offer: "See if you may qualify with 600+ credit",
  },
});
assert.equal(
  visionAcceptedSoftenedCredit.decision,
  "accept",
  "finished_ad QA accepts semantically equivalent softened credit offer text",
);

globalThis.fetch = async () =>
  new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            readableTextSamples: ["Private shortlist"],
            hasGibberish: false,
            hasFakeUi: false,
            hasListingOrDashboard: false,
            hasChartOrTable: false,
            brandMisspelled: false,
            requiredCtaPresent: false,
            requiredOfferPresent: true,
          }),
        },
      },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });
const visionMissingCta = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "vision-missing-cta-finished-ad",
  imageUrl: "data:image/png;base64,iVBORw0KGgo=",
  mode: "finished_ad",
  prompt: "Create a finished paid social creative.",
  campaignContext: {
    cta: "Learn More",
    offer: "Private shortlist",
  },
});
assert.equal(visionMissingCta.decision, "reject", "vision QA rejects finished_ad missing required CTA");
assert.ok(visionMissingCta.reasons.includes("required_cta_missing"));

globalThis.fetch = originalFetchForVision;
if (previousVisionEnabled === undefined) delete process.env.FINISHED_AD_VISION_QA_ENABLED;
else process.env.FINISHED_AD_VISION_QA_ENABLED = previousVisionEnabled;
if (previousAiKey === undefined) delete process.env.AI_API_KEY;
else process.env.AI_API_KEY = previousAiKey;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;
if (previousAiModel === undefined) delete process.env.AI_MODEL;
else process.env.AI_MODEL = previousAiModel;

const fetchFailed = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "bad-url",
  imageUrl: "file:///private/provider-image.png",
  prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean photo.",
});
assert.equal(fetchFailed.decision, "reject", "unsafe or failed image fetch rejected");
assert.ok(fetchFailed.reasons.includes("image_fetch_failed"));

for (const [label, url] of [
  ["http", "http://example.com/provider-image.png"],
  ["localhost", "https://localhost/provider-image.png"],
  ["metadata", "https://169.254.169.254/latest/meta-data/provider-image.png"],
  ["evil-substring", "https://evil.test/storage/v1/object/public/creative-assets/provider-image.png"],
]) {
  const unsafe = await evaluateStaticCreativeImageQa({
    campaignId: "test-campaign",
    creativeId: `unsafe-${label}`,
    imageUrl: url,
    prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean photo.",
  });
  assert.equal(unsafe.decision, "reject", `${label} QA fetch rejected`);
  assert.ok(unsafe.reasons.includes("image_fetch_failed"));
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(null, {
    status: 302,
    headers: { location: "https://127.0.0.1/private.png" },
  });
const redirectPrivate = await evaluateStaticCreativeImageQa({
  campaignId: "test-campaign",
  creativeId: "redirect-private",
  imageUrl: "https://example.com/provider-redirect.png",
  prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean photo.",
});
globalThis.fetch = originalFetch;
assert.equal(redirectPrivate.decision, "reject", "redirect-to-private QA fetch rejected");
assert.ok(redirectPrivate.reasons.includes("image_fetch_failed"));

console.log("Static creative image QA tests passed.");
