import { Router, type Request, type Response } from "express";
import type { Notification, Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuth, requireRole } from "../../shared/security/authMiddleware.js";
import { verifyAccess } from "../../shared/security/jwt.js";
import { HttpError } from "../../shared/http/errors.js";
import { sendSupportTicketEmail } from "../../shared/mail/mailer.js";

type ActorRole = "ADMIN" | "RESELLER" | "USER";
type Actor = { sub: string; role: ActorRole };
type SupportStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type SenderType = "USER" | "ADMIN" | "SYSTEM";

type SupportMeta = {
  version: 1;
  token: string;
  messageId: string;
  subject: string;
  status: SupportStatus;
  senderType: SenderType;
  source: string;
  category: string;
  priority: string;
  contactEmail?: string;
  contactName?: string;
  threadOwnerId?: string | null;
  assignedAdminId?: string | null;
};

type ThreadMessage = {
  id: string;
  senderType: SenderType;
  body: string;
  createdAt: Date;
};

const SUPPORT_CATEGORY = "SUPPORT_CHAT";
const DEFAULT_STATUS: SupportStatus = "OPEN";

export const supportRouter = Router();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
  subject: z.string().trim().min(2).max(140).optional(),
  category: z.string().trim().min(2).max(40).optional(),
  source: z.string().trim().min(2).max(40).optional(),
  priority: z.string().trim().min(2).max(40).optional(),
  message: z.string().trim().min(3).max(5000),
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(5000),
});

function compactText(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function normalizeStatus(value: unknown): SupportStatus {
  if (value === "OPEN" || value === "IN_PROGRESS" || value === "RESOLVED" || value === "CLOSED") return value;
  return DEFAULT_STATUS;
}

function parseMeta(value: Prisma.JsonValue | null): SupportMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  const token = typeof candidate.token === "string" ? candidate.token : "";
  const messageId = typeof candidate.messageId === "string" ? candidate.messageId : "";
  const subject = typeof candidate.subject === "string" ? candidate.subject : "";
  const senderType = candidate.senderType;
  const status = normalizeStatus(candidate.status);
  const source = typeof candidate.source === "string" ? candidate.source : "dashboard";
  const category = typeof candidate.category === "string" ? candidate.category : "GENERAL";
  const priority = typeof candidate.priority === "string" ? candidate.priority : "NORMAL";

  if (!token || !messageId || !subject) return null;
  if (senderType !== "USER" && senderType !== "ADMIN" && senderType !== "SYSTEM") return null;

  return {
    version: 1,
    token,
    messageId,
    subject,
    status,
    senderType,
    source,
    category,
    priority,
    contactEmail: typeof candidate.contactEmail === "string" ? candidate.contactEmail : undefined,
    contactName: typeof candidate.contactName === "string" ? candidate.contactName : undefined,
    threadOwnerId: typeof candidate.threadOwnerId === "string" || candidate.threadOwnerId === null ? candidate.threadOwnerId : undefined,
    assignedAdminId: typeof candidate.assignedAdminId === "string" || candidate.assignedAdminId === null ? candidate.assignedAdminId : undefined,
  };
}

function buildMeta(input: {
  token: string;
  messageId: string;
  subject: string;
  status: SupportStatus;
  senderType: SenderType;
  source: string;
  category: string;
  priority: string;
  contactEmail?: string;
  contactName?: string;
  threadOwnerId?: string | null;
  assignedAdminId?: string | null;
}): Prisma.InputJsonValue {
  const meta: SupportMeta = {
    version: 1,
    token: input.token,
    messageId: input.messageId,
    subject: input.subject,
    status: input.status,
    senderType: input.senderType,
    source: input.source,
    category: input.category,
    priority: input.priority,
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactName ? { contactName: input.contactName } : {}),
    ...(input.threadOwnerId !== undefined ? { threadOwnerId: input.threadOwnerId } : {}),
    ...(input.assignedAdminId !== undefined ? { assignedAdminId: input.assignedAdminId } : {}),
  };
  return meta;
}

