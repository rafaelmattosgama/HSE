import Redis from "ioredis";
import { env } from "@/lib/env";

const memoryStore = new Map<string, { count: number; resetAt: number }>();

let redis: Redis | undefined;
let redisConnection: Promise<Redis | null> | undefined;

function createRedisClient() {
  if (redis) {
    return redis;
  }

  try {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      // Readiness checks and rate limits fall back gracefully when Redis is unavailable.
    });
  } catch {
    redis = undefined;
  }

  return redis ?? null;
}

async function getConnectedRedisClient() {
  const client = createRedisClient();
  if (!client) {
    return null;
  }

  if (client.status === "ready") {
    return client;
  }

  if (!redisConnection) {
    redisConnection = (async () => {
      try {
        await client.connect();
        return client;
      } catch {
        if (redis === client) {
          redis = undefined;
        }
        client.disconnect();
        return null;
      }
    })().finally(() => {
      redisConnection = undefined;
    });
  }

  return redisConnection;
}

export async function consumeRateLimit(key: string, points = env.RATE_LIMIT_POINTS, windowSec = env.RATE_LIMIT_WINDOW_SEC) {
  const redisClient = await getConnectedRedisClient();

  if (redisClient) {
    const now = Date.now();
    const redisKey = `rl:${key}`;
    const tx = redisClient.multi();
    tx.incr(redisKey);
    tx.pttl(redisKey);
    const [incrResult, ttlResult] = (await tx.exec()) ?? [];

    const consumed = Number(incrResult?.[1] ?? 0);
    let ttl = Number(ttlResult?.[1] ?? -1);

    if (ttl < 0) {
      await redisClient.pexpire(redisKey, windowSec * 1000);
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

export async function getRateLimitState(key: string, points = env.RATE_LIMIT_POINTS) {
  const redisClient = await getConnectedRedisClient();

  if (redisClient) {
    const redisKey = `rl:${key}`;
    const [countResult, ttlResult] = await Promise.all([redisClient.get(redisKey), redisClient.pttl(redisKey)]);
    const count = Number(countResult ?? 0);
    const ttl = Number(ttlResult ?? -1);
    const resetAt = ttl > 0 ? Date.now() + ttl : null;

    return {
      count,
      allowed: count < points,
      remaining: Math.max(0, points - count),
      resetAt,
    };
  }

  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryStore.delete(key);
    return {
      count: 0,
      allowed: true,
      remaining: points,
      resetAt: null,
    };
  }

  return {
    count: existing.count,
    allowed: existing.count < points,
    remaining: Math.max(0, points - existing.count),
    resetAt: existing.resetAt,
  };
}

export async function resetRateLimit(key: string) {
  const redisClient = await getConnectedRedisClient();

  if (redisClient) {
    await redisClient.del(`rl:${key}`);
    return;
  }

  memoryStore.delete(key);
}

export function getRedisClient() {
  return createRedisClient();
}

export async function pingRedis() {
  const client = await getConnectedRedisClient();
  if (!client) return false;

  await client.ping();
  return true;
}
