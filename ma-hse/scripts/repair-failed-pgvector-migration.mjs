// One-time self-repair for the failed migration
// 20261028120000_add_incident_knowledge_base (P3009).
//
// That migration failed in production because the old postgres:16 image had
// no pgvector extension; it failed on its first statement (CREATE EXTENSION),
// so nothing was created. Once the database runs an image that provides
// pgvector, the failed record can be marked as rolled back and re-applied.
//
// The script only acts when ALL safety conditions hold; otherwise it does
// nothing (or stops with an explicit message) and `prisma migrate deploy`
// behaves as before.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const TARGET_MIGRATION = "20261028120000_add_incident_knowledge_base";

/**
 * Pure decision function (unit tested).
 * @param {{
 *   migrationsTableExists: boolean,
 *   targetFailed: boolean,
 *   otherFailedMigrations: string[],
 *   vectorAvailable: boolean,
 *   partialObjects: string[],
 * }} state
 * @returns {{ action: "none" | "resolve" | "abort", reason: string }}
 */
export function decidePgvectorRepair(state) {
  if (!state.migrationsTableExists) {
    return { action: "none", reason: "no _prisma_migrations table (fresh database)" };
  }
  if (!state.targetFailed) {
    return { action: "none", reason: `${TARGET_MIGRATION} is not marked as failed` };
  }
  if (state.otherFailedMigrations.length > 0) {
    return {
      action: "abort",
      reason: `other failed migrations exist (${state.otherFailedMigrations.join(", ")}); manual analysis required`,
    };
  }
  if (!state.vectorAvailable) {
    return {
      action: "abort",
      reason:
        "the pgvector extension is not available in this PostgreSQL. Recreate the postgres container with the image from docker-compose.prod.yml (see DEPLOY.md, 'Migrar O PostgreSQL Para pgvector')",
    };
  }
  if (state.partialObjects.length > 0) {
    return {
      action: "abort",
      reason: `the failed migration left objects behind (${state.partialObjects.join(", ")}); manual analysis required`,
    };
  }
  return { action: "resolve", reason: `marking ${TARGET_MIGRATION} as rolled back so it can be re-applied` };
}

async function readState(prisma) {
  const [{ exists: migrationsTableExists }] = await prisma.$queryRaw`
    select to_regclass('public._prisma_migrations') is not null as "exists"`;
  if (!migrationsTableExists) {
    return {
      migrationsTableExists,
      targetFailed: false,
      otherFailedMigrations: [],
      vectorAvailable: false,
      partialObjects: [],
    };
  }

  const failedRows = await prisma.$queryRaw`
    select migration_name from _prisma_migrations
    where finished_at is null and rolled_back_at is null`;
  const failed = failedRows.map((row) => row.migration_name);

  const [{ available: vectorAvailable }] = await prisma.$queryRaw`
    select exists (select 1 from pg_available_extensions where name = 'vector') as "available"`;

  const tableRows = await prisma.$queryRaw`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name like 'IncidentKnowledge%'`;
  const typeRows = await prisma.$queryRaw`
    select t.typname as name from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e' and t.typname like 'IncidentKnowledge%'`;

  return {
    migrationsTableExists,
    targetFailed: failed.includes(TARGET_MIGRATION),
    otherFailedMigrations: failed.filter((name) => name !== TARGET_MIGRATION),
    vectorAvailable,
    partialObjects: [...tableRows, ...typeRows].map((row) => row.name),
  };
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let decision;
  try {
    decision = decidePgvectorRepair(await readState(prisma));
  } finally {
    await prisma.$disconnect();
  }

  if (decision.action === "none") {
    console.log(`[pgvector-repair] nothing to do: ${decision.reason}`);
    return;
  }
  if (decision.action === "abort") {
    console.error(`[pgvector-repair] STOP: ${decision.reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[pgvector-repair] ${decision.reason}`);
  execFileSync("npx", ["prisma", "migrate", "resolve", "--rolled-back", TARGET_MIGRATION], {
    stdio: "inherit",
  });
  console.log("[pgvector-repair] done; prisma migrate deploy will re-apply the migration");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[pgvector-repair] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
