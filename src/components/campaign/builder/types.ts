export type BuilderStep = {
  id: string;
  label: string;
};

export type BuilderState = {
  currentStep: string;
};

export type BuilderEditingMode = "guided" | "advanced" | "manual" | "ai" | (string & {});
export type GuidedStep =
  | "setup"
  | "funnel"
  | "creatives"
  | "launch"
  | "review"
  | (string & {});
export type BuilderTab =
  | "setup"
  | "funnel"
  | "creatives"
  | "launch"
  | "review"
  | "strategy"
  | "creative"
  | "preview"
  | (string & {});
export type PreviewPaneTab = "creative" | "video" | "funnel" | "launch" | (string & {});
export type BuilderThemePreset =
  | "luxury"
  | "investor"
  | "seller"
  | "minimal"
  | "editorial"
  | "default"
  | "light"
  | "dark"
  | (string & {});

export type BuilderPreviewDirection = {
  themePreset: BuilderThemePreset;
  mood: string;
  visualDirection: string;
  designNotes: string[];
  typography: {
    display: string;
    body: string;
    label: string;
  };
  spacing: {
    hero: string;
    section: string;
  };
  palette: {
    background: string;
    surface: string;
    accent: string;
    text: string;
    mutedText: string;
    panel: string;
    ctaText: string;
  };
};
export type BuilderRevisionSource = "manual" | "ai" | "system" | (string & {});

export type BuilderAiCommandResult = {
  summary?: string;
  changes?: string[];
  direction?: BuilderPreviewDirection | null;
  creativePatch?: {
    visualDirection?: string | null;
    imagePromptAppend?: string | null;
  };
  funnelPatch?: {
    headline?: string | null;
    subheadline?: string | null;
    cta?: string | null;
  };
  payload?: Record<string, unknown>;
};

export type BuilderCampaignRevision = {
  id: string;
  source: BuilderRevisionSource;
  createdAt?: string;
  summary?: string;
};

export type GeneratedVideoState = {
  status: "idle" | "pending" | "processing" | "completed" | "failed" | (string & {});
  jobId?: string | null;
  error?: string | null;
  video?: {
    id?: string | null;
    url?: string | null;
    status?: string | null;
    thumbnailUrl?: string | null;
    providerId?: string | null;
  } | null;
};
