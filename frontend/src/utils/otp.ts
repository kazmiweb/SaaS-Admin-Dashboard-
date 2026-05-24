type MaybeNumber = number | string | null | undefined;

function toPositiveInt(value: MaybeNumber) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeOtpInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function extractCooldownSeconds(payload: any): number | null {
  const direct = toPositiveInt(payload?.cooldownSeconds);
  if (direct) return direct;
  return null;
}

export function extractExpiresInSeconds(payload: any): number | null {
  const direct = toPositiveInt(payload?.expiresInSeconds);
  if (direct) return direct;
  return null;
}

export function extractRetryAfterSeconds(error: any): number | null {
  const detailsRetry = toPositiveInt(error?.response?.data?.details?.retryAfterSeconds);
  if (detailsRetry) return detailsRetry;

  const headerRetry = toPositiveInt(error?.response?.headers?.["retry-after"]);
  if (headerRetry) return headerRetry;

  const message = String(error?.response?.data?.message ?? "");
  const match = message.match(/(\d+)\s*s/i);
  if (!match) return null;
  return toPositiveInt(match[1]);
}
