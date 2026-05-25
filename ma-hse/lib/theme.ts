export type ThemeMode = "normal" | "black";

export const THEME_STORAGE_KEY = "ma-hse-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "black" || value === "normal";
}

export function parseTheme(value: string | null | undefined): ThemeMode {
  return isThemeMode(value) ? value : "normal";
}
