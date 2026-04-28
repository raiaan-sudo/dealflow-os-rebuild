export const metadata = {
  title: "Terms of Service | DealFlow OS",
  description: "Terms of Service for DealFlow OS.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16 text-slate-100">
      <section className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
        <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-slate-400">Last updated: April 28, 2026</p>
        <p className="text-slate-300">
          These terms govern access to DealFlow OS, including campaign creation, lead capture,
          advertising workflow tools, billing, and integrations with third-party providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Use Of The Service</h2>
        <p className="text-slate-300">
          You are responsible for the accuracy of campaign content, offers, targeting inputs,
          advertising claims, consent language, and follow-up practices used in your workspace.
          You may not use the service for unlawful, deceptive, discriminatory, or abusive activity.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Advertising And Integrations</h2>
        <p className="text-slate-300">
          DealFlow OS can help prepare and launch advertising workflows through connected
          providers such as Meta. You remain responsible for complying with each provider&apos;s terms,
          ad policies, special ad category rules, billing requirements, and account permissions.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-slate-300">
          Paid plans and subscription access are processed through Stripe. Subscription access may
          be limited, suspended, or cancelled if payment fails, a subscription ends, or account use
          violates these terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Lead Capture And Messaging</h2>
        <p className="text-slate-300">
          If you collect leads or send messages through DealFlow OS, you are responsible for
          obtaining required consent, honoring opt-outs, and following applicable privacy,
          telemarketing, SMS, email, and advertising laws.
        </p>
        <p className="text-slate-300">
          SMS may only be used for leads that gave explicit consent through an approved form or
          equivalent compliant process. Message frequency varies. Message and data rates may apply.
          Recipients can reply STOP to opt out, START to resume, or HELP for help. You may not
          upload, message, or automate outreach to numbers without valid consent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">No Guaranteed Results</h2>
        <p className="text-slate-300">
          DealFlow OS provides software, automation, analytics, and workflow support. We do not
          guarantee ad approval, lead volume, appointment volume, revenue, or business outcomes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-slate-300">
          For terms, privacy, or compliance questions, contact the DealFlow OS operator through
          your workspace support channel.
        </p>
      </section>
    </main>
  );
}
