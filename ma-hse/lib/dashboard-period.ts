import { endOfMonth, endOfYear, startOfMonth, startOfYear } from "date-fns";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

function readParam(searchParams: DashboardSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveDashboardPeriod(searchParams: DashboardSearchParams, now = new Date()) {
  const yearParam = Number(readParam(searchParams, "year"));
  const monthParam = Number(readParam(searchParams, "month"));
  const fromParam = readParam(searchParams, "from");
  const toParam = readParam(searchParams, "to");
  const currentYear = now.getUTCFullYear();

  if (fromParam && toParam) {
    return {
      label: `${fromParam} - ${toParam}`,
      from: new Date(`${fromParam}T00:00:00.000Z`),
      to: new Date(`${toParam}T23:59:59.999Z`),
      year: currentYear,
      month: null as number | null,
      mode: "range" as const,
    };
  }

  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : currentYear;

  if (Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12) {
    const from = startOfMonth(new Date(Date.UTC(year, monthParam - 1, 1)));
    const to = endOfMonth(from);

    return {
      label: `${from.toISOString().slice(0, 10)} - ${to.toISOString().slice(0, 10)}`,
      from,
      to,
      year,
      month: monthParam,
      mode: "month" as const,
    };
  }

  const from = startOfYear(new Date(Date.UTC(year, 0, 1)));
  const to = endOfYear(from);

  return {
    label: `${from.toISOString().slice(0, 10)} - ${to.toISOString().slice(0, 10)}`,
    from,
    to,
    year,
    month: null as number | null,
    mode: "year" as const,
  };
}
