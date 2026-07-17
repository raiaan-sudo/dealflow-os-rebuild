import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { WorkspaceSelectionForm } from "@/components/workspace/workspace-selection-form";
import {
  localizeProductHref,
  parseProductLocalePathname,
} from "@/lib/i18n/routing";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  listWorkspaceOptions,
  sanitizeWorkspaceReturnTo,
} from "@/lib/services/workspace-selection-service";

export const metadata: Metadata = { title: "Select workspace" };

export default async function WorkspaceSelectionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headerStore = await headers();
  const parsedPath = parseProductLocalePathname(
    headerStore.get("x-pathname") ?? "/workspace/select",
  );
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawReturnTo = resolvedSearchParams?.returnTo;
  const returnTo = localizeProductHref(
    sanitizeWorkspaceReturnTo(typeof rawReturnTo === "string" ? rawReturnTo : undefined),
    parsedPath.locale,
  );
  const supabase = await createRouteHandlerClient();
  if (!supabase) {
    redirect(localizeProductHref("/login?reason=expired", parsedPath.locale));
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizeProductHref("/login?reason=expired", parsedPath.locale));
  }
  const options = await listWorkspaceOptions(supabase, user.id);

  return (
    <>
      <a className="df-skip-link" href="#workspace-selection">
        Skip to workspace selection
      </a>
      <main
        id="workspace-selection"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6"
      >
        <section className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
          <div className="flex justify-end">
            <LocaleSwitcher compact />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            DealFlow access
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            Choose your workspace
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Your account belongs to more than one workspace. Select the one you want to open.
          </p>
          <div className="mt-7">
            {options.length > 0 ? (
              <WorkspaceSelectionForm options={options} returnTo={returnTo} />
            ) : (
              <p
                role="alert"
                className="rounded-[16px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"
              >
                No active workspace membership is available for this account. Contact support.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
