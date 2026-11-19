// Fictitious workers for the demo plants. The names are deliberately artificial
// ("Demo", "Teste", ...) so they can never be mistaken for real people.
const FIRST_NAMES = [
  "Ana Demo",
  "Bruno Teste",
  "Carla Exemplo",
  "Diogo Fictício",
  "Eva Amostra",
  "Filipe Modelo",
  "Gabriela Simulada",
  "Hugo Ensaio",
] as const;

const LAST_NAMES = ["Silva", "Costa", "Rocha", "Lopes", "Matos"] as const;

export const DEMO_WORKERS: ReadonlyArray<{ employeeNo: string; name: string }> = FIRST_NAMES.flatMap((first, i) =>
  LAST_NAMES.map((last, j) => ({ employeeNo: `D${String(1001 + i * LAST_NAMES.length + j)}`, name: `${first} ${last}` })),
);
