import { copyFile, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import iconv from "iconv-lite";

const suspiciousGlobalPattern = /├|ÔÇ|┬|[ÃãÂâ][^\u0000-\u007F]|�/gu;

function suspiciousCount(value) {
  return [...value.matchAll(suspiciousGlobalPattern)].length;
}

function repairText(value) {
  return iconv.decode(iconv.encode(value, "cp850"), "utf8");
}

function maybeRepairText(value) {
  const originalCount = suspiciousCount(value);
  if (originalCount === 0) {
    return {
      changed: false,
      repaired: value,
      originalCount,
      repairedCount: 0,
      reason: "clean",
    };
  }

  const repaired = repairText(value);
  const repairedCount = suspiciousCount(repaired);

  if (repaired.includes("�")) {
    return {
      changed: false,
      repaired: value,
      originalCount,
      repairedCount,
      reason: "replacement-character",
    };
  }

  if (repairedCount >= originalCount || repaired === value) {
    return {
      changed: false,
      repaired: value,
      originalCount,
      repairedCount,
      reason: "no-improvement",
    };
  }

  return {
    changed: true,
    repaired,
    originalCount,
    repairedCount,
    reason: "repaired",
  };
}

function printUsage() {
  console.log("Usage: node scripts/fix-mojibake-files.mjs [--check | --write] [--backup] <file> [file...]");
}

async function main() {
  const args = process.argv.slice(2);
  const files = [];
  let mode = "report";
  let backup = false;

  for (const arg of args) {
    if (arg === "--check") {
      mode = "check";
      continue;
    }
    if (arg === "--write") {
      mode = "write";
      continue;
    }
    if (arg === "--backup") {
      backup = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    files.push(arg);
  }

  if (files.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  let hadFailure = false;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const result = maybeRepairText(text);

    if (result.reason === "clean") {
      console.log(`${file}: clean`);
      continue;
    }

    if (!result.changed) {
      console.error(`${file}: suspicious content remains (${result.reason})`);
      hadFailure = true;
      continue;
    }

    if (mode === "write") {
      if (backup) {
        await copyFile(file, `${file}.bak`);
      }
      await writeFile(file, result.repaired, "utf8");
      console.log(`${file}: repaired in place (${result.originalCount} -> ${result.repairedCount})`);
      continue;
    }

    console.log(`${file}: needs repair (${result.originalCount} -> ${result.repairedCount})`);
    if (mode === "check") {
      hadFailure = true;
    }
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
