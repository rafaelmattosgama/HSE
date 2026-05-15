"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

type ThemeMode = "normal" | "black";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme === "black" || currentTheme === "normal") {
        return currentTheme;
      }
    }

    return "normal";
  });

  function applyTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem("ma-hse-theme", nextTheme);
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
