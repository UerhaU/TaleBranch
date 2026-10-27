import { useEffect, useState } from "react";
import { readPreference, writePreference } from "../lib/preferences";
import type { Theme } from "../types";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    readPreference("dynasty-chronicles:theme") === "light" ? "light" : "dark",
  );
  useEffect(() => {
    // Built-in theme "default"; the light or dark variant is chosen separately.
    document.documentElement.dataset.theme = "default";
    document.documentElement.dataset.mode = theme;
    writePreference("dynasty-chronicles:theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}
