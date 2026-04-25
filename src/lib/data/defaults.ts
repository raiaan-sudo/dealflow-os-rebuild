import { subDays } from "date-fns";

export const DEFAULT_SERVICE_TYPES = [
  "Seller Leads",
  "Buyer Leads",
  "Investor Leads",
];

export const DEFAULT_SERVICE_AREAS = [
  { city: "Miami", region: "FL", postalCode: "33131", country: "USA" },
  { city: "Austin", region: "TX", postalCode: "78701", country: "USA" },
  { city: "Toronto", region: "ON", postalCode: "M5V", country: "Canada" },
];

export const DEFAULT_MARKETS = [
  {
    name: "Miami Waterfront",
    city: "Miami",
    region: "FL",
    status: "active",
    priorityLevel: "high",
  },
  {
    name: "Austin Central",
    city: "Austin",
    region: "TX",
    status: "active",
    priorityLevel: "high",
  },
  {
    name: "Toronto West",
    city: "Toronto",
    region: "ON",
    status: "active",
    priorityLevel: "medium",
  },
];

export const DEFAULT_MARKETING_ACCOUNTS = [
  { name: "Google Ads", platform: "google_ads" },
  { name: "Meta Ads", platform: "meta_ads" },
  { name: "Zillow Flex", platform: "zillow_flex" },
];

export type DemoLeadSeed = {
  key: string;
  daysAgo: number;
  source: string;
  serviceType: string;
  marketingAccount: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: "new" | "engaged" | "qualified" | "unqualified" | "booked" | "lost";
  estimatedValue: number;
  notes: string;
};

export type DemoAppointmentSeed = {
  key: string;
  leadKey: string;
  daysAgo: number;
  scheduledOffsetDays: number;
  status: "scheduled" | "booked" | "completed" | "canceled" | "no_show";
  appointmentType: string;
  notes: string;
};

export type DemoDealSeed = {
  key: string;
  leadKey: string;
  appointmentKey?: string | null;
  daysAgo: number;
  title: string;
  contactName: string;
  dealType: "buyer" | "seller" | "listing" | "purchase" | "other";
  stage: string;
  status: "active" | "closed_won" | "closed_lost" | "paused";
  estimatedValue: number;
  closedValue?: number | null;
  commissionRevenue?: number | null;
  marketName: string;
  source: string;
  closedOffsetDays?: number | null;
  notes: string;
};

