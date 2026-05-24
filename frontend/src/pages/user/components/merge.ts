export type UnifiedResult = { apiId: string; apiName: string; ok: boolean; data?: any; error?: string };

const reCnic = /\b\d{13}\b/;
const reMobile92 = /\b92\d{10}\b/;
const reMobile03 = /\b03\d{9}\b/;
const reReg = /\b[A-Z]{1,4}-?\d{1,4}-?\d{1,6}\b/i;
const ignoredFieldKeys = new Set([
  "status",
  "message",
  "error",
  "errors",
  "success",
  "ok",
  "type",
  "query",
  "query_sent",
  "querysent",
  "detectedtype",
  "detected_type",
  "result_count",
  "count",
  "raw",
]);

function normalizeKey(key: string) {
  return key.replace(/[\s_-]+/g, "").toLowerCase();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSimNoRecordMessage(value: string) {
  const text = value.toLowerCase();
  return (
    text.includes("registered after 2022")
    || text.includes("get data with payment")
    || text.includes("click here")
    || text.includes("followed correct format")
  );
}

function isSimPlaceholder(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return true;
  return normalized === "no"
    || normalized === "null"
    || normalized === "n/a"
    || normalized === "na"
    || normalized.includes("data not recieved from nadra")
    || normalized.includes("data not received from nadra")
    || isSimNoRecordMessage(normalized);
}

function normalizeSimMobile(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("03")) return digits;
  if (digits.length === 12 && digits.startsWith("92")) return `0${digits.slice(2)}`;
  if (digits.length === 13 && digits.startsWith("0092")) return `0${digits.slice(3)}`;
  return null;
}

function isImageField(key: string, value: unknown) {
  if (typeof value !== "string") return false;
  const normalizedKey = normalizeKey(key);
  return /image|photo|picture|avatar|pic|img/.test(normalizedKey) && /^https?:\/\/|^data:image/i.test(value.trim());
}

function isNegativeMessage(value: string) {
  const normalized = value.trim();
  if (isSimNoRecordMessage(normalized)) return true;
  return /^(0|null|undefined|n\/a|na|none|no)$|no\s+(data|record|records|result|results|image|images)|not\s+found|failed\s+to\s+fetch|api\s+offline|server\s+error|invalid|unavailable|empty/i.test(normalized);
}

function unwrapPayload(data: any): any {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (data.status === "success" && data.data && typeof data.data === "object") return unwrapPayload(data.data);
  if (Array.isArray(data.data) && data.data.every((item: unknown) => item && typeof item === "object")) return data.data;
  if (data.result && typeof data.result === "object" && Object.keys(data).length <= 3) return unwrapPayload(data.result);
  return data;
}

function extractRenderableRecords(data: any): any[] {
  const unwrapped = unwrapPayload(data);
  if (unwrapped == null) return [];
  if (Array.isArray(unwrapped)) {
    return unwrapped.filter((item) => hasVisibleValue(item));
  }
  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    Array.isArray(unwrapped.results) &&
    unwrapped.results.every((item: unknown) => item && typeof item === "object")
  ) {
    return unwrapped.results.filter((item: unknown) => hasVisibleValue(item));
  }
  return hasVisibleValue(unwrapped) ? [unwrapped] : [];
}

function normalizeSimDatabaseRecord(record: any) {
  if (!record || typeof record !== "object") return record;

  const {
    mobile: rawMobile,
    cnic: rawCnic,
    name: rawName,
    address: rawAddress,
    ...rest
  } = record;

  const mobile = normalizeText(rawMobile);
  const cnic = normalizeText(rawCnic);
  const name = normalizeText(rawName);
  const address = normalizeText(rawAddress);
  const normalizedMobile = isSimPlaceholder(mobile) ? null : normalizeSimMobile(mobile);

  return {
    ...rest,
    ...(name && !isSimPlaceholder(name) ? { name } : {}),
    ...(cnic ? { cnic } : {}),
    ...(normalizedMobile ? { all_sim_numbers: [normalizedMobile] } : {}),
    ...(address && !isSimPlaceholder(address) ? { address: [address] } : {}),
  };
}

function normalizeRecordForMerge(apiName: string, record: any) {
  if (normalizeKey(apiName) === "simdatabase") {
    return normalizeSimDatabaseRecord(record);
  }
  return record;
}

function isSimDatabaseApi(apiName: string) {
  return normalizeKey(apiName) === "simdatabase";
}

function hasVisibleValue(data: any): boolean {
  if (data == null) return false;
  if (typeof data === "string") return data.trim().length > 0 && !isNegativeMessage(data);
  if (typeof data === "number") return Number.isFinite(data) && data !== 0;
  if (typeof data === "boolean") return data;
  if (Array.isArray(data)) return data.some((item) => hasVisibleValue(item));
  if (typeof data === "object") {
    return Object.entries(data).some(([key, value]) => {
      if (ignoredFieldKeys.has(normalizeKey(key))) return false;
      if (isImageField(key, value)) return false;
      return hasVisibleValue(value);
    });
  }
  return false;
}

export function normalizeResultData(data: any) {
  const unwrapped = unwrapPayload(data);
  if (unwrapped == null) return null;
  if (typeof unwrapped === "object" && !Array.isArray(unwrapped)) {
    const status = typeof unwrapped.status === "string" ? unwrapped.status.toLowerCase() : "";
    const message = typeof unwrapped.message === "string" ? unwrapped.message : "";
    if (status === "error" || (message && isNegativeMessage(message))) {
      if (!hasVisibleValue(unwrapped.data)) return null;
    }
  }
  return hasVisibleValue(unwrapped) ? unwrapped : null;
}

export function isRenderableResult(result: UnifiedResult) {
  if (!result.ok) return false;
  return normalizeResultData(result.data) != null;
}

