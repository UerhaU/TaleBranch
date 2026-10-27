import { useEffect, useState } from "react";
import { readPreference, writePreference } from "../lib/preferences";
import type { Theme } from "../types";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    readPreference("dynasty-chronicles:theme") === "light" ? "light" : "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePreference("dynasty-chronicles:theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}
