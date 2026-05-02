export const metadata = {
  title: "Data Deletion Instructions | DealFlow OS",
  description: "How to request deletion of DealFlow OS account, workspace, and lead data.",
};

const supportEmail = "raiaan@scaleholdings.co";

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-white">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Data Deletion Instructions</h1>
      <p className="mt-3 text-sm text-white/60">Last updated: April 29, 2026</p>

      <div className="surface-guided mt-10 space-y-8 rounded-df-panel border border-white/10 p-6 leading-7 text-white/75 shadow-df-elevated sm:p-8">
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