function walkStrings(obj: any, out: string[]) {
  if (obj == null) return;
  if (typeof obj === "string") out.push(obj);
  else if (typeof obj === "number") out.push(String(obj));
  else if (Array.isArray(obj)) obj.forEach(v => walkStrings(v,out));
  else if (typeof obj === "object") Object.values(obj).forEach(v => walkStrings(v,out));
}

export function extractKey(data: any): string {
  const strs: string[] = [];
  walkStrings(data, strs);
  for (const s of strs) {
    const r = s.match(reReg)?.[0];
    if (r) return `REG:${r.toUpperCase()}`;
  }
  for (const s of strs) {
    const c = s.match(reCnic)?.[0];
    if (c) return `CNIC:${c}`;
  }
  for (const s of strs) {
    const m92 = s.replace(/^\+/, "").match(reMobile92)?.[0];
    if (m92) return `MOBILE:${m92}`;
    const m03 = s.match(reMobile03)?.[0];
    if (m03) return `MOBILE:92${m03.slice(1)}`;
  }
  return `API:${Math.random().toString(36).slice(2)}`;
}

function mergeDeep(a: any, b: any): any {
  if (a == null) return b;
  if (b == null) return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    const set = new Set<string>();
    const out: any[] = [];
    for (const v of [...a, ...b]) {
      const key = typeof v === "string" ? v : JSON.stringify(v);
      if (!set.has(key)) { set.add(key); out.push(v); }
    }
    return out;
  }
  if (typeof a === "object" && typeof b === "object") {
    const out: any = { ...a };
    for (const [k,v] of Object.entries(b)) {
      out[k] = mergeDeep((out as any)[k], v);
    }
    return out;
  }
  // prefer non-empty
  if (typeof a === "string" && a.trim() === "" && typeof b === "string") return b;
  return a ?? b;
}

export function mergeResults(results: UnifiedResult[]) {
  const groups = new Map<string, { key: string; sources: string[]; data: any[] }>();
  for (const r of results.filter(isRenderableResult)) {
    const records = extractRenderableRecords(r.data);

    if (isSimDatabaseApi(r.apiName)) {
      const normalizedRecords = records.map((record) => normalizeRecordForMerge(r.apiName, record));
      const mergedRecord = normalizedRecords.reduce((acc, cur) => mergeDeep(acc, cur), {});
      const recordKey = extractKey(mergedRecord);
      const key = `${normalizeKey(r.apiName)}::${recordKey}`;
      const g = groups.get(key) ?? { key, sources: [], data: [] };
      g.sources.push(r.apiName);
      g.data.push(mergedRecord);
      groups.set(key, g);
      continue;
    }

    for (const record of records) {
      const normalizedRecord = normalizeRecordForMerge(r.apiName, record);
      const recordKey = extractKey(normalizedRecord);
      const key = `${normalizeKey(r.apiName)}::${recordKey}`;
      const g = groups.get(key) ?? { key, sources: [], data: [] };
      g.sources.push(r.apiName);
      g.data.push(normalizedRecord);
      groups.set(key, g);
    }
  }
  return Array.from(groups.values()).map(g => ({
    key: g.key,
    sources: Array.from(new Set(g.sources)),
    merged: g.data.reduce((acc,cur) => mergeDeep(acc,cur), {})
  }));
}

export function collectImages(obj: any): string[] {
  const imgs: string[] = [];
  const looksLikeImageUrl = (value: string) =>
    /^data:image/i.test(value)
    || /\\.(jpg|jpeg|png|webp|gif|bmp|svg)(\\?|$)/i.test(value)
    || /(image|photo|avatar|profile|upload|attachment|e-?gadget)/i.test(value);
  const looksLikeImageField = (key?: string) =>
    !!key && /(image|img|photo|picture|avatar|profile|evidence|attachment|file|upload|imeiimage)/i.test(key);
  const looksLikeBase64Blob = (value: string) =>
    /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 180;
  const looksLikeRelativeImagePath = (value: string) =>
    /^(\/|\.\/|uploads\/|upload\/|storage\/|images\/|files\/)/i.test(value);
  const extractImgSrcFromHtml = (value: string) => {
    const matches = value.matchAll(/<img[^>]*src=["']([^"']+)["']/gi);
    const out: string[] = [];
    for (const match of matches) {
      if (match[1]) out.push(match[1]);
    }
    return out;
  };
  const normalizeImageString = (value: string) => value.replace(/\\\//g, "/").trim();
  const walk = (x: any, parentKey?: string) => {
    if (x == null) return;
    if (typeof x === "string") {
      const s = normalizeImageString(x);
      if (!s) return;

      if (s.startsWith("data:image")) {
        imgs.push(s);
        return;
      }

      if (s.match(/^https?:\/\//i) && (looksLikeImageUrl(s) || looksLikeImageField(parentKey))) {
        imgs.push(s);
        return;
      }

      if (looksLikeImageField(parentKey) && looksLikeRelativeImagePath(s)) {
        imgs.push(s);
        return;
      }

      if (looksLikeImageField(parentKey) && looksLikeBase64Blob(s)) {
        imgs.push(`data:image/jpeg;base64,${s}`);
        return;
      }

      if (s.toLowerCase().includes("<img")) {
        extractImgSrcFromHtml(s)
          .map((src) => normalizeImageString(src))
          .filter(Boolean)
          .forEach((src) => imgs.push(src));
      }
    } else if (Array.isArray(x)) x.forEach((item) => walk(item, parentKey));
    else if (typeof x === "object") Object.entries(x).forEach(([key, value]) => {
      if (ignoredFieldKeys.has(normalizeKey(key))) return;
      walk(value, key);
    });
  };
  walk(obj);
  return Array.from(new Set(imgs));
}
