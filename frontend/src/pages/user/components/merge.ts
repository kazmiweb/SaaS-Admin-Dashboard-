export type UnifiedResult = { apiId: string; apiName: string; ok: boolean; data?: any; error?: string };

const reCnic = /\b\d{13}\b/;
const reMobile92 = /\b92\d{10}\b/;
const reMobile03 = /\b03\d{9}\b/;
const reReg = /\b[A-Z]{1,4}-?\d{1,4}-?\d{1,6}\b/i;

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
    const c = s.match(reCnic)?.[0];
    if (c) return `CNIC:${c}`;
  }
  for (const s of strs) {
    const m92 = s.replace(/^\+/, "").match(reMobile92)?.[0];
    if (m92) return `MOBILE:${m92}`;
    const m03 = s.match(reMobile03)?.[0];
    if (m03) return `MOBILE:92${m03.slice(1)}`;
  }
  for (const s of strs) {
    const r = s.match(reReg)?.[0];
    if (r) return `REG:${r.toUpperCase()}`;
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
  for (const r of results.filter(x => x.ok)) {
    const key = extractKey(r.data);
    const g = groups.get(key) ?? { key, sources: [], data: [] };
    g.sources.push(r.apiName);
    g.data.push(r.data);
    groups.set(key, g);
  }
  return Array.from(groups.values()).map(g => ({
    key: g.key,
    sources: Array.from(new Set(g.sources)),
    merged: g.data.reduce((acc,cur) => mergeDeep(acc,cur), {})
  }));
}

export function collectImages(obj: any): string[] {
  const imgs: string[] = [];
  const walk = (x: any) => {
    if (x == null) return;
    if (typeof x === "string") {
      const s=x.trim();
      if (s.startsWith("data:image") || s.match(/^https?:\/\//i)) imgs.push(s);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(obj);
  return Array.from(new Set(imgs));
}
