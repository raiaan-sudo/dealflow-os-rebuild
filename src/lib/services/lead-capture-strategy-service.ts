import type { CampaignIntent } from "@/lib/campaign-intent";

export type LeadCaptureGoal = "quality" | "balanced" | "volume";
export type CaptureMethod = "website_funnel" | "meta_instant_form";
export type FormFrictionLevel = "low" | "medium" | "high";
export type LeadDeliveryDestination =
  | "dealflow_dashboard"
  | "csv_export"
  | "crm_later"
  | "webhook_later"
  | "operator_notification_later";
export type SpecialAdCategory = "HOUSING" | "NONE";
export type LeadCaptureStatus =
  | "not_configured"
  | "draft"
  | "ready"
  | "blocked"
  | "created"
  | "live"
  | "error";

export type LeadCaptureStrategy = {
  lead_capture_goal: LeadCaptureGoal;
  capture_method: CaptureMethod;
  form_friction_level: FormFrictionLevel;
  lead_form_template_id: string | null;
  meta_lead_form_id: string | null;
  funnel_id: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  sms_consent_enabled: boolean;
  lead_delivery_destination: LeadDeliveryDestination;
  special_ad_category: SpecialAdCategory;
  lead_capture_status: LeadCaptureStatus;
  lead_capture_ready_at: string | null;
  lead_capture_last_error: string | null;
};

export type LeadCaptureStrategyInput = {
  lead_capture_goal?: unknown;
  capture_method?: unknown;
  form_friction_level?: unknown;
  lead_form_template_id?: unknown;
  meta_lead_form_id?: unknown;
  funnel_id?: unknown;
  privacy_policy_url?: unknown;
  terms_url?: unknown;
  sms_consent_enabled?: unknown;
  lead_delivery_destination?: unknown;
  special_ad_category?: unknown;
  lead_capture_status?: unknown;
  lead_capture_ready_at?: unknown;
  lead_capture_last_error?: unknown;
  goal?: unknown;
  method?: unknown;
};

export const LEAD_CAPTURE_STRATEGY_OPTIONS: Array<{
  goal: LeadCaptureGoal;
  label: string;
  captureMethod: CaptureMethod;
  frictionLevel: FormFrictionLevel;
  templateId: string;
  description: string;
}> = [
  {
    goal: "quality",
    label: "Higher Quality",
    captureMethod: "website_funnel",
    frictionLevel: "high",
    templateId: "quality_website_funnel",
    description: "Send users to the website funnel for deeper education and stronger intent.",
  },
  {
    goal: "balanced",
    label: "Balanced",
    captureMethod: "meta_instant_form",
    frictionLevel: "medium",
    templateId: "balanced_instant_form",
    description: "Use Meta Instant Forms with enough questions to qualify without crushing volume.",
  },
  {
    goal: "volume",
    label: "Higher Volume",
    captureMethod: "meta_instant_form",
    frictionLevel: "low",
    templateId: "volume_instant_form",
    description: "Use a short Meta Instant Form to maximize lead volume.",
  },
];

const LEAD_CAPTURE_GOALS = new Set<LeadCaptureGoal>(["quality", "balanced", "volume"]);
const CAPTURE_METHODS = new Set<CaptureMethod>(["website_funnel", "meta_instant_form"]);
const FRICTION_LEVELS = new Set<FormFrictionLevel>(["low", "medium", "high"]);
const DELIVERY_DESTINATIONS = new Set<LeadDeliveryDestination>([
  "dealflow_dashboard",
  "csv_export",
  "crm_later",
  "webhook_later",
  "operator_notification_later",
]);
const CAPTURE_STATUSES = new Set<LeadCaptureStatus>([
  "not_configured",
  "draft",
  "ready",
  "blocked",
  "created",
  "live",
  "error",
]);

function flagEnabled(name: string, env: NodeJS.ProcessEnv = process.env) {
  const value = env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizedText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function optionForGoal(goal: LeadCaptureGoal) {
  return LEAD_CAPTURE_STRATEGY_OPTIONS.find((option) => option.goal === goal) ?? LEAD_CAPTURE_STRATEGY_OPTIONS[1];
}

export function isLeadCaptureStrategyEnabled(env: NodeJS.ProcessEnv = process.env) {
  return flagEnabled("LEAD_CAPTURE_STRATEGY_ENABLED", env);
}

export function isMetaInstantFormsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return flagEnabled("META_INSTANT_FORMS_ENABLED", env);
}

export function isLeadFormLaunchEnabled(env: NodeJS.ProcessEnv = process.env) {
  return flagEnabled("LEAD_FORM_LAUNCH_ENABLED", env);
}

export function isLiveMetaLeadFormCreationAllowed(env: NodeJS.ProcessEnv = process.env) {
  return (
    isMetaInstantFormsEnabled(env) &&
    isLeadFormLaunchEnabled(env) &&
    flagEnabled("ALLOW_META_LIVE_LAUNCH", env)
  );
}

