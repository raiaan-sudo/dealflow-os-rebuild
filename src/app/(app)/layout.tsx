import { cookies, headers } from "next/headers";
import Link from "next/link";
import { Settings } from "lucide-react";
import { AppSidebar } from "@/components/layout/sidebar";
import { GuidedFlowBanner } from "@/components/layout/guided-flow-banner";
import { TopBar } from "@/components/layout/top-bar";
import { SupportWidget } from "@/components/layout/support-widget";
import { LeadCaptureTrigger } from "@/components/layout/lead-capture-trigger";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { isInternalAdminEmail } from "@/lib/env";
import { ACTIVE_CAMPAIGN_COOKIE } from "@/lib/paywall-access";
import { getAppContext } from "@/lib/services/app-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getInitials } from "@/lib/utils";
import type { CampaignExperienceStage } from "@/lib/services/campaign-plan-service";

function getStageForPath(pathname: string): CampaignExperienceStage {
  if (pathname.startsWith("/preview")) return "preview";
  if (pathname.startsWith("/launch")) return "launch_ready";
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/results")) return "live";
  if (pathname.startsWith("/paywall")) return "paywall";
  if (pathname.startsWith("/builder") || pathname.startsWith("/build")) return "built";
  return "built";
}

function buildCampaignScopedHref(path: string, campaignId?: string | null) {
  if (!campaignId) {
    return path;
  }

  const params = new URLSearchParams();
  params.set("campaignId", campaignId);
  return `${path}?${params.toString()}`;
}

async function resolveOwnedActiveCampaignId(candidateCampaignId: string | null) {
  if (!candidateCampaignId) {
    return null;
  }

  const record = await getCampaignById(candidateCampaignId).catch(() => null);
  return record?.campaign.id ?? null;
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const authState = headerStore.get("x-dealflow-auth-state");
  const pathname = headerStore.get("x-pathname") ?? "";
  const activeCampaignId = await resolveOwnedActiveCampaignId(
    cookieStore.get(ACTIVE_CAMPAIGN_COOKIE)?.value ?? null,
  );
  const isFirstRunFocusRoute =
    pathname.startsWith("/campaign-built") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/build") ||
    pathname.startsWith("/builder") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/paywall");
  const appContext = await getAppContext().catch(() => null);
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

  if (isFirstRunFocusRoute) {
    if (authState === "missing_context") {
      return (
        <div className="flex h-screen w-screen overflow-hidden bg-transparent">
          <div className="flex flex-1 items-start overflow-y-auto px-6 py-10">
            <div className="surface-guided w-full rounded-[28px] border border-white/10 p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                Workspace Recovery
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                Your account is authenticated, but the workspace is still recovering.
              </h1>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                We detected a valid session without a fully hydrated workspace context. Try the guided
                boot flow again to complete profile and workspace recovery.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="/onboarding"
                  className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  Retry Recovery
                </a>
                <a
                  href="/login?reason=expired"
                  className="inline-flex h-11 items-center rounded-full border border-white/10 px-5 text-sm font-semibold text-foreground"
                >
                  Return to Login
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative min-h-screen w-screen overflow-hidden bg-transparent">
        <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-end px-4 py-3 sm:px-6">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-white/8 bg-black/40 px-2.5 py-2 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <div className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-[10px] font-semibold text-primary">
                {getInitials(userName)}
              </div>
              <div className="min-w-0">
                <p className="max-w-[150px] truncate text-xs font-semibold text-foreground">{userName}</p>
                <p className="max-w-[150px] truncate text-[10px] text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <Link
              href={buildCampaignScopedHref("/settings", activeCampaignId)}
              aria-label="Open settings"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-muted-foreground transition hover:border-primary/20 hover:bg-primary/[0.08] hover:text-foreground"
            >
              <Settings className="size-4" />
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main className="min-h-screen px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <SupportWidget activeCampaignId={activeCampaignId} />
      </div>
    );
  }

  return (
    <div className="app-shell relative flex h-screen w-screen overflow-hidden bg-transparent">
      <AppSidebar
        activeCampaignId={activeCampaignId}
        isAdmin={isAdmin}
        organizationName={organizationName}
        stage={getStageForPath(pathname)}
      />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          userName={userName}
          userEmail={userEmail}
          organizationName={organizationName}
          activeCampaignId={activeCampaignId}
        />
        <main className="flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-6">
            <div className="app-page-transition flex min-h-full min-w-0 flex-col gap-5 pb-20">
              <GuidedFlowBanner />
              {children}
            </div>
          </div>
        </main>
        <LeadCaptureTrigger defaultName="" defaultEmail="" />
        <SupportWidget activeCampaignId={activeCampaignId} />
      </div>
    </div>
  );
}
