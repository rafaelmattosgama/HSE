// Runs a demo task with the demo environment: node scripts/demo-run.mjs <seed|reset>
import { runWithDemoEnv } from "./demo-env.mjs";

const TASKS = {
  seed: ["npx", ["tsx", "prisma/demo-seed.ts"]],
  reset: ["npx", ["tsx", "scripts/demo-reset.ts"]],
};

const task = TASKS[process.argv[2]];
if (!task) {
  console.error(`Uso: node scripts/demo-run.mjs <${Object.keys(TASKS).join("|")}>`);
  process.exit(1);
}
await runWithDemoEnv(task[0], task[1]);
