import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type BookingClient = SupabaseClient<Database>;
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

export type SuggestedSlot = {
  iso: string;
  label: string;
  dayLabel: string;
};

export type AvailabilitySlotInput = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type BookingContext = {
  supabase: BookingClient;
  userId: string;
  organizationId: string;
};

type BookingOptions = {
  supabase?: BookingClient;
  organizationId?: string;
  notes?: string | null;
};

export const BOOKING_EXTERNAL_DISPOSITION = {
  systemOfRecord: "gohighlevel",
  localRelations: {
    "public.availability_slots": "RETIRED_DO_NOT_CREATE",
    "public.booked_slots": "RETIRED_DO_NOT_CREATE",
    "public.appointments.write": "EXTERNAL_GHL_SOURCE_OF_TRUTH",
  },
  runtimeFallback: "FAIL_CLOSED_TO_CONFIGURED_GHL_LINK_OR_MANUAL_HANDOFF",
} as const;

const BOOKING_LINK_KEYS = [
  "ghl_booking_url",
  "ghlBookingUrl",
  "booking_url",
  "bookingUrl",
  "calendar_url",
  "calendarUrl",
  "appointment_url",
  "appointmentUrl",
] as const;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function toTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getSlotLabel(date: Date) {
  return `${toDayLabel(date)} at ${toTimeLabel(date)}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asSafeBookingUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveGhlBookingLink(value: unknown) {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const integrations = asRecord(root.integrations);
  const containers = [
    root,
    asRecord(root.plan),
    asRecord(root.funnel),
    asRecord(root.strategy),
    asRecord(root.ghl),
    asRecord(root.gohighlevel),
    asRecord(integrations?.ghl),
    asRecord(integrations?.gohighlevel),
  ];

  for (const container of containers) {
    if (!container) {
      continue;
    }
    for (const key of BOOKING_LINK_KEYS) {
      const candidate = asSafeBookingUrl(container[key]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

export function formatGhlBookingHandoffMessage(bookingUrl: string | null) {
  const safeBookingUrl = asSafeBookingUrl(bookingUrl);
  if (!safeBookingUrl) {
    return "I can help with next steps, but a verified booking link is not available yet. Want me to have someone reach out manually?";
  }

  return `You can choose a time on the team's booking page here: ${safeBookingUrl} If none of those times work, reply here and the team will follow up manually.`;
}

async function requireBookingContext(): Promise<BookingContext> {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  return {
    supabase,
    userId: context.user.id,
    organizationId: context.organization.id,
  };
}

function localBookingRetiredError() {
  return new ApiError(
    410,
    "Local appointment scheduling is retired. Use the configured GoHighLevel booking link or a manual handoff.",
    "local_booking_retired",
  );
}

export async function getAvailabilitySettings(_userId?: string): Promise<never> {
  throw localBookingRetiredError();
}

export async function saveAvailabilitySettings(
  _slots: AvailabilitySlotInput[],
): Promise<never> {
  throw localBookingRetiredError();
}

export async function getAvailableSlots(
  _userId: string,
  _dateRange?: Partial<{ start: string | Date; end: string | Date }>,
  _client?: BookingClient,
): Promise<never> {
  throw localBookingRetiredError();
}

export async function generateSuggestedSlots(
  _userId: string,
  _client?: BookingClient,
): Promise<never> {
  throw localBookingRetiredError();
}

export async function checkSlotAvailability(
  _userId: string,
  _datetime: string | Date,
  _client?: BookingClient,
): Promise<never> {
  throw localBookingRetiredError();
}

export async function bookAppointment(
  _leadId: string,
  _userId: string,
  _campaignId: string | null,
  _datetime: string | Date,
  _options: BookingOptions = {},
): Promise<never> {
  throw localBookingRetiredError();
}

export async function listAppointmentsForCurrentUser(filters: {
  limit?: number;
  status?: string;
} = {}) {
  const { supabase, userId } = await requireBookingContext();

  let query = supabase
    .from("appointments")
    .select("id, lead_id, campaign_id, scheduled_at, status, appointment_type, notes, created_at, leads(name, first_name, last_name, phone)")
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true })
    .limit(filters.limit ?? 50);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<
    AppointmentRow & {
      leads?: {
        name: string | null;
        first_name: string;
        last_name: string;
        phone: string | null;
      } | null;
    }
  >;
}

export function parseTimeFromMessage(message: string, offeredSlots: string[]) {
  if (offeredSlots.length === 0) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (/\b(first|1st|earliest)\b/.test(normalized)) {
    return offeredSlots[0] ?? null;
  }

  if (/\b(second|2nd)\b/.test(normalized)) {
    return offeredSlots[1] ?? null;
  }

  if (/\b(third|3rd|last)\b/.test(normalized)) {
    return offeredSlots[2] ?? null;
  }

  const targetDayOffset = /\btomorrow\b/.test(normalized) ? 1 : /\btoday\b/.test(normalized) ? 0 : null;
  const timeMatch = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const wantsEvening = /\bevening|tonight|after work\b/.test(normalized);
  const wantsAfternoon = /\bafternoon\b/.test(normalized);
  const wantsMorning = /\bmorning\b/.test(normalized);

  const slots = offeredSlots.map((iso) => new Date(iso));

  const byDay = targetDayOffset === null
    ? slots
    : slots.filter((slot) => {
        const dayDiff = Math.round((startOfDay(slot).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
        return dayDiff === targetDayOffset;
      });

  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? "0");
    const meridiem = timeMatch[3] ?? null;

    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    } else if (meridiem === "am" && hour === 12) {
      hour = 0;
    } else if (!meridiem && hour <= 8) {
      hour += 12;
    }

    const exact = byDay.find(
      (slot) => slot.getHours() === hour && slot.getMinutes() === minute,
    );

    if (exact) {
      return exact.toISOString();
    }
  }

  const thematic = byDay.find((slot) => {
    if (wantsMorning) {
      return slot.getHours() < 12;
    }
    if (wantsAfternoon) {
      return slot.getHours() >= 12 && slot.getHours() < 17;
    }
    if (wantsEvening) {
      return slot.getHours() >= 17;
    }
    return false;
  });

  if (thematic) {
    return thematic.toISOString();
  }

  if (/\bworks|that works|sounds good|let's do it|book it|yes\b/.test(normalized)) {
    return byDay[0]?.toISOString() ?? offeredSlots[0] ?? null;
  }

  return null;
}

export function formatSuggestedSlotMessage(slots: SuggestedSlot[]) {
  if (slots.length === 0) {
    return "Got it — I can line up a call, but I don’t have a slot ready yet. Want me to have someone reach out manually?";
  }

  const list = slots
    .map((slot) => `${slot.dayLabel} at ${slot.label}`)
    .join("\n");

  return `Got it — I can have someone walk you through options. Does today or tomorrow work better?\n\nI have availability at:\n${list}\n\nWhat works best for you?`;
}

export function formatAppointmentConfirmationMessage(datetime: string | Date) {
  const date = new Date(datetime);
  return `Perfect — you're booked for ${getSlotLabel(date)}. We'll reach out then.`;
}

export function createBookingAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}