function getOptionalActor(req: Request): Actor | null {
  const session = (req as any).session as { userId?: string; role?: ActorRole } | undefined;
  if (session?.userId && session?.role) {
    return { sub: session.userId, role: session.role };
  }

  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const payload = verifyAccess(token);
    if (payload.type !== "access") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

async function listAdmins() {
  return prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });
}

async function createToken() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = `CMP-${date}-${nanoid(7).toUpperCase()}`;
    const exists = await prisma.notification.findFirst({
      where: {
        category: SUPPORT_CATEGORY,
        meta: { path: ["token"], equals: token },
      },
      select: { id: true },
    });
    if (!exists) return token;
  }
  throw new HttpError(500, "TOKEN_GENERATION_FAILED", "Unable to create complaint token");
}

async function issueMessage(input: {
  token: string;
  senderType: SenderType;
  senderUserId?: string | null;
  participants: string[];
  subject: string;
  status: SupportStatus;
  source: string;
  category: string;
  priority: string;
  body: string;
  contactEmail?: string;
  contactName?: string;
  threadOwnerId?: string | null;
  assignedAdminId?: string | null;
}) {
  const messageId = nanoid(12);
  const participants = Array.from(new Set(input.participants.filter(Boolean)));
  if (!participants.length) {
    throw new HttpError(503, "SUPPORT_UNAVAILABLE", "No admin accounts available for support inbox");
  }

  const meta = buildMeta({
    token: input.token,
    messageId,
    subject: input.subject,
    status: input.status,
    senderType: input.senderType,
    source: input.source,
    category: input.category,
    priority: input.priority,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    threadOwnerId: input.threadOwnerId,
    assignedAdminId: input.assignedAdminId,
  });

  await prisma.notification.createMany({
    data: participants.map((userId) => ({
      userId,
      key: `support:${input.token}:${messageId}:${userId}`,
      category: SUPPORT_CATEGORY,
      title: input.subject,
      message: input.body,
      isRead: userId === input.senderUserId,
      readAt: userId === input.senderUserId ? new Date() : null,
      meta,
    })),
    skipDuplicates: true,
  });

  return { id: messageId, senderType: input.senderType, body: input.body, createdAt: new Date() };
}

