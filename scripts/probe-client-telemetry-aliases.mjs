const baseUrl = process.env.PROBE_CLIENT_TELEMETRY_BASE_URL;

function buildPayload(eventName) {
  return {
    source: "public_lead_capture",
    routePath: "/f/hamza-juma",
    errorName: eventName,
    message: eventName,
    severity: "low",
    viewport: "probe",
    metadata: {
      eventType: eventName,
      publicSlug: "hamza-juma",
      deviceType: "probe",
      sessionId: `probe_${Date.now()}`,
    },
  };
}

if (!baseUrl) {
  console.log("Client telemetry alias probe skipped live HTTP; set PROBE_CLIENT_TELEMETRY_BASE_URL to run a production/staging-safe probe.");
  process.exit(0);
}

const target = `${baseUrl.replace(/\/$/, "")}/api/client-errors`;
const trusted = await fetch(target, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: baseUrl.replace(/\/$/, ""),
    Referer: `${baseUrl.replace(/\/$/, "")}/f/hamza-juma`,
  },
  body: JSON.stringify(buildPayload("lead_form_viewed")),
});

if (!trusted.ok) {
  throw new Error(`Trusted telemetry alias probe failed with ${trusted.status}: ${await trusted.text()}`);
}

const fake = await fetch(target, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://evil.example",
    Referer: "https://evil.example/f/hamza-juma",
  },
  body: JSON.stringify(buildPayload("lead_form_viewed")),
});

if (fake.status !== 403) {
  throw new Error(`Fake-origin telemetry probe should fail with 403; received ${fake.status}.`);
}

console.log("Client telemetry alias probe passed: trusted alias accepted and fake origin rejected.");
