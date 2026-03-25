import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const INVALID_ENV_KEY_PATTERN = /[=\0]/;

function buildChildEnv(overrides = {}) {
  const env = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key || INVALID_ENV_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === "undefined") {
      continue;
    }
    env[key] = value;
  }

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = String(value);
  }

  return env;
}

function resolveNpmInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      commandArgs: ["/d", "/s", "/c", `npm ${args.join(" ")}`],
    };
  }

  return {
    command: "npm",
    commandArgs: args,
  };
}

function runNpmOnce(args, env) {
  const { command, commandArgs } = resolveNpmInvocation(args);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${commandArgs.join(" ")} exited with code ${code ?? 1}`));
      }
    });

    child.on("error", reject);
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function findAvailablePort(start = 3000, end = 3020) {
  for (let port = start; port <= end; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) {
      return port;
    }
  }

  throw new Error(`No available port found in range ${start}-${end}`);
}

function spawnNpmLongRunning(args, env) {
  const { command, commandArgs } = resolveNpmInvocation(args);

  return spawn(command, commandArgs, {
    stdio: "inherit",
    env,
  });
}

async function main() {
  const port = await findAvailablePort(3000, 3020);
  const baseUrl = `http://localhost:${port}`;
  const nextDevLockPath = path.join(process.cwd(), ".next", "dev", "lock");

  const env = buildChildEnv({
    APP_URL: baseUrl,
    NEXTAUTH_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
  });

  console.log(`[dev:all] Using app port ${port}`);
  console.log(`[dev:all] APP_URL=${baseUrl}`);

  if (fs.existsSync(nextDevLockPath)) {
    console.warn(
      `[dev:all] Detected Next.js dev lock at ${nextDevLockPath}. If app exits immediately, stop other "next dev" processes first.`,
    );
  }

  await runNpmOnce(["run", "scheduler:dev"], env);

  const app = spawnNpmLongRunning(["run", "dev", "--", "--port", String(port)], env);
  const worker = spawnNpmLongRunning(["run", "worker:dev"], env);

  const children = [app, worker];
  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }

    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }
      process.exit(exitCode);
    }, 1500);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  app.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev:all] app exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });

  worker.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev:all] worker exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error("[dev:all] startup failed", error);
  process.exit(1);
});
