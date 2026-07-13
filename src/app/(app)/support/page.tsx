import { PageHeader } from "@/components/app/page-header";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";

export default function SupportPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Support"
        title="Get help without losing your place"
        description="Record a product question or blocker with a durable reference tied to this workspace."
        guidance="Submitting this form records the request immediately. External notification delivery remains governed by the configured support policy."
      />
      <Card className="p-5 sm:p-7">
        <SupportTicketForm />
      </Card>
    </PageShell>
  );
}
