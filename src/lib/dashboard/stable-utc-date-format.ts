import type { ProductLocale } from "@/lib/i18n/config";

type StableUtcTimestampOptions = {
  value: string;
  locale: ProductLocale;
  includeTime: boolean;
};

/**
 * Format persisted dashboard timestamps without relying on runtime ICU data.
 *
 * The dashboard is server-rendered and then hydrated in Chromium, Firefox, and
 * WebKit. Those runtimes use different date-time punctuation and day-period
 * labels for the same locale, so Intl formatting here would make the initial
 * client render differ from the server HTML. Numeric UTC output is deliberate:
 * it is unambiguous, engine-independent, and stable across hydration.
 */
export function formatStableDashboardUtcTimestamp({
  value,
  locale,
  includeTime,
}: StableUtcTimestampOptions) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return "—";
  }

  const year = String(timestamp.getUTCFullYear()).padStart(4, "0");
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  const hours = String(timestamp.getUTCHours()).padStart(2, "0");
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, "0");
  const date = locale === "es"
    ? `${day}/${month}/${year}`
    : `${year}-${month}-${day}`;

  if (!includeTime) {
    return date;
  }

  return `${date}${locale === "fr" ? " " : ", "}${hours}:${minutes} UTC`;
}
