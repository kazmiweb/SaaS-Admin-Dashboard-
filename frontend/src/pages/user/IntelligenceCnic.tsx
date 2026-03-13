import React from "react";
import IntelligenceBase from "./IntelligenceBase";

export default function IntelligenceCnic() {
  return (
    <IntelligenceBase
      title="CNIC Lookup"
      serviceName="CNIC Lookup"
      placeholder="Enter CNIC (13 digits, no dashes) e.g. 4220186578817"
      description="Enter 13 Digits CNIC without Dashes"
      badgeLabel={null}
      resultsActions="single-pdf"
      validate={(raw) => {
        const d = raw.trim().replace(/[^0-9]/g, "");
        if (d.length !== 13) return "CNIC must be exactly 13 digits (no dashes)";
        return null;
      }}
      normalizeForBackend={(raw) => raw.trim().replace(/[^0-9]/g, "")}
    />
  );
}
