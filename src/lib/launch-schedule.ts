export const LAUNCH_TIME_ZONE = "America/New_York";
export const LAUNCH_HOUR = 9;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function addLocalDays(parts: ZonedParts, days: number): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedDateTimeToUtc(parts: ZonedParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getZonedParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const delta = target - observedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }

  return new Date(guess);
}

export function getNextEligibleLaunchAt(now: Date, timeZone = LAUNCH_TIME_ZONE) {
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError("A valid current time is required.");
  }

  const localNow = getZonedParts(now, timeZone);
  const launchToday = zonedDateTimeToUtc(
    {
      ...localNow,
      hour: LAUNCH_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  if (now.getTime() <= launchToday.getTime()) {
    return launchToday;
  }

  const tomorrow = addLocalDays(localNow, 1);
  return zonedDateTimeToUtc(
    {
      ...tomorrow,
      hour: LAUNCH_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}
