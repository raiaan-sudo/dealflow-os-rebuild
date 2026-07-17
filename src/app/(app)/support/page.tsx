import { PageHeader } from "@/components/app/page-header";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getRequestProductI18n } from "@/lib/i18n/server";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  listSupportTickets,
  type SupportTicketSummary,
} from "@/lib/services/support-ticket-service";

function ticketStatusLabel(
  status: SupportTicketSummary["status"],
  t: Awaited<ReturnType<typeof getRequestProductI18n>>["t"],
) {
  if (status === "in_progress") return t("support.statusInProgress");
  if (status === "resolved") return t("support.statusResolved");
  if (status === "closed") return t("support.statusClosed");
  return t("support.statusOpen");
}

function notificationStatusLabel(
  status: SupportTicketSummary["operatorNotificationStatus"],
  t: Awaited<ReturnType<typeof getRequestProductI18n>>["t"],
) {
  if (status === "delivered") return t("support.notificationDelivered");
  if (status === "failed" || status === "operator_action_required") {
    return t("support.notificationNeedsAttention");
  }
  if (status === "unavailable") return t("support.notificationUnavailable");
  return t("support.notificationPending");
}

export default async function SupportPage() {
  const { dateTime, t } = await getRequestProductI18n();
  const auth = await getAuthenticatedContext();
  const tickets = await listSupportTickets({
    supabase: auth.supabase,
    organizationId: auth.organizationId,
    userId: auth.userId,
  }).catch(() => null);
  return (
    <PageShell>
      <PageHeader
        eyebrow={t("support.title")}
        title={t("support.headerTitle")}
        description={t("support.headerDescription")}
        guidance={t("support.guidance")}
      />
      <Card className="p-5 sm:p-7">
        <SupportTicketForm />
      </Card>
      <Card className="p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-foreground">{t("support.historyTitle")}</h2>
        {tickets === null ? (
          <p className="mt-3 text-sm text-amber-200">{t("support.historyUnavailable")}</p>
        ) : tickets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("support.historyEmpty")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/8">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{ticket.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("support.reference", { reference: ticket.reference })} · {dateTime(ticket.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-foreground">
                    {ticketStatusLabel(ticket.status, t)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("support.notificationStatus")}: {notificationStatusLabel(ticket.operatorNotificationStatus, t)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
