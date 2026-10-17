import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character, HistoryState, PairLink, ParentLink, Project } from "../types";
import { cloneProject } from "../lib/project";
import { deleteStoredProject, listProjects, loadInitialProject, loadProject, saveProject, saveProjectIrreversibly } from "../lib/storage";
import { createEmptyProject } from "../lib/project";
import { moveCharacterToTrash, normalizePairLink, permanentlyDeleteTrashedCharacters, restoreTrashedCharacter, validPetOwnerIds } from "../lib/relationships";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { recordStorageFailure, type StorageFailure } from "../lib/storageDiagnostics";
import { clearLastDynastyFolder, DynastyFolder, FOLDER_ACTIVE_KEY, forgetDynastyFolder, lastDynastyFolder, rememberDynastyFolder } from "../lib/folderStorage";

export type SaveStatus = "saved" | "saving" | "error";

export function useProject() {
  const [initial] = useState(() => {
    try {
      const restore = isTauri() || Boolean(localStorage.getItem(FOLDER_ACTIVE_KEY));
      const project = restore ? null : loadInitialProject();
      return { project: project ?? createEmptyProject(), hasProject: project !== null, loadError: false, restore };
    }
    catch { return { project: createEmptyProject(), hasProject: true, loadError: true, restore: false }; }
  });
  const [hasProject, setHasProject] = useState(initial.hasProject);
  const [loadError, setLoadError] = useState(initial.loadError);
  const [history, setHistory] = useState<HistoryState>(() => ({ past: [], present: initial.project, future: [] }));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<StorageFailure>();
  const [closeGuardError, setCloseGuardError] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const folderRef = useRef<DynastyFolder | undefined>(undefined);
  const [folderName, setFolderName] = useState<string>();
  const [busy, setBusy] = useState(initial.restore);
  const [startupError, setStartupError] = useState(false);
  const transitioning = useRef(false);
  const destructive = useRef(false);

  const project = history.present;
  const active = useRef(hasProject);
  active.current = hasProject;
  const current = useRef(project);
  current.current = project;
  const blocked = useRef(loadError);
  blocked.current = loadError;
  const lastSaved = useRef<Project | undefined>(undefined);

  const forceSave = useCallback((): boolean | Promise<boolean> => {
    if (destructive.current) return false;
    if (!active.current) return true;
    if (blocked.current) return false;
    window.clearTimeout(saveTimer.current);
    const folder = folderRef.current;
    if (folder) {
      const snapshot = current.current;
      if (lastSaved.current === snapshot) return true;
      setSaveStatus("saving");
      return folder.save(snapshot).then(() => {
        if (folderRef.current !== folder) return true;
        lastSaved.current = snapshot;
        setSaveStatus(current.current === snapshot ? "saved" : "saving");
        setSaveError(undefined);
        return true;
      }).catch(error => {
        if (folderRef.current === folder) { setSaveError(recordStorageFailure(error, "save")); setSaveStatus("error"); }
        return false;
      });
    }
    try {
      if (lastSaved.current !== current.current) saveProject(current.current);
      lastSaved.current = current.current;
      setSaveStatus("saved");
      setSaveError(undefined);
      return true;
    } catch (error) {
      setSaveError(recordStorageFailure(error, "save"));
      setSaveStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (loadError || !hasProject) return;
    if (lastSaved.current === project) return;
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      forceSave();
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, loadError, hasProject, forceSave]);

  useEffect(() => {
    const flush = () => { forceSave(); };
    const close = (event: BeforeUnloadEvent) => {
      const dirtyFolder = folderRef.current && lastSaved.current !== current.current;
      if (!blocked.current && (dirtyFolder || forceSave() === false)) {
        if (dirtyFolder) void forceSave();
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
      if (active.current && !blocked.current && !destructive.current && lastSaved.current !== current.current) {
        if (folderRef.current) void folderRef.current.save(current.current).catch(() => {});
        else try { saveProject(current.current); } catch { /* Keep the previous saved record. */ }
      }
    };
  }, [forceSave]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    // WebView destruction need not dispatch beforeunload. Intercept native close too.
    let closing = false;
    void getCurrentWindow().onCloseRequested((event) => {
      if (closing || blocked.current) return;
      const result = forceSave();
      if (result instanceof Promise) {
        event.preventDefault();
        void result.then(ok => {
          if (ok && lastSaved.current === current.current) {
            closing = true;
            void getCurrentWindow().close().catch(() => { closing = false; setCloseGuardError(true); });
          }
        });
      } else if (!result) event.preventDefault();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => { if (!disposed) setCloseGuardError(true); });
    return () => { disposed = true; unlisten?.(); };
  }, [forceSave]);

  const commit = useCallback((recipe: (draft: Project) => void) => {
    setHistory((current) => {
      if (!active.current || transitioning.current) return current;
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

  const replace = useCallback((next: Project): boolean | Promise<boolean> => {
    if (transitioning.current) return false;
    const finish = (): boolean => {
      try { saveProject(next); }
      catch (error) { setSaveError(recordStorageFailure(error, "switch")); setSaveStatus("error"); return false; }
      lastSaved.current = next;
      folderRef.current = undefined; setFolderName(undefined);
      try { localStorage.removeItem(FOLDER_ACTIVE_KEY); } catch { /* Preferences are optional. */ }
      void clearLastDynastyFolder(true).catch(() => {});
      current.current = next;
      active.current = true;
      setHasProject(true);
      blocked.current = false;
      setLoadError(false);
      setSaveStatus("saved");
      setSaveError(undefined);
      setHistory({ past: [], present: next, future: [] });
      return true;
    };
    const saved = blocked.current ? true : forceSave();
    if (saved instanceof Promise) {
      transitioning.current = true; setBusy(true);
      return saved.then(ok => ok && finish()).finally(() => { transitioning.current = false; setBusy(false); });
    }
    return saved && finish();
  }, [forceSave]);

  const openFolder = useCallback(async (folder: DynastyFolder, next: Project, currentAlreadySaved = false): Promise<boolean> => {
    if (transitioning.current) return false;
    transitioning.current = true; setBusy(true);
    try {
      // A transfer has already written this exact current snapshot to the new
      // folder. It must also work when the old browser quota is exhausted.
      if (!(currentAlreadySaved && next === current.current) && !blocked.current && !await forceSave()) return false;
      folderRef.current = folder; setFolderName(folder.directory.displayPath ?? folder.directory.name);
      current.current = next; lastSaved.current = next; active.current = true; blocked.current = false;
      setHasProject(true); setLoadError(false); setSaveStatus("saved"); setSaveError(undefined);
      setHistory({ past: [], present: next, future: [] });
      try { localStorage.setItem(FOLDER_ACTIVE_KEY, next.id); } catch { /* No content is stored here. */ }
      await rememberDynastyFolder(folder, next).catch(() => {});
      return true;
    } finally { transitioning.current = false; setBusy(false); }
  }, [forceSave]);

  useEffect(() => {
    if (!initial.restore) return;
    let cancelled = false;
    void (async () => {
      try {
        const entry = await lastDynastyFolder();
        if (!entry || cancelled) return;
        // Startup must never open a permission dialog. Native folders are
        // authorized by their saved path; browsers may require an explicit click.
        if (await entry.directory.queryPermission({ mode: "readwrite" }) !== "granted" || cancelled) return;
        const { folder, project: saved } = await DynastyFolder.open(entry.directory, entry.parent);
        if (!cancelled) await openFolder(folder, saved);
      } catch {
        if (!cancelled) setStartupError(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initial.restore, openFolder]);

  const closeFolder = useCallback(async (): Promise<boolean> => {
    if (transitioning.current) return false;
    transitioning.current = true; setBusy(true);
    try {
      if (!await forceSave()) return false;
      await clearLastDynastyFolder();
      folderRef.current = undefined; setFolderName(undefined);
      active.current = false; setHasProject(false); lastSaved.current = undefined;
      current.current = createEmptyProject();
      setHistory({ past: [], present: current.current, future: [] });
      return true;
    } catch (error) {
      setSaveError(recordStorageFailure(error, "switch")); setSaveStatus("error");
      return false;
    } finally { transitioning.current = false; setBusy(false); }
  }, [forceSave]);

  const acceptIrreversibleChange = useCallback((next?: Project) => {
    window.clearTimeout(saveTimer.current);
    // Keep a private draft for the hook's shape; it is never saved or editable
    // until the user explicitly creates or opens a dynasty.
    const present = next ?? createEmptyProject();
    active.current = Boolean(next);
    setHasProject(Boolean(next));
    current.current = present;
    lastSaved.current = next;
    setSaveStatus("saved");
    setSaveError(undefined);
    // Undo/redo and close-time autosave must never resurrect deleted data.
    setHistory({ past: [], present, future: [] });
  }, []);

  const permanentlyDeleteCharacters = useCallback((ids: string[]): boolean | Promise<boolean> => {
    if (transitioning.current) return false;
    if (blocked.current || !active.current) return false;
    if (!current.current.trashedCharacters.some((item) => ids.includes(item.id))) return false;
    const next = cloneProject(current.current);
    permanentlyDeleteTrashedCharacters(next, ids);
    next.updatedAt = new Date().toISOString();
    if (folderRef.current) {
      transitioning.current = true; destructive.current = true; setBusy(true); window.clearTimeout(saveTimer.current);
      return folderRef.current.save(next).then(() => { acceptIrreversibleChange(next); return true; })
        .catch(error => { setSaveError(recordStorageFailure(error, "purge")); setSaveStatus("error"); return false; })
        .finally(() => { transitioning.current = false; destructive.current = false; setBusy(false); });
    }
    try { saveProjectIrreversibly(next); }
    catch (error) { setSaveError(recordStorageFailure(error, "purge")); setSaveStatus("error"); return false; }
    acceptIrreversibleChange(next);
    return true;
  }, [acceptIrreversibleChange]);

  const deleteProject = useCallback((): boolean | Promise<boolean> => {
    if (transitioning.current) return false;
    if (blocked.current || !active.current) return false;
    if (folderRef.current) {
      const directory = folderRef.current.directory;
      transitioning.current = true; destructive.current = true; setBusy(true); window.clearTimeout(saveTimer.current);
      return folderRef.current.delete().then(async () => {
        folderRef.current = undefined; setFolderName(undefined);
        acceptIrreversibleChange();
        await clearLastDynastyFolder().catch(() => {});
        await forgetDynastyFolder(directory).catch(() => {});
        return true;
      }).catch(error => { setSaveError(recordStorageFailure(error, "delete")); setSaveStatus("error"); return false; })
        .finally(() => { transitioning.current = false; destructive.current = false; setBusy(false); });
    }
    try {
      let next: Project | undefined;
      for (const item of listProjects()) {
        if (item.id === current.current.id) continue;
        try { next = loadProject(item.id) ?? undefined; } catch { continue; }
        if (next) break;
      }
      deleteStoredProject(current.current.id, next);
      acceptIrreversibleChange(next);
      return true;
    } catch (error) { setSaveError(recordStorageFailure(error, "delete")); setSaveStatus("error"); return false; }
  }, [acceptIrreversibleChange]);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!active.current || transitioning.current) return current;
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
      if (!active.current || transitioning.current) return current;
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
    if (!active.current || transitioning.current) return false;
    const existing = current.current.characters.find((item) => item.id === id);
    if (!existing) return false;
    const next = { ...existing, ...patch };
    // Full profile edits and type conversions require an explicit owner. Legacy
    // profiles can still receive unrelated updates such as a new photo or age.
    if (next.type === "pet" && (patch.ownerIds !== undefined || patch.type !== undefined) && !validPetOwnerIds(next, current.current.characters).length) return false;
    commit((draft) => {
      const index = draft.characters.findIndex((character) => character.id === id);
      if (index < 0) return;
      draft.characters[index] = {
        ...draft.characters[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    });
    return true;
  }, [commit]);

  const addCharacter = useCallback((character: Character, position?: { x: number; y: number }) => {
    if (!active.current || transitioning.current) return false;
    if (character.type === "pet" && !validPetOwnerIds(character, current.current.characters).length) return false;
    commit((draft) => {
      draft.characters.push(character);
      draft.positions[character.id] = position ?? {
        x: 220 + (draft.characters.length % 4) * 330,
        y: 120 + Math.floor(draft.characters.length / 4) * 300,
      };
    });
    return true;
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
    if (!active.current || transitioning.current) return;
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
    hasProject,
    folderName,
    busy,
    startupError,
    openFolder,
    closeFolder,
    loadError,
    closeGuardError,
    saveStatus,
    saveError,
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
    permanentlyDeleteCharacters,
    deleteProject,
    addParentLink,
    addPairLink,
    removeLink,
    removeRelationship,
    updatePosition,
  }), [
    project, hasProject, folderName, busy, startupError, openFolder, closeFolder, loadError, closeGuardError, saveStatus, saveError, history.past.length, history.future.length, commit, replace, undo, redo,
    forceSave, updateCharacter, addCharacter, deleteCharacter, restoreCharacter, permanentlyDeleteCharacters, deleteProject, addParentLink,
    addPairLink, removeLink, removeRelationship, updatePosition,
  ]);
}
