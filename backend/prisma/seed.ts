import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertUser(email: string, name: string, password: string, role: UserRole, credits: number, expireDays: number, resellerId?: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const expireAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role, credits, expireAt, status: "ACTIVE", resellerId: resellerId ?? null },
    create: { email, name, passwordHash, role, credits, expireAt, status: "ACTIVE", resellerId: resellerId ?? null },
  });
}

async function main() {
  // Services
  const elookupService = await prisma.service.upsert({
    where: { name: "Elookup Search" },
    update: { description: "Unified multi-database search", icon: "fa-magnifying-glass", type: "Search", status: true, defaultCost: 1 },
    create: { name: "Elookup Search", description: "Unified multi-database search", icon: "fa-magnifying-glass", type: "Search", status: true, defaultCost: 1 },
  });

  await prisma.service.upsert({
    where: { name: "Mix Family Tree" },
    update: { description: "Graph family tree search", icon: "fa-sitemap", type: "FamilyTree", status: true, defaultCost: 1 },
    create: { name: "Mix Family Tree", description: "Graph family tree search", icon: "fa-sitemap", type: "FamilyTree", status: true, defaultCost: 1 },
  });

  // APIs (3 sample)
  const simApi = await prisma.apiConfig.upsert({
    where: { id: "seed-sim" },
    update: {},
    create: {
      id: "seed-sim",
      name: "SIM Database",
      method: "GET",
      baseUrl: "https://elookup.xyz/sim/",
      endpoint: "simrecord.php",
      queryParam: "num",
      description: "SIM info (CNIC/Phone)",
      authType: "NONE",
      supportsCnic: true,
      supportsPhone: true,
      creditsPerSearch: 1,
      allowUser: true, allowReseller: true, allowAdmin: true,
      status: true,
      sampleQuery: "4220186578817",
      sampleResponse: {
        status: "success",
        detected_type: "cnic",
        query_sent: "4220186578817",
        result_count: 1
      }
    }
  });

  const exciseApi = await prisma.apiConfig.upsert({
    where: { id: "seed-excise" },
    update: {},
    create: {
      id: "seed-excise",
      name: "Excise Vehicle Database",
      method: "GET",
      baseUrl: "https://elookup.xyz/haider-api/",
      endpoint: "avlexcise.php",
      queryParam: "search",
      description: "Vehicle record (Reg/Chassis/Engine/CNIC)",
      authType: "NONE",
      supportsCnic: true,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
      creditsPerSearch: 1,
      allowUser: true, allowReseller: true, allowAdmin: true,
      status: true,
      sampleQuery: "RIM-11-5096"
    }
  });

  const ajkApi = await prisma.apiConfig.upsert({
    where: { id: "seed-ajk" },
    update: {},
    create: {
      id: "seed-ajk",
      name: "AJK Vehicle Database",
      method: "GET",
      baseUrl: "https://elookup.xyz/haider-api/",
      endpoint: "haiderajkapi.php",
      queryParam: "search",
      description: "AJK vehicle record (CNIC/Registration)",
      authType: "NONE",
      supportsCnic: true,
      supportsReg: true,
      creditsPerSearch: 1,
      allowUser: true, allowReseller: true, allowAdmin: true,
      status: true,
      sampleQuery: "82202-5305851-7"
    }
  });

  // Assign to unified service
  for (const api of [simApi, exciseApi, ajkApi]) {
    await prisma.serviceApi.upsert({
      where: { serviceId_apiId: { serviceId: elookupService.id, apiId: api.id } },
      update: { enabled: true, priority: 1 },
      create: { serviceId: elookupService.id, apiId: api.id, enabled: true, priority: 1 },
    });
  }

  // Users
  const admin = await upsertUser("admin@elookup.local", "System Admin", "Admin@12345", "ADMIN", 9999, 365);
  const reseller = await upsertUser("reseller@elookup.local", "Default Reseller", "Reseller@12345", "RESELLER", 5000, 365);
  await upsertUser("user@elookup.local", "Demo User", "User@12345", "USER", 50, 30, reseller.id);

  console.log("Seed complete:", { admin: admin.email, reseller: reseller.email });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
