import type { ApiConfig } from "@prisma/client";
import { HttpError } from "../../shared/http/errors.js";

function buildUrl(api: ApiConfig, query: string) {
  const base = api.baseUrl.endsWith("/") ? api.baseUrl : api.baseUrl + "/";
  const url = new URL(base + api.endpoint);
  if (api.method === "GET") {
    url.searchParams.set(api.queryParam, query);
  }
  return url;
}

export async function runApiCall(api: ApiConfig, query: string) {
  const url = buildUrl(api, query);

  const headers: Record<string,string> = {
    "User-Agent": "Elookup/1.0",
    "Accept": "application/json, text/plain, */*"
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const resp = await fetch(url.toString(), {
      method: api.method,
      headers,
      signal: controller.signal,
      ...(api.method === "POST" ? { body: JSON.stringify({ [api.queryParam]: query }), headers: { ...headers, "Content-Type": "application/json" } } : {})
    });

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      throw new HttpError(502, "API_ERROR", `API failed (${resp.status})`);
    }
    return { ok: true, api: api.name, status: resp.status, data };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new HttpError(504, "API_TIMEOUT", "API timeout");
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, "API_ERROR", "API call failed");
  } finally {
    clearTimeout(timeout);
  }
}
