const PERSONAL_FIELD_LINE = /^\s*(?:name|full name|employee name|worker name|injured person|name of injured person|person involved|nome|nome completo|nome do trabalhador|nome do acidentado|nome do comunicante|trabalhador envolvido|worker number|employee number|employee id|worker id|badge number|number of worker|n(?:u|\u00fa|Ãº)mero do trabalhador|n[\u00ba\u00b0.]\s*trabalhador|date of birth|birth date|dob|data de nascimento|email|e-mail|phone|telephone|telefone)\s*[:\-].*$/i;

const PERSONAL_NAME_CONTEXT = /\b(?:injured\s+)?(?:worker|employee|operator|person|trabalhador(?:a)?|colaborador(?:a)?|operador(?:a)?)\s+(?:(?:named|called|de nome|chamado|chamada)\s+)?[\p{Lu}][\p{L}'\u2019.-]+(?:\s+[\p{Lu}][\p{L}'\u2019.-]+){1,3}\b/gu;
const WORKER_ID = /\b(?:employee|worker|trabalhador|trabalhadora)\s*(?:no\.?|number|n[\u00ba\u00b0.]|n(?:u|\u00fa|Ãº)mero|id)(?=\s|[:#-])\s*[:#-]?\s*[A-Z0-9-]{3,}\b/gi;
const EMAIL = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g;

export function sanitizeIncidentKnowledgeText(value: string | null | undefined) {
  if (!value) return value ?? null;
  return value
    .split(/\r?\n/)
    .map((line) => PERSONAL_FIELD_LINE.test(line) ? line.replace(/[:\-].*/, ": [REDACTED]") : line)
    .join("\n")
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(PHONE, "[REDACTED_PHONE]")
    .replace(WORKER_ID, "[REDACTED_WORKER_ID]")
    .replace(PERSONAL_NAME_CONTEXT, "[REDACTED_PERSON]");
}

const DATE_LIKE = /\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/g;
const DATE_PLACEHOLDER = /__IKDATE(\d+)__/g;

/**
 * Text allowed to leave MAxSafety for structured extraction by an external
 * model. Personal data is redacted as in sanitizeIncidentKnowledgeText, but
 * dates are preserved (the PHONE pattern would otherwise swallow them) because
 * incident and action dates are part of the extracted draft. A date on a
 * personal field line (e.g. date of birth) is still redacted with that line.
 */
export function sanitizeIncidentKnowledgeExtractionText(value: string | null | undefined) {
  if (!value) return value ?? null;
  const dates: string[] = [];
  const masked = value.replace(DATE_LIKE, (match) => `__IKDATE${dates.push(match) - 1}__`);
  const sanitized = sanitizeIncidentKnowledgeText(masked) ?? "";
  return sanitized.replace(DATE_PLACEHOLDER, (_match, index: string) => dates[Number(index)] ?? "");
}

/** Text allowed to leave MAxSafety for embedding generation. */
export function sanitizeIncidentKnowledgeEmbeddingText(value: string | null | undefined) {
  const sanitized = sanitizeIncidentKnowledgeText(value)?.trim();
  if (!sanitized) return null;

  return sanitized
    .replace(/\b(?:date of birth|birth date|dob|data de nascimento)\b[^\n.;]*/gi, "[REDACTED_HEALTH_DATA]")
    .replace(/\b(?:medical record|medical history|diagnosis|diagn[o\u00f3]stico|medical treatment|tratamento m[e\u00e9]dico)\b[^\n.;]*/gi, "[REDACTED_HEALTH_DATA]")
    .replace(/\s+/g, " ")
    .trim() || null;
}

export function isStandalonePersonName(value: string | null | undefined) {
  const words = value?.trim().split(/\s+/) ?? [];
  return words.length >= 2 && words.length <= 4
    && words.every((word) => /^\p{Lu}[\p{L}'\u2019.-]+$/u.test(word));
}
