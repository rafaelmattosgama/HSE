// Fire equipment types are a fixed, universal taxonomy — unlike the
// Competence catalog (each plant defines its own from scratch), these 5 are
// provisioned into every plant, existing and new. See
// lib/services/fire-equipment-type-service.ts and
// app/api/corporate/plants/route.ts's ensurePlantDefaults for the two call
// sites that upsert this same list.
export const FIRE_EQUIPMENT_EXTINGUISHER_CODE = "EXTINGUISHER";

export const DEFAULT_FIRE_EQUIPMENT_TYPES = [
  { code: FIRE_EQUIPMENT_EXTINGUISHER_CODE, name: "Extintor", category: "PORTABLE_EXTINCTION", codePrefix: "EXT", displayOrder: 0 },
  { code: "HOSE_REEL", name: "Carretel", category: "FIXED_EXTINCTION", codePrefix: "CAR", displayOrder: 1 },
  { code: "EMERGENCY_LIGHT", name: "Bloco de luz de emergência", category: "EMERGENCY_LIGHTING", codePrefix: "BLE", displayOrder: 2 },
  { code: "ALARM_BUTTON", name: "Botão de alarme", category: "DETECTION_ALARM", codePrefix: "BTA", displayOrder: 3 },
  { code: "SMOKE_DETECTOR", name: "Detetor de fumo", category: "DETECTION_ALARM", codePrefix: "DET", displayOrder: 4 },
] as const;
