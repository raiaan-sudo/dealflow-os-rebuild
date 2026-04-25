import { getAiEnv } from "@/lib/env";
import { logWarn } from "@/lib/logging";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type GenerateAiJsonOptions = {
  timeoutMs?: number;
};

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function generateAiJson(
  messages: ChatMessage[],
  options: GenerateAiJsonOptions = {},
) {
  const env = getAiEnv();

  if (!env) {
    return {
      ok: false as const,
      error: "AI provider is not configured.",
      content: null,
    };
  }

  try {
    const timeoutMs = options.timeoutMs ?? 12_000;
    const response = await fetch(`${stripTrailingSlash(env.baseUrl)}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model: env.model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWarn("AI request failed", {
        provider: env.provider,
        status: response.status,
      });
      return {
        ok: false as const,
        error: `AI request failed: ${errorText}`,
        content: null,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content ?? null;

    if (!content) {
      return {
        ok: false as const,
        error: "AI response was empty.",
        content: null,
      };
    }

    return {
      ok: true as const,
      error: null,
      content,
    };
  } catch (error) {
    logWarn("AI request threw", {
      provider: env.provider,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "AI request failed.",
      content: null,
    };
  }
}
