import { ApiError } from "@/lib/api/route";

export function assertExactAuthOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const candidate = request.headers.get("origin") ?? request.headers.get("referer");

  if (!candidate) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }

  let candidateOrigin: string;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }

  if (
    candidateOrigin !== requestOrigin ||
    (process.env.NODE_ENV === "production" && !requestOrigin.startsWith("https://"))
  ) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }
}
