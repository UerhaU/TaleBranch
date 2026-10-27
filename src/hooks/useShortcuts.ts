import { useEffect, type RefObject } from "react";
import { useI18n } from "../i18n";
import type { ProjectApi } from "./projectApi";

/** Ctrl+S, Ctrl+K, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y on the main screen. */
export function useShortcuts(
  app: ProjectApi,
  notify: (message: string) => void,
  searchInput: RefObject<HTMLInputElement | null>,
) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) {
        if (key === "s") event.preventDefault();
        return;
      }
      if (!app.hasProject) {
        if (key === "s") event.preventDefault();
        return;
      }
      const editingText =
        event.target instanceof Element && Boolean(event.target.closest('input, textarea, [contenteditable="true"]'));
      if (key === "s") {
        event.preventDefault();
        const result = app.forceSave();
        if (result instanceof Promise) void result.then((ok) => notify(t(ok ? "projectSaved" : "saveFailedHint")));
        else notify(t(result ? "projectSaved" : "saveFailedHint"));
      } else if (key === "k") {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      } else if (key === "z" && !editingText) {
        event.preventDefault();
        event.shiftKey ? app.redo() : app.undo();
      } else if (key === "y" && !editingText) {
        event.preventDefault();
        app.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app, notify, t, searchInput]);
}
