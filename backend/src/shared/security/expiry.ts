import type { User } from "@prisma/client";
import { prisma } from "../prisma.js";

/**
 * Business rule: after expiry date, coins expire and are gone (credits -> 0).
 * This is a best-effort sync that runs on common entry points.
 */
export async function syncExpiredCredits(user: Pick<User, "id" | "expireAt" | "credits">) {
  if (!user.expireAt) return;
  if (user.expireAt.getTime() >= Date.now()) return;
  if (user.credits === 0) return;
  await prisma.user.update({ where: { id: user.id }, data: { credits: 0 } });
}