const demoLeadSeeds: DemoLeadSeed[] = [
  {
    key: "mia-seller-prev-1",
    daysAgo: 23,
    source: "google_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Google Ads",
    firstName: "Sophia",
    lastName: "Bennett",
    email: "sophia.bennett@demo.com",
    phone: "305-555-1011",
    status: "qualified",
    estimatedValue: 26500,
    notes: "Luxury condo seller from Brickell looking to list within 30 days.",
  },
  {
    key: "austin-buyer-prev-1",
    daysAgo: 22,
    source: "zillow_flex",
    serviceType: "Buyer Leads",
    marketingAccount: "Zillow Flex",
    firstName: "Mason",
    lastName: "Turner",
    email: "mason.turner@demo.com",
    phone: "512-555-1883",
    status: "qualified",
    estimatedValue: 17800,
    notes: "Relocation buyer targeting Austin Central and Mueller.",
  },
  {
    key: "toronto-buyer-prev-1",
    daysAgo: 21,
    source: "meta_ads",
    serviceType: "Buyer Leads",
    marketingAccount: "Meta Ads",
    firstName: "Amelia",
    lastName: "Chen",
    email: "amelia.chen@demo.com",
    phone: "416-555-2321",
    status: "engaged",
    estimatedValue: 15200,
    notes: "Townhome buyer lead in Toronto West with financing questions.",
  },
  {
    key: "mia-investor-prev-1",
    daysAgo: 19,
    source: "referral",
    serviceType: "Investor Leads",
    marketingAccount: "Google Ads",
    firstName: "Lucas",
    lastName: "King",
    email: "lucas.king@demo.com",
    phone: "305-555-4402",
    status: "qualified",
    estimatedValue: 31000,
    notes: "Investor lead evaluating a duplex acquisition near Coconut Grove.",
  },
  {
    key: "austin-seller-prev-1",
    daysAgo: 18,
    source: "google_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Google Ads",
    firstName: "Harper",
    lastName: "Brooks",
    email: "harper.brooks@demo.com",
    phone: "512-555-8201",
    status: "qualified",
    estimatedValue: 22400,
    notes: "Seller lead preparing a listing launch in Clarksville.",
  },
  {
    key: "toronto-seller-prev-1",
    daysAgo: 16,
    source: "meta_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Meta Ads",
    firstName: "Noah",
    lastName: "Patel",
    email: "noah.patel@demo.com",
    phone: "416-555-8765",
    status: "qualified",
    estimatedValue: 19100,
    notes: "Seller lead in Toronto West, cautious on timing and pricing.",
  },
  {
    key: "mia-seller-current-1",
    daysAgo: 12,
    source: "google_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Google Ads",
    firstName: "Olivia",
    lastName: "Foster",
    email: "olivia.foster@demo.com",
    phone: "305-555-9901",
    status: "qualified",
    estimatedValue: 28600,
    notes: "High-intent Miami seller asking for pricing strategy and media plan.",
  },
  {
    key: "mia-buyer-current-1",
    daysAgo: 11,
    source: "zillow_flex",
    serviceType: "Buyer Leads",
    marketingAccount: "Zillow Flex",
    firstName: "Ethan",
    lastName: "Ross",
    email: "ethan.ross@demo.com",
    phone: "305-555-7210",
    status: "engaged",
    estimatedValue: 16800,
    notes: "Buyer lead comparing inventory in Edgewater and Midtown.",
  },
  {
    key: "austin-buyer-current-1",
    daysAgo: 10,
    source: "meta_ads",
    serviceType: "Buyer Leads",
    marketingAccount: "Meta Ads",
    firstName: "Chloe",
    lastName: "Jenkins",
    email: "chloe.jenkins@demo.com",
    phone: "512-555-6541",
    status: "qualified",
    estimatedValue: 14400,
    notes: "Austin relocation buyer with strong lead quality but slow scheduling.",
  },
  {
    key: "toronto-buyer-current-1",
    daysAgo: 8,
    source: "meta_ads",
    serviceType: "Buyer Leads",
    marketingAccount: "Meta Ads",
    firstName: "Liam",
    lastName: "Santos",
    email: "liam.santos@demo.com",
    phone: "416-555-4401",
    status: "new",
    estimatedValue: 13100,
    notes: "New Toronto condo buyer lead still waiting for first response.",
  },
  {
    key: "austin-seller-current-1",
    daysAgo: 7,
    source: "google_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Google Ads",
    firstName: "Ella",
    lastName: "Ramirez",
    email: "ella.ramirez@demo.com",
    phone: "512-555-3119",
    status: "qualified",
    estimatedValue: 24800,
    notes: "Seller lead in Austin Central close to appointment but undecided on launch timing.",
  },
  {
    key: "toronto-seller-current-1",
    daysAgo: 5,
    source: "meta_ads",
    serviceType: "Seller Leads",
    marketingAccount: "Meta Ads",
    firstName: "Henry",
    lastName: "Wong",
    email: "henry.wong@demo.com",
    phone: "416-555-2190",
    status: "engaged",
    estimatedValue: 17300,
    notes: "Seller lead in Toronto West with delayed appointment follow-up.",
  },
  {
    key: "mia-investor-current-1",
    daysAgo: 4,
    source: "referral",
    serviceType: "Investor Leads",
    marketingAccount: "Google Ads",
    firstName: "Grace",
    lastName: "Mills",
    email: "grace.mills@demo.com",
    phone: "305-555-8122",
    status: "qualified",
    estimatedValue: 32700,
    notes: "Referral investor lead with immediate purchase timeline in Miami.",
  },
  {
    key: "austin-buyer-current-2",
    daysAgo: 2,
    source: "zillow_flex",
    serviceType: "Buyer Leads",
    marketingAccount: "Zillow Flex",
    firstName: "Jack",
    lastName: "Nelson",
    email: "jack.nelson@demo.com",
    phone: "512-555-4200",
    status: "new",
    estimatedValue: 13900,
    notes: "New Austin buyer inquiry with no appointment booked yet.",
  },
];

