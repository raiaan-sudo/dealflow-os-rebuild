import { NextResponse } from "next/server";

export function finalizeServerAuthResponse(
  response: NextResponse,
  cookieSource?: NextResponse | null,
) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");

  if (cookieSource) {
    for (const cookie of cookieSource.cookies.getAll()) {
      response.cookies.set(cookie);
    }
  }

  return response;
}
