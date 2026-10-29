import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useI18n } from "../i18n";
import { createEmptyProject } from "../lib/project";
import { exportDocument, readProjectDocument } from "../lib/storage";
import {
  deleteLegacyProject,
  hasUnreadableLegacyRecords,
  legacyRecoveryData,
  listLegacyProjects,
  loadLegacyProject,
} from "../lib/legacyStorage";
import {
  DamagedDynastyError,
  type DynastyPlace,
  type DynastyVersion,
  type OpenedDynasty,
  type RecentDynasty,
  type RecentFolderStatus,
} from "../lib/dynastyStore";
import { recordStorageFailure } from "../lib/storageDiagnostics";
import type { Project, ProjectSummary } from "../types";
import type { ProjectApi } from "./projectApi";
import { useDynastyStore } from "./useDynastyStore";

type Options = {
  app: ProjectApi;
  notify: (message: string) => void;
  /** Called after another dynasty has been opened on the screen. */
  onOpened: (next: Project) => void;
  closeProjectMenu: () => void;
};

/** Opening, creating, importing, moving and exporting dynasties. */
export function useDynastyFiles({ app, notify, onOpened, closeProjectMenu }: Options) {
  const { t, locale } = useI18n();
  const store = useDynastyStore();
  const { project } = app;
  const [newProjectName, setNewProjectName] = useState<string | undefined>();
  // Keep the native handle stable across name edits and asynchronous renders.
  // Only its display name belongs in form state.
  const chosenPlace = useRef<DynastyPlace | undefined>(undefined);
  const [chosenDirectoryName, setChosenDirectoryName] = useState<string>();
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const choosingDirectoryRef = useRef(false);
  const directorySelection = useRef(0);
  const setChosenPlace = (place?: DynastyPlace) => {
    directorySelection.current++;
    chosenPlace.current = place;
    setChosenDirectoryName(place ? place.displayPath || place.name || "/" : undefined);
  };
  const [pendingImport, setPendingImport] = useState<Project>();
  // Set when the pending dynasty is an old browser record being moved into a folder.
  const [pendingLegacyId, setPendingLegacyId] = useState<string>();
  const [recentFolders, setRecentFolders] = useState<RecentDynasty[]>([]);
  /** Recent dynasties whose folder was checked; a missing folder can only be removed from the list. */
  const [recentStatus, setRecentStatus] = useState<Record<string, RecentFolderStatus>>({});
  /** A recent dynasty waiting for the delete confirmation on the start screen. */
  const [recentToDelete, setRecentToDelete] = useState<RecentDynasty>();
  const [legacyProjects, setLegacyProjects] = useState<ProjectSummary[]>(listLegacyProjects);
  const [legacyUnreadable, setLegacyUnreadable] = useState(hasUnreadableLegacyRecords);
  const [folderWorking, setFolderWorking] = useState(false);
  const [folderError, setFolderError] = useState<string>();
  /** An unreadable dynasty.json waiting for the user to pick a saved version. */
  const [damaged, setDamaged] = useState<DamagedDynastyError>();
  /** Saved versions of the open dynasty while their dialog is shown. */
  const [versions, setVersions] = useState<DynastyVersion[]>();
  const importInput = useRef<HTMLInputElement>(null);
  const refreshFolders = useCallback(() => {
    void store
      .recent()
      .then(setRecentFolders)
      .catch(() => {});
    setLegacyProjects(listLegacyProjects());
    setLegacyUnreadable(hasUnreadableLegacyRecords());
  }, [store]);
  useEffect(refreshFolders, [refreshFolders, project.id, app.folderName, app.hasProject]);
  // Folders are checked only for the welcome screen, where the recent list is shown.
  useEffect(() => {
    if (app.hasProject) return;
    let current = true;
    void Promise.all(recentFolders.map(async (item) => [item.id, await store.folderStatus(item)] as const)).then(
      (checked) => {
        if (current) setRecentStatus(Object.fromEntries(checked));
      },
    );
    return () => {
      current = false;
    };
  }, [store, recentFolders, app.hasProject]);
  const versionDate = useCallback(
    (version: DynastyVersion) =>
      new Date(version.savedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const startNewProject = () => {
    setChosenPlace(undefined);
    setFolderError(undefined);
    setNewProjectName("");
  };
  const cancelNewProject = () => {
    setChosenPlace(undefined);
    setNewProjectName(undefined);
  };
  const cancelImport = () => {
    setChosenPlace(undefined);
    setPendingImport(undefined);
    setPendingLegacyId(undefined);
  };
  const openImportPicker = () => importInput.current?.click();

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readProjectDocument(await file.text());
      setPendingImport(imported);
      setPendingLegacyId(undefined);
      setChosenPlace(undefined);
      setFolderError(undefined);
    } catch {
      notify(t("importFailed"));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  /** An old browser record is only moved into a folder; it is never edited in place. */
  const startTransfer = (id: string) => {
    closeProjectMenu();
    try {
      const saved = loadLegacyProject(id);
      if (!saved) {
        notify(t("loadFailedHint"));
        return;
      }
      setPendingImport(saved);
      setPendingLegacyId(id);
      setChosenPlace(undefined);
      setFolderError(undefined);
    } catch {
      notify(t("loadFailedHint"));
    }
  };
  /** Called only from the confirmation dialog. */
  const deleteLegacy = () => {
    if (!pendingLegacyId) return false;
    try {
      deleteLegacyProject(pendingLegacyId);
    } catch {
      return false;
    }
    cancelImport();
    refreshFolders();
    notify(t("dynastyDeleted"));
    return true;
  };
  /** Only the entry in the list goes; the folder and its files stay as they are. */
  const forgetRecent = async (item: RecentDynasty) => {
    try {
      await store.forgetRecent(item);
      notify(t("removedFromRecent"));
    } catch {
      notify(t("folderFailed"));
    }
    refreshFolders();
  };
  /** Called only from the confirmation dialog; deletes the dynasty folder like «Delete dynasty» in its menu. */
  const deleteRecent = async () => {
    if (!recentToDelete) return false;
    try {
      await store.deleteRecent(recentToDelete);
    } catch (error) {
      if ((error as Error).message === "DYNASTY_OPEN_ELSEWHERE") notify(t("dynastyOpenElsewhere"));
      return false;
    } finally {
      refreshFolders();
    }
    setRecentToDelete(undefined);
    notify(t("dynastyDeleted"));
    return true;
  };
  const downloadLegacyRecovery = () => {
    void store.saveFile("dynasty-recovery.json", legacyRecoveryData()).catch(() => {});
  };

  const showFolderFailure = useCallback(
    (error: unknown) => {
      if ((error as Error).name === "AbortError") return;
      if (error instanceof DamagedDynastyError) {
        if (error.versions.length) setDamaged(error);
        else setFolderError(t("dynastyDamagedNoVersions"));
        return;
      }
      const message = (error as Error).message;
      setFolderError(
        t(
          message === "FOLDER_UNSUPPORTED"
            ? "folderUnsupported"
            : message === "FOLDER_NOT_EMPTY"
              ? "folderNotEmpty"
              : message === "FOLDER_CONFLICT"
                ? "folderConflict"
                : message === "DYNASTY_OPEN_ELSEWHERE"
                  ? "dynastyOpenElsewhere"
                  : "folderFailed",
        ),
      );
    },
    [t],
  );
  useEffect(() => {
    if (app.startupError) showFolderFailure(app.startupFailure);
  }, [app.startupError, app.startupFailure, showFolderFailure]);
  const chooseDirectory = async () => {
    if (choosingDirectoryRef.current) return;
    const selection = ++directorySelection.current;
    choosingDirectoryRef.current = true;
    setChoosingDirectory(true);
    try {
      const place = await store.choosePlace();
      if (selection !== directorySelection.current) return;
      if (!place || typeof place.name !== "string") throw new Error("INVALID_DIRECTORY_HANDLE");
      setChosenPlace(place);
      setFolderError(undefined);
    } catch (error) {
      if (selection === directorySelection.current) showFolderFailure(error);
    } finally {
      choosingDirectoryRef.current = false;
      setChoosingDirectory(false);
    }
  };
  const workWithFolder = async (mode: "open" | "create" | "import", recent?: RecentDynasty) => {
    if (folderWorking || app.busy || choosingDirectoryRef.current) return;
    const place = chosenPlace.current;
    if (mode !== "open" && !place) {
      setFolderError(t("chooseDynastyFolder"));
      return;
    }
    // Started before any await: a browser shows its folder dialog only right after a click.
    // A place chosen in the dialog already has read/write access and is not asked again.
    const opening = mode === "open" ? store.open(recent) : undefined;
    setFolderWorking(true);
    setFolderError(undefined);
    try {
      await show(
        (await opening) ??
          (async () => {
            const next = mode === "import" ? pendingImport! : createEmptyProject(newProjectName!.trim());
            return { dynasty: await store.create(place!, next), project: next };
          }),
      );
    } catch (error) {
      showFolderFailure(error);
    } finally {
      setFolderWorking(false);
    }
  };
  /** Shows an opened dynasty, or creates one once the current one is saved. */
  const show = async (target: OpenedDynasty | (() => Promise<OpenedDynasty>)) => {
    const ready = typeof target === "function" ? undefined : target;
    if (!(await app.forceSave())) {
      // Nothing changes on the screen: the opened dynasty is free for other windows again.
      void ready?.dynasty.close().catch(() => {});
      notify(t("saveFailedHint"));
      return;
    }
    const { dynasty, project: next } = ready ?? (await (target as () => Promise<OpenedDynasty>)());
    if (!(await app.openFolder(dynasty, next))) {
      void dynasty.close().catch(() => {});
      notify(t("saveFailedHint"));
      return;
    }
    onOpened(next);
    setNewProjectName(undefined);
    setPendingImport(undefined);
    setPendingLegacyId(undefined);
    setChosenPlace(undefined);
    refreshFolders();
  };
  /** Replaces an unreadable dynasty.json with the chosen saved version and opens it. */
  const restoreDamaged = async (version: DynastyVersion) => {
    if (!damaged || folderWorking || app.busy) return;
    setFolderWorking(true);
    try {
      await show(await damaged.restore(version));
      setDamaged(undefined);
      notify(t("versionRestored", { date: versionDate(version) }));
    } catch (error) {
      setDamaged(undefined);
      if (error instanceof DamagedDynastyError) showFolderFailure(error);
      else setFolderError(t("versionRestoreFailed"));
    } finally {
      setFolderWorking(false);
    }
  };
  const showVersions = async () => {
    closeProjectMenu();
    try {
      setVersions(await app.listVersions());
    } catch {
      notify(t("folderFailed"));
    }
  };
  const restoreVersion = async (version: DynastyVersion) => {
    if (!(await app.restoreVersion(version))) {
      notify(t("versionRestoreFailed"));
      return;
    }
    setVersions(undefined);
    notify(t("versionRestored", { date: versionDate(version) }));
  };
  const createNewProject = () => {
    if (newProjectName?.trim()) void workWithFolder("create");
  };

  const exportProject = () => {
    void exportDocument(project)
      .then(({ filename, contents }) => store.saveFile(filename, contents))
      .catch((error) => {
        const failure = recordStorageFailure(error, "export");
        notify(`${t("exportFailed")} ${failure.name}: ${failure.message}`);
      });
  };

  const exportPng = async () => {
    const canvas = document.querySelector<HTMLElement>(".flow-wrap");
    if (!canvas) return;
    try {
      const dataUrl = await toPng(canvas, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--tb-canvas").trim(),
        pixelRatio: 2,
        // Floating panels are not part of the tree picture.
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("tb-no-export")),
      });
      const name = `${project.name.replace(/\s+/g, "_")}.png`;
      if (await store.saveFile(name, dataUrl.slice(dataUrl.indexOf(",") + 1), true)) notify(t("pngCreated"));
    } catch {
      notify(t("pngFailed"));
    }
  };

  return {
    supported: store.supported,
    importInput,
    recentFolders,
    recentStatus,
    forgetRecent,
    recentToDelete,
    askDeleteRecent: setRecentToDelete,
    closeDeleteRecent: () => setRecentToDelete(undefined),
    deleteRecent,
    legacyProjects,
    legacyUnreadable,
    refreshFolders,
    folderWorking,
    folderError,
    setFolderError,
    damaged,
    dismissDamaged: () => setDamaged(undefined),
    restoreDamaged,
    versions,
    versionDate,
    showVersions,
    closeVersions: () => setVersions(undefined),
    restoreVersion,
    newProjectName,
    setNewProjectName,
    pendingImport,
    pendingLegacyId,
    chosenDirectoryName,
    choosingDirectory,
    startNewProject,
    cancelNewProject,
    cancelImport,
    openImportPicker,
    handleImport,
    startTransfer,
    deleteLegacy,
    downloadLegacyRecovery,
    chooseDirectory,
    workWithFolder,
    createNewProject,
    exportProject,
    exportPng,
  };
}

export type DynastyFiles = ReturnType<typeof useDynastyFiles>;
