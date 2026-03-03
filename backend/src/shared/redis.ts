import Redis from "ioredis";

const url = process.env.REDIS_URL;
export const redis = url ? new Redis(url) : new Redis();
