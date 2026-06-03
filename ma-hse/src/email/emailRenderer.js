const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

function getValue(data, key) {
  return key.split(".").reduce((current, part) => {
    if (current === null || typeof current === "undefined") return undefined;
    return current[part];
  }, data);
}

function formatValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function renderTemplate(template, data = {}) {
  return String(template).replace(PLACEHOLDER_PATTERN, (_match, key) => formatValue(getValue(data, key)));
}
