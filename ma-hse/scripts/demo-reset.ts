// npm run demo:reset: wipes the local demo and reloads the demo data.
import { resetDemoData } from "../lib/demo-reset";

try {
  const { durationMs } = await resetDemoData();
  console.log(`[demo] Demo reiniciada em ${Math.round(durationMs / 1000)} s.`);
  process.exit(0);
} catch (error) {
  console.error(`[demo] Falha ao reiniciar a demo: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
