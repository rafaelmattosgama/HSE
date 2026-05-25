"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_COOKIE_MAX_AGE, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

function writeTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.cookie = `${THEME_STORAGE_KEY}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle({ initialTheme }: { initialTheme: ThemeMode }) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    writeTheme(theme);
  }, [theme]);

  function applyTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    writeTheme(nextTheme);
  }

  const isBlack = theme === "black";

  return (
    <button
      type="button"
      onClick={() => applyTheme(isBlack ? "normal" : "black")}
      aria-label={isBlack ? "Ativar modo normal" : "Ativar modo poupanca"}
      title={isBlack ? "Ativar modo normal" : "Ativar modo poupanca"}
      className="relative inline-flex h-10 w-[5.5rem] items-center rounded-full border border-slate-200 bg-white/80 px-1 shadow-sm backdrop-blur transition"
    >
      <span
        className={`absolute top-1 h-8 w-10 rounded-full transition ${
          isBlack ? "translate-x-10 bg-slate-900" : "translate-x-0 bg-[var(--primary)]"
        }`}
      />
      <span className="relative z-10 flex w-full items-center justify-between px-1.5">
        <Sun className={`h-4 w-4 ${isBlack ? "text-slate-500" : "text-white"}`} aria-hidden="true" />
        <Moon className={`h-4 w-4 ${isBlack ? "text-white" : "text-slate-500"}`} aria-hidden="true" />
      </span>
      <span className="sr-only">{isBlack ? "Modo poupanca ativo" : "Modo normal ativo"}</span>
    </button>
  );
}
