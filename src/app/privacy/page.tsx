export const metadata = {
  title: "Privacy Policy | DealFlow OS",
  description: "Privacy Policy for DealFlow OS.",
};

const lastUpdated = "April 28, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-white">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-white/60">Last updated: {lastUpdated}</p>

      <div className="surface-guided mt-10 space-y-8 rounded-df-panel border border-white/10 p-6 leading-7 text-white/75 shadow-df-elevated sm:p-8">
        <section>
          <h2 className="text-xl font-semibold text-white">1. Overview</h2>
          <p className="mt-3">
            DealFlow OS helps real estate and service businesses create campaign funnels,
            capture leads, connect advertising accounts, and review campaign performance.
            This Privacy Policy explains what information we collect, how we use it, and the
            choices available to users and visitors.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
          <p className="mt-3">
            We may collect account information such as name, email address, workspace details,
            onboarding answers, campaign settings, selected creative assets, public funnel
            submissions, billing status, optional cancellation feedback, and integration metadata
            needed to operate the product.
          </p>
          <p className="mt-3">
            When a visitor submits a lead form, we collect the information they choose to provide,
            such as name, email address, phone number, message, and related campaign context.
          </p>
          <p className="mt-3">
            If a visitor provides a phone number and checks the SMS consent box, we store the
            consent text shown, consent source, phone number, and timestamp so opt-in proof can be
            audited. We also store SMS opt-out timestamps and inbound/outbound message records
            needed to honor STOP, START, and HELP requests.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">3. Connected Services</h2>
          <p className="mt-3">
            If you connect third-party services such as Meta or Stripe, we store only the access
            details and account metadata needed to provide the requested functionality, such as ad
            account IDs, Page IDs, pixel IDs, billing session data, webhook event IDs, and launch
            status. Access tokens are stored securely and are used only to perform actions you
            initiate or authorize.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">4. How We Use Information</h2>
          <p className="mt-3">
            We use information to create and manage campaigns, generate previews and creative
            drafts, process lead submissions, prevent duplicate submissions, maintain billing and
            subscription access, understand cancellation or payment issues, sync campaign state,
            troubleshoot errors, improve reliability, and provide support. SMS information is used only to respond to the submitted request,
            maintain conversation history, document consent, and honor opt-out choices.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">5. Sharing and Disclosure</h2>
          <p className="mt-3">
            We do not sell personal information. We may share information with service providers
            that help operate DealFlow OS, including hosting, database, authentication, payment,
            analytics, AI generation, and advertising integration providers. We may also disclose
            information if required by law, to protect users, or to prevent abuse.
          </p>
          <p className="mt-3">
            We do not sell or share SMS consent data, phone numbers, or opt-in records with third
            parties for their independent marketing. We may share data with service providers such
            as Twilio, Stripe, Supabase, Vercel, Meta, OpenAI, analytics, security, and
            infrastructure vendors only to operate DealFlow OS.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
          <p className="mt-3">
            We retain account, campaign, billing, integration, and lead information for as long as
            needed to provide the service, comply with legal obligations, resolve disputes, and
            maintain operational records. Users may request deletion of their data, subject to
            legal, security, and operational retention requirements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">7. Security</h2>
          <p className="mt-3">
            We use reasonable administrative, technical, and organizational safeguards to protect
            information. No online service can guarantee absolute security, but we work to limit
            access, protect sensitive credentials, and monitor reliability issues.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">8. Your Choices</h2>
          <p className="mt-3">
            You may request access, correction, deletion, or export of your information. You may
            disconnect third-party integrations where supported, and you may stop using public lead
            forms or campaign pages at any time.
          </p>
          <p className="mt-3">
            You may request access, correction, export, or deletion of your account/workspace data
            by contacting support. Some records may be retained where required for billing, fraud
            prevention, security, legal obligations, backups, dispute resolution, or operational
            recovery.
          </p>
          <p className="mt-3">
            SMS recipients can reply STOP to opt out, START to resume messages, or HELP for help.
            Message and data rates may apply. Opt-out records may be retained as needed to prevent
            future unauthorized messaging.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white">9. Contact</h2>
          <p className="mt-3">
            For privacy questions or data requests, contact us at{" "}
            <a className="text-sky-300 underline" href="mailto:raiaan@scaleholdings.co">
              raiaan@scaleholdings.co
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
