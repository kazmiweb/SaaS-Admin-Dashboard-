import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  client = new Redis(url ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true
  });
  return client;
}
