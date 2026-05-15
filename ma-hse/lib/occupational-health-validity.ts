const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function formatDateInputValue(value: Date) {
  return toUtcDateOnly(value).toISOString().slice(0, 10);
}

export function parseDateInputValue(value: string) {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function calculateAgeOnDate(birthDate: Date, referenceDate = new Date()) {
  const birth = toUtcDateOnly(birthDate);
  const reference = toUtcDateOnly(referenceDate);
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - birth.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }

  return age;
}

function addCalendarYears(value: Date, years: number) {
  const date = toUtcDateOnly(value);
  const target = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));

  if (target.getUTCMonth() !== date.getUTCMonth()) {
    return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + 1, 0));
  }

  return target;
}

export function getOccupationalHealthExamValidityYears(age: number) {
  return age > 50 ? 1 : 2;
}

export function calculateOccupationalHealthExamValidUntil(input: {
  birthDate: Date;
  examDate: Date;
  referenceDate?: Date;
}) {
  const age = calculateAgeOnDate(input.birthDate, input.referenceDate);
  return addCalendarYears(input.examDate, getOccupationalHealthExamValidityYears(age));
}

export function calculateOccupationalHealthExamValidUntilInput(
  birthDate: string,
  examDate: string,
  referenceDate?: Date,
) {
  const parsedBirthDate = parseDateInputValue(birthDate);
  const parsedExamDate = parseDateInputValue(examDate);

  if (!parsedBirthDate || !parsedExamDate) {
    return "";
  }

  return formatDateInputValue(
    calculateOccupationalHealthExamValidUntil({
      birthDate: parsedBirthDate,
      examDate: parsedExamDate,
      referenceDate,
    }),
  );
}
