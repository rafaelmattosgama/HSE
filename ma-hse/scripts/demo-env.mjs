import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

/**
 * Environment for the local demo: the parent env overridden by .env.demo.
 * Values in .env.demo win even when empty, so development secrets (email
 * gateway, AI keys) from the shell or .env never reach the demo processes.
 */
export function loadDemoEnv() {
  const file = path.join(process.cwd(), ".env.demo");
  if (!fs.existsSync(file)) {
    throw new Error(".env.demo não encontrado. Corra o comando a partir da pasta ma-hse.");
  }
  const demo = parse(fs.readFileSync(file));
  return { ...process.env, ...demo };
}

/** Runs a command with the demo environment and exits with its status (used by package.json scripts). */
export async function runWithDemoEnv(command, args) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: loadDemoEnv(),
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}
