import type { Json } from "@/lib/supabase/types";

export type SupportTicketInput = {
  requestId: string;
  confusedText: string;
  blockerText: string;
  page: string;
  emailPresent: boolean;
};

export class SupportTicketValidationError extends Error {
  constructor(
    message: string,
    readonly code = "feedback_message_required",
  ) {
    super(message);
    this.name = "SupportTicketValidationError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function safeRoutePath(value: string) {
  const candidate = value.trim();

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return null;
  }

  return candidate.split(/[?#]/, 1)[0]?.slice(0, 500) || null;
}

export function buildSupportTicketPayload(input: SupportTicketInput) {
  if (!UUID_PATTERN.test(input.requestId)) {
    throw new SupportTicketValidationError(
      "A valid feedback request identifier is required.",
      "feedback_request_invalid",
    );
  }

  const confusedText = cleanText(input.confusedText);
  const blockerText = cleanText(input.blockerText);

  if (!confusedText && !blockerText) {
    throw new SupportTicketValidationError(
      "Tell us what was confusing or what blocked you.",
    );
  }

  const sections = [
    confusedText ? `Confusing or unclear\n${confusedText}` : null,
    blockerText ? `Blocking adoption\n${blockerText}` : null,
  ].filter((section): section is string => Boolean(section));
  const category = blockerText ? "product_blocker" : "product_feedback";

  return {
    category,
    subject:
      category === "product_blocker"
        ? "Product feedback: adoption blocker"
        : "Product feedback: confusing experience",
    message: sections.join("\n\n"),
    routePath: safeRoutePath(input.page),
    safeContext: {
      source: "in_app_feedback_widget",
      emailProvided: input.emailPresent,
      confusedTextProvided: Boolean(confusedText),
      blockerTextProvided: Boolean(blockerText),
    } satisfies Record<string, Json | undefined>,
  };
}
