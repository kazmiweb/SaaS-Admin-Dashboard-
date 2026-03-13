import { describe, it, expect } from "vitest";
import { detectQuery } from "./detect";

describe("detectQuery", () => {
  it("detects CNIC", () => {
    expect(detectQuery("4220186578817").type).toBe("CNIC");
  });

  it("detects phone", () => {
    expect(detectQuery("03016180767").type).toBe("PHONE");
  });

  it("detects Kashmir-style registration numbers", () => {
    expect(detectQuery("MD-JS-606")).toEqual({
      type: "REGISTRATION",
      normalized: "MD-JS-606",
    });
  });
});
