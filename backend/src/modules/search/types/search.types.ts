export type SearchDetectedType =
  | "CNIC"
  | "MOBILE"
  | "VEHICLE_REGISTRATION"
  | "CHASSIS"
  | "ENGINE"
  | "GENERAL";

export type QueryClassificationResult = {
  originalQuery: string;
  normalizedQuery: string;
  detectedType: SearchDetectedType;
  confidence: number;
  reason?: string;
};

export type SearchSourceDiagnostic = {
  sourceId: string;
  sourceName: string;
  status: "success" | "failed";
  latencyMs: number;
  timedOut: boolean;
  cached: boolean;
  error?: string;
  matched: boolean;
};

export type SearchSourceResult = {
  sourceId: string;
  sourceName: string;
  data: unknown;
  cached: boolean;
};

export type ApiExecutionResult = {
  results: SearchSourceResult[];
  diagnostics: SearchSourceDiagnostic[];
};

export type OrchestratedSearchResult = {
  status: "success" | "partial";
  service: string;
  originalQuery: string;
  normalizedQuery: string;
  detectedType: SearchDetectedType;
  confidence: number;
  reason?: string;
  cached: boolean;
  completedAt: string;
  totalLatencyMs: number;
  fastestSource: string | null;
  results: SearchSourceResult[];
  sourceDiagnostics: SearchSourceDiagnostic[];
  cost: number;
  remainingCredits: number | null;
};
