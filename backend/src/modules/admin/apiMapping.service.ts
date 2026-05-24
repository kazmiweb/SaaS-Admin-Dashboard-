import type { ApiConfig, Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import { isInternalApiConfig } from "../../shared/internalApis.js";

export const MANAGED_SERVICE_NAMES = [
  "Elookup Search",
  "CNIC Lookup",
  "Mobile Lookup",
  "Mix Family Tree",
  "Punjab Excise",
  "Islamabad Excise",
  "Sindh Excise",
  "Balochistan Excise",
  "KPK Excise",
  "Kashmir Excise",
  "Stolen Vehicle Record",
] as const;

type ManagedServiceName = (typeof MANAGED_SERVICE_NAMES)[number];

type MappingResult = {
  apiId: string;
  apiName: string;
  matchedServices: ManagedServiceName[];
  createdLinks: number;
  updatedLinks: number;
  removedLinks: number;
};

function buildApiFingerprint(api: Pick<ApiConfig, "name" | "baseUrl" | "endpoint" | "description" | "queryParam">) {
  return [api.name, api.baseUrl, api.endpoint, api.description, api.queryParam]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferVehicleServiceName(api: Pick<ApiConfig, "name" | "baseUrl" | "endpoint" | "description" | "queryParam">): ManagedServiceName | null {
  const fingerprint = buildApiFingerprint(api);

  if (/\bstolen\b|\btheft\b/.test(fingerprint)) return "Stolen Vehicle Record";
  if (/\bkashmir\b|\bajk\b|haiderajk/.test(fingerprint)) return "Kashmir Excise";
  if (/\bpunjab\b|avlexcise/.test(fingerprint)) return "Punjab Excise";
  if (/\bislamabad\b|\bisb\b/.test(fingerprint)) return "Islamabad Excise";
  if (/\bsindh\b|\bkarachi\b/.test(fingerprint)) return "Sindh Excise";
  if (/\bbalochistan\b|\bbaloch\b|\bquetta\b/.test(fingerprint)) return "Balochistan Excise";
  if (/\bkpk\b|\bkp\b|\bkhyber\b|\bpakhtunkhwa\b|\bpeshawar\b/.test(fingerprint)) return "KPK Excise";

  return null;
}

function isFamilyTreeApi(api: Pick<ApiConfig, "name" | "baseUrl" | "endpoint" | "description" | "queryParam">) {
  return /\bfamily tree\b|\bfamily-tree\b|\bfamily\b.*\btree\b/.test(buildApiFingerprint(api));
}

export function inferManagedServiceNames(
  api: Pick<
    ApiConfig,
    | "name"
    | "baseUrl"
    | "endpoint"
    | "description"
    | "queryParam"
    | "supportsCnic"
    | "supportsPhone"
    | "supportsEngine"
    | "supportsChassis"
    | "supportsReg"
    | "customRegex"
  >
): ManagedServiceName[] {
  const matched = new Set<ManagedServiceName>();
  const vehicleServiceName = inferVehicleServiceName(api);
  const familyTreeApi = isFamilyTreeApi(api);
  const supportsUnifiedSearch =
    api.supportsCnic || api.supportsPhone || api.supportsEngine || api.supportsChassis || api.supportsReg || Boolean(api.customRegex);

  if (supportsUnifiedSearch && !familyTreeApi) matched.add("Elookup Search");
  if (api.supportsCnic) matched.add("CNIC Lookup");
  if (api.supportsPhone) matched.add("Mobile Lookup");
  if (familyTreeApi) {
    matched.add("Mix Family Tree");
  }
  if (vehicleServiceName && (api.supportsReg || api.supportsEngine || api.supportsChassis)) {
    matched.add(vehicleServiceName);
  }

  return MANAGED_SERVICE_NAMES.filter((serviceName) => matched.has(serviceName));
}

async function syncSingleApiMappings(db: Prisma.TransactionClient, api: ApiConfig): Promise<MappingResult> {
  if (isInternalApiConfig(api)) {
    return {
      apiId: api.id,
      apiName: api.name,
      matchedServices: [],
      createdLinks: 0,
      updatedLinks: 0,
      removedLinks: 0,
    };
  }
  const matchedServices = inferManagedServiceNames(api);
  const managedServices = await db.service.findMany({
    where: { name: { in: [...MANAGED_SERVICE_NAMES] } },
    select: { id: true, name: true, serviceApis: { where: { apiId: api.id }, select: { id: true, enabled: true, priority: true } } },
  });

  const desiredByName = new Map(managedServices.map((service) => [service.name, service]));
  let createdLinks = 0;
  let updatedLinks = 0;
  let removedLinks = 0;

  for (const serviceName of matchedServices) {
    const service = desiredByName.get(serviceName);
    if (!service) continue;

    const existing = service.serviceApis[0];
    if (!existing) {
      const maxPriority = await db.serviceApi.aggregate({
        where: { serviceId: service.id },
        _max: { priority: true },
      });
      await db.serviceApi.create({
        data: {
          serviceId: service.id,
          apiId: api.id,
          enabled: true,
          priority: (maxPriority._max.priority ?? 0) + 1,
        },
      });
      createdLinks += 1;
      continue;
    }

    if (!existing.enabled) {
      await db.serviceApi.update({
        where: { id: existing.id },
        data: { enabled: true },
      });
      updatedLinks += 1;
    }
  }

  const matchedServiceIds = new Set(
    matchedServices
      .map((serviceName) => desiredByName.get(serviceName)?.id)
      .filter((value): value is string => Boolean(value))
  );

  const removableLinks = await db.serviceApi.findMany({
    where: {
      apiId: api.id,
      service: { name: { in: [...MANAGED_SERVICE_NAMES] } },
      serviceId: { notIn: [...matchedServiceIds] },
    },
    select: { id: true },
  });

  if (removableLinks.length) {
    await db.serviceApi.deleteMany({
      where: { id: { in: removableLinks.map((item) => item.id) } },
    });
    removedLinks = removableLinks.length;
  }

  return {
    apiId: api.id,
    apiName: api.name,
    matchedServices,
    createdLinks,
    updatedLinks,
    removedLinks,
  };
}

export async function syncApiMappingsForApi(apiId: string) {
  const api = await prisma.apiConfig.findUnique({ where: { id: apiId } });
  if (!api) {
    return null;
  }

  return prisma.$transaction((db) => syncSingleApiMappings(db, api));
}

export async function syncManagedApiMappings() {
  const apis = await prisma.apiConfig.findMany({
    orderBy: { createdAt: "asc" },
  });

  const results: MappingResult[] = [];
  for (const item of apis) {
    const result = await prisma.$transaction((db) => syncSingleApiMappings(db, item));
    results.push(result);
  }

  return {
    totalApis: results.length,
    totalCreatedLinks: results.reduce((sum, item) => sum + item.createdLinks, 0),
    totalUpdatedLinks: results.reduce((sum, item) => sum + item.updatedLinks, 0),
    totalRemovedLinks: results.reduce((sum, item) => sum + item.removedLinks, 0),
    results,
  };
}
