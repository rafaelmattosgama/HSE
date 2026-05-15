type UnsafeConditionTypeOption = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
};

type UnsafeConditionTypeGroup = {
  category: string;
  types: UnsafeConditionTypeOption[];
};

function unsafeConditionTypeLabel(type: UnsafeConditionTypeOption) {
  return type.code ? `${type.code} - ${type.name}` : type.name;
}

export function groupUnsafeConditionTypes(types: UnsafeConditionTypeOption[]): UnsafeConditionTypeGroup[] {
  const groups = new Map<string, UnsafeConditionTypeOption[]>();

  for (const type of types) {
    const category = type.category?.trim() || "General";
    const entries = groups.get(category) ?? [];
    entries.push(type);
    groups.set(category, entries);
  }

  return [...groups.entries()]
    .map(([category, entries]) => ({
      category,
      types: [...entries].sort((left, right) => left.name.localeCompare(right.name) || (left.code ?? "").localeCompare(right.code ?? "")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

export function UnsafeConditionTypeSelect({
  value,
  onChange,
  types,
  placeholder = "Unsafe condition type",
  disabled,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  types: UnsafeConditionTypeOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const groups = groupUnsafeConditionTypes(types);

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className} disabled={disabled} required={required}>
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.types.map((type) => (
            <option key={type.id} value={type.id}>
              {unsafeConditionTypeLabel(type)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

