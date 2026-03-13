type LogLevel = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function normalizePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, value instanceof Error ? serializeError(value) : value])
  );
}

function emit(level: LogLevel, payload: Record<string, unknown>) {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      ...normalizePayload(payload),
    })
  );
}

export function logInfo(payload: Record<string, unknown>) {
  emit("info", payload);
}

export function logWarn(payload: Record<string, unknown>) {
  emit("warn", payload);
}

export function logError(payload: Record<string, unknown>) {
  emit("error", payload);
}
