import type { ApiConfig } from "@prisma/client";
import { runApiCall } from "../runApiCall.js";
import { recordApiHealthCheck } from "../../health/apiHealth.service.js";
import { recordRealtimeError } from "../../realtime/realtime.service.js";
import type { ApiExecutionResult, SearchSourceDiagnostic, SearchSourceResult } from "../types/search.types.js";

type ExecutionSource = {
  api: ApiConfig;
  matched: boolean;
};

type ExecuteApiFn = (api: ApiConfig, query: string, timeoutMs: number) => Promise<{ data: unknown }>;
type ReadCachedResultFn = (api: ApiConfig) => Promise<SearchSourceResult | null>;
type WriteCachedResultFn = (api: ApiConfig, result: SearchSourceResult) => Promise<void>;

type ExecuteSourcesParams = {
  query: string;
  sources: ExecutionSource[];
  concurrency?: number;
  timeoutMs?: number;
  executeApi?: ExecuteApiFn;
  readCachedResult?: ReadCachedResultFn;
  writeCachedResult?: WriteCachedResultFn;
};

function pLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount -= 1;
    const fn = queue.shift();
    if (fn) fn();
  };

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount += 1;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("timeout");
}

function defaultExecuteApi(api: ApiConfig, query: string, timeoutMs: number) {
  return runApiCall(api, query, { timeoutMs });
}

export async function executeSources(params: ExecuteSourcesParams): Promise<ApiExecutionResult> {
  const {
    query,
    sources,
    executeApi = defaultExecuteApi,
    readCachedResult,
    writeCachedResult,
    timeoutMs = Math.max(100, Number(process.env.SEARCH_API_TIMEOUT_MS ?? 20_000)),
    concurrency = Math.max(1, Math.min(12, Number(process.env.SEARCH_MAX_CONCURRENCY ?? 5))),
  } = params;

  const limit = pLimit(concurrency);

  const settled = await Promise.all(
    sources.map((source, index) =>
      limit(async () => {
        const startedAt = Date.now();

        try {
          if (readCachedResult) {
            const cached = await readCachedResult(source.api);
            if (cached) {
              const latencyMs = Date.now() - startedAt;
              const diagnostic: SearchSourceDiagnostic = {
                sourceId: source.api.id,
                sourceName: source.api.name,
                status: "success",
                latencyMs,
                timedOut: false,
                cached: true,
                matched: source.matched,
              };

              return {
                index,
                result: { ...cached, cached: true },
                diagnostic,
              };
            }
          }

          const response = await executeApi(source.api, query, timeoutMs);
          const latencyMs = Date.now() - startedAt;

          const result: SearchSourceResult = {
            sourceId: source.api.id,
            sourceName: source.api.name,
            data: response.data,
            cached: false,
          };

          const diagnostic: SearchSourceDiagnostic = {
            sourceId: source.api.id,
            sourceName: source.api.name,
            status: "success",
            latencyMs,
            timedOut: false,
            cached: false,
            matched: source.matched,
          };

          await recordApiHealthCheck({
            apiId: source.api.id,
            probeType: "RUNTIME",
            status: "HEALTHY",
            httpStatus: 200,
            latencyMs,
            timedOut: false,
          });

          if (writeCachedResult) {
            await writeCachedResult(source.api, result);
          }

          return { index, result, diagnostic };
        } catch (error: unknown) {
          const latencyMs = Date.now() - startedAt;

          const diagnostic: SearchSourceDiagnostic = {
            sourceId: source.api.id,
            sourceName: source.api.name,
            status: "failed",
            latencyMs,
            timedOut: isTimeoutError(error),
            cached: false,
            error: error instanceof Error ? error.message : "API error",
            matched: source.matched,
          };

          await recordApiHealthCheck({
            apiId: source.api.id,
            probeType: "RUNTIME",
            status: "UNHEALTHY",
            latencyMs,
            timedOut: isTimeoutError(error),
            errorCode: error instanceof Error && "code" in error ? String((error as any).code ?? "") || "API_ERROR" : "API_ERROR",
            errorMessage: error instanceof Error ? error.message : "API error",
            httpStatus: error instanceof Error && "status" in error ? Number((error as any).status ?? 0) || null : null,
          });
          await recordRealtimeError({
            scope: "api.execution",
            code: error instanceof Error && "code" in error ? String((error as any).code ?? "API_ERROR") : "API_ERROR",
            message: error instanceof Error ? error.message : "API error",
            severity: "error",
            service: source.api.name,
          });

          return { index, diagnostic };
        }
      })
    )
  );

  settled.sort((a, b) => a.index - b.index);

  return {
    results: settled.flatMap((entry) => (entry.result ? [entry.result] : [])),
    diagnostics: settled.map((entry) => entry.diagnostic),
  };
}
