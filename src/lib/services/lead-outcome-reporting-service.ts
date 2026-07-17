import "server-only";

import type { LeadOutcomePortfolio } from "@/lib/integrations/meta/reporting-portfolio-contract";
import { createClient } from "@/lib/supabase/server";

export async function getLeadOutcomePortfolioForCampaign(
  campaignId: string | null,
): Promise<LeadOutcomePortfolio> {
  if (!campaignId) return null;
  const client = await createClient();
  if (!client) return null;
  const [leadCountResult, outcomesResult] = await Promise.all([
    (client as any)
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId),
    (client as any)
      .from("lead_outcome_current")
      .select("outcome_type,updated_at")
      .eq("campaign_id", campaignId),
  ]);
  if (leadCountResult.error || outcomesResult.error) return null;
  const outcomes = Array.isArray(outcomesResult.data) ? outcomesResult.data : [];
  const count = (...types: string[]) => outcomes.filter((row: Record<string, unknown>) =>
    typeof row.outcome_type === "string" && types.includes(row.outcome_type)).length;
  const timestamps = outcomes
    .map((row: Record<string, unknown>) => typeof row.updated_at === "string" ? row.updated_at : null)
    .filter((value: string | null): value is string => Boolean(value && Number.isFinite(Date.parse(value))));
  return {
    capturedLeads: Number(leadCountResult.count ?? 0),
    conversations: count("replied", "conversation_started"),
    appointments: count("appointment_booked", "appointment_attended"),
    qualified: count("qualified"),
    closedWon: count("closed_won"),
    latestReceivedAt: timestamps.sort().at(-1) ?? null,
  };
}
