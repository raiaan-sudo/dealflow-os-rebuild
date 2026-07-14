import { isExactIsolatedStagingVercelHost } from "@/lib/deployment-target";

const STAGING_PRIVATE_IMAGE_GATE_PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAA0VXHyAAAAPElEQVQ4EWNgGAWM2IJA4dLr/9jEH+iJYqjHEMClGWYguiFMMAly6VEDGBgwYgEUmLhiAj0GyA344aYPADfRDA5//ZlKAAAAAElFTkSuQmCC",
  "base64",
);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound() {
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

export async function GET(
  request: Request,
  context: { params: Promise<{ commit: string }> },
) {
  const expectedCommit =
    process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT?.trim() ?? "";
  const { commit } = await context.params;
  if (
    !isExactIsolatedStagingVercelHost() ||
    new URL(request.url).search !== "" ||
    !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    commit !== `${expectedCommit}.png`
  ) {
    return notFound();
  }
  return new Response(STAGING_PRIVATE_IMAGE_GATE_PROOF_PNG, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "image/png",
      "Content-Length": String(STAGING_PRIVATE_IMAGE_GATE_PROOF_PNG.byteLength),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
