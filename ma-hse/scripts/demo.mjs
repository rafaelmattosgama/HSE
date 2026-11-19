// npm run demo: starts the local demo (isolated containers, port 3100,
// fictitious data). See docs/modo-demo.md.
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { loadDemoEnv } from "./demo-env.mjs";

const env = loadDemoEnv();
const isWin = process.platform === "win32";
const COMPOSE = ["compose", "-f", "docker-compose.demo.yml"];
const APP_PORT = 3100;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: isWin });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} falhou (código ${result.status}).`);
  }
}

function runLong(command, args) {
  return spawn(command, args, { stdio: "inherit", env, shell: isWin });
}

function portInUseOn(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code !== "EAFNOSUPPORT" && error.code !== "EADDRNOTAVAIL"));
    server.once("listening", () => server.close(() => resolve(false)));
    server.listen(port, host);
  });
}

// Next listens on "::" (IPv6), so checking 127.0.0.1 alone misses a running demo.
async function portInUse(port) {
  return (await portInUseOn(port, "127.0.0.1")) || (await portInUseOn(port, "::"));
}

async function main() {
  if (spawnSync("docker", ["info"], { stdio: "ignore", shell: isWin }).status !== 0) {
    console.error("[demo] O Docker não está a correr. Arranque o Docker Desktop e tente de novo.");
    process.exit(1);
  }
  if (await portInUse(APP_PORT)) {
    console.error(`[demo] A porta ${APP_PORT} já está ocupada (a demo já está a correr?).`);
    process.exit(1);
  }

  console.log("[demo] A arrancar os contentores da demo...");
  run("docker", [...COMPOSE, "up", "-d", "--wait", "postgres", "redis", "minio"]);
  run("docker", [...COMPOSE, "up", "minio-init"]);

  console.log("[demo] A aplicar migrações na base ehs_demo...");
  run("npx", ["prisma", "migrate", "deploy"]);

  const probe = spawnSync("npx", ["tsx", "scripts/demo-is-empty.ts"], { env, shell: isWin, encoding: "utf8" });
  if (probe.status !== 0) {
    console.error(probe.stderr);
    throw new Error("Não foi possível verificar a base de dados da demo.");
  }
  if (probe.stdout.trim().endsWith("empty")) {
    console.log("[demo] Base vazia: a carregar dados de demonstração (pode demorar alguns minutos)...");
    run("npx", ["tsx", "prisma/demo-seed.ts"]);
  }

  console.log(`[demo] Demo em http://localhost:${APP_PORT} (dados fictícios). Ctrl+C para parar.`);
  const children = [
    runLong("npx", ["next", "dev", "--port", String(APP_PORT)]),
    runLong("npx", ["tsx", "jobs/worker.ts"]),
  ];
  const stop = () => {
    for (const child of children) {
      // On Windows the child is a shell; kill its whole tree (only processes this script started).
      if (isWin && child.pid) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
      else child.kill();
    }
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(`[demo] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
