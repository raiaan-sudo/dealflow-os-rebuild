export const typography = {
  fontFamily:
    "var(--font-sans, 'Satoshi', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif)",
  monoFamily:
    "var(--font-mono, 'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace)",
  tracking: {
    tight: "-0.06em",
    label: "0.22em",
  },
  scale: {
    eyebrow: "0.6875rem",
    body: "0.9375rem",
    h1: "clamp(2.6rem, 7vw, 5.75rem)",
    h2: "clamp(2rem, 4vw, 3.5rem)",
  },
} as const;
