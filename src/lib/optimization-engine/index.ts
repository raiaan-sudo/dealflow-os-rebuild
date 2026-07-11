export type CampaignInput = {
  audience: "buyer" | "seller" | "investor" | "precon" | "luxury";
  location: string;
  budget: number;
  offer: string;
};

export * from "@/lib/optimization-engine/kpi";
export * from "@/lib/optimization-engine/rules";
export * from "@/lib/optimization-engine/decision";
export * from "@/lib/optimization-engine/funnel";
export * from "@/lib/optimization-engine/media-buying-rules";
export * from "@/lib/optimization-engine/creative";
export * from "@/lib/optimization-engine/campaign";
export * from "@/lib/optimization-engine/safety-policy";
