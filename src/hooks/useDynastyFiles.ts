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
import type { DynastyPlace, RecentDynasty } from "../lib/dynastyStore";
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
  const { t } = useI18n();
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
  const [legacyProjects, setLegacyProjects] = useState<ProjectSummary[]>(listLegacyProjects);
  const [legacyUnreadable, setLegacyUnreadable] = useState(hasUnreadableLegacyRecords);
  const [folderWorking, setFolderWorking] = useState(false);
  const [folderError, setFolderError] = useState<string>();
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
  useEffect(() => {
    if (app.startupError) setFolderError(t("folderFailed"));
  }, [app.startupError, t]);

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
  const downloadLegacyRecovery = () => {
    void store.saveFile("dynasty-recovery.json", legacyRecoveryData()).catch(() => {});
  };

  const showFolderFailure = (error: unknown) => {
    if ((error as Error).name === "AbortError") return;
    const message = (error as Error).message;
    setFolderError(
      t(
        message === "FOLDER_UNSUPPORTED"
          ? "folderUnsupported"
          : message === "FOLDER_NOT_EMPTY"
            ? "folderNotEmpty"
            : message === "FOLDER_CONFLICT"
              ? "folderConflict"
              : "folderFailed",
      ),
    );
  };
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
      const opened = await opening;
      if (!(await app.forceSave())) {
        notify(t("saveFailedHint"));
        return;
      }
      let next: Project;
      let dynasty;
      if (opened) ({ dynasty, project: next } = opened);
      else {
        next = mode === "import" ? pendingImport! : createEmptyProject(newProjectName!.trim());
        dynasty = await store.create(place!, next);
      }
      if (!(await app.openFolder(dynasty, next))) {
        notify(t("saveFailedHint"));
        return;
      }
      onOpened(next);
      setNewProjectName(undefined);
      setPendingImport(undefined);
      setPendingLegacyId(undefined);
      setChosenPlace(undefined);
      refreshFolders();
    } catch (error) {
      showFolderFailure(error);
    } finally {
      setFolderWorking(false);
    }
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
    legacyProjects,
    legacyUnreadable,
    refreshFolders,
    folderWorking,
    folderError,
    setFolderError,
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
