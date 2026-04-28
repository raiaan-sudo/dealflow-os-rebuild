export const metadata = {
  title: "Privacy Policy | DealFlow OS",
  description: "Privacy Policy for DealFlow OS.",
};

const lastUpdated = "April 28, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl py-10 text-white">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-white/60">Last updated: {lastUpdated}</p>

      <div className="mt-10 space-y-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 leading-7 text-white/75 shadow-2xl shadow-black/20">
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
            submissions, billing status, and integration metadata needed to operate the product.
          </p>
          <p className="mt-3">
            When a visitor submits a lead form, we collect the information they choose to provide,
            such as name, email address, phone number, message, and related campaign context.
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
            subscription access, sync campaign state, troubleshoot errors, improve reliability, and
            provide support.
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
