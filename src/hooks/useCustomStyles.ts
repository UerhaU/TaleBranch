import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { loadDesktopStyles, sanitizeCss, type UserSnippet, type UserTheme } from "../lib/customStyles";
import { readPreference, writePreference } from "../lib/preferences";

const keys = {
  enabled: "dynasty-chronicles:snippets",
  webCss: "dynasty-chronicles:custom-css",
} as const;

function readEnabled(): string[] {
  try {
    const value = JSON.parse(readPreference(keys.enabled) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** A `<style>` element at the end of the page, so the user's CSS wins over the built-in one. */
function setStyle(id: string, css: string) {
  let element = document.getElementById(id);
  if (!css) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("style");
    element.id = id;
  }
  document.head.append(element);
  if (element.textContent !== css) element.textContent = css;
}

/**
 * The user's own styles (snippets, each with a switch) and themes. In the desktop version they are
 * `.css` files in TaleBranch-data; in the browser one field of CSS kept in the browser's settings.
 * Ctrl Shift 0 turns all of them off until the next launch, in case a style broke the screen.
 */
export function useCustomStyles(onSafeMode?: () => void) {
  const desktop = isTauri();
  const [folder, setFolder] = useState("");
  const [snippets, setSnippets] = useState<UserSnippet[]>([]);
  const [themes, setThemes] = useState<UserTheme[]>([]);
  const [loaded, setLoaded] = useState(!desktop);
  const [error, setError] = useState(false);
  const [enabled, setEnabled] = useState(readEnabled);
  const [webCss, setWebCssState] = useState(() => (desktop ? "" : (readPreference(keys.webCss) ?? "")));
  const [safe, setSafe] = useState(false);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    try {
      const result = await loadDesktopStyles();
      setFolder(result.folder);
      setSnippets(result.snippets);
      setThemes(result.themes);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [desktop]);
  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.code === "Digit0" || event.key === "0")) {
        event.preventDefault();
        setSafe(true);
        onSafeMode?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onSafeMode]);

  useEffect(() => {
    setStyle("tb-user-themes", safe ? "" : themes.map((theme) => `/* ${theme.file} */\n${theme.css}`).join("\n"));
    const active = snippets.filter((snippet) => enabled.includes(snippet.file));
    const css = [...active.map((snippet) => `/* ${snippet.file} */\n${snippet.css}`), sanitizeCss(webCss)].join("\n");
    setStyle("tb-user-snippets", safe ? "" : css.trim());
  }, [themes, snippets, enabled, webCss, safe]);
  useEffect(() => () => ["tb-user-themes", "tb-user-snippets"].forEach((id) => setStyle(id, "")), []);

  return useMemo(
    () => ({
      desktop,
      folder,
      snippets,
      themes,
      loaded,
      error,
      enabled,
      webCss,
      safe,
      refresh,
      toggle: (file: string, on: boolean) =>
        setEnabled((current) => {
          const next = on ? [...new Set([...current, file])] : current.filter((item) => item !== file);
          writePreference(keys.enabled, JSON.stringify(next));
          return next;
        }),
      setWebCss: (css: string) => {
        setWebCssState(css);
        writePreference(keys.webCss, css);
      },
      restore: () => setSafe(false),
    }),
    [desktop, folder, snippets, themes, loaded, error, enabled, webCss, safe, refresh],
  );
}

export type CustomStylesApi = ReturnType<typeof useCustomStyles>;
