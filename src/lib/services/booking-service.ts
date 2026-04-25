import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type BookingClient = SupabaseClient<Database>;
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type AvailabilitySlotRow = Database["public"]["Tables"]["availability_slots"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export type AvailabilityDateRange = {
  start: Date;
  end: Date;
};

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

const SLOT_DURATION_MINUTES = 30;
const SLOT_STEP_MINUTES = 30;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function parseTimeOfDay(value: string) {
  const [hourString, minuteString = "0"] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new ApiError(400, "Invalid availability time format.", "invalid_time");
  }

  return { hour, minute };
}

function combineDateAndTime(date: Date, time: string) {
  const { hour, minute } = parseTimeOfDay(time);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  );
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

async function ensureAvailabilitySettings(
  supabase: BookingClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("user_id", userId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  if ((data ?? []).length > 0) {
    return (data ?? []) as AvailabilitySlotRow[];
  }
  return [];
}

async function listBookedTimes(
  supabase: BookingClient,
  userId: string,
  range: AvailabilityDateRange,
) {
  const { data, error } = await supabase
    .from("appointments")
    .select("scheduled_at")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("scheduled_at", range.start.toISOString())
    .lte("scheduled_at", range.end.toISOString());

  if (error) {
    throw error;
  }

  return new Set(
    ((data ?? []) as Array<Pick<AppointmentRow, "scheduled_at">>).map((item) => item.scheduled_at),
  );
}

function buildSlotsForDate(
  date: Date,
  availability: AvailabilitySlotRow[],
  bookedIsoTimestamps: Set<string>,
) {
  const slots: Date[] = [];
  const windows = availability.filter((slot) => slot.day_of_week === date.getDay());

  for (const window of windows) {
    const start = combineDateAndTime(date, window.start_time);
    const end = combineDateAndTime(date, window.end_time);

    for (
      let cursor = new Date(start);
      cursor.getTime() + SLOT_DURATION_MINUTES * 60_000 <= end.getTime();
      cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
    ) {
      const iso = cursor.toISOString();
      if (!bookedIsoTimestamps.has(iso) && cursor.getTime() > Date.now() + 5 * 60_000) {
        slots.push(new Date(cursor));
      }
    }
  }

  return slots;
}

async function getLeadById(supabase: BookingClient, leadId: string) {
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();

  if (error) {
    throw error;
  }

  return (data as LeadRow | null) ?? null;
}

export async function getAvailabilitySettings(userId?: string) {
  const context = await requireBookingContext();
  const targetUserId = userId ?? context.userId;
  return ensureAvailabilitySettings(context.supabase, targetUserId);
}

export async function saveAvailabilitySettings(slots: AvailabilitySlotInput[]) {
  const { supabase, userId } = await requireBookingContext();

  const sanitized = slots
    .filter((slot) => slot.start_time && slot.end_time)
    .map((slot) => ({
      user_id: userId,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time.length === 5 ? `${slot.start_time}:00` : slot.start_time,
      end_time: slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time,
    }));

  const { error: deleteError } = await supabase
    .from("availability_slots")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (sanitized.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("availability_slots")
    .insert(sanitized as never)
    .select("*")
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as AvailabilitySlotRow[];
}

export async function getAvailableSlots(
  userId: string,
  dateRange?: Partial<{ start: string | Date; end: string | Date }>,
  client?: BookingClient,
) {
  const supabase = client ?? (await createClient());

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const start = startOfDay(
    dateRange?.start ? new Date(dateRange.start) : new Date(),
  );
  const end = endOfDay(
    dateRange?.end ? new Date(dateRange.end) : addDays(start, 6),
  );

  const availability = await ensureAvailabilitySettings(supabase, userId);
  const booked = await listBookedTimes(supabase, userId, { start, end });

  const slots: SuggestedSlot[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const daySlots = buildSlotsForDate(cursor, availability, booked);
    for (const slot of daySlots) {
      slots.push({
        iso: slot.toISOString(),
        label: toTimeLabel(slot),
        dayLabel: toDayLabel(slot),
      });
    }
  }

  return slots;
}

export async function generateSuggestedSlots(
  userId: string,
  client?: BookingClient,
) {
  const slots = await getAvailableSlots(userId, undefined, client);
  return slots.slice(0, 3);
}

export async function checkSlotAvailability(
  userId: string,
  datetime: string | Date,
  client?: BookingClient,
) {
  const target = new Date(datetime);
  const windowStart = addMinutes(target, -1);
  const windowEnd = addMinutes(target, 1);
  const supabase = client ?? (await createClient());

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const availability = await ensureAvailabilitySettings(supabase, userId);
  const daySlots = buildSlotsForDate(target, availability, new Set());
  const matchingConfiguredSlot = daySlots.some(
    (slot) => slot.toISOString() === target.toISOString(),
  );

  if (!matchingConfiguredSlot) {
    return false;
  }

  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart.toISOString())
    .lte("scheduled_at", windowEnd.toISOString())
    .limit(1);

  if (error) {
    throw error;
  }

  return (data ?? []).length === 0;
}

export async function bookAppointment(
  leadId: string,
  userId: string,
  campaignId: string | null,
  datetime: string | Date,
  options: BookingOptions = {},
): Promise<AppointmentRow | null> {
  const supabase = options.supabase ?? (await createClient());

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const lead = await getLeadById(supabase, leadId);

  if (!lead) {
    return null;
  }

  const scheduledAt = new Date(datetime);
  const isAvailable = await checkSlotAvailability(userId, scheduledAt, supabase);

  if (!isAvailable) {
    throw new ApiError(409, "That time is no longer available.", "slot_unavailable");
  }

  const organizationId = options.organizationId ?? lead.organization_id;

  const { data: appointmentRaw, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      campaign_id: campaignId ?? lead.campaign_id,
      lead_id: leadId,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      appointment_type: "sms_consultation",
      notes: options.notes ?? "Booked by SMS auto-booking engine.",
    } as never)
    .select("*")
    .single();

  if (appointmentError || !appointmentRaw) {
    throw appointmentError ?? new ApiError(500, "Appointment could not be created.", "appointment_create_failed");
  }

  const appointment = appointmentRaw as AppointmentRow;

  const { error: slotError } = await supabase.from("booked_slots").insert({
    appointment_id: appointment.id,
    scheduled_at: appointment.scheduled_at,
  } as never);

  if (slotError) {
    throw slotError;
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      status: "booked",
      metadata: {
        ...((lead.metadata as Record<string, unknown> | null) ?? {}),
        booking: {
          status: "booked",
          appointment_id: appointment.id,
          scheduled_at: appointment.scheduled_at,
        },
      },
    } as never)
    .eq("id", leadId);

  if (leadError) {
    throw leadError;
  }

  return appointment;
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
