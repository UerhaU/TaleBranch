import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character, HistoryState, PairLink, ParentLink, Project } from "../types";
import { cloneProject } from "../lib/project";
import { loadInitialProject, saveProject } from "../lib/storage";
import { createEmptyProject } from "../lib/project";
import { moveCharacterToTrash, normalizePairLink, restoreTrashedCharacter } from "../lib/relationships";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type SaveStatus = "saved" | "saving" | "error";

export function useProject() {
  const [initial] = useState(() => {
    try { return { project: loadInitialProject(), loadError: false }; }
    catch { return { project: createEmptyProject(), loadError: true }; }
  });
  const [loadError, setLoadError] = useState(initial.loadError);
  const [history, setHistory] = useState<HistoryState>(() => ({ past: [], present: initial.project, future: [] }));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [closeGuardError, setCloseGuardError] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const project = history.present;
  const current = useRef(project);
  current.current = project;
  const blocked = useRef(loadError);
  blocked.current = loadError;
  const lastSaved = useRef<Project | undefined>(undefined);

  const forceSave = useCallback((): boolean => {
    if (blocked.current) return false;
    window.clearTimeout(saveTimer.current);
    try {
      if (lastSaved.current !== current.current) saveProject(current.current);
      lastSaved.current = current.current;
      setSaveStatus("saved");
      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (loadError) return;
    if (lastSaved.current === project) return;
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      forceSave();
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, loadError, forceSave]);

  useEffect(() => {
    const flush = () => { forceSave(); };
    const close = (event: BeforeUnloadEvent) => {
      if (!blocked.current && !forceSave()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", close);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", close);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      window.clearTimeout(saveTimer.current);
      // Also flush on unmount; switching projects is handled synchronously below.
      if (!blocked.current && lastSaved.current !== current.current) {
        try { saveProject(current.current); } catch { /* Keep the previous saved record. */ }
      }
    };
  }, [forceSave]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    // WebView destruction need not dispatch beforeunload. Intercept native close too.
    void getCurrentWindow().onCloseRequested((event) => {
      if (!blocked.current && !forceSave()) event.preventDefault();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => { if (!disposed) setCloseGuardError(true); });
    return () => { disposed = true; unlisten?.(); };
  }, [forceSave]);

  const commit = useCallback((recipe: (draft: Project) => void) => {
    setHistory((current) => {
      const next = cloneProject(current.present);
      recipe(next);
      next.updatedAt = new Date().toISOString();
      return {
        past: [...current.past.slice(-49), current.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const replace = useCallback((next: Project): boolean => {
    if (!blocked.current && !forceSave()) return false;
    try { saveProject(next); }
    catch { setSaveStatus("error"); return false; }
    lastSaved.current = next;
    current.current = next;
    blocked.current = false;
    setLoadError(false);
    setSaveStatus("saved");
    setHistory({ past: [], present: next, future: [] });
    return true;
  }, [forceSave]);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const updateCharacter = useCallback((id: string, patch: Partial<Character>) => {
    commit((draft) => {
      const index = draft.characters.findIndex((character) => character.id === id);
      if (index < 0) return;
      draft.characters[index] = {
        ...draft.characters[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [commit]);

  const addCharacter = useCallback((character: Character, position?: { x: number; y: number }) => {
    commit((draft) => {
      draft.characters.push(character);
      draft.positions[character.id] = position ?? {
        x: 220 + (draft.characters.length % 4) * 330,
        y: 120 + Math.floor(draft.characters.length / 4) * 300,
      };
    });
  }, [commit]);

  const deleteCharacter = useCallback((id: string) => {
    commit((draft) => moveCharacterToTrash(draft, id));
  }, [commit]);

  const restoreCharacter = useCallback((id: string) => {
    commit((draft) => restoreTrashedCharacter(draft, id));
  }, [commit]);

  const addParentLink = useCallback((link: ParentLink) => {
    commit((draft) => {
      const index = draft.parentLinks.findIndex((item) => item.id === link.id);
      if (index >= 0) draft.parentLinks[index] = link;
      else draft.parentLinks.push(link);
    });
  }, [commit]);

  const addPairLink = useCallback((link: PairLink) => {
    commit((draft) => {
      link = normalizePairLink(link);
      const existing = draft.pairLinks.find((pair) =>
        (pair.aId === link.aId && pair.bId === link.bId) ||
        (pair.aId === link.bId && pair.bId === link.aId));
      if (existing) {
        for (const label of link.labels) {
          const index = existing.labels.findIndex((item) => item.id === label.id);
          if (index >= 0) existing.labels[index] = label;
          else existing.labels.push(label);
        }
      }
      else draft.pairLinks.push(link);
    });
  }, [commit]);

  const removeLink = useCallback((kind: "parent" | "pair", id: string) => {
    commit((draft) => {
      if (kind === "parent") draft.parentLinks = draft.parentLinks.filter((link) => link.id !== id);
      else draft.pairLinks = draft.pairLinks.filter((link) => link.id !== id);
    });
  }, [commit]);

  const removeRelationship = useCallback((pairId: string, labelId: string) => {
    commit((draft) => {
      const pair = draft.pairLinks.find((item) => item.id === pairId);
      if (!pair) return;
      pair.labels = pair.labels.filter((item) => item.id !== labelId);
      if (!pair.labels.length) draft.pairLinks = draft.pairLinks.filter((item) => item.id !== pairId);
    });
  }, [commit]);

  const updatePosition = useCallback((id: string, position: { x: number; y: number }, record = false) => {
    if (record) {
      commit((draft) => {
        draft.positions[id] = position;
      });
      return;
    }
    setHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        positions: { ...current.present.positions, [id]: position },
      },
    }));
  }, [commit]);

  return useMemo(() => ({
    project,
    loadError,
    closeGuardError,
    saveStatus,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    replace,
    undo,
    redo,
    forceSave,
    updateCharacter,
    addCharacter,
    deleteCharacter,
    restoreCharacter,
    addParentLink,
    addPairLink,
    removeLink,
    removeRelationship,
    updatePosition,
  }), [
    project, loadError, closeGuardError, saveStatus, history.past.length, history.future.length, commit, replace, undo, redo,
    forceSave, updateCharacter, addCharacter, deleteCharacter, restoreCharacter, addParentLink,
    addPairLink, removeLink, removeRelationship, updatePosition,
  ]);
}
