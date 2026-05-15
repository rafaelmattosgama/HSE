export const DEFAULT_UNSAFE_CONDITION_TYPES = [
  { code: "UC-FAC-01", category: "FACILITIES / EQUIPMENT", name: "Anomalous functioning of equipment / facilities" },
  { code: "UC-FAC-02", category: "FACILITIES / EQUIPMENT", name: "Equipment facilities inadequate" },
  { code: "UC-FAC-03", category: "FACILITIES / EQUIPMENT", name: "Erroneous manufacturing / installation" },
  { code: "UC-FAC-04", category: "FACILITIES / EQUIPMENT", name: "Failure / breakage" },
  { code: "UC-FAC-05", category: "FACILITIES / EQUIPMENT", name: "Lack of cleaning cycles" },
  { code: "UC-FAC-06", category: "FACILITIES / EQUIPMENT", name: "Lack of maintenance" },
  { code: "UC-FAC-07", category: "FACILITIES / EQUIPMENT", name: "Poor lighting" },
  { code: "UC-FAC-08", category: "FACILITIES / EQUIPMENT", name: "Weakness in design" },
  { code: "UC-PROC-01", category: "PROCEDURE / SYSTEMS", name: "Complex work methods" },
  { code: "UC-PROC-02", category: "PROCEDURE / SYSTEMS", name: "Lack of standard procedure and/or safety rules" },
  { code: "UC-PROC-03", category: "PROCEDURE / SYSTEMS", name: "Others" },
  { code: "UC-PROC-04", category: "PROCEDURE / SYSTEMS", name: "Procedure inadequate" },
  { code: "UC-PROC-05", category: "PROCEDURE / SYSTEMS", name: "Protective items not suitable" },
] as const;

export const LEGACY_DEFAULT_UNSAFE_CONDITION_TYPES = [
  { code: "UC1", name: "Housekeeping issue" },
  { code: "UC01", name: "Oil Leak" },
  { code: "UC02", name: "Blocked Exit" },
] as const;