async function getThreadRowsForActor(token: string, actorUserId: string) {
  return prisma.notification.findMany({
    where: {
      userId: actorUserId,
      category: SUPPORT_CATEGORY,
      meta: { path: ["token"], equals: token },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function getThreadRowsAnyParticipant(token: string) {
  return prisma.notification.findMany({
    where: {
      category: SUPPORT_CATEGORY,
      meta: { path: ["token"], equals: token },
    },
    orderBy: { createdAt: "asc" },
  });
}

function dedupeMessages(rows: Notification[]): ThreadMessage[] {
  const seen = new Set<string>();
  const out: ThreadMessage[] = [];

  for (const row of rows) {
    const meta = parseMeta(row.meta);
    if (!meta) continue;
    if (seen.has(meta.messageId)) continue;
    seen.add(meta.messageId);
    out.push({ id: meta.messageId, senderType: meta.senderType, body: row.message, createdAt: row.createdAt });
  }

  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function lastMeta(rows: Notification[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const meta = parseMeta(rows[index]?.meta ?? null);
    if (meta) return meta;
  }
  return null;
}

function buildTicketSummaryFromRows(rows: Notification[], unreadCount: number) {
  if (!rows.length) return null;
  const latestRow = rows[rows.length - 1]!;
  const latestMeta = parseMeta(latestRow.meta);
  if (!latestMeta) return null;

  return {
    id: latestMeta.token,
    token: latestMeta.token,
    subject: latestMeta.subject,
    status: latestMeta.status,
    category: latestMeta.category,
    priority: latestMeta.priority,
    source: latestMeta.source,
    contactEmail: latestMeta.contactEmail ?? null,
    contactName: latestMeta.contactName ?? null,
    lastMessageAt: latestRow.createdAt,
    lastMessagePreview: compactText(latestRow.message, 160),
    messageCount: dedupeMessages(rows).length,
    unreadCount,
  };
}

async function threadSnapshot(token: string) {
  const rows = await getThreadRowsAnyParticipant(token);
  if (!rows.length) return null;
  const meta = lastMeta(rows);
  if (!meta) return null;
  return {
    rows,
    meta,
    messages: dedupeMessages(rows),
  };
}

async function listTicketsForActor(actor: Actor) {
  const rows = await prisma.notification.findMany({
    where: {
      userId: actor.sub,
      category: SUPPORT_CATEGORY,
    },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });

  const byToken = new Map<string, Notification[]>();
  rows.forEach((row) => {
    const meta = parseMeta(row.meta);
    if (!meta) return;
    const bucket = byToken.get(meta.token) ?? [];
    bucket.push(row);
    byToken.set(meta.token, bucket);
  });

  const items = Array.from(byToken.values())
    .map((ticketRows) => {
      const unreadCount = ticketRows.filter((row) => {
        if (row.isRead) return false;
        const meta = parseMeta(row.meta);
        if (!meta) return false;
        if (actor.role === "ADMIN") return meta.senderType !== "ADMIN";
        return meta.senderType === "ADMIN" || meta.senderType === "SYSTEM";
      }).length;
      return buildTicketSummaryFromRows(ticketRows, unreadCount);
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return items;
}

function assertPublicEmailAllowed(meta: SupportMeta, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new HttpError(400, "BAD_REQUEST", "Email is required");
  const contactEmail = (meta.contactEmail ?? "").toLowerCase();
  if (!contactEmail || contactEmail !== normalized) {
    throw new HttpError(403, "FORBIDDEN", "Ticket access denied");
  }
}

supportRouter.post("/contact", async (req: Request, res: Response) => {
  const body = contactSchema.parse(req.body ?? {});
  const actor = getOptionalActor(req);

  const actorUser = actor
    ? await prisma.user.findUnique({
        where: { id: actor.sub },
        select: { id: true, email: true, name: true, role: true },
      })
    : null;

  if (actor && !actorUser) {
    throw new HttpError(401, "UNAUTHORIZED", "Session not found");
  }

  const admins = await listAdmins();
  const adminIds = admins.map((item) => item.id);
  if (!adminIds.length) {
    throw new HttpError(503, "SUPPORT_UNAVAILABLE", "Admin inbox is not configured");
  }

  const contactEmail = (body.email ?? actorUser?.email ?? "").trim().toLowerCase();
  const contactName = (body.name ?? actorUser?.name ?? "").trim() || undefined;
  const ownerUser = !actorUser && contactEmail
    ? await prisma.user.findUnique({ where: { email: contactEmail }, select: { id: true } })
    : null;
  const threadOwnerId = actorUser && actorUser.role !== "ADMIN" ? actorUser.id : ownerUser?.id ?? null;

  const token = await createToken();
  const messageText = body.message.trim();
  const subject = body.subject?.trim() || "General Support Request";
  const senderType: SenderType = actorUser?.role === "ADMIN" ? "ADMIN" : "USER";
  const senderUserId = actorUser?.id ?? threadOwnerId;
  const participants = [...adminIds, ...(threadOwnerId ? [threadOwnerId] : [])];

  const created = await issueMessage({
    token,
    senderType,
    senderUserId,
    participants,
    subject,
    status: DEFAULT_STATUS,
    source: body.source ?? (actor ? "dashboard" : "login"),
    category: body.category ?? "GENERAL",
    priority: body.priority ?? "NORMAL",
    body: messageText,
    contactEmail: contactEmail || undefined,
    contactName,
    threadOwnerId,
    assignedAdminId: null,
  });

  if (senderType === "USER") {
    await sendSupportTicketEmail({
      ticketToken: token,
      subject,
      message: messageText,
      fromEmail: contactEmail || undefined,
      fromName: contactName,
    }).catch(() => void 0);
  }

  res.status(201).json({
    status: "success",
    ticket: {
      id: token,
      token,
      subject,
      status: DEFAULT_STATUS,
      category: body.category ?? "GENERAL",
      priority: body.priority ?? "NORMAL",
      source: body.source ?? (actor ? "dashboard" : "login"),
      contactEmail: contactEmail || null,
      contactName: contactName ?? null,
      lastMessageAt: new Date(),
      lastMessagePreview: compactText(messageText, 160),
      messageCount: 1,
      unreadCount: 0,
    },
    firstMessage: created,
  });
});

supportRouter.get("/public/:token/messages", async (req: Request, res: Response) => {
  const token = z.string().trim().min(8).max(40).parse(req.params.token);
  const email = z.string().trim().email().max(255).parse(req.query.email);

  const snapshot = await threadSnapshot(token);
  if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Ticket not found");
  assertPublicEmailAllowed(snapshot.meta, email);

  res.json({
    status: "success",
    ticket: {
      id: snapshot.meta.token,
      token: snapshot.meta.token,
      subject: snapshot.meta.subject,
      status: snapshot.meta.status,
      category: snapshot.meta.category,
      priority: snapshot.meta.priority,
      source: snapshot.meta.source,
      contactEmail: snapshot.meta.contactEmail ?? null,
      contactName: snapshot.meta.contactName ?? null,
      createdAt: snapshot.rows[0]?.createdAt,
    },
    messages: snapshot.messages,
  });
});

supportRouter.post("/public/:token/messages", async (req: Request, res: Response) => {
  const token = z.string().trim().min(8).max(40).parse(req.params.token);
  const body = z
    .object({
      email: z.string().trim().email().max(255),
      message: z.string().trim().min(1).max(5000),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .parse(req.body ?? {});

  const snapshot = await threadSnapshot(token);
  if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Ticket not found");
  assertPublicEmailAllowed(snapshot.meta, body.email);

  const admins = await listAdmins();
  const adminIds = admins.map((item) => item.id);
  const threadOwnerId = snapshot.meta.threadOwnerId ?? null;
  const participants = [...adminIds, ...(threadOwnerId ? [threadOwnerId] : [])];
  const nextStatus = snapshot.meta.status === "RESOLVED" || snapshot.meta.status === "CLOSED" ? "OPEN" : snapshot.meta.status;

  const created = await issueMessage({
    token,
    senderType: "USER",
    senderUserId: threadOwnerId,
    participants,
    subject: snapshot.meta.subject,
    status: nextStatus,
    source: snapshot.meta.source,
    category: snapshot.meta.category,
    priority: snapshot.meta.priority,
    body: body.message,
    contactEmail: body.email.toLowerCase(),
    contactName: body.name ?? snapshot.meta.contactName,
    threadOwnerId,
    assignedAdminId: snapshot.meta.assignedAdminId,
  });

  await sendSupportTicketEmail({
    ticketToken: token,
    subject: snapshot.meta.subject,
    message: body.message,
    fromEmail: body.email,
    fromName: body.name,
  }).catch(() => void 0);

  res.status(201).json({ status: "success", message: created });
});

supportRouter.get("/my/tickets", requireAuth, async (req: Request, res: Response) => {
  const actor = (req as any).auth as Actor;
  const items = await listTicketsForActor(actor);
  res.json({ status: "success", items });
});

supportRouter.get("/tickets/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const actor = (req as any).auth as Actor;
  const token = z.string().trim().min(8).max(40).parse(req.params.id);

  const rows = await getThreadRowsForActor(token, actor.sub);
  if (!rows.length) {
    throw new HttpError(404, "NOT_FOUND", "Ticket not found");
  }

  const messages = dedupeMessages(rows);
  const latest = lastMeta(rows);
  if (!latest) {
    throw new HttpError(404, "NOT_FOUND", "Ticket metadata not found");
  }

  await prisma.notification.updateMany({
    where: {
      userId: actor.sub,
      category: SUPPORT_CATEGORY,
      isRead: false,
      meta: { path: ["token"], equals: token },
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  res.json({
    status: "success",
    ticket: {
      id: latest.token,
      token: latest.token,
      subject: latest.subject,
      status: latest.status,
      category: latest.category,
      priority: latest.priority,
      source: latest.source,
      contactEmail: latest.contactEmail ?? null,
      contactName: latest.contactName ?? null,
      lastMessageAt: rows[rows.length - 1]?.createdAt,
      lastMessagePreview: compactText(rows[rows.length - 1]?.message ?? "", 160),
      messageCount: messages.length,
      unreadCount: 0,
    },
    messages,
  });
});

supportRouter.post("/tickets/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const actor = (req as any).auth as Actor;
  const token = z.string().trim().min(8).max(40).parse(req.params.id);
  const body = replySchema.parse(req.body ?? {});

  const snapshot = await threadSnapshot(token);
  if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Ticket not found");

  if (actor.role !== "ADMIN" && snapshot.meta.threadOwnerId !== actor.sub) {
    throw new HttpError(403, "FORBIDDEN", "Ticket access denied");
  }

  const admins = await listAdmins();
  const adminIds = admins.map((item) => item.id);
  const threadOwnerId = snapshot.meta.threadOwnerId ?? null;
  const participants = [...adminIds, ...(threadOwnerId ? [threadOwnerId] : [])];
  const senderType: SenderType = actor.role === "ADMIN" ? "ADMIN" : "USER";
  const nextStatus: SupportStatus = senderType === "ADMIN"
    ? (snapshot.meta.status === "OPEN" ? "IN_PROGRESS" : snapshot.meta.status)
    : (snapshot.meta.status === "RESOLVED" || snapshot.meta.status === "CLOSED" ? "OPEN" : snapshot.meta.status);

  const created = await issueMessage({
    token,
    senderType,
    senderUserId: actor.sub,
    participants,
    subject: snapshot.meta.subject,
    status: nextStatus,
    source: snapshot.meta.source,
    category: snapshot.meta.category,
    priority: snapshot.meta.priority,
    body: body.message,
    contactEmail: snapshot.meta.contactEmail,
    contactName: snapshot.meta.contactName,
    threadOwnerId,
    assignedAdminId: senderType === "ADMIN" ? actor.sub : snapshot.meta.assignedAdminId,
  });

  if (senderType === "USER") {
    await sendSupportTicketEmail({
      ticketToken: token,
      subject: snapshot.meta.subject,
      message: body.message,
      fromEmail: snapshot.meta.contactEmail,
      fromName: snapshot.meta.contactName,
    }).catch(() => void 0);
  }

  res.status(201).json({ status: "success", message: created });
});

supportRouter.get("/admin/tickets", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const actor = (req as any).auth as Actor;
  const query = z
    .object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      search: z.string().trim().max(120).optional(),
    })
    .parse(req.query);

  let items = await listTicketsForActor(actor);
  if (query.status) items = items.filter((item) => item.status === query.status);
  if (query.search) {
    const needle = query.search.toLowerCase();
    items = items.filter((item) =>
      [item.token, item.subject, item.contactEmail, item.contactName, item.lastMessagePreview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }

  res.json({ status: "success", items });
});

supportRouter.patch("/admin/tickets/:id/status", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const actor = (req as any).auth as Actor;
  const token = z.string().trim().min(8).max(40).parse(req.params.id);
  const body = z
    .object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
      priority: z.string().trim().min(2).max(40).optional(),
      category: z.string().trim().min(2).max(40).optional(),
    })
    .parse(req.body ?? {});

  const snapshot = await threadSnapshot(token);
  if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Ticket not found");

  const admins = await listAdmins();
  const adminIds = admins.map((item) => item.id);
  const threadOwnerId = snapshot.meta.threadOwnerId ?? null;
  const participants = [...adminIds, ...(threadOwnerId ? [threadOwnerId] : [])];

  await issueMessage({
    token,
    senderType: "SYSTEM",
    senderUserId: actor.sub,
    participants,
    subject: snapshot.meta.subject,
    status: body.status,
    source: snapshot.meta.source,
    category: body.category ?? snapshot.meta.category,
    priority: body.priority ?? snapshot.meta.priority,
    body: `Ticket status changed to ${body.status.replace("_", " ")}`,
    contactEmail: snapshot.meta.contactEmail,
    contactName: snapshot.meta.contactName,
    threadOwnerId,
    assignedAdminId: actor.sub,
  });

  res.json({
    status: "success",
    ticket: {
      id: token,
      token,
      subject: snapshot.meta.subject,
      status: body.status,
      category: body.category ?? snapshot.meta.category,
      priority: body.priority ?? snapshot.meta.priority,
    },
  });
});
