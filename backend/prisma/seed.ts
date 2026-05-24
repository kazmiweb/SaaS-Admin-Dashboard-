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
  // APIs
  const simApi = await prisma.apiConfig.upsert({
    where: { id: "seed-sim" },
    update: {
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
      allowUser: true,
      allowReseller: true,
      allowAdmin: true,
      status: true,
      sampleQuery: "4220186578817",
      sampleResponse: {
        status: "success",
        detected_type: "cnic",
        query_sent: "4220186578817",
        result_count: 2,
        results: [
          {
            mobile: "923111771386",
            name: "SYED ZEESHAN KAZMI",
            cnic: "4220186578817",
            address: "RAWALPINDI",
          },
          {
            mobile: "923455943116",
            name: "SYED ZEESHAN KAZMI",
            cnic: "4220186578817",
            address: "LAHORE",
          },
        ],
      },
    },
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
        result_count: 2,
        results: [
          {
            mobile: "923111771386",
            name: "SYED ZEESHAN KAZMI",
            cnic: "4220186578817",
            address: "RAWALPINDI",
          },
          {
            mobile: "923455943116",
            name: "SYED ZEESHAN KAZMI",
            cnic: "4220186578817",
            address: "LAHORE",
          },
        ],
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

  const islamabadApi = await prisma.apiConfig.upsert({
    where: { id: "seed-islamabad-excise" },
    update: {},
    create: {
      id: "seed-islamabad-excise",
      name: "Islamabad Excise",
      method: "GET",
      baseUrl: "https://cnic.sims.govpk.site/elookup/ict/",
      endpoint: "search.php",
      queryParam: "query",
      description: "Islamabad vehicle record (CNIC/Reg/Chassis/Engine)",
      authType: "NONE",
      supportsCnic: true,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
      creditsPerSearch: 1,
      allowUser: true, allowReseller: true, allowAdmin: true,
      status: true,
      sampleQuery: "3740537438711"
    }
  });

  const kpkApi = await prisma.apiConfig.upsert({
    where: { id: "internal-kpk-dastak-mvrs" },
    update: {
      name: "KPK Excise Internal (Dastak MVRS)",
      method: "GET",
      baseUrl: "https://dastakapi.kp.gov.pk",
      endpoint: "/api/public/mvrs/vehicles",
      queryParam: "cnic",
      description: "INTERNAL_ONLY: KPK MVRS via Dastak API. Auth from env (KPK_DASTAK_BEARER_TOKEN / KPK_DASTAK_API_KEY).",
      authType: "NONE",
      apiKeyHeader: null,
      apiKeyValue: null,
      bearerToken: null,
      supportsCnic: true,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
      creditsPerSearch: 1,
      allowUser: true,
      allowReseller: true,
      allowAdmin: true,
      status: true,
      sampleQuery: "1610111488357",
    },
    create: {
      id: "internal-kpk-dastak-mvrs",
      name: "KPK Excise Internal (Dastak MVRS)",
      method: "GET",
      baseUrl: "https://dastakapi.kp.gov.pk",
      endpoint: "/api/public/mvrs/vehicles",
      queryParam: "cnic",
      description: "INTERNAL_ONLY: KPK MVRS via Dastak API. Auth from env (KPK_DASTAK_BEARER_TOKEN / KPK_DASTAK_API_KEY).",
      authType: "NONE",
      apiKeyHeader: null,
      apiKeyValue: null,
      bearerToken: null,
      supportsCnic: true,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
      creditsPerSearch: 1,
      allowUser: true,
      allowReseller: true,
      allowAdmin: true,
      status: true,
      sampleQuery: "1610111488357",
    },
  });

  await prisma.serviceApi.deleteMany({
    where: {
      apiId: "seed-kpk-excise",
    },
  });
  await prisma.apiConfig.deleteMany({
    where: {
      id: "seed-kpk-excise",
    },
  });

  const familyTreeApi = await prisma.apiConfig.upsert({
    where: { id: "seed-family-tree" },
    update: {},
    create: {
      id: "seed-family-tree",
      name: "Family Tree API",
      method: "GET",
      baseUrl: "https://placeholder.elookup.local/family-tree/",
      endpoint: "search",
      queryParam: "cnic",
      description: "Dummy family tree API. Update endpoint/auth from admin before production use.",
      authType: "NONE",
      supportsCnic: true,
      creditsPerSearch: 1,
      allowUser: true, allowReseller: true, allowAdmin: true,
      status: false,
      sampleQuery: "4220186578817"
    }
  });

  const cmsPunjabPoliceApi = await prisma.apiConfig.upsert({
    where: { id: "seed-cms-punjab-police" },
    update: {
      name: "CMS Punjab Police",
      method: "GET",
      baseUrl: "https://igp-8787-center.psca.gop.pk/comp_form/",
      endpoint: "get_api_detail",
      queryParam: "cnic",
      description: "Punjab Police complaint records by CNIC or mobile number.",
      authType: "NONE",
      supportsCnic: true,
      supportsPhone: true,
      creditsPerSearch: 1,
      allowUser: true,
      allowReseller: true,
      allowAdmin: true,
      status: true,
      sampleQuery: "6110118359225",
      sampleResponse: {
        status: "success",
        source_format: "html_table",
        result_count: 1,
        results: [
          {
            complaint_no: "WK-3/28/2022-3266",
            cnic: "6110118359225",
            complainant_name: "سید ذیشان کاظمی",
            mobile: "03111773434",
            district: "Rawalpindi",
            police_station: "Waris Khan",
            category: "CNIC Loss",
            officer_name: "طاہر محمود محرر",
            officer_mobile: "03331909211",
            status: "Completed",
            date: "28-03-2022 10:22:41",
          },
        ],
      },
    },
    create: {
      id: "seed-cms-punjab-police",
      name: "CMS Punjab Police",
      method: "GET",
      baseUrl: "https://igp-8787-center.psca.gop.pk/comp_form/",
      endpoint: "get_api_detail",
      queryParam: "cnic",
      description: "Punjab Police complaint records by CNIC or mobile number.",
      authType: "NONE",
      supportsCnic: true,
      supportsPhone: true,
      creditsPerSearch: 1,
      allowUser: true,
      allowReseller: true,
      allowAdmin: true,
      status: true,
      sampleQuery: "6110118359225",
      sampleResponse: {
        status: "success",
        source_format: "html_table",
        result_count: 1,
        results: [
          {
            complaint_no: "WK-3/28/2022-3266",
            cnic: "6110118359225",
            complainant_name: "سید ذیشان کاظمی",
            mobile: "03111773434",
            district: "Rawalpindi",
            police_station: "Waris Khan",
            category: "CNIC Loss",
            officer_name: "طاہر محمود محرر",
            officer_mobile: "03331909211",
            status: "Completed",
            date: "28-03-2022 10:22:41",
          },
        ],
      },
    },
  });

  const services = [
    {
      name: "Elookup Search",
      description: "Unified multi-database search across configured sources.",
      icon: "fa-magnifying-glass",
      type: "Search",
      defaultCost: 2,
      apiLinks: [simApi.id, cmsPunjabPoliceApi.id, exciseApi.id, ajkApi.id],
    },
    {
      name: "CNIC Lookup",
      description: "Unified CNIC search using multiple APIs from one click.",
      icon: "fa-id-card",
      type: "UnifiedSearch",
      defaultCost: 2,
      apiLinks: [simApi.id, cmsPunjabPoliceApi.id, exciseApi.id, ajkApi.id, kpkApi.id],
    },
    {
      name: "Mobile Lookup",
      description: "Unified mobile number search using all phone-supported APIs.",
      icon: "fa-mobile-screen-button",
      type: "UnifiedSearch",
      defaultCost: 2,
      apiLinks: [simApi.id, cmsPunjabPoliceApi.id],
    },
    {
      name: "Mix Family Tree",
      description: "Family tree graph search service. Dummy API linked for admin configuration.",
      icon: "fa-sitemap",
      type: "FamilyTree",
      defaultCost: 30,
      apiLinks: [familyTreeApi.id],
    },
    {
      name: "Punjab Excise",
      description: "Punjab vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [exciseApi.id],
    },
    {
      name: "Islamabad Excise",
      description: "Islamabad vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [islamabadApi.id],
    },
    {
      name: "Sindh Excise",
      description: "Sindh vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [exciseApi.id],
    },
    {
      name: "Balochistan Excise",
      description: "Balochistan vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [exciseApi.id],
    },
    {
      name: "KPK Excise",
      description: "KPK vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [kpkApi.id],
    },
    {
      name: "Kashmir Excise",
      description: "Kashmir/AJK vehicle lookup service with editable excise API mapping.",
      icon: "fa-car",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [ajkApi.id],
    },
    {
      name: "Stolen Vehicle Record",
      description: "Specific stolen vehicle verification service with editable API mapping.",
      icon: "fa-car-burst",
      type: "Vehicle",
      defaultCost: 2,
      apiLinks: [exciseApi.id],
    },
  ];

  for (const serviceDef of services) {
    const service = await prisma.service.upsert({
      where: { name: serviceDef.name },
      update: {
        description: serviceDef.description,
        icon: serviceDef.icon,
        type: serviceDef.type,
        status: true,
        defaultCost: serviceDef.defaultCost,
      },
      create: {
        name: serviceDef.name,
        description: serviceDef.description,
        icon: serviceDef.icon,
        type: serviceDef.type,
        status: true,
        defaultCost: serviceDef.defaultCost,
      },
    });

    for (const [index, apiId] of serviceDef.apiLinks.entries()) {
      await prisma.serviceApi.upsert({
        where: { serviceId_apiId: { serviceId: service.id, apiId } },
        update: { enabled: true, priority: index + 1 },
        create: { serviceId: service.id, apiId, enabled: true, priority: index + 1 },
      });
    }
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
