// Local demo reset: empties the ehs_demo database, the demo redis and the demo
// bucket, then reloads the demo data. Every step re-checks that it is pointed
// at local demo infrastructure (see assertDemoModeSafe) before touching it.
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import { assertDemoModeSafe, isDemoMode } from "@/lib/demo-mode";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assertSafe(serviceUrl: string, label: string) {
  if (!isDemoMode()) throw new Error("O reinício da demo exige DEMO_MODE=true.");
  assertDemoModeSafe(env);
  const host = new URL(serviceUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Reinício da demo recusado: ${label} não é local (${host}).`);
}

async function truncateDemoDatabase() {
  assertSafe(env.DATABASE_URL, "a base de dados");
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((table) => `"public"."${table.tablename.replaceAll('"', '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

async function flushDemoRedis() {
  assertSafe(env.REDIS_URL, "o redis");
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushall();
  } finally {
    redis.disconnect();
  }
}

async function clearDemoBucket() {
  assertSafe(env.S3_ENDPOINT, "o armazenamento S3");
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, ContinuationToken: continuationToken, MaxKeys: 1000 }));
    const objects = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: env.S3_BUCKET, Delete: { Objects: objects, Quiet: true } }));
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  s3.destroy();
}

export async function resetDemoData(): Promise<{ durationMs: number }> {
  const started = Date.now();
  await truncateDemoDatabase();
  await flushDemoRedis();
  await clearDemoBucket();
  const { seedDemo } = await import("../prisma/demo-seed");
  await seedDemo();
  return { durationMs: Date.now() - started };
}
