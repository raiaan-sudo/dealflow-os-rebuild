import { LocalizedLegalPage } from "@/components/legal/localized-legal-page";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";

export const metadata = {
  title: `${LEGAL_COPY.en.terms.title} | DealFlow OS`,
  description: LEGAL_COPY.en.terms.description,
};

export default function TermsPage() {
  return <LocalizedLegalPage copy={LEGAL_COPY.en.terms} contentId="terms-content" />;
}
