import { describe, expect, it, vi, afterEach } from "vitest";
import type { ApiConfig } from "@prisma/client";
import { runApiCall } from "./runApiCall.js";

function makeApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const now = new Date("2026-03-08T00:00:00.000Z");
  return {
    id: "api-1",
    name: "Test API",
    method: "POST",
    baseUrl: "https://example.test",
    endpoint: "lookup",
    queryParam: "search",
    description: null,
    authType: "NONE",
    apiKeyHeader: null,
    apiKeyValue: null,
    bearerToken: null,
    basicUser: null,
    basicPass: null,
    loginUrl: null,
    usernameField: null,
    passwordField: null,
    captchaEnabled: false,
    sessionPolicy: null,
    maxPerMinute: null,
    maxPerDay: null,
    cooldownSeconds: null,
    creditsPerSearch: 1,
    status: true,
    sampleQuery: null,
    sampleResponse: null,
    supportsCnic: false,
    supportsPhone: false,
    supportsEngine: false,
    supportsChassis: false,
    supportsReg: false,
    supportsLicense: false,
    customRegex: null,
    allowUser: true,
    allowReseller: true,
    allowAdmin: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.KPK_DASTAK_BEARER_TOKEN;
  delete process.env.KPK_DASTAK_API_KEY;
  delete process.env.KPK_DASTAK_UUID;
  delete process.env.KPK_DASTAK_IF_MODIFIED_SINCE;
});

