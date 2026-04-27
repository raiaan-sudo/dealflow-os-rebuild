type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

function write(level: LogLevel, message: string, payload?: LogPayload) {
  const shouldWriteInfo =
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_STRUCTURED_INFO_LOGS === "true";
  const shouldWriteWarning = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production";
  const shouldWriteError = true;

  if (level === "info" && !shouldWriteInfo) {
    return;
  }

  if (level === "warn" && !shouldWriteWarning) {
    return;
  }

  if (level === "error" && !shouldWriteError) {
    return;
  }

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function logInfo(message: string, payload?: LogPayload) {
  write("info", message, payload);
}

export function logWarn(message: string, payload?: LogPayload) {
  write("warn", message, payload);
}

export function logError(message: string, payload?: LogPayload) {
  write("error", message, payload);
}

export function logOperationalEvent(message: string, payload?: LogPayload) {
  const entry = {
    level: "info",
    message,
    timestamp: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };

  console.info(JSON.stringify(entry));
}