const demoAppointmentSeeds: DemoAppointmentSeed[] = [
  {
    key: "mia-prev-1",
    leadKey: "mia-seller-prev-1",
    daysAgo: 22,
    scheduledOffsetDays: 1,
    status: "completed",
    appointmentType: "listing_consultation",
    notes: "Completed pricing and prep consultation.",
  },
  {
    key: "austin-prev-1",
    leadKey: "austin-buyer-prev-1",
    daysAgo: 21,
    scheduledOffsetDays: 2,
    status: "completed",
    appointmentType: "buyer_consultation",
    notes: "Completed relocation buyer consult.",
  },
  {
    key: "mia-prev-2",
    leadKey: "mia-investor-prev-1",
    daysAgo: 18,
    scheduledOffsetDays: 1,
    status: "completed",
    appointmentType: "investment_consultation",
    notes: "Investor strategy session completed quickly after referral intake.",
  },
  {
    key: "austin-prev-2",
    leadKey: "austin-seller-prev-1",
    daysAgo: 17,
    scheduledOffsetDays: 1,
    status: "completed",
    appointmentType: "listing_consultation",
    notes: "Seller meeting completed and listing prep started.",
  },
  {
    key: "toronto-prev-1",
    leadKey: "toronto-seller-prev-1",
    daysAgo: 15,
    scheduledOffsetDays: 2,
    status: "booked",
    appointmentType: "listing_consultation",
    notes: "Booked, but momentum slowed after pricing hesitation.",
  },
  {
    key: "mia-current-1",
    leadKey: "mia-seller-current-1",
    daysAgo: 11,
    scheduledOffsetDays: 1,
    status: "completed",
    appointmentType: "listing_consultation",
    notes: "Miami seller consult completed and photography timeline discussed.",
  },
  {
    key: "austin-current-1",
    leadKey: "austin-buyer-current-1",
    daysAgo: 9,
    scheduledOffsetDays: 2,
    status: "booked",
    appointmentType: "buyer_consultation",
    notes: "Booked, but follow-up quality still needs work after the call.",
  },
  {
    key: "toronto-current-1",
    leadKey: "toronto-seller-current-1",
    daysAgo: 4,
    scheduledOffsetDays: 3,
    status: "scheduled",
    appointmentType: "listing_consultation",
    notes: "Scheduled, but not yet confirmed.",
  },
  {
    key: "mia-current-2",
    leadKey: "mia-investor-current-1",
    daysAgo: 3,
    scheduledOffsetDays: 1,
    status: "completed",
    appointmentType: "investment_consultation",
    notes: "Investor consult completed and acquisition criteria defined.",
  },
];

