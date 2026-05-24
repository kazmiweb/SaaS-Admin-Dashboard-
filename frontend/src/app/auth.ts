export type Role = "ADMIN" | "RESELLER" | "USER";

const ROLE_VALUES: readonly Role[] = ["ADMIN", "RESELLER", "USER"];

function safeGetItem(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

function safeRemoveItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage write failures
  }
}

export function setTokens(accessToken: string | null, refreshToken: string | null, role: Role) {
  if (accessToken) safeSetItem("accessToken", accessToken);
  else safeRemoveItem("accessToken");
  if (refreshToken) safeSetItem("refreshToken", refreshToken);
  else safeRemoveItem("refreshToken");
  safeSetItem("role", role);
}

export function clearTokens() {
  safeRemoveItem("accessToken");
  safeRemoveItem("refreshToken");
  safeRemoveItem("role");
}

export function getRole(): Role | null {
  const role = safeGetItem("role");
  if (!role) return null;
  if (ROLE_VALUES.includes(role as Role)) return role as Role;
  clearTokens();
  return null;
}
