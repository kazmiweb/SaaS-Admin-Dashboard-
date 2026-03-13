import { describe, it, expect } from "vitest";
import { classifyQuery } from "./queryClassifier.service.js";

describe("classifyQuery", () => {
  it("detects and normalizes cnic", () => {
    const result = classifyQuery("61101 1234567 1");
    expect(result.detectedType).toBe("CNIC");
    expect(result.normalizedQuery).toBe("61101-1234567-1");
  });

  it("detects and normalizes mobile", () => {
    const result = classifyQuery("0300 1234567");
    expect(result.detectedType).toBe("MOBILE");
    expect(result.normalizedQuery).toBe("+923001234567");
  });

  it("falls back to general", () => {
    const result = classifyQuery("some random query");
    expect(result.detectedType).toBe("GENERAL");
  });
});