const demoDealSeeds: DemoDealSeed[] = [
  {
    key: "mia-closed-prev-1",
    leadKey: "mia-seller-prev-1",
    appointmentKey: "mia-prev-1",
    daysAgo: 20,
    title: "Bennett Brickell listing",
    contactName: "Sophia Bennett",
    dealType: "listing",
    stage: "closed",
    status: "closed_won",
    estimatedValue: 950000,
    closedValue: 950000,
    commissionRevenue: 28500,
    marketName: "Miami Waterfront",
    source: "google_ads",
    closedOffsetDays: 18,
    notes: "Strong seller close with healthy commission yield.",
  },
  {
    key: "austin-closed-prev-1",
    leadKey: "austin-buyer-prev-1",
    appointmentKey: "austin-prev-1",
    daysAgo: 18,
    title: "Turner relocation purchase",
    contactName: "Mason Turner",
    dealType: "purchase",
    stage: "closed",
    status: "closed_won",
    estimatedValue: 740000,
    closedValue: 740000,
    commissionRevenue: 22200,
    marketName: "Austin Central",
    source: "zillow_flex",
    closedOffsetDays: 16,
    notes: "Buyer relocation close completed efficiently.",
  },
  {
    key: "mia-active-prev-1",
    leadKey: "mia-investor-prev-1",
    appointmentKey: "mia-prev-2",
    daysAgo: 17,
    title: "King duplex acquisition",
    contactName: "Lucas King",
    dealType: "buyer",
    stage: "offer_preparation",
    status: "active",
    estimatedValue: 820000,
    marketName: "Miami Waterfront",
    source: "referral",
    notes: "Investor lead progressing with strong intent.",
  },
  {
    key: "austin-active-prev-1",
    leadKey: "austin-seller-prev-1",
    appointmentKey: "austin-prev-2",
    daysAgo: 16,
    title: "Brooks Clarksville listing",
    contactName: "Harper Brooks",
    dealType: "listing",
    stage: "pricing_strategy",
    status: "active",
    estimatedValue: 930000,
    marketName: "Austin Central",
    source: "google_ads",
    notes: "Listing opportunity with high pipeline value and clear next steps.",
  },
  {
    key: "toronto-active-prev-1",
    leadKey: "toronto-seller-prev-1",
    appointmentKey: "toronto-prev-1",
    daysAgo: 14,
    title: "Patel Toronto listing",
    contactName: "Noah Patel",
    dealType: "listing",
    stage: "listing_preparation",
    status: "active",
    estimatedValue: 980000,
    marketName: "Toronto West",
    source: "meta_ads",
    notes: "Pipeline is present, but progression is lagging and commission has not materialized.",
  },
  {
    key: "mia-active-current-1",
    leadKey: "mia-seller-current-1",
    appointmentKey: "mia-current-1",
    daysAgo: 10,
    title: "Foster waterfront listing",
    contactName: "Olivia Foster",
    dealType: "listing",
    stage: "pricing_strategy",
    status: "active",
    estimatedValue: 1250000,
    marketName: "Miami Waterfront",
    source: "google_ads",
    notes: "Large Miami opportunity increasing overall pipeline value.",
  },
  {
    key: "austin-active-current-1",
    leadKey: "austin-buyer-current-1",
    appointmentKey: "austin-current-1",
    daysAgo: 8,
    title: "Jenkins relocation search",
    contactName: "Chloe Jenkins",
    dealType: "buyer",
    stage: "offer_preparation",
    status: "active",
    estimatedValue: 670000,
    marketName: "Austin Central",
    source: "meta_ads",
    notes: "Opportunity is alive, but conversion from appointment still feels fragile.",
  },
  {
    key: "toronto-active-current-1",
    leadKey: "toronto-seller-current-1",
    appointmentKey: "toronto-current-1",
    daysAgo: 4,
    title: "Wong Toronto West listing",
    contactName: "Henry Wong",
    dealType: "listing",
    stage: "appointment_completed",
    status: "active",
    estimatedValue: 1100000,
    marketName: "Toronto West",
    source: "meta_ads",
    notes: "Toronto pipeline is building, but close velocity remains soft.",
  },
  {
    key: "mia-closed-current-1",
    leadKey: "mia-investor-current-1",
    appointmentKey: "mia-current-2",
    daysAgo: 3,
    title: "Mills Miami acquisition",
    contactName: "Grace Mills",
    dealType: "purchase",
    stage: "closed",
    status: "closed_won",
    estimatedValue: 890000,
    closedValue: 890000,
    commissionRevenue: 26700,
    marketName: "Miami Waterfront",
    source: "referral",
    closedOffsetDays: 1,
    notes: "Fast referral-driven close supporting Miami performance.",
  },
];

export function buildDefaultLeadSeeds() {
  return demoLeadSeeds;
}

export function buildDefaultAppointmentSeeds() {
  return demoAppointmentSeeds;
}

export function buildDefaultDealSeeds() {
  return demoDealSeeds;
}

