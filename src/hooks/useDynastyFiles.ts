import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { isTauri } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { createEmptyProject } from "../lib/project";
import { downloadProject, loadProject, readProjectDocument } from "../lib/storage";
import {
  DynastyFolder,
  grantDirectory,
  pickDynastyDirectory,
  recentDynastyFolders,
  type DynastyDirectory,
  type RecentFolder,
} from "../lib/folderStorage";
import { recordStorageFailure } from "../lib/storageDiagnostics";
import { saveDesktopExport } from "../lib/desktopStorage";
import type { Project } from "../types";
import type { ProjectApi } from "./projectApi";

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
  const { project } = app;
  const [newProjectName, setNewProjectName] = useState<string | undefined>();
  // Keep the native handle stable across name edits and asynchronous renders.
  // Only its display name belongs in form state.
  const chosenDirectory = useRef<DynastyDirectory | undefined>(undefined);
  const [chosenDirectoryName, setChosenDirectoryName] = useState<string>();
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const choosingDirectoryRef = useRef(false);
  const directorySelection = useRef(0);
  const setChosenDirectory = (directory?: DynastyDirectory) => {
    directorySelection.current++;
    chosenDirectory.current = directory;
    setChosenDirectoryName(directory ? directory.displayPath || directory.name || "/" : undefined);
  };
  const [pendingImport, setPendingImport] = useState<Project>();
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [folderWorking, setFolderWorking] = useState(false);
  const [folderError, setFolderError] = useState<string>();
  const importInput = useRef<HTMLInputElement>(null);
  const refreshFolders = useCallback(() => {
    void recentDynastyFolders()
      .then(setRecentFolders)
      .catch(() => {});
  }, []);
  useEffect(refreshFolders, [refreshFolders, project.id, app.folderName, app.hasProject]);
  useEffect(() => {
    if (app.startupError) setFolderError(t("folderFailed"));
  }, [app.startupError, t]);

  const startNewProject = () => {
    setChosenDirectory(undefined);
    setFolderError(undefined);
    setNewProjectName("");
  };
  const cancelNewProject = () => {
    setChosenDirectory(undefined);
    setNewProjectName(undefined);
  };
  const cancelImport = () => {
    setChosenDirectory(undefined);
    setPendingImport(undefined);
  };
  const openImportPicker = () => importInput.current?.click();

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readProjectDocument(await file.text());
      setPendingImport(imported);
      setChosenDirectory(undefined);
      setFolderError(undefined);
    } catch {
      notify(t("importFailed"));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const switchProject = async (id: string) => {
    if (id === project.id && !app.folderName) {
      closeProjectMenu();
      return;
    }
    try {
      const next = loadProject(id);
      if (!next) {
        notify(t("loadFailedHint"));
        return;
      }
      if (!(await app.replace(next))) {
        notify(t("saveFailedHint"));
        return;
      }
      onOpened(next);
    } catch {
      notify(t("loadFailedHint"));
    }
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
      const directory = await pickDynastyDirectory();
      if (selection !== directorySelection.current) return;
      if (!directory || typeof directory.name !== "string" || typeof directory.getFileHandle !== "function")
        throw new Error("INVALID_DIRECTORY_HANDLE");
      setChosenDirectory(directory);
      setFolderError(undefined);
    } catch (error) {
      if (selection === directorySelection.current) showFolderFailure(error);
    } finally {
      choosingDirectoryRef.current = false;
      setChoosingDirectory(false);
    }
  };
  const workWithFolder = async (mode: "open" | "create" | "transfer" | "import", recent?: DynastyDirectory) => {
    if (folderWorking || app.busy || choosingDirectoryRef.current) return;
    const target = mode === "create" || mode === "import" ? chosenDirectory.current : recent;
    if ((mode === "create" || mode === "import") && !target) {
      setFolderError(t("chooseDynastyFolder"));
      return;
    }
    // A fresh selection already requested read/write access. Do not request it
    // again on Create/Import; only bookmarks from earlier sessions need renewal.
    const selection = recent
      ? grantDirectory(recent).then(() => recent)
      : target
        ? Promise.resolve(target)
        : pickDynastyDirectory();
    setFolderWorking(true);
    setFolderError(undefined);
    try {
      const directory = await selection;
      if (mode !== "transfer" && !app.loadError && !(await app.forceSave())) {
        notify(t("saveFailedHint"));
        return;
      }
      let next: Project;
      let folder: DynastyFolder;
      if (mode === "open") {
        let parent: DynastyDirectory | undefined;
        for (const item of recentFolders) {
          try {
            if (item.parent && (await item.directory.isSameEntry(directory))) {
              parent = item.parent;
              break;
            }
          } catch {
            /* A stale bookmark must not block opening a selected folder. */
          }
        }
        ({ project: next, folder } = await DynastyFolder.open(directory, parent));
      } else {
        next =
          mode === "transfer"
            ? project
            : mode === "import"
              ? pendingImport!
              : createEmptyProject(newProjectName!.trim());
        folder = await DynastyFolder.createInLocation(directory, next);
      }
      if (!(await app.openFolder(folder, next, mode === "transfer"))) {
        notify(t("saveFailedHint"));
        return;
      }
      onOpened(next);
      setNewProjectName(undefined);
      setPendingImport(undefined);
      setChosenDirectory(undefined);
      refreshFolders();
    } catch (error) {
      showFolderFailure(error);
    } finally {
      setFolderWorking(false);
    }
  };
  const transferToFolder = () => {
    setChosenDirectory(undefined);
    void workWithFolder("transfer");
  };
  const createNewProject = () => {
    if (newProjectName?.trim()) void workWithFolder("create");
  };

  const exportProject = () => {
    void downloadProject(project).catch((error) => {
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
      if (isTauri()) {
        if (
          await saveDesktopExport(
            `${project.name.replace(/\s+/g, "_")}.png`,
            dataUrl.slice(dataUrl.indexOf(",") + 1),
            true,
          )
        )
          notify(t("pngCreated"));
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${project.name.replace(/\s+/g, "_")}.png`;
      anchor.click();
      notify(t("pngCreated"));
    } catch {
      notify(t("pngFailed"));
    }
  };

  return {
    importInput,
    recentFolders,
    refreshFolders,
    folderWorking,
    folderError,
    setFolderError,
    newProjectName,
    setNewProjectName,
    pendingImport,
    chosenDirectoryName,
    choosingDirectory,
    startNewProject,
    cancelNewProject,
    cancelImport,
    openImportPicker,
    handleImport,
    switchProject,
    chooseDirectory,
    workWithFolder,
    transferToFolder,
    createNewProject,
    exportProject,
    exportPng,
  };
}

export type DynastyFiles = ReturnType<typeof useDynastyFiles>;
