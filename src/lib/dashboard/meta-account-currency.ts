import type { MetaConnectionState } from "@/lib/integrations/meta/types";

export type SupportedMetaCurrency = "CAD" | "USD";

function normalizeAccountId(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^act_/, "");
}

export function resolveSelectedMetaAccountCurrency(
  connection: Pick<MetaConnectionState, "accountId" | "availableAccounts">,
): SupportedMetaCurrency | null {
  const selectedAccountId = normalizeAccountId(connection.accountId);
  if (!selectedAccountId) {
    return null;
  }

  const selectedAccount = connection.availableAccounts.find((account) => {
    const candidates = [account.externalAccountId, account.accountId, account.id];
    return candidates.some(
      (candidate) => normalizeAccountId(candidate) === selectedAccountId,
    );
  });
  const currency = selectedAccount?.currency?.trim().toUpperCase();
  return currency === "CAD" || currency === "USD" ? currency : null;
}

export function formatMetaCurrency(
  value: number,
  currency: SupportedMetaCurrency | null,
) {
  if (!currency) {
    return "Currency unavailable";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
