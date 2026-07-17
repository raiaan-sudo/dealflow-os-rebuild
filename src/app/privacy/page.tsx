import { LocalizedLegalPage } from "@/components/legal/localized-legal-page";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";

export const metadata = {
  title: `${LEGAL_COPY.en.privacy.title} | DealFlow OS`,
  description: LEGAL_COPY.en.privacy.description,
};

export default function PrivacyPolicyPage() {
  return <LocalizedLegalPage copy={LEGAL_COPY.en.privacy} contentId="privacy-content" />;
}
