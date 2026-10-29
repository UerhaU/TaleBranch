import { useEffect, type RefObject } from "react";
import { useI18n } from "../i18n";
import type { CharacterActions } from "../components/shell/CharacterMenu";
import type { ProjectApi } from "./projectApi";
import type { Dialogs } from "./useDialogs";

/**
 * Keyboard shortcuts of the main screen (the list is in «Help → Keyboard shortcuts»).
 * Single letters use the physical key, so they also work with a Russian or another keyboard layout.
 */
export function useShortcuts({
  app,
  notify,
  searchInput,
  dialogs,
  selectedId,
  actions,
  onDeselect,
  onShowAll,
}: {
  app: ProjectApi;
  notify: (message: string) => void;
  searchInput: RefObject<HTMLInputElement | null>;
  dialogs: Dialogs;
  selectedId?: string;
  actions: CharacterActions;
  onDeselect: () => void;
  onShowAll: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      const key = event.key.toLowerCase();
      const is = (letter: string) => event.code === `Key${letter.toUpperCase()}` || key === letter;
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
      const target = event.target instanceof Element ? event.target : null;
      const editingText = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
      if (event.ctrlKey || event.metaKey) {
        if (event.code === "Comma" || key === ",") {
          event.preventDefault();
          if (!dialogOpen) dialogs.open("settings");
          return;
        }
        if (dialogOpen || !app.hasProject) {
          if (is("s")) event.preventDefault();
          return;
        }
        if (is("s")) {
          event.preventDefault();
          const result = app.forceSave();
          if (result instanceof Promise) void result.then((ok) => notify(t(ok ? "projectSaved" : "saveFailedHint")));
          else notify(t(result ? "projectSaved" : "saveFailedHint"));
        } else if (is("k")) {
          event.preventDefault();
          searchInput.current?.focus();
          searchInput.current?.select();
        } else if (is("z") && !editingText) {
          event.preventDefault();
          event.shiftKey ? app.redo() : app.undo();
        } else if (is("y") && !editingText) {
          event.preventDefault();
          app.redo();
        }
        return;
      }
      if (!app.hasProject || dialogOpen || editingText || event.shiftKey) return;
      // An open menu or the character editor handles its own keys.
      if (document.querySelector('[role="menu"]') || dialogs.state.addCharacter || dialogs.state.editCharacter) return;
      const onControl = Boolean(target?.closest("button, a, [role='menuitem'], [role='separator'], summary"));
      if (event.key === "Escape") {
        if (selectedId) onDeselect();
        return;
      }
      if (is("n")) {
        event.preventDefault();
        dialogs.open("addCharacter", { type: "sim" });
      } else if (is("l")) {
        if (!app.project.characters.length) return;
        event.preventDefault();
        dialogs.open("link", { kind: "parent", fromId: selectedId });
      } else if (is("f")) {
        event.preventDefault();
        onShowAll();
      } else if (event.key === "Enter" && selectedId && !onControl) {
        event.preventDefault();
        actions.edit(selectedId);
      } else if (event.key === "Delete" && selectedId) {
        event.preventDefault();
        actions.trash(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app, notify, t, searchInput, dialogs, selectedId, actions, onDeselect, onShowAll]);
}
