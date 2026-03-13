import { describe, expect, it } from "vitest";
import { inferManagedServiceNames } from "./apiMapping.service.js";

describe("inferManagedServiceNames", () => {
  it("maps Punjab excise APIs to Punjab Excise and CNIC Lookup", () => {
    const result = inferManagedServiceNames({
      name: "Punjab Excise",
      baseUrl: "https://elookup.xyz/haider-api/",
      endpoint: "avlexcise.php",
      description: "Vehicle record (Reg/Chassis/Engine/CNIC)",
      queryParam: "search",
      supportsCnic: true,
      supportsPhone: false,
      supportsEngine: true,
      supportsChassis: true,
      supportsReg: true,
      customRegex: null,
    });

    expect(result).toEqual(["Elookup Search", "CNIC Lookup", "Punjab Excise"]);
  });

  it("maps Kashmir excise APIs to Kashmir Excise and CNIC Lookup", () => {
    const result = inferManagedServiceNames({
      name: "AJK Vehicle Database",
      baseUrl: "https://elookup.xyz/haider-api/",
      endpoint: "haiderajkapi.php",
      description: "AJK vehicle record (CNIC/Registration)",
      queryParam: "search",
      supportsCnic: true,
      supportsPhone: false,
      supportsEngine: false,
      supportsChassis: false,
      supportsReg: true,
      customRegex: null,
    });

    expect(result).toEqual(["Elookup Search", "CNIC Lookup", "Kashmir Excise"]);
  });

  it("maps CRO CNIC APIs only to CNIC Lookup", () => {
    const result = inferManagedServiceNames({
      name: "CRO Punjab",
      baseUrl: "https://cro.elookup.xyz/",
      endpoint: "search",
      description: "Crime record lookup with CNIC and image response",
      queryParam: "cnic",
      supportsCnic: true,
      supportsPhone: false,
      supportsEngine: false,
      supportsChassis: false,
      supportsReg: false,
      customRegex: null,
    });

    expect(result).toEqual(["Elookup Search", "CNIC Lookup"]);
  });

  it("maps SIM database APIs to unified, CNIC, and mobile services", () => {
    const result = inferManagedServiceNames({
      name: "SIM Database",
      baseUrl: "https://elookup.xyz/sim/",
      endpoint: "simrecord.php",
      description: "SIM info (CNIC/Phone)",
      queryParam: "num",
      supportsCnic: true,
      supportsPhone: true,
      supportsEngine: false,
      supportsChassis: false,
      supportsReg: false,
      customRegex: null,
    });

    expect(result).toEqual(["Elookup Search", "CNIC Lookup", "Mobile Lookup"]);
  });

  it("keeps family tree APIs out of unified search mappings", () => {
    const result = inferManagedServiceNames({
      name: "Family Tree API",
      baseUrl: "https://placeholder.elookup.local/family-tree/",
      endpoint: "search",
      description: "Dummy family tree API",
      queryParam: "cnic",
      supportsCnic: true,
      supportsPhone: false,
      supportsEngine: false,
      supportsChassis: false,
      supportsReg: false,
      customRegex: null,
    });

    expect(result).toEqual(["CNIC Lookup", "Mix Family Tree"]);
  });
});
