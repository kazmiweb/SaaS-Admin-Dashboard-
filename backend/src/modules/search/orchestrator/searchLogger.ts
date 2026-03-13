import type { SearchSourceDiagnostic } from "../types/search.types.js";
import { logError, logInfo, logWarn } from "../../../shared/observability/logger.js";

type LogLevel = "info" | "warn" | "error";

type BaseSearchLogContext = {
  requestId?: string;
  userId?: string;
  ip?: string;
  service?: string;
};

type SearchStartLog = BaseSearchLogContext & {
  originalQuery: string;
  normalizedQuery: string;
  detectedType: string;
  selectedSources: Array<{ sourceId: string; sourceName: string; priority: number }>;
  forceRefresh: boolean;
};

type SearchCompleteLog = BaseSearchLogContext & {
  originalQuery: string;
  normalizedQuery: string;
  detectedType: string;
  fastestSource: string | null;
  totalLatencyMs: number;
  sourceDiagnostics: SearchSourceDiagnostic[];
  cacheHits: number;
  cacheMisses: number;
};

type SearchFailureLog = BaseSearchLogContext & {
  originalQuery: string;
  normalizedQuery?: string;
  detectedType?: string;
  totalLatencyMs: number;
  errorCode?: string;
  errorMessage: string;
};

function emit(level: LogLevel, event: string, payload: Record<string, unknown>) {
  const logPayload = {
    scope: "search.orchestrated",
    event,
    ...payload,
  };
  if (level === "error") {
    logError(logPayload);
    return;
  }
  if (level === "warn") {
    logWarn(logPayload);
    return;
  }
  logInfo(logPayload);
}

export function logSearchStart(payload: SearchStartLog) {
  emit("info", "started", payload);
}

export function logSearchComplete(payload: SearchCompleteLog) {
  emit("info", "completed", payload);
}

export function logSearchFailure(payload: SearchFailureLog) {
  emit("warn", "failed", payload);
}
