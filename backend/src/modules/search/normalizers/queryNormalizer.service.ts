export function normalizeForDetection(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

export function normalizeCnic(input: string): string {
  const digits = digitsOnly(input);
  if (digits.length !== 13) return input.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function normalizeMobile(input: string): string {
  const digits = digitsOnly(input);
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+92${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("03")) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("92")) {
    return `+${digits}`;
  }
  return input.trim();
}

export function normalizeVehicleRegistration(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeChassis(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function normalizeEngine(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}
