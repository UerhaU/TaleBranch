import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { produce } from "immer";
import type { Character, HistoryState, PairLink, ParentLink, Project } from "../types";
import { createEmptyProject } from "../lib/project";
import {
  moveCharacterToTrash,
  normalizePairLink,
  permanentlyDeleteTrashedCharacters,
  restoreTrashedCharacter,
  validPetOwnerIds,
} from "../lib/relationships";
import { recordStorageFailure, type StorageFailure } from "../lib/storageDiagnostics";
import type { Dynasty } from "../lib/dynastyStore";
import { useDynastyStore } from "./useDynastyStore";

export type SaveStatus = "saved" | "saving" | "error";

export function useProject() {
  const store = useDynastyStore();
  const [hasProject, setHasProject] = useState(false);
  const [history, setHistory] = useState<HistoryState>(() => ({ past: [], present: createEmptyProject(), future: [] }));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<StorageFailure>();
  const [closeGuardError, setCloseGuardError] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const dynastyRef = useRef<Dynasty | undefined>(undefined);
  const [folderName, setFolderName] = useState<string>();
  // The last dynasty is being restored on startup.
  const [busy, setBusy] = useState(true);
  const [startupError, setStartupError] = useState(false);
  const transitioning = useRef(false);
  const destructive = useRef(false);

  const project = history.present;
  const active = useRef(hasProject);
  active.current = hasProject;
  const current = useRef(project);
  current.current = project;
  const lastSaved = useRef<Project | undefined>(undefined);
  const dirty = () => Boolean(dynastyRef.current) && lastSaved.current !== current.current;

  const forceSave = useCallback((): boolean | Promise<boolean> => {
    if (destructive.current) return false;
    window.clearTimeout(saveTimer.current);
    const dynasty = dynastyRef.current;
    if (!dynasty) return true;
    const snapshot = current.current;
    if (lastSaved.current === snapshot) return true;
    setSaveStatus("saving");
    return dynasty
      .save(snapshot)
      .then(() => {
        if (dynastyRef.current !== dynasty) return true;
        lastSaved.current = snapshot;
        setSaveStatus(current.current === snapshot ? "saved" : "saving");
        setSaveError(undefined);
        return true;
      })
      .catch((error) => {
        if (dynastyRef.current === dynasty) {
          setSaveError(recordStorageFailure(error, "save"));
          setSaveStatus("error");
        }
        return false;
      });
  }, []);

  useEffect(() => {
    if (!hasProject) return;
    if (lastSaved.current === project) return;
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      forceSave();
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, hasProject, forceSave]);

  useEffect(() => {
    const flush = () => {
      void forceSave();
    };
    const close = (event: BeforeUnloadEvent) => {
      if (!dirty()) return;
      void forceSave();
      event.preventDefault();
      event.returnValue = "";
    };
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", close);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", close);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      window.clearTimeout(saveTimer.current);
      // Also flush on unmount; switching dynasties saves before the switch.
      if (!destructive.current && dirty()) void dynastyRef.current!.save(current.current).catch(() => {});
    };
  }, [forceSave]);

  useEffect(
    () =>
      store.guardClose(
        () => {
          const result = forceSave();
          return result instanceof Promise ? result.then((ok) => ok && !dirty()) : result;
        },
        () => setCloseGuardError(true),
      ),
    [store, forceSave],
  );

  const commit = useCallback((recipe: (draft: Project) => void) => {
    setHistory((current) => {
      if (!active.current || transitioning.current) return current;
      // Only changed branches are copied; untouched characters and photos are shared
      // with earlier history entries, which Immer freezes against accidental edits.
      const next = produce(current.present, (draft) => {
        recipe(draft);
        draft.updatedAt = new Date().toISOString();
      });
      return {
        past: [...current.past.slice(-49), current.present],
        present: next,
        future: [],
      };
    });
  }, []);

  /** Shows another dynasty after the current one has been saved. */
  const openFolder = useCallback(
    async (dynasty: Dynasty, next: Project): Promise<boolean> => {
      if (transitioning.current) return false;
      transitioning.current = true;
      setBusy(true);
      try {
        if (!(await forceSave())) return false;
        dynastyRef.current = dynasty;
        setFolderName(dynasty.folderName);
        current.current = next;
        lastSaved.current = next;
        active.current = true;
        setHasProject(true);
        setSaveStatus("saved");
        setSaveError(undefined);
        setHistory({ past: [], present: next, future: [] });
        await store.remember(dynasty).catch(() => {});
        return true;
      } finally {
        transitioning.current = false;
        setBusy(false);
      }
    },
    [store, forceSave],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const last = await store.restoreLast();
        if (last && !cancelled) await openFolder(last.dynasty, last.project);
      } catch {
        if (!cancelled) setStartupError(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, openFolder]);

  const showNothing = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    dynastyRef.current = undefined;
    setFolderName(undefined);
    active.current = false;
    setHasProject(false);
    lastSaved.current = undefined;
    current.current = createEmptyProject();
    setSaveStatus("saved");
    setSaveError(undefined);
    // Undo/redo and close-time autosave must never resurrect closed or deleted data.
    setHistory({ past: [], present: current.current, future: [] });
  }, []);

  const closeFolder = useCallback(async (): Promise<boolean> => {
    if (transitioning.current) return false;
    transitioning.current = true;
    setBusy(true);
    try {
      if (!(await forceSave())) return false;
      await store.forgetLast();
      showNothing();
      return true;
    } catch (error) {
      setSaveError(recordStorageFailure(error, "switch"));
      setSaveStatus("error");
      return false;
    } finally {
      transitioning.current = false;
      setBusy(false);
    }
  }, [store, forceSave, showNothing]);

  /** An irreversible write: no autosave may run until it has finished. */
  const irreversibly = useCallback(
    (operation: StorageFailure["operation"], run: (dynasty: Dynasty) => Promise<void>): false | Promise<boolean> => {
      const dynasty = dynastyRef.current;
      if (transitioning.current || !dynasty) return false;
      transitioning.current = true;
      destructive.current = true;
      setBusy(true);
      window.clearTimeout(saveTimer.current);
      return run(dynasty)
        .then(() => true)
        .catch((error) => {
          setSaveError(recordStorageFailure(error, operation));
          setSaveStatus("error");
          return false;
        })
        .finally(() => {
          transitioning.current = false;
          destructive.current = false;
          setBusy(false);
        });
    },
    [],
  );

  const permanentlyDeleteCharacters = useCallback(
    (ids: string[]): boolean | Promise<boolean> => {
      if (!current.current.trashedCharacters.some((item) => ids.includes(item.id))) return false;
      const next = produce(current.current, (draft) => {
        permanentlyDeleteTrashedCharacters(draft, ids);
        draft.updatedAt = new Date().toISOString();
      });
      return irreversibly("purge", async (dynasty) => {
        await dynasty.save(next);
        current.current = next;
        lastSaved.current = next;
        setSaveStatus("saved");
        setSaveError(undefined);
        // Undo/redo and close-time autosave must never resurrect deleted data.
        setHistory({ past: [], present: next, future: [] });
      });
    },
    [irreversibly],
  );

  const deleteProject = useCallback(
    (): boolean | Promise<boolean> =>
      irreversibly("delete", async (dynasty) => {
        await dynasty.delete();
        showNothing();
      }),
    [irreversibly, showNothing],
  );

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

  const updateCharacter = useCallback(
    (id: string, patch: Partial<Character>) => {
      if (!active.current || transitioning.current) return false;
      const existing = current.current.characters.find((item) => item.id === id);
      if (!existing) return false;
      const next = { ...existing, ...patch };
      // Full profile edits and type conversions require an explicit owner. Legacy
      // profiles can still receive unrelated updates such as a new photo or age.
      if (
        next.type === "pet" &&
        (patch.ownerIds !== undefined || patch.type !== undefined) &&
        !validPetOwnerIds(next, current.current.characters).length
      )
        return false;
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
    },
    [commit],
  );

  const addCharacter = useCallback(
    (character: Character, position?: { x: number; y: number }) => {
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
    },
    [commit],
  );

  const deleteCharacter = useCallback(
    (id: string) => {
      commit((draft) => moveCharacterToTrash(draft, id));
    },
    [commit],
  );

  const restoreCharacter = useCallback(
    (id: string) => {
      commit((draft) => restoreTrashedCharacter(draft, id));
    },
    [commit],
  );

  const addParentLink = useCallback(
    (link: ParentLink) => {
      commit((draft) => {
        const index = draft.parentLinks.findIndex((item) => item.id === link.id);
        if (index >= 0) draft.parentLinks[index] = link;
        else draft.parentLinks.push(link);
      });
    },
    [commit],
  );

  const addPairLink = useCallback(
    (link: PairLink) => {
      commit((draft) => {
        link = normalizePairLink(link);
        const existing = draft.pairLinks.find(
          (pair) =>
            (pair.aId === link.aId && pair.bId === link.bId) || (pair.aId === link.bId && pair.bId === link.aId),
        );
        if (existing) {
          for (const label of link.labels) {
            const index = existing.labels.findIndex((item) => item.id === label.id);
            if (index >= 0) existing.labels[index] = label;
            else existing.labels.push(label);
          }
        } else draft.pairLinks.push(link);
      });
    },
    [commit],
  );

  const removeLink = useCallback(
    (kind: "parent" | "pair", id: string) => {
      commit((draft) => {
        if (kind === "parent") draft.parentLinks = draft.parentLinks.filter((link) => link.id !== id);
        else draft.pairLinks = draft.pairLinks.filter((link) => link.id !== id);
      });
    },
    [commit],
  );

  const removeRelationship = useCallback(
    (pairId: string, labelId: string) => {
      commit((draft) => {
        const pair = draft.pairLinks.find((item) => item.id === pairId);
        if (!pair) return;
        pair.labels = pair.labels.filter((item) => item.id !== labelId);
        if (!pair.labels.length) draft.pairLinks = draft.pairLinks.filter((item) => item.id !== pairId);
      });
    },
    [commit],
  );

  const updatePosition = useCallback(
    (id: string, position: { x: number; y: number }, record = false) => {
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
    },
    [commit],
  );

  return useMemo(
    () => ({
      project,
      hasProject,
      folderName,
      busy,
      startupError,
      openFolder,
      closeFolder,
      closeGuardError,
      saveStatus,
      saveError,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      commit,
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
    }),
    [
      project,
      hasProject,
      folderName,
      busy,
      startupError,
      openFolder,
      closeFolder,
      closeGuardError,
      saveStatus,
      saveError,
      history.past.length,
      history.future.length,
      commit,
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
    ],
  );
}
