export const SUPPORT_CATEGORIES = [
  "contact_support",
  "report_bug",
  "billing_help",
  "campaign_not_working",
  "meta_connection_issue",
  "creative_generation_issue",
  "ai_ugc_video_issue",
  "launch_issue",
  "lead_delivery_issue",
  "login_account_issue",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  contact_support: "Contact support",
  report_bug: "Report a bug",
  billing_help: "Billing help",
  campaign_not_working: "Campaign not working",
  meta_connection_issue: "Meta/Facebook connection issue",
  creative_generation_issue: "Creative generation issue",
  ai_ugc_video_issue: "AI UGC video issue",
  launch_issue: "Launch issue",
  lead_delivery_issue: "Lead delivery issue",
  login_account_issue: "Login/account issue",
  other: "Other",
};

export const SUPPORT_CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((value) => ({
  value,
  label: SUPPORT_CATEGORY_LABELS[value],
}));

export const SUPPORT_PRIORITY_BY_CATEGORY: Record<SupportCategory, 1 | 2 | 3 | 4> = {
  launch_issue: 3,
  meta_connection_issue: 3,
  login_account_issue: 3,
  billing_help: 3,
  campaign_not_working: 3,
  lead_delivery_issue: 3,
  creative_generation_issue: 2,
  ai_ugc_video_issue: 2,
  report_bug: 2,
  contact_support: 2,
  other: 2,
};
