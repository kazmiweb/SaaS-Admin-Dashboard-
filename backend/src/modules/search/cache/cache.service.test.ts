import { describe, expect, it } from "vitest";
import type { ApiConfig } from "@prisma/client";
import { CacheService } from "./cache.service.js";

function makeRedisStub() {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();

  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return "OK";
    },
    async incr(key: string) {
      const value = (counters.get(key) ?? 0) + 1;
      counters.set(key, value);
      return value;
    },
    async expire() {
      return 1;
    },
  };
}

function makeApi(id: string): ApiConfig {
  return {
    id,
    name: id,
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

describe("CacheService", () => {
  it("builds normalized keys", () => {
    const service = new CacheService(makeRedisStub());
    const key = service.buildSourceCacheKey({
      apiId: "API 1",
      detectedType: "CNIC",
      normalizedQuery: "61101-1234567-1",
    });

    expect(key).toBe("search:source:api_1:cnic:61101-1234567-1");
  });

  it("stores and loads source cache entries", async () => {
    const service = new CacheService(makeRedisStub());
    const api = makeApi("api-1");
    const key = service.buildSourceCacheKey({
      apiId: api.id,
      detectedType: "CNIC",
      normalizedQuery: "61101-1234567-1",
    });

    await service.setSourceResult(key, {
      sourceId: api.id,
      sourceName: api.name,
      data: { ok: true },
      cached: false,
    }, 60);

    const result = await service.getSourceResult(key);
    expect(result?.cached).toBe(true);
    expect(result?.sourceId).toBe(api.id);
  });

  it("tracks repeated query counters", async () => {
    const service = new CacheService(makeRedisStub());
    const first = await service.incrementRepeatedQueryCounter({
      actorKey: "user-1",
      detectedType: "CNIC",
      normalizedQuery: "61101-1234567-1",
    });
    const second = await service.incrementRepeatedQueryCounter({
      actorKey: "user-1",
      detectedType: "CNIC",
      normalizedQuery: "61101-1234567-1",
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
  });
});
