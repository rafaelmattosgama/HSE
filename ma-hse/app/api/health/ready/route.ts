import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pingRedis } from "@/lib/rate-limit";
import { StorageService } from "@/lib/services/storage-service";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const redisReady = await pingRedis();
    if (!redisReady) {
      throw new Error("Redis is not ready");
    }

    await StorageService.checkBucketReady();

    return NextResponse.json({
      ok: true,
      status: "ready",
      checks: {
        database: "ok",
        redis: "ok",
        storage: "ok",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_ready",
        message: error instanceof Error ? error.message : "Unknown readiness error",
      },
      { status: 503 },
    );
  }
}
