import { describe, expect, it } from "vitest";
import type { ApiConfig } from "@prisma/client";
import { mergeConfiguredAndInferredServiceApis } from "./search.service.js";

function makeApiConfig(overrides: Partial<ApiConfig>): ApiConfig {
  const now = new Date();
  return {
    id: overrides.id ?? "api-id",
    name: overrides.name ?? "API",
    method: overrides.method ?? "GET",
    baseUrl: overrides.baseUrl ?? "https://example.com/",
    endpoint: overrides.endpoint ?? "search",
    queryParam: overrides.queryParam ?? "query",
    description: overrides.description ?? null,
    authType: overrides.authType ?? "NONE",
    apiKeyHeader: overrides.apiKeyHeader ?? null,
    apiKeyValue: overrides.apiKeyValue ?? null,
    bearerToken: overrides.bearerToken ?? null,
    basicUser: overrides.basicUser ?? null,
    basicPass: overrides.basicPass ?? null,
    supportsCnic: overrides.supportsCnic ?? false,
    supportsPhone: overrides.supportsPhone ?? false,
    supportsEngine: overrides.supportsEngine ?? false,
    supportsChassis: overrides.supportsChassis ?? false,
    supportsReg: overrides.supportsReg ?? false,
    supportsLicense: overrides.supportsLicense ?? false,
    customRegex: overrides.customRegex ?? null,
    creditsPerSearch: overrides.creditsPerSearch ?? 1,
    allowUser: overrides.allowUser ?? true,
    allowReseller: overrides.allowReseller ?? true,
    allowAdmin: overrides.allowAdmin ?? true,
    status: overrides.status ?? true,
    sampleQuery: overrides.sampleQuery ?? null,
    loginUrl: overrides.loginUrl ?? null,
    usernameField: overrides.usernameField ?? null,
    passwordField: overrides.passwordField ?? null,
    captchaEnabled: overrides.captchaEnabled ?? false,
    sessionPolicy: overrides.sessionPolicy ?? null,
    maxPerMinute: overrides.maxPerMinute ?? null,
    maxPerDay: overrides.maxPerDay ?? null,
    cooldownSeconds: overrides.cooldownSeconds ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe("mergeConfiguredAndInferredServiceApis", () => {
  it("adds inferred Punjab vehicle APIs to CNIC Lookup when mapping is stale", () => {
    const configuredLinks = [
      {
        priority: 1,
        api: makeApiConfig({
          id: "sim-db",
          name: "SIM Database",
          supportsCnic: true,
        }),
      },
    ];

    const activeApis = [
      makeApiConfig({
        id: "punjab-excise",
        name: "Excise Vehicle Database",
        baseUrl: "https://elookup.xyz/haider-api/",
        endpoint: "avlexcise.php",
        description: "Vehicle record (Reg/Chassis/Engine/CNIC)",
        queryParam: "search",
        supportsCnic: true,
        supportsEngine: true,
        supportsChassis: true,
        supportsReg: true,
      }),
    ];

    const result = mergeConfiguredAndInferredServiceApis("CNIC Lookup", configuredLinks, activeApis);

    expect(result.map((item) => item.api.id)).toEqual(["sim-db", "punjab-excise"]);
  });

  it("does not duplicate already configured APIs", () => {
    const punjabApi = makeApiConfig({
      id: "punjab-excise",
      name: "Excise Vehicle Database",
      baseUrl: "https://elookup.xyz/haider-api/",
      endpoint: "avlexcise.php",
      description: "Vehicle record (Reg/Chassis/Engine/CNIC)",
      queryParam: "search",
      supportsCnic: true,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
    });

    const result = mergeConfiguredAndInferredServiceApis(
      "CNIC Lookup",
      [{ priority: 1, api: punjabApi }],
      [punjabApi]
    );

    expect(result.map((item) => item.api.id)).toEqual(["punjab-excise"]);
  });
});
