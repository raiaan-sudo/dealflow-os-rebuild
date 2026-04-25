import { ApiError } from "@/lib/api/route";
import { cookies } from "next/headers";
import { logWarn } from "@/lib/logging";

type SessionCostBucket = "openai_image_generation" | "heygen_video_generation";

const SESSION_COST_LIMITS: Record<SessionCostBucket, { cookie: string; limit: number }> = {
  openai_image_generation: {
    cookie: "dealflow_session_openai_image_generations",
    limit: 10,
  },
  heygen_video_generation: {
    cookie: "dealflow_session_heygen_video_generations",
    limit: 2,
  },
};

function parseCount(value: string | undefined) {
  const numeric = Number.parseInt(value ?? "", 10);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export async function consumeSessionCostBudget(params: {
  bucket: SessionCostBucket;
  userId: string;
  campaignId?: string | null;
}) {
  const config = SESSION_COST_LIMITS[params.bucket];
  const cookieStore = await cookies();
  const currentCount = parseCount(cookieStore.get(config.cookie)?.value);

  if (currentCount >= config.limit) {
    logWarn("Session cost guard blocked generation request", {
      bucket: params.bucket,
      userId: params.userId,
      campaignId: params.campaignId ?? null,
      limit: config.limit,
      currentCount,
    });
    throw new ApiError(
      429,
      params.bucket === "openai_image_generation"
        ? "This session already used the maximum 10 OpenAI image generations."
        : "This session already used the maximum 2 HeyGen video generations.",
      "session_cost_limit_reached",
    );
  }

  const nextCount = currentCount + 1;
  cookieStore.set(config.cookie, String(nextCount), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return {
    currentCount,
    nextCount,
    limit: config.limit,
  };
}
