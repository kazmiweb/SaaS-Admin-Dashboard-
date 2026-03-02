export type Role = "ADMIN" | "RESELLER" | "USER";

export function setTokens(accessToken: string | null, refreshToken: string | null, role: Role) {
  if (accessToken) localStorage.setItem("accessToken", accessToken);
  else localStorage.removeItem("accessToken");
  if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
  else localStorage.removeItem("refreshToken");
  localStorage.setItem("role", role);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("role");
}

export function getRole(): Role | null {
  return (localStorage.getItem("role") as Role) || null;
}
