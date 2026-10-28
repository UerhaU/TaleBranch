import { useEffect, useMemo, useState } from "react";
import { readPreference, writePreference } from "../lib/preferences";
import type { Theme } from "../types";

export type ThemeMode = Theme | "system";
export type Appearance = {
  mode: ThemeMode;
  textSize: number;
  lessMotion: boolean;
  showMinimap: boolean;
};

const keys = {
  mode: "dynasty-chronicles:theme",
  textSize: "dynasty-chronicles:text-size",
  lessMotion: "dynasty-chronicles:less-motion",
  showMinimap: "dynasty-chronicles:minimap",
} as const;
export const TEXT_SIZE = { min: 90, max: 125, step: 5 } as const;

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readAppearance(): Appearance {
  const mode = readPreference(keys.mode);
  const size = Number(readPreference(keys.textSize));
  return {
    mode: mode === "light" || mode === "system" ? mode : "dark",
    textSize: size >= TEXT_SIZE.min && size <= TEXT_SIZE.max && size % TEXT_SIZE.step === 0 ? size : 100,
    lessMotion: readPreference(keys.lessMotion) === "true",
    showMinimap: readPreference(keys.showMinimap) !== "false",
  };
}

/** Light or dark mode, text size, reduced motion and the mini map; remembered between launches. */
export function useAppearance() {
  const [appearance, setAppearance] = useState(readAppearance);
  const [system, setSystem] = useState(systemTheme);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const refresh = () => setSystem(systemTheme());
    query.addEventListener?.("change", refresh);
    return () => query.removeEventListener?.("change", refresh);
  }, []);
  const theme: Theme = appearance.mode === "system" ? system : appearance.mode;

  useEffect(() => {
    const root = document.documentElement;
    // Built-in theme "default"; the light or dark variant is chosen separately.
    root.dataset.theme = "default";
    root.dataset.mode = theme;
    root.dataset.motion = appearance.lessMotion ? "reduce" : "full";
    root.style.setProperty("--tb-ui-zoom", String(appearance.textSize / 100));
    writePreference(keys.mode, appearance.mode);
    writePreference(keys.textSize, String(appearance.textSize));
    writePreference(keys.lessMotion, String(appearance.lessMotion));
    writePreference(keys.showMinimap, String(appearance.showMinimap));
  }, [appearance, theme]);

  return useMemo(
    () => ({
      ...appearance,
      theme,
      update: (patch: Partial<Appearance>) => setAppearance((current) => ({ ...current, ...patch })),
    }),
    [appearance, theme],
  );
}

export type AppearanceApi = ReturnType<typeof useAppearance>;
