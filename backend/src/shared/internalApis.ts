import type { ApiConfig } from "@prisma/client";

export const INTERNAL_API_ID_PREFIX = "internal-";
export const INTERNAL_KPK_DASTAK_API_ID = process.env.INTERNAL_KPK_DASTAK_API_ID?.trim() || "internal-kpk-dastak-mvrs";

type ApiLike = Pick<ApiConfig, "id" | "name"> & {
  baseUrl?: string | null;
  endpoint?: string | null;
};

export function isInternalApiConfig(api: ApiLike | null | undefined): boolean {
  if (!api) return false;
  if ((api.id ?? "").startsWith(INTERNAL_API_ID_PREFIX)) return true;

  const fingerprint = `${api.baseUrl ?? ""} ${api.endpoint ?? ""} ${api.name ?? ""}`.toLowerCase();
  if (fingerprint.includes("dastakapi.kp.gov.pk") && fingerprint.includes("/api/public/mvrs/vehicles")) return true;

  return false;
}

export function isInternalApiId(apiId: string | null | undefined): boolean {
  if (!apiId) return false;
  return apiId.startsWith(INTERNAL_API_ID_PREFIX) || apiId === INTERNAL_KPK_DASTAK_API_ID;
}
