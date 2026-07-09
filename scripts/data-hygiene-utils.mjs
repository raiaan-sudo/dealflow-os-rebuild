import { createClient } from "@supabase/supabase-js";

export function getArg(argv, name) {
  const equalArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) {
    return equalArg.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function splitIds(value) {
  return String(value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function redactId(id) {
  const value = asString(id);
  return value ? `${value.slice(0, 8)}...${value.slice(-4)}` : null;
}

export function redactText(value) {
  const text = asString(value);
  if (!text) {
    return null;
  }

  return `${text.slice(0, 3)}...${text.slice(-2)}`;
}

export function redactObject(value) {
  const record = asRecord(value);
  const redacted = {};
  const piiKeys = new Set([
    "email",
    "phone",
    "phoneRaw",
    "phone_raw",
    "phoneE164",
    "phone_e164",
    "firstName",
    "first_name",
    "lastName",
    "last_name",
    "name",
    "fullName",
    "full_name",
  ]);

  for (const [key, rawValue] of Object.entries(record)) {
    if (piiKeys.has(key)) {
      redacted[key] = redactText(rawValue);
    } else if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      redacted[key] = redactObject(rawValue);
    } else if (Array.isArray(rawValue)) {
      redacted[key] = rawValue.slice(0, 10).map((item) => (typeof item === "object" ? redactObject(item) : item));
    } else {
      redacted[key] = rawValue;
    }
  }

  return redacted;
}

export function mergeOpsMetadata(existing, patch) {
  return {
    ...asRecord(existing),
    opsDataHygiene: {
      ...asRecord(asRecord(existing).opsDataHygiene),
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function countRows(supabase, table, buildQuery) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = buildQuery(query);
  const { count, error } = await query;
  return error ? { error: error.message || error.code || "unknown_error" } : count ?? 0;
}

export function outputJson(report) {
  console.log(JSON.stringify(report, null, 2));
}
