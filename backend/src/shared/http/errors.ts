import type { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "NOT_FOUND", "Route not found"));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.status ?? 500;
  const code = err?.code ?? "INTERNAL_ERROR";
  const message = status === 500 ? "Server error" : (err?.message ?? "Error");
  if (status === 500) console.error(err);
  res.status(status).json({ status: "error", code, message });
}
