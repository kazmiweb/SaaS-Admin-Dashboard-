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
  return parseResponsePayloadForApi(text);
}

function parseResponsePayloadForApi(text: string, api?: ApiConfig) {
  if (api && isKpkExciseApi(api)) {
    const kpkPayload = parseKpkVehiclePayload(text);
    if (kpkPayload) return kpkPayload;
  }

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

function isKpkLoginPage(text: string) {
  const normalized = text.toLowerCase();
  return normalized.includes("login - vehicle verification system")
    && normalized.includes('name="username"')
    && normalized.includes('name="password"');
}

function parseKpkVehiclePayload(text: string) {
  if (!/results-section/i.test(text)) return null;

  const sectionStart = text.search(/<div class=["']results-section["']/i);
  if (sectionStart < 0) return null;

  const mainEnd = text.search(/<\/main>/i);
  const section = text.slice(sectionStart, mainEnd > sectionStart ? mainEnd : undefined);
  const cards = section.split(/<div class=['"]card['"][^>]*>/i).slice(1);

  if (!cards.length) {
    const sectionText = stripTags(section).toLowerCase();
    if (/no\s+record/.test(sectionText) || /\b0\s+record/.test(sectionText) || /not\s+found/.test(sectionText)) {
      return {
        status: "success",
        source_format: "kpk_vehicle_html",
        result_count: 0,
        results: [],
      };
    }
    return { raw: text };
  }

  const results = cards.map((chunk) => {
    const record: Record<string, string> = {};
    const makeName = stripTags(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? "");
    const regNo = stripTags(chunk.match(/Reg\s*No\s*:\s*([^<]+)/i)?.[1] ?? "");
    if (makeName) record.make_name = makeName;
    if (regNo) record.registration_no = regNo;

    const rowMatches = [...chunk.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)];
    rowMatches.forEach((match) => {
      const rawLabel = match[1] ?? "";
      const rawValue = match[2] ?? "";
      const key = normalizeHeaderLabel(rawLabel);
      const value = stripTags(rawValue);
      if (!key || !value) return;
      if (!(key in record)) record[key] = value;
    });

    return Object.keys(record).length ? record : null;
  }).filter((item): item is Record<string, string> => Boolean(item));

  return {
    status: "success",
    source_format: "kpk_vehicle_html",
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

function isKpkExciseApi(api: ApiConfig) {
  const fingerprint = `${api.baseUrl} ${api.endpoint} ${api.name} ${api.description ?? ""}`;
  return (
    (/vehicleverificationsystem\.com/i.test(fingerprint) && /kpk\.php/i.test(fingerprint))
    || /\bkpk\s+excise\b/i.test(`${api.name} ${api.description ?? ""}`)
  );
}

function isKpkDastakApi(api: ApiConfig) {
  const fingerprint = `${api.baseUrl} ${api.endpoint} ${api.name} ${api.description ?? ""}`;
  return /dastakapi\.kp\.gov\.pk/i.test(fingerprint) && /\/api\/public\/mvrs\/vehicles/i.test(fingerprint);
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

function resolveKpkSessionCookie(api: ApiConfig) {
  if (
    api.authType === "API_KEY_HEADER"
    && api.apiKeyHeader
    && api.apiKeyValue
    && api.apiKeyHeader.toLowerCase() === "cookie"
  ) {
    return api.apiKeyValue.trim();
  }

  return process.env.KPK_VEHICLE_SESSION_COOKIE?.trim() || "";
}

function extractKpkPayload(query: string, requestParams: Record<string, string>) {
  const payload = {
    reg_no: "",
    cnic: "",
    chassis_no: "",
    engine_no: "",
  };

  const forcedType = requestParams._detectedType?.toUpperCase();
  if (forcedType === "CNIC") {
    payload.cnic = query;
    return payload;
  }
  if (forcedType === "REGISTRATION") {
    payload.reg_no = query;
    return payload;
  }
  if (forcedType === "CHASSIS") {
    payload.chassis_no = query;
    return payload;
  }
  if (forcedType === "ENGINE") {
    payload.engine_no = query;
    return payload;
  }

  if (/^\d{13}$/.test(query)) {
    payload.cnic = query;
    return payload;
  }

  if (/^[A-Z]{1,4}[-\s]?\d{1,6}$/i.test(query)) {
    payload.reg_no = query;
    return payload;
  }

  if (/^[A-HJ-NPR-Z0-9\-]{8,25}$/i.test(query)) {
    payload.chassis_no = query;
    return payload;
  }

  payload.engine_no = query;
  return payload;
}

async function executeKpkExciseFetch(
  api: ApiConfig,
  query: string,
  controller: AbortController,
  requestParams: Record<string, string>,
) {
  const url = buildUrl(api, query);
  const payload = extractKpkPayload(query, requestParams);
  const cookie = resolveKpkSessionCookie(api);
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://vehicleverificationsystem.com",
    "Referer": "https://vehicleverificationsystem.com/services/kpk.php",
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    signal: controller.signal,
    body: new URLSearchParams(payload).toString(),
  });

  const text = await response.text();
  if (isKpkLoginPage(text)) {
    throw new HttpError(
      502,
      "API_AUTH_REQUIRED",
      "KPK API session required. Set an active PHP session in API Cookie header or KPK_VEHICLE_SESSION_COOKIE.",
    );
  }
  const data = parseResponsePayloadForApi(text, api);

  if (!response.ok) {
    throw new HttpError(502, "API_ERROR", `API failed (${response.status})`);
  }

  return { ok: true, api: api.name, status: response.status, data };
}

function inferKpkLookupType(query: string, forcedType?: string) {
  const type = forcedType?.toUpperCase();
  if (type === "CNIC" || /^\d{13}$/.test(query)) return "CNIC";
  if (type === "ENGINE") return "ENGINE";
  if (type === "CHASSIS") return "CHASSIS";
  if (type === "REGISTRATION") return "REGISTRATION";
  if (/^[A-Z]{1,4}[-\s]?\d{1,6}$/i.test(query)) return "REGISTRATION";
  if (/^[A-HJ-NPR-Z0-9\-]{8,25}$/i.test(query)) return "CHASSIS";
  return "ENGINE";
}

function getKpkDastakParamCandidates(query: string, requestParams: Record<string, string>) {
  const detected = inferKpkLookupType(query, requestParams._detectedType);
  if (detected === "CNIC") return ["cnic"];

  const priority =
    detected === "REGISTRATION"
      ? ["reg_no", "chassis_no", "engine_no", "cnic"]
      : detected === "CHASSIS"
        ? ["chassis_no", "engine_no", "reg_no", "cnic"]
        : ["engine_no", "engine", "engine_number", "chassis_no", "reg_no", "cnic"];

  const fallback = [
    "engine",
    "engine_number",
    "chasis_no",
    "chassis",
    "chasis",
    "registration_no",
    "registration",
    "regno",
    "reg",
  ];

  return [...new Set([...priority, ...fallback])];
}

function parseKpkDastakBody(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractMessage(data: any) {
  if (!data || typeof data !== "object") return "";
  const message = typeof data.message === "string" ? data.message : "";
  const error = typeof data.error === "string" ? data.error : "";
  const detail = typeof data.detail === "string" ? data.detail : "";
  return `${message} ${error} ${detail}`.trim();
}

function shouldTryNextKpkParam(status: number, data: any, param: string) {
  if (status >= 500) return true;
  if (!(status === 400 || status === 404 || status === 422)) return false;
  const message = extractMessage(data).toLowerCase();
  if (!message) return false;
  if (!/required|validation|invalid|not\s+found|missing|no\s+vehicles\s+found|no\s+record/.test(message)) return false;
  if (/cnic/.test(message) && param !== "cnic") return true;
  if (/engine/.test(message) && !param.startsWith("engine")) return true;
  if (/chassis|chasis/.test(message) && !param.startsWith("chassis") && !param.startsWith("chasis")) return true;
  if (/reg/.test(message) && !param.startsWith("reg")) return true;
  return true;
}

function isKpkDastakNoResultPayload(data: any) {
  if (!data || typeof data !== "object") return false;

  const message = extractMessage(data).toLowerCase();
  if (Array.isArray(data.data) && data.data.length === 0 && /no\s+vehicles\s+found|not\s+found/.test(message)) {
    return true;
  }
  if (Array.isArray(data.results) && data.results.length === 0 && /no\s+vehicles\s+found|not\s+found/.test(message)) {
    return true;
  }
  return false;
}

function resolveKpkDastakAuth() {
  return {
    bearerToken: (process.env.KPK_DASTAK_BEARER_TOKEN ?? "").trim(),
    apiKey: (process.env.KPK_DASTAK_API_KEY ?? "").trim(),
    uuid: (process.env.KPK_DASTAK_UUID ?? "").trim(),
    ifModifiedSince: (process.env.KPK_DASTAK_IF_MODIFIED_SINCE ?? "").trim(),
  };
}

function buildKpkDastakHeaders(auth: ReturnType<typeof resolveKpkDastakAuth>) {
  const headers: Record<string, string> = {
    "User-Agent": "okhttp/4.12.0",
    "Connection": "Keep-Alive",
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip",
    "os": "android",
    "os-version": "30",
    "app-version": "20106",
    "device-model": "samsung-samsung-SM-N986B-android-30",
    "app-name": "Dastak",
  };
  if (auth.bearerToken) headers.authorization = `Bearer ${auth.bearerToken}`;
  if (auth.apiKey) headers["x-api-key"] = auth.apiKey;
  if (auth.uuid) headers.uuid = auth.uuid;
  if (auth.ifModifiedSince) headers["If-Modified-Since"] = auth.ifModifiedSince;
  return headers;
}

async function executeKpkDastakFetch(
  api: ApiConfig,
  query: string,
  controller: AbortController,
  requestParams: Record<string, string>,
) {
  const auth = resolveKpkDastakAuth();
  if (!auth.bearerToken || !auth.apiKey) {
    throw new HttpError(
      502,
      "API_AUTH_REQUIRED",
      "KPK Dastak auth missing. Set KPK_DASTAK_BEARER_TOKEN and KPK_DASTAK_API_KEY in backend environment.",
    );
  }

  const base = new URL(api.baseUrl.trim());
  const endpointPath = api.endpoint.trim().replace(/^\/+/, "");
  const endpointUrl = endpointPath.length
    ? new URL(endpointPath, base.toString().endsWith("/") ? base.toString() : `${base.toString()}/`)
    : new URL(base.toString());
  const candidates = getKpkDastakParamCandidates(query, requestParams);
  const headers = buildKpkDastakHeaders(auth);

  let lastStatus = 0;
  let lastData: any = null;
  let lastMessage = "KPK Dastak API call failed";

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const param = candidates[idx];
    const url = new URL(endpointUrl.toString());
    url.searchParams.set(param, query);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = parseKpkDastakBody(text);
    lastStatus = response.status;
    lastData = data;
    lastMessage = extractMessage(data) || `API failed (${response.status})`;

    if (response.status === 401 || response.status === 403) {
      throw new HttpError(
        502,
        "API_AUTH_REQUIRED",
        "KPK Dastak token/api-key expired or invalid. Update KPK_DASTAK_BEARER_TOKEN and KPK_DASTAK_API_KEY.",
      );
    }

    if (response.ok) {
      if (idx < candidates.length - 1 && isKpkDastakNoResultPayload(data)) {
        continue;
      }
      return { ok: true, api: api.name, status: response.status, data };
    }

    if (!shouldTryNextKpkParam(response.status, data, param)) {
      break;
    }
  }

  if (lastStatus === 401 || lastStatus === 403) {
    throw new HttpError(
      502,
      "API_AUTH_REQUIRED",
      "KPK Dastak token/api-key expired or invalid. Update KPK_DASTAK_BEARER_TOKEN and KPK_DASTAK_API_KEY.",
    );
  }

  if (lastStatus === 0) {
    throw new HttpError(502, "API_ERROR", "KPK Dastak API call failed");
  }

  if (lastStatus === 404 && /not\s+found|no\s+record/.test(extractMessage(lastData).toLowerCase())) {
    return {
      ok: true,
      api: api.name,
      status: 200,
      data: {
        status: "success",
        result_count: 0,
        results: [],
      },
    };
  }

  throw new HttpError(502, "API_ERROR", lastMessage || `API failed (${lastStatus})`);
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

    if (api.method === "GET" && isKpkDastakApi(api)) {
      return await executeKpkDastakFetch(api, query, controller, options.requestParams ?? {});
    }

    if (api.method === "GET" && isPunjabExciseApi(api)) {
      return await executePunjabExciseFetch(api, query, controller);
    }

    if (api.method === "POST" && isKpkExciseApi(api)) {
      return await executeKpkExciseFetch(api, query, controller, options.requestParams ?? {});
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
        const data = parseResponsePayloadForApi(text, api);
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
