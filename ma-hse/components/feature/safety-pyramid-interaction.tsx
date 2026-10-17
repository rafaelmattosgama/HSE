"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DashboardPyramidLevel } from "@/lib/dashboard-pyramid";

type Interaction = {
  activeLevel: DashboardPyramidLevel | null;
  pinnedLevel: DashboardPyramidLevel | null;
  setHoveredLevel: (level: DashboardPyramidLevel | null) => void;
  setFocusedLevel: (level: DashboardPyramidLevel | null) => void;
  togglePinnedLevel: (level: DashboardPyramidLevel) => void;
  clearPinnedLevel: () => void;
};

const InteractionContext = createContext<Interaction | null>(null);

export function SafetyPyramidInteractionProvider({ children }: { children: ReactNode }) {
  const [hoveredLevel, setHoveredLevel] = useState<DashboardPyramidLevel | null>(null);
  const [focusedLevel, setFocusedLevel] = useState<DashboardPyramidLevel | null>(null);
  const [pinnedLevel, setPinnedLevel] = useState<DashboardPyramidLevel | null>(null);

  const value = useMemo<Interaction>(() => ({
    activeLevel: hoveredLevel ?? focusedLevel ?? pinnedLevel,
    pinnedLevel,
    setHoveredLevel,
    setFocusedLevel,
    togglePinnedLevel: (level) => {
      setPinnedLevel((current) => current === level ? null : level);
      setFocusedLevel(null);
    },
    clearPinnedLevel: () => setPinnedLevel(null),
  }), [focusedLevel, hoveredLevel, pinnedLevel]);

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>;
}

export function useSafetyPyramidInteraction() {
  return useContext(InteractionContext);
}
