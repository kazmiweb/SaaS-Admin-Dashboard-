import {
  normalizeCnic,
  normalizeEngine,
  normalizeForDetection,
  normalizeMobile,
  normalizeVehicleRegistration,
  normalizeChassis,
  digitsOnly,
} from "../normalizers/queryNormalizer.service.js";
import type { QueryClassificationResult } from "../types/search.types.js";

const reCnic = /^(\d{5}[-\s]?\d{7}[-\s]?\d|\d{13})$/;
const reMobile = /^((\+92|92|0)?3\d{2}[-\s]?\d{7})$/;
const reVehicleReg = /^[A-Za-z]{1,4}[-\s]?\d{1,4}$/;
const reChassis = /^[A-HJ-NPR-Z0-9]{17,20}$/i;
const reEngine = /^[A-Z0-9]{8,12}$/i;

export function classifyQuery(query: string): QueryClassificationResult {
  const originalQuery = query;
  const trimmed = normalizeForDetection(query);

  if (!trimmed) {
    return {
      originalQuery,
      normalizedQuery: "",
      detectedType: "GENERAL",
      confidence: 0,
      reason: "empty_query",
    };
  }

  const compact = trimmed.replace(/[\s-]/g, "");

  if (reCnic.test(trimmed) || /^\d{13}$/.test(digitsOnly(trimmed))) {
    return {
      originalQuery,
      normalizedQuery: normalizeCnic(trimmed),
      detectedType: "CNIC",
      confidence: 1,
      reason: "cnic_pattern_match",
    };
  }

  if (reMobile.test(trimmed)) {
    return {
      originalQuery,
      normalizedQuery: normalizeMobile(trimmed),
      detectedType: "MOBILE",
      confidence: 1,
      reason: "mobile_pattern_match",
    };
  }

  if (reVehicleReg.test(trimmed)) {
    return {
      originalQuery,
      normalizedQuery: normalizeVehicleRegistration(trimmed),
      detectedType: "VEHICLE_REGISTRATION",
      confidence: 0.95,
      reason: "vehicle_registration_pattern_match",
    };
  }

  if (reChassis.test(compact)) {
    return {
      originalQuery,
      normalizedQuery: normalizeChassis(trimmed),
      detectedType: "CHASSIS",
      confidence: 0.9,
      reason: "chassis_pattern_match",
    };
  }

  if (reEngine.test(compact)) {
    return {
      originalQuery,
      normalizedQuery: normalizeEngine(trimmed),
      detectedType: "ENGINE",
      confidence: 0.85,
      reason: "engine_pattern_match",
    };
  }

  if (/^\d+$/.test(compact)) {
    if (compact.length <= 11) {
      return {
        originalQuery,
        normalizedQuery: normalizeMobile(trimmed),
        detectedType: "MOBILE",
        confidence: 0.65,
        reason: "numeric_mobile_heuristic",
      };
    }
    if (compact.length === 13) {
      return {
        originalQuery,
        normalizedQuery: normalizeCnic(trimmed),
        detectedType: "CNIC",
        confidence: 0.8,
        reason: "numeric_cnic_heuristic",
      };
    }
  }

  return {
    originalQuery,
    normalizedQuery: trimmed,
    detectedType: "GENERAL",
    confidence: 0.5,
    reason: "fallback_general",
  };
}
