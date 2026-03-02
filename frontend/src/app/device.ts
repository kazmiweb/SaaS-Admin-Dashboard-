const KEY = "elookup.deviceId";

function uuid() {
  // Prefer native
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = uuid();
  localStorage.setItem(KEY, id);
  return id;
}
