type UnsafeActTypeOption = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
};

type UnsafeActTypeGroup = {
  category: string;
  types: UnsafeActTypeOption[];
};

function unsafeActTypeLabel(type: UnsafeActTypeOption) {
  return type.code ? `${type.code} - ${type.name}` : type.name;
}

export function groupUnsafeActTypes(types: UnsafeActTypeOption[]): UnsafeActTypeGroup[] {
  const groups = new Map<string, UnsafeActTypeOption[]>();

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

export function UnsafeActTypeSelect({
  value,
  onChange,
  types,
  placeholder = "Escolha Tipo de Ato Inseguro",
  disabled,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  types: UnsafeActTypeOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const groups = groupUnsafeActTypes(types);

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className} disabled={disabled} required={required}>
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.types.map((type) => (
            <option key={type.id} value={type.id}>
              {unsafeActTypeLabel(type)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
