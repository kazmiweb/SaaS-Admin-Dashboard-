import { describe, expect, it } from "vitest";
import type { ApiConfig } from "@prisma/client";
import { executeSources } from "./apiExecution.service.js";

function makeApi(id: string, name: string): ApiConfig {
  return {
    id,
    name,
    method: "GET",
    baseUrl: "https://example.test",
    endpoint: "lookup",
    queryParam: "query",
    description: null,
    authType: "NONE",
    apiKeyHeader: null,
    apiKeyValue: null,
    bearerToken: null,
    basicUser: null,
    basicPass: null,
    loginUrl: null,
    usernameField: null,
    passwordField: null,
    captchaEnabled: false,
    sessionPolicy: null,
    supportsCnic: true,
    supportsPhone: true,
    supportsEngine: true,
    supportsChassis: true,
    supportsReg: true,
    supportsLicense: false,
    customRegex: null,
    maxPerMinute: null,
    maxPerDay: null,
    cooldownSeconds: null,
    creditsPerSearch: 1,
    allowUser: true,
    allowReseller: true,
    allowAdmin: true,
    status: true,
    sampleQuery: null,
    sampleResponse: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("executeSources", () => {
  it("returns partial results when one source fails", async () => {
    const sources = [
      { api: makeApi("api-1", "Primary"), matched: true },
      { api: makeApi("api-2", "Fallback"), matched: true },
    ];

    const result = await executeSources({
      query: "61101-1234567-1",
      sources,
      concurrency: 2,
      timeoutMs: 500,
      executeApi: async (api) => {
        if (api.id === "api-2") {
          throw new Error("upstream unavailable");
        }
        return { data: { ok: true, source: api.name } };
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.sourceId).toBe("api-1");
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]?.status).toBe("success");
    expect(result.diagnostics[1]?.status).toBe("failed");
    expect(result.diagnostics[1]?.error).toContain("upstream unavailable");
  });

  it("marks timeout failures in diagnostics", async () => {
    const sources = [{ api: makeApi("api-1", "Timeout Source"), matched: true }];

    const result = await executeSources({
      query: "ABCD1234",
      sources,
      concurrency: 1,
      timeoutMs: 100,
      executeApi: async () => {
        throw new Error("API timeout");
      },
    });

    expect(result.results).toHaveLength(0);
    expect(result.diagnostics[0]?.timedOut).toBe(true);
    expect(result.diagnostics[0]?.status).toBe("failed");
  });

  it("uses cached source results when available", async () => {
    const sources = [{ api: makeApi("api-1", "Cached Source"), matched: true }];

    const result = await executeSources({
      query: "61101-1234567-1",
      sources,
      concurrency: 1,
      timeoutMs: 100,
      readCachedResult: async () => ({
        sourceId: "api-1",
        sourceName: "Cached Source",
        data: { ok: true, cached: true },
        cached: true,
      }),
      executeApi: async () => {
        throw new Error("should not call upstream");
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.cached).toBe(true);
    expect(result.diagnostics[0]?.cached).toBe(true);
    expect(result.diagnostics[0]?.status).toBe("success");
  });
});
