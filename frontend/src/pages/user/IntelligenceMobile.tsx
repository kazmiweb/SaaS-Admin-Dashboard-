import React from "react";
import IntelligenceBase from "./IntelligenceBase";

export default function IntelligenceMobile() {
  return (
    <IntelligenceBase
      title="Mobile Intelligence"
      placeholder="Enter Mobile (03xxxxxxxxx) e.g. 03001234567"
      validate={(raw) => {
        const v = raw.trim();
        if (!/^03\d{9}$/.test(v)) return "Mobile must be in 03xxxxxxxxx format";
        return null;
      }}
      // backend already normalizes 03 -> 92xxxx, but we keep strict input
      normalizeForBackend={(raw) => raw.trim()}
    />
  );
}
