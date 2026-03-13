import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const FALLBACK_HEADER = "x-correlation-id";

function normalizeHeaderValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getRequestId(req: Request): string | undefined {
  return normalizeHeaderValue(req.headers[REQUEST_ID_HEADER]) ?? normalizeHeaderValue(req.headers[FALLBACK_HEADER]);
}

export function getOrCreateRequestId(req: Request): string {
  const existing = (req as any).requestId as string | undefined;
  if (existing) return existing;

  const requestId = getRequestId(req) ?? randomUUID();
  (req as any).requestId = requestId;
  return requestId;
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = getOrCreateRequestId(req);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
