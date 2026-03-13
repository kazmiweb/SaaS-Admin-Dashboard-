import type { ApiConfig } from "@prisma/client";
import { HttpError } from "../../shared/http/errors.js";

type RunApiCallOptions = {
  timeoutMs?: number;
  requestParams?: Record<string, string>;
};

function isCmsPunjabPoliceApi(api: ApiConfig) {
  return /igp-8787-center\.psca\.gop\.pk/i.test(api.baseUrl) || /cms punjab police/i.test(`${api.name} ${api.description ?? ""}`);
}

function normalizeOutboundQuery(api: ApiConfig, query: string) {
  if (isCmsPunjabPoliceApi(api) && /^92\d{10}$/.test(query)) {
    return `0${query.slice(2)}`;
  }
  return query;
}

function resolveQueryParam(api: ApiConfig, query?: string) {
  if (isCmsPunjabPoliceApi(api)) {
    if (query && /^\d{13}$/.test(query)) return "cnic";
    return "cell_no";
  }
  const endpoint = api.endpoint.trim();
  if (/^[A-Za-z0-9_-]+=$/.test(endpoint) && (!api.queryParam || api.queryParam === "query")) {
    return endpoint.slice(0, -1);
  }
  return api.queryParam;
}

function buildUrl(api: ApiConfig, query: string) {
  const baseUrl = api.baseUrl.trim();
  const endpoint = api.endpoint.trim();
  const outboundQuery = normalizeOutboundQuery(api, query);
  const queryParam = resolveQueryParam(api, outboundQuery);
  const base = new URL(baseUrl);
  const baseLooksLikeFile = /\.[A-Za-z0-9]+$/.test(base.pathname);
  const endpointLooksLikeQueryParam = /^[A-Za-z0-9_-]+=$/.test(endpoint);
  const endpointPath = endpoint.replace(/^\/+/, "");
  const url = baseLooksLikeFile || endpointLooksLikeQueryParam || endpointPath.length === 0
    ? new URL(base.toString())
    : new URL(endpointPath, base.toString().endsWith("/") ? base.toString() : `${base.toString()}/`);

  if (api.method === "GET") {
    url.searchParams.set(queryParam, outboundQuery);
    if (isCmsPunjabPoliceApi(api)) {
      const secondaryParam = queryParam === "cnic" ? "cell_no" : "cnic";
      if (!url.searchParams.has(secondaryParam)) url.searchParams.set(secondaryParam, "");
    }
  }
  return url;
}

function parseResponsePayload(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return parseHtmlTablePayload(text);
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

function normalizeHeaderLabel(label: string) {
  const normalized = stripTags(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized === "mobile_no") return "mobile";
  if (normalized === "officer_mobile_no") return "officer_mobile";
  if (normalized === "complainant_name") return "complainant_name";
  return normalized;
}

function parseHtmlTablePayload(text: string) {
  const headerMatches = [...text.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
  const headers = headerMatches.map((match) => normalizeHeaderLabel(match[1] ?? "")).filter(Boolean);
  const tbodyMatch = text.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  const tbody = tbodyMatch?.[1] ?? text;
  const rowMatches = [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  if (!headers.length || !rowMatches.length) {
    return { raw: text };
  }

  const results = rowMatches
    .map((match) => {
      const rowHtml = match[1] ?? "";
      const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1] ?? ""));
      if (!cells.length) return null;

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        const value = cells[index] ?? "";
        if (!header || !value || header === "action") return;
        record[header] = value;
      });
      return Object.keys(record).length ? record : null;
    })
    .filter((item): item is Record<string, string> => Boolean(item));

  if (!results.length) {
    return { raw: text };
  }

  return {
    status: "success",
    source_format: "html_table",
    result_count: results.length,
    results,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeTelecomSimPayload(data: any) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!Array.isArray(data.results)) return data;

  const seen = new Set<string>();
  const dedupedResults = data.results.filter((item: unknown) => {
    if (!item || typeof item !== "object") return true;
    const key = stableStringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ...data,
    result_count: dedupedResults.length,
    results: dedupedResults,
  };
}

function responseLooksLikeMissingQuery(data: any) {
  const message = typeof data?.message === "string" ? data.message : "";
  const status = typeof data?.status === "string" ? data.status : "";
  return /no\s+search\s+query\s+provided/i.test(message) || /missing\s+query/i.test(message) || /error/i.test(status) && /query/i.test(message);
}

async function executeFetch(url: URL, api: ApiConfig, query: string, controller: AbortController) {
  const headers: Record<string, string> = {
    "User-Agent": "Elookup/1.0",
    "Accept": "application/json, text/plain, */*",
  };

  if (api.authType === "API_KEY_HEADER") {
    if (api.apiKeyHeader && api.apiKeyValue) headers[api.apiKeyHeader] = api.apiKeyValue;
  } else if (api.authType === "BEARER_TOKEN") {
    if (api.bearerToken) headers["Authorization"] = `Bearer ${api.bearerToken}`;
  } else if (api.authType === "BASIC_AUTH") {
    if (api.basicUser && api.basicPass) {
      const token = Buffer.from(`${api.basicUser}:${api.basicPass}`).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }
  }

  const response = await fetch(url.toString(), {
    method: api.method,
    headers,
    signal: controller.signal,
    ...(api.method === "POST"
      ? {
          body: JSON.stringify({ [resolveQueryParam(api, query)]: url.searchParams.get(resolveQueryParam(api, query)) ?? "" }),
          headers: { ...headers, "Content-Type": "application/json" },
        }
      : {}),
  });

  const text = await response.text();
  const data = parseResponsePayload(text);

  if (!response.ok) {
    throw new HttpError(502, "API_ERROR", `API failed (${response.status})`);
  }

  return { ok: true, api: api.name, status: response.status, data: normalizeTelecomSimPayload(data) };
}

