import { getMetaDeletionPublicStatus } from "@/lib/services/meta-deletion-service";

export const metadata = {
  title: "Data Deletion Instructions | DealFlow OS",
  description: "How to request deletion of DealFlow OS account, workspace, and lead data.",
};

export const dynamic = "force-dynamic";

const supportEmail = "raiaan@scaleholdings.co";

const statusCopy = {
  operator_required: {
    label: "Received — operator review required",
    detail: "The signed request is recorded. No deletion or anonymization is represented as complete.",
  },
  in_progress: {
    label: "In progress",
    detail: "An authorized operator is reconciling the request. Completion is not yet represented.",
  },
  completed: {
    label: "Completed",
    detail: "The request ledger records completion by the authorized privacy workflow.",
  },
  rejected: {
    label: "Rejected",
    detail: "The request could not be completed. Contact support with the confirmation code for review.",
  },
} as const;

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const requestedCode = (await searchParams).code;
  const code = typeof requestedCode === "string" ? requestedCode.trim().toLowerCase() : "";
  let status: Awaited<ReturnType<typeof getMetaDeletionPublicStatus>> = null;
  let lookupUnavailable = false;
  if (code) {
    try {
      status = await getMetaDeletionPublicStatus({ confirmationCode: code });
    } catch {
      lookupUnavailable = true;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-white">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Data Deletion Instructions</h1>
      <p className="mt-3 text-sm text-white/60">Last updated: July 11, 2026</p>

      <div className="surface-guided mt-10 space-y-8 rounded-df-panel border border-white/10 p-6 leading-7 text-white/75 shadow-df-elevated sm:p-8">
        {code ? (
          <section aria-live="polite" className="rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5">
            <h2 className="text-xl font-semibold text-white">Meta request status</h2>
            {status ? (
              <>
                <p className="mt-3 font-semibold text-sky-200">{statusCopy[status.status].label}</p>
                <p className="mt-2">{statusCopy[status.status].detail}</p>
                <p className="mt-3 text-sm text-white/60">
                  Confirmation code: <span className="font-mono text-white/80">{status.confirmationCode}</span>
                </p>
              </>
            ) : (
              <p className="mt-3">
                {lookupUnavailable
                  ? "Request status is temporarily unavailable. No completion is inferred."
                  : "No request matches this confirmation code. Check the exact code returned by Meta."}
              </p>
            )}
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold text-white">How To Request Deletion</h2>
          <p className="mt-3">
            To request deletion of your DealFlow OS account, workspace, campaign, integration, or
            lead data, email{" "}
            <a className="text-sky-300 underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>{" "}
            with the subject line “Data Deletion Request”.
          </p>
          <p className="mt-3">
            Include the email address associated with your account, your workspace or business name
            if known, and a short description of the data you want deleted.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">What Happens Next</h2>
          <p className="mt-3">
            We will verify that you are authorized to make the request, review the affected records,
            and confirm completion or provide a status update. Some records may be retained where
            required for billing, fraud prevention, security, legal obligations, backups, dispute
            resolution, or operational recovery.
          </p>
          <p className="mt-3">
            A received request is not automatically executed. DealFlow does not claim a completion
            time until an owner-approved privacy procedure and retention policy have been applied.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">Connected Providers</h2>
          <p className="mt-3">
            If your workspace uses connected providers such as Meta, Stripe, Twilio, Supabase,
            Vercel, or OpenAI, we may need to retain limited operational records or direct you to
            provider-specific deletion controls for data held independently by those providers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">Questions</h2>
          <p className="mt-3">
            For privacy, export, correction, or deletion questions, contact{" "}
            <a className="text-sky-300 underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
