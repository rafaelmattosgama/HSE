type ProfessionalRiskOption = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
};

type ProfessionalRiskGroup = {
  category: string;
  risks: ProfessionalRiskOption[];
};

function riskLabel(risk: ProfessionalRiskOption) {
  return risk.code ? `${risk.code} - ${risk.name}` : risk.name;
}

export function groupProfessionalRisks(risks: ProfessionalRiskOption[]): ProfessionalRiskGroup[] {
  const groups = new Map<string, ProfessionalRiskOption[]>();

  for (const risk of risks) {
    const category = risk.category?.trim() || "General";
    const entries = groups.get(category) ?? [];
    entries.push(risk);
    groups.set(category, entries);
  }

  return [...groups.entries()]
    .map(([category, entries]) => ({
      category,
      risks: [...entries].sort((left, right) => left.name.localeCompare(right.name) || (left.code ?? "").localeCompare(right.code ?? "")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

export function ProfessionalRiskSelect({
  value,
  onChange,
  risks,
  placeholder = "Professional risk",
  disabled,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  risks: ProfessionalRiskOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const groups = groupProfessionalRisks(risks);

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className} disabled={disabled} required={required}>
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.risks.map((risk) => (
            <option key={risk.id} value={risk.id}>
              {riskLabel(risk)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
