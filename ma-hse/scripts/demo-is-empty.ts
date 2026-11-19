// Prints "empty" when the demo database has no demo plants yet (used by scripts/demo.mjs).
import { PrismaClient } from "@prisma/client";
import { DEMO_PLANTS } from "../lib/demo-mode";

const prisma = new PrismaClient();
const plants = await prisma.plant.count({ where: { code: { in: DEMO_PLANTS.map((plant) => plant.code) } } });
console.log(plants === 0 ? "empty" : "seeded");
await prisma.$disconnect();
