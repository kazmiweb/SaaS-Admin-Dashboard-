export type AppRole = "ADMIN" | "RESELLER" | "USER";

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Super Admin",
  RESELLER: "Admin",
  USER: "User",
};

function isAppRole(role: string): role is AppRole {
  return role === "ADMIN" || role === "RESELLER" || role === "USER";
}

export function getRoleLabel(role?: string | null) {
  if (!role) return "";
  if (isAppRole(role)) return ROLE_LABELS[role];
  return role;
}

