import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const EXPIRY_WARNING_DAYS = 5;
const LOW_COIN_THRESHOLD = 10;

type UserSnapshot = {
  id: string;
  credits: number;
  expireAt: Date | null;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / msPerDay);
}

export async function upsertNotification(input: {
  userId: string;
  key?: string;
  category: string;
  title: string;
  message: string;
  expiresAt?: Date | null;
  meta?: Prisma.InputJsonValue;
}) {
  if (!input.key) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category,
        title: input.title,
        message: input.message,
        expiresAt: input.expiresAt ?? null,
        meta: input.meta,
      },
    });
  }

  return prisma.notification.upsert({
    where: {
      userId_key: {
        userId: input.userId,
        key: input.key,
      },
    },
    create: {
      userId: input.userId,
      key: input.key,
      category: input.category,
      title: input.title,
      message: input.message,
      expiresAt: input.expiresAt ?? null,
      meta: input.meta,
    },
    update: {
      category: input.category,
      title: input.title,
      message: input.message,
      expiresAt: input.expiresAt ?? null,
      meta: input.meta,
    },
  });
}

export async function ensureSystemNotifications(user: UserSnapshot) {
  const now = new Date();
  const tasks: Promise<unknown>[] = [];

  if (user.expireAt) {
    const daysLeft = diffInDays(now, user.expireAt);
    if (daysLeft >= 0 && daysLeft <= EXPIRY_WARNING_DAYS) {
      const key = `expiry-warning:${user.expireAt.toISOString().slice(0, 10)}`;
      tasks.push(
        upsertNotification({
          userId: user.id,
          key,
          category: "EXPIRY_WARNING",
          title: "Login expiry warning",
          message: `Apka Login ${daysLeft} Din Me Expire Hony wala Ha Update Karny k liye Admin se contact kary`,
          expiresAt: user.expireAt,
          meta: { daysLeft, expireAt: user.expireAt.toISOString() },
        })
      );
    } else {
      tasks.push(
        prisma.notification.deleteMany({
          where: {
            userId: user.id,
            category: "EXPIRY_WARNING",
          },
        })
      );
    }
  } else {
    tasks.push(
      prisma.notification.deleteMany({
        where: {
          userId: user.id,
          category: "EXPIRY_WARNING",
        },
      })
    );
  }

  if ((user.credits ?? 0) <= LOW_COIN_THRESHOLD) {
    tasks.push(
      upsertNotification({
        userId: user.id,
        key: "low-coins:10",
        category: "LOW_COINS",
        title: "Low coins alert",
        message: `Apke coins kam reh gaye hain. Sirf ${Math.max(user.credits ?? 0, 0)} coins baki hain. Recharge k liye Admin se rabta karein.`,
        meta: { credits: user.credits ?? 0, threshold: LOW_COIN_THRESHOLD },
      })
    );
  } else {
    tasks.push(
      prisma.notification.deleteMany({
        where: {
          userId: user.id,
          category: "LOW_COINS",
        },
      })
    );
  }

  await Promise.all(tasks);
}
