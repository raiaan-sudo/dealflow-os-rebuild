export function normalizePhone(input: unknown, defaultCountry = "US") {
  const raw = typeof input === "string" ? input.trim() : "";

  if (!raw) {
    return null;
  }

  const country = defaultCountry.trim().toUpperCase();
  const stripped = raw.replace(/[^\d+]/g, "");

  if (stripped.startsWith("+")) {
    const digits = stripped.slice(1).replace(/\D/g, "");

    if (digits.length < 8 || digits.length > 15) {
      return null;
    }

    return `+${digits}`;
  }

  const digits = stripped.replace(/\D/g, "");

  if ((country === "US" || country === "CA") && digits.length === 10) {
    return `+1${digits}`;
  }

  if ((country === "US" || country === "CA") && digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

export function formatPhoneForSms(input: string | null | undefined) {
  const value = input?.trim();

  if (!value) {
    return "No phone provided";
  }

  const match = value.match(/^\+1(\d{3})(\d{3})(\d{4})$/);

  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }

  return value;
}