describe("runApiCall", () => {
  it("retries POST requests with query string when upstream reports missing query", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "error", message: "No search query provided" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ ok: true }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const result = await runApiCall(makeApiConfig(), "RIM-11-5096");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/lookup");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://example.test/lookup?search=RIM-11-5096");
    expect(result.data).toEqual([{ ok: true }]);
  });

  it("keeps standard GET requests unchanged", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await runApiCall(makeApiConfig({ method: "GET" }), "4220186578817");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/lookup?search=4220186578817");
  });

  it("deduplicates telecom SIM results arrays and updates result_count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          detected_type: "mobile",
          query_sent: "923111771386",
          result_count: 3,
          results: [
            {
              mobile: "923111771386",
              name: "syed zeeshan kazmi",
              cnic: "6110118359225",
              address: "NULL",
            },
            {
              mobile: "923111771386",
              name: "syed zeeshan kazmi",
              cnic: "6110118359225",
              address: "NULL",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const result = await runApiCall(makeApiConfig({ method: "GET" }), "03111771386");

    expect(result.data).toEqual({
      status: "success",
      detected_type: "mobile",
      query_sent: "923111771386",
      result_count: 1,
      results: [
        {
          mobile: "923111771386",
          name: "syed zeeshan kazmi",
          cnic: "6110118359225",
          address: "NULL",
        },
      ],
    });
  });

  it("normalizes legacy GET configs where the base URL already points to the PHP file", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "Punjab Excise",
        baseUrl: "https://elookup.xyz/haider-api/avlexcise.php",
        endpoint: "search=",
        queryParam: "query",
      }),
      "RIM-11-5096"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://elookup.xyz/haider-api/avlexcise.php?search=RIM-11-5096");
  });

  it("resolves Punjab Excise CNIC searches through aaData registration fallback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aaData: [["RIM-11-5096", "4220186578817"]],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              vehicle: "TOYOTA COROLLA",
              registration_no: "RIM-11-5096",
              cnic: "4220186578817",
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    const result = await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "Punjab Excise",
        baseUrl: "https://elookup.xyz/haider-api/avlexcise.php",
        endpoint: "search=",
        queryParam: "query",
      }),
      "4220186578817"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://elookup.xyz/haider-api/avlexcise.php?search=4220186578817");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://elookup.xyz/haider-api/avlexcise.php?search=RIM-11-5096");
    expect(result.data).toEqual([
      {
        vehicle: "TOYOTA COROLLA",
        registration_no: "RIM-11-5096",
        cnic: "4220186578817",
      },
    ]);
  });

  it("sends the BETO payload for Balochistan Excise searches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { reg_no: "ABC-123" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await runApiCall(
      makeApiConfig({
        method: "POST",
        name: "Balochistan Excise",
        authType: "BEARER_TOKEN",
        bearerToken: "secret-token",
        baseUrl: "https://gw.fbr.gov.pk/beto/v1/VehicleDetails/",
        endpoint: "LoadVehicleDetails",
        queryParam: "vehicleRegNumber",
      }),
      "qab786",
      { requestParams: { district: "1", registrationNo: "qab786" } }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gw.fbr.gov.pk/beto/v1/VehicleDetails/LoadVehicleDetails");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json;charset=UTF-8",
      }),
      body: JSON.stringify({
        mobileNumber: "00923192284339",
        vehicleRegNumber: "QAB786",
        district: "1",
      }),
    });
    expect(result.data).toEqual({ data: { reg_no: "ABC-123" } });
  });

  it("calls KPK Dastak MVRS endpoint with CNIC query and auth headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          result_count: 1,
          results: [{ registration_no: "B-2032", cnic: "1610111488357" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    process.env.KPK_DASTAK_BEARER_TOKEN = "test-bearer-token";
    process.env.KPK_DASTAK_API_KEY = "test-api-key";
    process.env.KPK_DASTAK_UUID = "uuid-1234";

    const result = await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "KPK Excise Internal",
        baseUrl: "https://dastakapi.kp.gov.pk",
        endpoint: "/api/public/mvrs/vehicles",
        queryParam: "cnic",
        supportsCnic: true,
        supportsReg: true,
        supportsEngine: true,
        supportsChassis: true,
      }),
      "1610111488357",
      { requestParams: { _detectedType: "CNIC" } },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://dastakapi.kp.gov.pk/api/public/mvrs/vehicles?cnic=1610111488357");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        authorization: "Bearer test-bearer-token",
        "x-api-key": "test-api-key",
        uuid: "uuid-1234",
      }),
    });
    expect(result.data).toEqual({
      status: "success",
      result_count: 1,
      results: [
        {
          registration_no: "B-2032",
          cnic: "1610111488357",
        },
      ],
    });
  });

  it("tries alternate params for KPK Dastak when the first param is rejected", async () => {
    process.env.KPK_DASTAK_BEARER_TOKEN = "test-bearer-token";
    process.env.KPK_DASTAK_API_KEY = "test-api-key";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "The cnic field is required.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            result_count: 1,
            results: [{ engine_no: "1N0091908" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "KPK Excise Internal",
        baseUrl: "https://dastakapi.kp.gov.pk",
        endpoint: "/api/public/mvrs/vehicles",
        queryParam: "cnic",
        supportsEngine: true,
      }),
      "1N0091908",
      { requestParams: { _detectedType: "ENGINE" } },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://dastakapi.kp.gov.pk/api/public/mvrs/vehicles?engine_no=1N0091908");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://dastakapi.kp.gov.pk/api/public/mvrs/vehicles?engine=1N0091908");
    expect(result.data).toEqual({
      status: "success",
      result_count: 1,
      results: [{ engine_no: "1N0091908" }],
    });
  });

  it("returns clear auth error when KPK Dastak env credentials are missing", async () => {
    await expect(
      runApiCall(
        makeApiConfig({
          method: "GET",
          name: "KPK Excise Internal",
          baseUrl: "https://dastakapi.kp.gov.pk",
          endpoint: "/api/public/mvrs/vehicles",
          queryParam: "cnic",
          supportsCnic: true,
        }),
        "1610111488357",
        { requestParams: { _detectedType: "CNIC" } },
      ),
    ).rejects.toMatchObject({
      code: "API_AUTH_REQUIRED",
    });
  });

  it("parses CMS Punjab Police HTML tables and strips the action column", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<table class="table table-responsive">
          <thead>
            <tr>
              <th>Complaint No</th>
              <th>CNIC</th>
              <th>Complainant Name</th>
              <th>Mobile No.</th>
              <th>District</th>
              <th>Police Station</th>
              <th>Category</th>
              <th>Officer Name</th>
              <th>Officer Mobile No</th>
              <th>Status</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>WK-3/28/2022-3266</td>
              <td>6110118359225</td>
              <td>سید ذیشان کاظمی</td>
              <td>03111773434</td>
              <td>Rawalpindi</td>
              <td>Waris Khan</td>
              <td>CNIC Loss</td>
              <td>طاہر محمود محرر</td>
              <td>03331909211</td>
              <td>Completed</td>
              <td>28-03-2022 10:22:41</td>
              <td><button type="button">Load</button></td>
            </tr>
          </tbody>
        </table>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      )
    );

    const result = await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "CMS Punjab Police",
        baseUrl: "https://igp-8787-center.psca.gop.pk/comp_form/",
        endpoint: "get_api_detail",
        queryParam: "cnic",
      }),
      "6110118359225"
    );

    expect(result.data).toEqual({
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
    });
  });

  it("uses cell_no and 03-format for CMS Punjab Police mobile lookups", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<table><tbody></tbody></table>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    await runApiCall(
      makeApiConfig({
        method: "GET",
        name: "CMS Punjab Police",
        baseUrl: "https://igp-8787-center.psca.gop.pk/comp_form/",
        endpoint: "get_api_detail",
        queryParam: "cnic",
      }),
      "923111773434"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://igp-8787-center.psca.gop.pk/comp_form/get_api_detail?cell_no=03111773434&cnic="
    );
  });
});
