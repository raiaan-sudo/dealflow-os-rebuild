import { LocalizedDataDeletionPage } from "@/components/legal/localized-data-deletion-page";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";

export const metadata = {
  title: `${LEGAL_COPY.en.deletion.title} | DealFlow OS`,
  description: LEGAL_COPY.en.deletion.description,
};

export const dynamic = "force-dynamic";

export default function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  return <LocalizedDataDeletionPage locale="en" searchParams={searchParams} />;
}