export function inferSpecialAdCategory(params: {
  intent?: CampaignIntent | string | null;
  businessType?: string | null;
  category?: string | null;
}) {
  const joined = [params.intent, params.businessType, params.category]
    .map((value) => String(value ?? "").toLowerCase().replace(/[_-]+/g, " "))
    .join(" ");

  if (
    /\b(buyer|seller|investor|commercial|real estate|realtor|home|house|property|listing|mortgage)\b/.test(joined)
  ) {
    return "HOUSING" as const;
  }

  return "NONE" as const;
}

export function getDefaultLeadCaptureStrategy(params: {
  intent?: CampaignIntent | string | null;
  enableInstantForms?: boolean;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  funnelId?: string | null;
} = {}): LeadCaptureStrategy {
  const goal: LeadCaptureGoal = params.enableInstantForms ? "balanced" : "quality";
  const option = optionForGoal(goal);
  const captureMethod = params.enableInstantForms ? option.captureMethod : "website_funnel";

  return {
    lead_capture_goal: goal,
    capture_method: captureMethod,
    form_friction_level: params.enableInstantForms ? option.frictionLevel : "high",
    lead_form_template_id: params.enableInstantForms ? option.templateId : "quality_website_funnel",
    meta_lead_form_id: null,
    funnel_id: normalizedText(params.funnelId),
    privacy_policy_url: normalizedText(params.privacyPolicyUrl),
    terms_url: normalizedText(params.termsUrl),
    sms_consent_enabled: true,
    lead_delivery_destination: "dealflow_dashboard",
    special_ad_category: inferSpecialAdCategory({ intent: params.intent }),
    lead_capture_status: "draft",
    lead_capture_ready_at: null,
    lead_capture_last_error: null,
  };
}

export function normalizeLeadCaptureStrategy(
  input: LeadCaptureStrategyInput | null | undefined,
  context: {
    intent?: CampaignIntent | string | null;
    env?: NodeJS.ProcessEnv;
    privacyPolicyUrl?: string | null;
    termsUrl?: string | null;
    funnelId?: string | null;
  } = {},
): LeadCaptureStrategy {
  const env = context.env ?? process.env;
  const strategyEnabled = isLeadCaptureStrategyEnabled(env);
  const instantFormsEnabled = isMetaInstantFormsEnabled(env);
  const requestedGoal = enumValue(
    input?.lead_capture_goal ?? input?.goal,
    LEAD_CAPTURE_GOALS,
    strategyEnabled ? "balanced" : "quality",
  );
  const option = optionForGoal(requestedGoal);
  const requestedMethod = enumValue(input?.capture_method ?? input?.method, CAPTURE_METHODS, option.captureMethod);
  const captureMethod: CaptureMethod =
    strategyEnabled && instantFormsEnabled && requestedMethod === "meta_instant_form"
      ? "meta_instant_form"
      : "website_funnel";
  const fallbackFriction = captureMethod === "meta_instant_form" ? option.frictionLevel : "high";

  return {
    lead_capture_goal: strategyEnabled ? requestedGoal : "quality",
    capture_method: captureMethod,
    form_friction_level: enumValue(input?.form_friction_level, FRICTION_LEVELS, fallbackFriction),
    lead_form_template_id:
      normalizedText(input?.lead_form_template_id) ??
      (captureMethod === "meta_instant_form" ? option.templateId : "quality_website_funnel"),
    meta_lead_form_id: normalizedText(input?.meta_lead_form_id),
    funnel_id: normalizedText(input?.funnel_id) ?? normalizedText(context.funnelId),
    privacy_policy_url: normalizedText(input?.privacy_policy_url) ?? normalizedText(context.privacyPolicyUrl),
    terms_url: normalizedText(input?.terms_url) ?? normalizedText(context.termsUrl),
    sms_consent_enabled: input?.sms_consent_enabled !== false,
    lead_delivery_destination: enumValue(
      input?.lead_delivery_destination,
      DELIVERY_DESTINATIONS,
      "dealflow_dashboard",
    ),
    special_ad_category:
      input?.special_ad_category === "NONE" ? "NONE" : inferSpecialAdCategory({ intent: context.intent }),
    lead_capture_status: enumValue(input?.lead_capture_status, CAPTURE_STATUSES, "draft"),
    lead_capture_ready_at: normalizedText(input?.lead_capture_ready_at),
    lead_capture_last_error: normalizedText(input?.lead_capture_last_error),
  };
}

export function toLeadCapturePlanPatch(strategy: LeadCaptureStrategy) {
  return {
    lead_capture_strategy: strategy,
    lead_capture_goal: strategy.lead_capture_goal,
    capture_method: strategy.capture_method,
    form_friction_level: strategy.form_friction_level,
    lead_form_template_id: strategy.lead_form_template_id,
    meta_lead_form_id: strategy.meta_lead_form_id,
    funnel_id: strategy.funnel_id,
    privacy_policy_url: strategy.privacy_policy_url,
    terms_url: strategy.terms_url,
    sms_consent_enabled: strategy.sms_consent_enabled,
    lead_delivery_destination: strategy.lead_delivery_destination,
    special_ad_category: strategy.special_ad_category,
    lead_capture_status: strategy.lead_capture_status,
    lead_capture_ready_at: strategy.lead_capture_ready_at,
    lead_capture_last_error: strategy.lead_capture_last_error,
  };
}