export function buildDefaultCampaignSnapshots(marketingAccountIds: string[]) {
  const accountMap = {
    google: marketingAccountIds[0],
    meta: marketingAccountIds[1],
    zillow: marketingAccountIds[2],
  };

  const weeklyScenario = [
    { daysBack: 35, google: [2400, 22, 7, 18200], meta: [1800, 18, 6, 13100], zillow: [900, 10, 5, 14200] },
    { daysBack: 28, google: [2500, 23, 7, 18800], meta: [1950, 19, 6, 12900], zillow: [940, 11, 5, 14900] },
    { daysBack: 21, google: [2600, 24, 7, 19000], meta: [2100, 20, 5, 12400], zillow: [980, 11, 4, 14500] },
    { daysBack: 14, google: [2700, 24, 6, 17600], meta: [2250, 21, 5, 11800], zillow: [1050, 12, 4, 13800] },
    { daysBack: 7, google: [2850, 23, 6, 17000], meta: [2450, 20, 4, 9800], zillow: [1100, 11, 3, 12100] },
    { daysBack: 0, google: [2950, 24, 6, 16800], meta: [2600, 19, 3, 8400], zillow: [1160, 10, 3, 11000] },
  ];

  return weeklyScenario.flatMap((week) => {
    const snapshotDate = subDays(new Date(), week.daysBack).toISOString().slice(0, 10);

    return [
      {
        marketing_account_id: accountMap.google,
        snapshot_date: snapshotDate,
        spend: week.google[0],
        impressions: 26500 + week.daysBack * 55,
        clicks: 840 + Math.round(week.google[1] * 11),
        leads: week.google[1],
        booked_jobs: week.google[2],
        revenue: week.google[3],
      },
      {
        marketing_account_id: accountMap.meta,
        snapshot_date: snapshotDate,
        spend: week.meta[0],
        impressions: 23200 + week.daysBack * 62,
        clicks: 690 + Math.round(week.meta[1] * 9),
        leads: week.meta[1],
        booked_jobs: week.meta[2],
        revenue: week.meta[3],
      },
      {
        marketing_account_id: accountMap.zillow,
        snapshot_date: snapshotDate,
        spend: week.zillow[0],
        impressions: 9100 + week.daysBack * 18,
        clicks: 240 + Math.round(week.zillow[1] * 8),
        leads: week.zillow[1],
        booked_jobs: week.zillow[2],
        revenue: week.zillow[3],
      },
    ].filter((snapshot) => Boolean(snapshot.marketing_account_id));
  });
}

export function buildDefaultInsights() {
  return [
    {
      title: "Toronto West is building pipeline without closings",
      body: "Toronto West has meaningful active deal value, but recent closed commission is still flat. That makes it the clearest market drag in the current story.",
      category: "pipeline",
      severity: "warning",
    },
    {
      title: "Lead volume is holding while appointment creation softens",
      body: "Top-of-funnel demand remains healthy, but fewer leads are converting into booked conversations. Follow-up quality is the main pressure point to review next.",
      category: "conversion",
      severity: "warning",
    },
  ];
}

export function buildDefaultRecommendations() {
  return [
    {
      title: "Tighten follow-up on Meta and Toronto leads",
      body: "Lead flow is not the problem. The immediate gain is in faster handoff, better appointment confirmation, and stronger qualification in Toronto West.",
      category: "sales",
      priority: "high",
      status: "open",
    },
    {
      title: "Protect Miami close velocity while pipeline grows",
      body: "Miami is carrying the strongest commission output. Keep late-stage execution tight so growing pipeline converts into real revenue.",
      category: "operations",
      priority: "medium",
      status: "open",
    },
  ];
}

export function buildDefaultHealthScores() {
  return [
    {
      category: "lead-efficiency",
      score: 76,
      summary: "Lead volume is healthy, but appointment efficiency has softened in the current window.",
    },
    {
      category: "deal-conversion",
      score: 68,
      summary: "Pipeline is growing, but close progression is uneven across markets, especially in Toronto West.",
    },
  ];
}
