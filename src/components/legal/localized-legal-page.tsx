import type { LegalDocumentCopy } from "@/lib/i18n/legal-copy";

const SUPPORT_EMAIL = "support@agentdealflow.io";

function LegalParagraph({ value }: { value: string }) {
  const segments = value.split(SUPPORT_EMAIL);
  if (segments.length === 1) return <>{value}</>;

  return (
    <>
      {segments.map((segment, index) => (
        <span key={`${index}:${segment}`}>
          {index > 0 ? (
            <a className="text-sky-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          ) : null}
          {segment}
        </span>
      ))}
    </>
  );
}

export function LocalizedLegalPage({
  copy,
  contentId,
}: {
  copy: LegalDocumentCopy;
  contentId: string;
}) {
  return (
    <>
      <a className="df-skip-link" href={`#${contentId}`}>
        {copy.skip}
      </a>
      <main id={contentId} tabIndex={-1} className="mx-auto max-w-3xl px-6 py-16 text-white">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300">DealFlow OS</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-sm text-white/60">{copy.updated}</p>
        <p className="mt-5 leading-7 text-white/75">{copy.description}</p>

        <div className="surface-guided mt-10 space-y-8 rounded-df-panel border border-white/10 p-6 leading-7 text-white/75 shadow-df-elevated sm:p-8">
          {copy.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p className="mt-3" key={paragraph}>
                  <LegalParagraph value={paragraph} />
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
