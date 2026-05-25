import process from "node:process";
import iconv from "iconv-lite";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const suspiciousPattern = /├|ÔÇ|┬|[ÃãÂâ][^\u0000-\u007F]|�/u;
const suspiciousGlobalPattern = /├|ÔÇ|┬|[ÃãÂâ][^\u0000-\u007F]|�/gu;

function quoteIdentifier(value) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function suspiciousCount(value) {
  return [...value.matchAll(suspiciousGlobalPattern)].length;
}

function maybeRepairText(value) {
  if (!suspiciousPattern.test(value)) {
    return { changed: false, value };
  }

  const repaired = iconv.decode(iconv.encode(value, "cp850"), "utf8");
  if (repaired.includes("�")) {
    return { changed: false, value };
  }

  if (suspiciousCount(repaired) >= suspiciousCount(value) || repaired === value) {
    return { changed: false, value };
  }

  return { changed: true, value: repaired };
}

function repairJsonValue(value) {
  if (typeof value === "string") {
    return maybeRepairText(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const repaired = value.map((entry) => {
      const result = repairJsonValue(entry);
      changed ||= result.changed;
      return result.value;
    });
    return { changed, value: repaired };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const repaired = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const result = repairJsonValue(entry);
        changed ||= result.changed;
        return [key, result.value];
      }),
    );
    return { changed, value: repaired };
  }
  return { changed: false, value };
}

function suspiciousWhere(identifier) {
  return `(${identifier}::text LIKE '%├%' OR ${identifier}::text LIKE '%ÔÇ%' OR ${identifier}::text LIKE '%┬%' OR ${identifier}::text LIKE '%�%')`;
}

function printUsage() {
  console.log("Usage: node scripts/repair-db-mojibake.mjs [--apply] [--table <name>] [--limit <n>]");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    apply: false,
    table: null,
    limit: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--table") {
      options.table = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[index + 1] ?? "");
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      options.limit = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function listCandidateColumns(table) {
  const filters = table ? ` AND table_name = '${table.replaceAll("'", "''")}'` : "";
  return prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      ${filters}
    ORDER BY table_name, ordinal_position
  `);
}

async function readCandidateRows(tableName, columnName, limit) {
  const tableIdentifier = quoteIdentifier(tableName);
  const columnIdentifier = quoteIdentifier(columnName);
  const limitClause = limit ? ` LIMIT ${limit}` : "";

  return prisma.$queryRawUnsafe(`
    SELECT ctid::text AS ctid, ${columnIdentifier}::text AS value
    FROM ${tableIdentifier}
    WHERE ${columnIdentifier} IS NOT NULL
      AND ${suspiciousWhere(columnIdentifier)}
    ${limitClause}
  `);
}

async function updateRow(tableName, columnName, dataType, ctid, value) {
  const tableIdentifier = quoteIdentifier(tableName);
  const columnIdentifier = quoteIdentifier(columnName);

  if (dataType === "json") {
    await prisma.$executeRawUnsafe(
      `UPDATE ${tableIdentifier} SET ${columnIdentifier} = $1::json WHERE ctid = $2::tid`,
      JSON.stringify(value),
      ctid,
    );
    return;
  }

  if (dataType === "jsonb") {
    await prisma.$executeRawUnsafe(
      `UPDATE ${tableIdentifier} SET ${columnIdentifier} = $1::jsonb WHERE ctid = $2::tid`,
      JSON.stringify(value),
      ctid,
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE ${tableIdentifier} SET ${columnIdentifier} = $1 WHERE ctid = $2::tid`,
    value,
    ctid,
  );
}

async function main() {
  const options = parseArgs();
  const columns = await listCandidateColumns(options.table);

  let touchedColumns = 0;
  let repairedRows = 0;
  let erroredRows = 0;

  for (const column of columns) {
    const rows = await readCandidateRows(column.table_name, column.column_name, options.limit);
    if (!rows.length) {
      continue;
    }

    let columnChanges = 0;
    for (const row of rows) {
      try {
        let result;
        if (column.data_type === "json" || column.data_type === "jsonb") {
          result = repairJsonValue(JSON.parse(row.value));
        } else {
          result = maybeRepairText(row.value);
        }

        if (!result.changed) {
          continue;
        }

        columnChanges += 1;
        repairedRows += 1;

        if (options.apply) {
          await updateRow(column.table_name, column.column_name, column.data_type, row.ctid, result.value);
        }
      } catch (error) {
        erroredRows += 1;
        console.error(
          `${column.table_name}.${column.column_name} ctid=${row.ctid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!columnChanges) {
      continue;
    }

    touchedColumns += 1;
    const action = options.apply ? "repaired" : "would repair";
    console.log(`${column.table_name}.${column.column_name}: ${action} ${columnChanges} row(s)`);
  }

  if (!touchedColumns) {
    console.log("No mojibake candidates found.");
  } else if (!options.apply) {
    console.log(`Dry-run complete. ${repairedRows} row(s) would change across ${touchedColumns} column(s).`);
  } else {
    console.log(`Repair complete. ${repairedRows} row(s) updated across ${touchedColumns} column(s).`);
  }

  if (erroredRows > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
