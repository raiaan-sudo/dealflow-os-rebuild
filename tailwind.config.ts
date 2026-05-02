import type { Config } from "tailwindcss";
import { colors, gradients, shadows, spacing, typography } from "./src/design-system";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "df-background": colors.background,
        "df-text": colors.text,
        "df-accent": colors.accent,
        "df-border": colors.border,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "df-app": gradients.appBackground,
        "df-panel": gradients.panel,
        "df-panel-strong": gradients.panelStrong,
        "df-primary": gradients.primary,
        "df-aurora": gradients.aurora,
      },
      boxShadow: {
        "df-glow-blue": shadows.glowBlue,
        "df-glow-purple": shadows.glowPurple,
        "df-panel": shadows.panel,
        "df-elevated": shadows.elevated,
        "df-button": shadows.button,
      },
      spacing: {
        "df-page-x": spacing.pageX,
        "df-page-y": spacing.pageY,
        "df-section": spacing.sectionGap,
        "df-card": spacing.cardPadding,
      },
      borderRadius: {
        "df-panel": spacing.radius.panel,
        "df-card": spacing.radius.card,
        "df-control": spacing.radius.control,
      },
      fontFamily: {
        sans: [typography.fontFamily],
        mono: [typography.monoFamily],
      },
    },
  },
  plugins: [],
};
export default config;
