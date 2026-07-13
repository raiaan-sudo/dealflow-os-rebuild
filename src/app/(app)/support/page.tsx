import { PageHeader } from "@/components/app/page-header";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getRequestProductI18n } from "@/lib/i18n/server";

export default async function SupportPage() {
  const { t } = await getRequestProductI18n();
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
    </PageShell>
  );
}
