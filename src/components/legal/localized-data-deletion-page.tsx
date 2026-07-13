import { LocalizedLegalPage } from "@/components/legal/localized-legal-page";
import { getProductIntlLocale, type ProductLocale } from "@/lib/i18n/config";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";
import { getPublicAccountDeletionStatus } from "@/lib/services/account-deletion-service";
import { getMetaDeletionPublicStatus } from "@/lib/services/meta-deletion-service";

type SearchParams = Promise<{ code?: string | string[] }>;

function localizedAccountState(
  state: string,
  copy: (typeof LEGAL_COPY)[ProductLocale]["deletion"],
) {
  if (state === "completed") return copy.statuses.completed;
  if (state === "rejected") return copy.statuses.rejected;
  if (state === "operator_required" || state === "legal_hold") {
    return copy.statuses.operator_required;
  }
  return copy.statuses.in_progress;
}

export async function LocalizedDataDeletionPage({
  locale,
  searchParams,
}: {
  locale: ProductLocale;
  searchParams: SearchParams;
}) {
  const copy = LEGAL_COPY[locale].deletion;
  const requestedCode = (await searchParams).code;
  const code = typeof requestedCode === "string" ? requestedCode.trim().toLowerCase() : "";
  let providerStatus: Awaited<ReturnType<typeof getMetaDeletionPublicStatus>> = null;
  let accountStatus: Awaited<ReturnType<typeof getPublicAccountDeletionStatus>> = null;
  let lookupUnavailable = false;

  if (code) {
    try {
      if (/^[a-f0-9]{32}$/.test(code)) {
        accountStatus = await getPublicAccountDeletionStatus(code);
      } else {
        providerStatus = await getMetaDeletionPublicStatus({ confirmationCode: code });
      }
    } catch {
      lookupUnavailable = true;
    }
  }

  const visibleStatus = accountStatus
    ? localizedAccountState(accountStatus.state, copy)
    : providerStatus
      ? copy.statuses[providerStatus.status]
      : null;
  const confirmationCode = accountStatus?.confirmationCode ?? providerStatus?.confirmationCode;
  const scheduledDeletionAt = accountStatus?.scheduledDeletionAt
    ? new Intl.DateTimeFormat(getProductIntlLocale(locale), {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(accountStatus.scheduledDeletionAt))
    : null;

  return (
    <>
      {code ? (
        <section
          aria-live="polite"
          className="mx-auto mt-10 max-w-3xl rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5 text-white/75"
        >
          <h1 className="text-xl font-semibold text-white">{copy.statusTitle}</h1>
          {visibleStatus ? (
            <>
              <p className="mt-3 font-semibold text-sky-200">{visibleStatus.label}</p>
              <p className="mt-2">{visibleStatus.detail}</p>
              <p className="mt-3 text-sm text-white/60">
                {copy.confirmationCode}: <span className="font-mono text-white/80">{confirmationCode}</span>
              </p>
              {scheduledDeletionAt ? (
                <p className="mt-2 text-sm text-white/60">
                  {copy.scheduledDeletionDate}: {scheduledDeletionAt}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3">{lookupUnavailable ? copy.unavailable : copy.noMatch}</p>
          )}
        </section>
      ) : null}
      <LocalizedLegalPage copy={copy} contentId="data-deletion-content" />
    </>
  );
}
