import type { WinningFunnelTheme } from "@/lib/funnels/winning-template/schema";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const DEFAULT_WINNING_FUNNEL_THEME: WinningFunnelTheme = {
  primaryColor: "#1c2b3a",
  secondaryColor: "#f3eee5",
  accentColor: "#9c8056",
  fontPreset: "modern",
  logoUrl: null,
  agentPhotoUrl: null,
};

function normalizeColor(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR.test(text) ? text : fallback;
}

export function normalizeWinningFunnelTheme(input?: Partial<WinningFunnelTheme> | null): WinningFunnelTheme {
  return {
    primaryColor: normalizeColor(input?.primaryColor, DEFAULT_WINNING_FUNNEL_THEME.primaryColor),
    secondaryColor: normalizeColor(input?.secondaryColor, DEFAULT_WINNING_FUNNEL_THEME.secondaryColor),
    accentColor: normalizeColor(input?.accentColor, DEFAULT_WINNING_FUNNEL_THEME.accentColor),
    fontPreset:
      input?.fontPreset === "classic" || input?.fontPreset === "luxury" || input?.fontPreset === "modern"
        ? input.fontPreset
        : DEFAULT_WINNING_FUNNEL_THEME.fontPreset,
    logoUrl: typeof input?.logoUrl === "string" && input.logoUrl.trim() ? input.logoUrl.trim() : null,
    agentPhotoUrl: typeof input?.agentPhotoUrl === "string" && input.agentPhotoUrl.trim() ? input.agentPhotoUrl.trim() : null,
  };
}
