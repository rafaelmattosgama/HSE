export const DEFAULT_NEAR_MISS_TYPES = [
  { code: "NMT01", name: "Lifting operations" },
  { code: "NMT02", name: "Transport safety" },
  { code: "NMT03", name: "LockOut / TagOut (LOTO)" },
  { code: "NMT04", name: "Work at height" },
  { code: "NMT05", name: "Machinery safety" },
  { code: "NMT06", name: "Confined Space" },
  { code: "NMT07", name: "Energy release" },
  { code: "NMT08", name: "None" },
] as const;

export const DEFAULT_NEAR_MISS_TYPE_CODES = DEFAULT_NEAR_MISS_TYPES.map((type) => type.code);
