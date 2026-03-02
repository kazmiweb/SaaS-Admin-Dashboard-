export type Detected = { type: "CNIC"|"PHONE"|"ENGINE"|"CHASSIS"|"REGISTRATION"|"LICENSE"|"CUSTOM"; normalized: string };

const reCnic = /^\d{13}$/;
const rePhonePk = /^(03\d{9}|92\d{10,11}|923\d{9})$/; // lenient
const reReg = /^[A-Z]{1,4}-?\d{1,4}-?\d{1,6}$/i;
const reEngine = /^[A-Z0-9\-]{5,25}$/i;
const reChassis = /^[A-HJ-NPR-Z0-9\-]{8,25}$/i;

export function detectQuery(q: string): Detected {
  const raw = q.trim();
  const digits = raw.replace(/[^0-9]/g,"");
  if (reCnic.test(digits)) return { type:"CNIC", normalized: digits };

  const phoneNorm = raw.replace(/\s+/g,"").replace(/^\+/, "");
  if (rePhonePk.test(phoneNorm)) return { type:"PHONE", normalized: phoneNorm.startsWith("03") ? ("92" + phoneNorm.slice(1)) : phoneNorm };

  if (reReg.test(raw.replace(/\s+/g,""))) return { type:"REGISTRATION", normalized: raw.toUpperCase() };
  // Heuristics: engine vs chassis are hard; keep separate screens for vehicle tabs; unified uses ENGINE fallback
  if (reChassis.test(raw)) return { type:"CHASSIS", normalized: raw.toUpperCase() };
  if (reEngine.test(raw)) return { type:"ENGINE", normalized: raw.toUpperCase() };

  return { type:"CUSTOM", normalized: raw };
}
