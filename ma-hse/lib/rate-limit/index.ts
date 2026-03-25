import Redis from "ioredis";
import { env } from "@/lib/env";

const memoryStore = new Map<string, { count: number; resetAt: number }>();

let redis: Redis | null = null;
try {
  redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.connect().catch(() => {
    redis = null;
  });
} catch {
  redis = null;
}

export async function consumeRateLimit(key: string, points = env.RATE_LIMIT_POINTS, windowSec = env.RATE_LIMIT_WINDOW_SEC) {
  if (redis) {
    const now = Date.now();
    const redisKey = `rl:${key}`;
    const tx = redis.multi();
    tx.incr(redisKey);
    tx.pttl(redisKey);
    const [incrResult, ttlResult] = (await tx.exec()) ?? [];

    const consumed = Number(incrResult?.[1] ?? 0);
    let ttl = Number(ttlResult?.[1] ?? -1);

    if (ttl < 0) {
      await redis.pexpire(redisKey, windowSec * 1000);
      ttl = windowSec * 1000;
    }

    return {
      allowed: consumed <= points,
      remaining: Math.max(0, points - consumed),
      resetAt: now + ttl,
    };
  }

  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowSec * 1000,
    });

    return {
      allowed: true,
      remaining: points - 1,
      resetAt: now + windowSec * 1000,
    };
  }

  existing.count += 1;
  memoryStore.set(key, existing);

  return {
    allowed: existing.count <= points,
    remaining: Math.max(0, points - existing.count),
    resetAt: existing.resetAt,
  };
}

export function getRedisClient() {
  return redis;
}