function isBalochistanBetoApi(api: ApiConfig) {
  return /gw\.fbr\.gov\.pk\/beto/i.test(api.baseUrl) || /\bbeto\b/i.test(`${api.name} ${api.description ?? ""}`);
}

function isPunjabExciseApi(api: ApiConfig) {
  return /avlexcise\.php/i.test(`${api.baseUrl} ${api.endpoint}`) || /\bpunjab\s+excise\b/i.test(`${api.name} ${api.description ?? ""}`);
}

function hasPunjabVehiclePayload(data: any) {
  return Array.isArray(data) && data.some((item) => item && typeof item === "object" && "vehicle" in item);
}

function extractPunjabExciseRegistration(data: any) {
  const reg = data?.aaData?.[0]?.[0];
  return typeof reg === "string" && reg.trim() ? reg.trim() : null;
}

function extractBalochistanPayload(query: string, requestParams: Record<string, string>) {
  const district = requestParams.district?.trim();
  const vehicleRegNumber = (requestParams.registrationNo?.trim() || query).toUpperCase();
  if (!district) {
    throw new HttpError(400, "BAD_REQUEST", "District is required for Balochistan Excise");
  }

  return {
    mobileNumber: process.env.BALOCHISTAN_BETO_MOBILE ?? "00923192284339",
    vehicleRegNumber,
    district,
  };
}

async function executeBalochistanFetch(api: ApiConfig, query: string, controller: AbortController, requestParams: Record<string, string>) {
  const url = buildUrl(api, query);
  const headers: Record<string, string> = {
    "User-Agent": "Elookup/1.0",
    "Accept": "*/*",
    "Content-Type": "application/json;charset=UTF-8",
  };

  if (api.bearerToken) {
    headers.Authorization = `Bearer ${api.bearerToken}`;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    signal: controller.signal,
    body: JSON.stringify(extractBalochistanPayload(query, requestParams)),
  });

  const text = await response.text();
  const data = parseResponsePayload(text);

  if (!response.ok) {
    throw new HttpError(502, "API_ERROR", `API failed (${response.status})`);
  }

  return { ok: true, api: api.name, status: response.status, data };
}

async function executePunjabExciseFetch(api: ApiConfig, query: string, controller: AbortController) {
  const firstUrl = buildUrl(api, query);
  const firstResult = await executeFetch(firstUrl, api, query, controller);
  const firstData = firstResult.data;

  if (hasPunjabVehiclePayload(firstData)) {
    return firstResult;
  }

  const reg = extractPunjabExciseRegistration(firstData);
  if (!reg) {
    return firstResult;
  }

  const secondUrl = buildUrl(api, reg);
  const secondResult = await executeFetch(secondUrl, api, reg, controller);
  if (hasPunjabVehiclePayload(secondResult.data)) {
    return secondResult;
  }

  return firstResult;
}

export async function runApiCall(api: ApiConfig, query: string, options: RunApiCallOptions = {}) {
  const url = buildUrl(api, query);

  const timeoutMs = Math.max(100, options.timeoutMs ?? Number(process.env.SEARCH_API_TIMEOUT_MS ?? 20_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (isBalochistanBetoApi(api)) {
      return await executeBalochistanFetch(api, query, controller, options.requestParams ?? {});
    }

    if (api.method === "GET" && isPunjabExciseApi(api)) {
      return await executePunjabExciseFetch(api, query, controller);
    }

    let result = await executeFetch(url, api, query, controller);

    // Some legacy upstreams are configured as POST but only honor the query string.
    if (api.method === "POST" && responseLooksLikeMissingQuery(result.data)) {
      const retryUrl = new URL(url.toString());
      const outboundQuery = normalizeOutboundQuery(api, query);
      retryUrl.searchParams.set(resolveQueryParam(api, outboundQuery), outboundQuery);
      result = await fetch(retryUrl.toString(), {
        method: "POST",
        headers: {
          "User-Agent": "Elookup/1.0",
          "Accept": "application/json, text/plain, */*",
        },
        signal: controller.signal,
      }).then(async (response) => {
        const text = await response.text();
        const data = parseResponsePayload(text);
        if (!response.ok) {
          throw new HttpError(502, "API_ERROR", `API failed (${response.status})`);
        }
        return { ok: true, api: api.name, status: response.status, data: normalizeTelecomSimPayload(data) };
      });
    }

    return result;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new HttpError(504, "API_TIMEOUT", "API timeout");
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, "API_ERROR", "API call failed");
  } finally {
    clearTimeout(timeout);
  }
}
