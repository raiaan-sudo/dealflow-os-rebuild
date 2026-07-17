import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/sidebar";
import { GuidedFlowBanner } from "@/components/layout/guided-flow-banner";
import { TopBar } from "@/components/layout/top-bar";
import { FeedbackWidget } from "@/components/layout/feedback-widget";
import { LeadCaptureTrigger } from "@/components/layout/lead-capture-trigger";
import { GhlEmbedCapabilityRefresher } from "@/components/ghl/ghl-embed-capability-refresher";
import { LocaleLink } from "@/components/i18n/locale-link";
import { isInternalAdminEmail } from "@/lib/env";
import { translateProductMessage } from "@/lib/i18n/messages";
import {
  localizeProductHref,
  parseProductLocalePathname,
} from "@/lib/i18n/routing";
import {
  getAppContext,
  WorkspaceSelectionDeniedError,
  WorkspaceSelectionRequiredError,
} from "@/lib/services/app-context";
import { listCurrentUserWorkspaceOptions } from "@/lib/services/workspace-selection-service";
import {
  DEFAULT_WORKSPACE_BRANDING,
  loadWorkspaceBranding,
} from "@/lib/white-label/workspace-branding";

function SkipToMainContent({ label }: { label: string }) {
  return (
    <a className="df-skip-link" href="#main-content">
      {label}
    </a>
  );
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const locale = parseProductLocalePathname(pathname).locale;
  const t = (key: Parameters<typeof translateProductMessage>[1]) =>
    translateProductMessage(locale, key);
  const embedParentOrigin = headerStore.get("x-dealflow-ghl-embed-parent-origin");
  const isFocusedProductRoute =
    pathname.startsWith("/builder") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/campaign-built");
  let appContext: Awaited<ReturnType<typeof getAppContext>> = null;
  try {
    appContext = await getAppContext();
  } catch (error) {
    if (
      error instanceof WorkspaceSelectionRequiredError ||
      error instanceof WorkspaceSelectionDeniedError
    ) {
      const selector = localizeProductHref("/workspace/select", locale);
      redirect(`${selector}?returnTo=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }
  const workspaceOptions = appContext
    ? await listCurrentUserWorkspaceOptions().catch(() => [])
    : [];
  const branding = appContext
    ? await loadWorkspaceBranding(appContext.organization.id).catch(
        () => DEFAULT_WORKSPACE_BRANDING,
      )
    : DEFAULT_WORKSPACE_BRANDING;
  const isAdmin = isInternalAdminEmail(appContext?.user.email ?? appContext?.profile?.email ?? null);
  const organizationName =
    appContext?.organization.name?.trim() ||
    appContext?.businessProfile?.business_name?.trim() ||
    "DealFlow Workspace";
  const userName =
    appContext?.profile?.full_name?.trim() ||
    appContext?.user.email?.split("@")[0] ||
    "Workspace User";
  const userEmail =
    appContext?.profile?.email?.trim() ||
    appContext?.user.email?.trim() ||
    "workspace@dealflow.local";

  if (isFocusedProductRoute) {
    if (!appContext) {
      return (
        <>
          <GhlEmbedCapabilityRefresher parentOrigin={embedParentOrigin} />
          <SkipToMainContent label={t("common.skip.main")} />
          <div className="flex h-screen w-screen overflow-hidden bg-transparent">
            <main
              id="main-content"
              tabIndex={-1}
              className="flex flex-1 items-start overflow-y-auto px-6 py-10"
            >
              <div className="surface-guided w-full rounded-[28px] border border-white/10 p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                  {t("workspace.recovery.eyebrow")}
                </p>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                  {t("workspace.recovery.title")}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {t("workspace.recovery.body")}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <LocaleLink
                    href="/onboarding"
                    className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
                  >
                    {t("workspace.recovery.retry")}
                  </LocaleLink>
                  <LocaleLink
                    href="/login?reason=expired"
                    className="inline-flex h-11 items-center rounded-full border border-white/10 px-5 text-sm font-semibold text-foreground"
                  >
                    {t("workspace.recovery.login")}
                  </LocaleLink>
                </div>
              </div>
            </main>
          </div>
        </>
      );
    }

    return (
      <>
        <GhlEmbedCapabilityRefresher parentOrigin={embedParentOrigin} />
        <SkipToMainContent label={t("common.skip.main")} />
        <div className="relative min-h-screen w-screen overflow-hidden bg-transparent">
          {branding.isWhiteLabel ? (
            <div className="border-b border-white/8 px-5 py-3 text-sm sm:px-6 lg:px-8">
              <span className="font-semibold" style={{ color: branding.primaryColor }}>
                {branding.productName}
              </span>
              {branding.poweredByDealFlow ? (
                <span className="ml-2 text-xs text-muted-foreground">{t("shell.poweredBy")}</span>
              ) : null}
            </div>
          ) : null}
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-screen px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
          >
            {children}
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <GhlEmbedCapabilityRefresher parentOrigin={embedParentOrigin} />
      <SkipToMainContent label={t("common.skip.main")} />
      <div className="app-shell relative flex h-screen w-screen overflow-hidden bg-transparent">
        <AppSidebar
          isAdmin={isAdmin}
          organizationName={organizationName}
          stage="built"
          productName={branding.productName}
          brandName={branding.brandName}
          brandPrimaryColor={branding.primaryColor}
          isWhiteLabel={branding.isWhiteLabel}
          poweredByDealFlow={branding.poweredByDealFlow}
        />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            userName={userName}
            userEmail={userEmail}
            organizationName={organizationName}
            productName={branding.productName}
            currentOrganizationId={appContext?.organization.id ?? null}
            workspaceOptions={workspaceOptions}
          />
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-6">
              <div className="app-page-transition flex min-h-full flex-col gap-6 pb-24 sm:pb-0">
                <GuidedFlowBanner />
                {children}
              </div>
            </div>
          </main>
          <LeadCaptureTrigger defaultName="" defaultEmail="" />
          <FeedbackWidget />
        </div>
      </div>
    </>
  );
}
