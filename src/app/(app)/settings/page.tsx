import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Workspace configuration is currently managed through onboarding, integrations, and billing flows."
        guidance="This page exists so the workspace settings entry point never dead-ends during launch validation."
      />

      <Card className="p-5 sm:p-7">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">No direct settings changes are required right now.</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Use Build to update campaign inputs, Go Live to connect Meta assets, and the billing gate to manage
            launch access. Operator-only launch visibility remains available in the internal monitor.
          </p>
        </div>
      </Card>
    </div>
  );
}
