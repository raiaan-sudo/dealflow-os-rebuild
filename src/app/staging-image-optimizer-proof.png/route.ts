import { isExactIsolatedStagingVercelHost } from "@/lib/deployment-target";

const STAGING_IMAGE_OPTIMIZER_PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAA0VXHyAAAAPElEQVQ4EWNgGAWM2IJA4dLr/9jEH+iJYqjHEMClGWYguiFMMAly6VEDGBgwYgEUmLhiAj0GyA344aYPADfRDA5//ZlKAAAAAElFTkSuQmCC",
  "base64",
);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  if (!isExactIsolatedStagingVercelHost()) {
    return new Response("Not found.", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
  return new Response(STAGING_IMAGE_OPTIMIZER_PROOF_PNG, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "image/png",
      "Content-Length": String(STAGING_IMAGE_OPTIMIZER_PROOF_PNG.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
