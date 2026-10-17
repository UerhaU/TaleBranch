import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, MarkerType, type Edge, type Node,
  type OnNodesChange, applyNodeChanges, type ReactFlowInstance, type AriaLabelConfig,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import {
  ArchiveRestore, BookOpenText, ChevronDown, CircleHelp, Download, Filter, Focus, FolderOpen, GitBranch,
  HeartHandshake, ImageDown, Languages, LayoutDashboard, Link2, ListFilter, Menu, MessageCircleQuestion, Moon, Network, Plus,
  Redo2, RefreshCw, Save, Search, Settings2, SlidersHorizontal, Sun, Trash2, Undo2, Upload, UserPlus, X,
} from "lucide-react";
import { CharacterNode, type CharacterNodeData } from "./components/CharacterNode";
import { CharacterDialog } from "./components/CharacterDialog";
import { Inspector } from "./components/Inspector";
import { LinkDialog, type LinkEdit } from "./components/LinkDialog";
import { Modal } from "./components/Modal";
import { PhotoEditor } from "./components/PhotoEditor";
import { useProject } from "./hooks/useProject";
import { autoLayout, createEmptyProject, hasAncestorCycle } from "./lib/project";
import { downloadProject, downloadRecoveryData, readProjectDocument, listProjects, loadProject } from "./lib/storage";
import { DynastyFolder, grantDirectory, pickDynastyDirectory, recentDynastyFolders, supportsDynastyFolders, type DynastyDirectory, type RecentFolder } from "./lib/folderStorage";
import { supportedLocales, useI18n, type LocalePreference } from "./i18n";
import type { Character, CharacterStatus, PhotoTransform, Project, Theme } from "./types";
import { APP_VERSION } from "./version";
import { readPreference, writePreference } from "./lib/preferences";
import { CatalogBrowser } from "./components/CatalogBrowser";
import { PermanentDeleteDialog } from "./components/PermanentDeleteDialog";
import { RelationshipEdge } from "./components/RelationshipEdge";
import { lastStorageFailure, recordStorageFailure, storageFailureText } from "./lib/storageDiagnostics";
import { isTauri } from "@tauri-apps/api/core";
import { saveDesktopExport } from "./lib/desktopStorage";

const nodeTypes = { character: CharacterNode };
const edgeTypes = { relationship: RelationshipEdge };
type PhotoDraft = { original: string; stageName: string; characterId: string; transform?: PhotoTransform };
type DeleteDraft = { character: Character; family: number; pairs: number; photos: number };
type PermanentDeleteDraft = { projectId: string } & (
  { kind: "character"; id: string; name: string } | { kind: "trash"; ids: string[] } | { kind: "dynasty"; name: string }
);
type UtilityPanel = "guide" | "updates" | "donation";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function inferPetOwner(pet: Character, project: Project): string | undefined {
  const people = project.characters.filter((character) => character.type !== "pet");
  const explicitOwner = pet.ownerIds?.find((id) => people.some((character) => character.id === id));
  if (explicitOwner) return explicitOwner;

  const linkedOwner = project.pairLinks
    .filter((link) => link.aId === pet.id || link.bId === pet.id)
    .map((link) => link.aId === pet.id ? link.bId : link.aId)
    .find((id) => people.some((character) => character.id === id));
  if (linkedOwner) return linkedOwner;

  const sameHousehold = pet.household
    ? people.filter((character) => character.household === pet.household)
    : [];
  return [...sameHousehold]
    .sort((a, b) => Math.abs(a.generation - pet.generation) - Math.abs(b.generation - pet.generation))[0]?.id;
}

export default function App() {
  const { t, valueLabel, locale, preference, systemLocale, setPreference } = useI18n();
  const app = useProject();
  const { project } = app;
  const storedFailure = lastStorageFailure();
  const lastFailure = app.saveError && (!storedFailure || app.saveError.time > storedFailure.time) ? app.saveError : storedFailure;
  const [theme, setTheme] = useState<Theme>(() => readPreference("dynasty-chronicles:theme") === "light" ? "light" : "dark");
  const [selectedId, setSelectedId] = useState<string | undefined>(() => project.characters.find((item) => item.id === "char_vera")?.id ?? project.characters[0]?.id);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CharacterStatus | "all">("all");
  const [showParents, setShowParents] = useState(true);
  const [showRelations, setShowRelations] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkEdit | undefined>();
  const [confirmAction, setConfirmAction] = useState<{ title: string; run: () => void } | undefined>();
  const [showCharacterList, setShowCharacterList] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectDetails, setProjectDetails] = useState({ name: "", description: "" });
  const [linkDialogKind, setLinkDialogKind] = useState<"parent" | "pair">("parent");
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft | undefined>();
  const [deleteDraft, setDeleteDraft] = useState<DeleteDraft | undefined>();
  const [permanentDeleteDraft, setPermanentDeleteDraft] = useState<PermanentDeleteDraft | undefined>();
  const [showTrash, setShowTrash] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel | undefined>();
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
  const refreshFolders = useCallback(() => { void recentDynastyFolders().then(setRecentFolders).catch(() => {}); }, []);
  useEffect(refreshFolders, [refreshFolders, project.id, app.folderName, app.hasProject]);
  useEffect(() => {
    if (!app.hasProject && !app.loadError) setNewProjectName("");
  }, [app.hasProject, app.loadError]);
  const [toast, setToast] = useState<string | undefined>();
  const [localNodes, setLocalNodes] = useState<Node<CharacterNodeData>[]>([]);
  const flowInstance = useRef<ReactFlowInstance<Node<CharacterNodeData>, Edge> | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const statusText = { saved: t("saved"), saving: t("saving"), error: t("saveError") };
  const currentLocale = supportedLocales.find((item) => item.code === locale)!;
  const detectedLocale = supportedLocales.find((item) => item.code === systemLocale)!;
  const graphAriaLabels = useMemo<Partial<AriaLabelConfig>>(() => ({
    "node.a11yDescription.default": t("graphNodeSelect"),
    "node.a11yDescription.keyboardDisabled": t("graphNodeMove"),
    "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) => {
      const directionKey = ({ up: "directionUp", down: "directionDown", left: "directionLeft", right: "directionRight" } as const)[direction as "up" | "down" | "left" | "right"];
      return t("graphNodeMoved", { direction: directionKey ? t(directionKey) : direction, x, y });
    },
    "edge.a11yDescription.default": t("graphEdgeSelect"),
    "controls.ariaLabel": t("graphControls"),
    "controls.zoomIn.ariaLabel": t("graphZoomIn"),
    "controls.zoomOut.ariaLabel": t("graphZoomOut"),
    "controls.fitView.ariaLabel": t("graphFitView"),
    "controls.interactive.ariaLabel": t("graphToggleInteractivity"),
    "minimap.ariaLabel": t("graphMiniMap"),
    "handle.ariaLabel": t("graphHandle"),
  }), [t]);

  const selected = project.characters.find((character) => character.id === selectedId);

  const visibleCharacters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return project.characters.filter((character) => {
      const matchesSearch = !query || [character.displayName, ...character.aliases, ...character.tags].join(" ").toLocaleLowerCase("ru").includes(query);
      const matchesStatus = statusFilter === "all" || character.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [project.characters, search, statusFilter]);

  const visiblePeople = useMemo(() => {
    const directlyVisible = new Set(visibleCharacters.filter((character) => character.type !== "pet").map((character) => character.id));
    visibleCharacters.filter((character) => character.type === "pet").forEach((pet) => {
      const ownerIds = pet.ownerIds?.length ? pet.ownerIds : [inferPetOwner(pet, project)];
      ownerIds.forEach((id) => { if (id) directlyVisible.add(id); });
    });
    return project.characters.filter((character) => character.type !== "pet" && directlyVisible.has(character.id));
  }, [visibleCharacters, project]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((character) => character.id)), [visiblePeople]);
  const petsByOwner = useMemo(() => {
    const grouped = new Map<string, Character[]>();
    visibleCharacters.filter((character) => character.type === "pet").forEach((pet) => {
      const ownerIds = pet.ownerIds?.length ? pet.ownerIds : [inferPetOwner(pet, project)];
      ownerIds.forEach((ownerId) => {
        if (ownerId) grouped.set(ownerId, [...(grouped.get(ownerId) ?? []), pet]);
      });
    });
    return grouped;
  }, [project, visibleCharacters]);

  const nodes = useMemo<Node<CharacterNodeData>[]>(() => visiblePeople.map((character) => {
    const pets = petsByOwner.get(character.id) ?? [];
    const selected = selectedId === character.id || pets.some((pet) => pet.id === selectedId);
    return {
      id: character.id,
      type: "character",
      position: project.positions[character.id] ?? { x: 100, y: 100 },
      data: {
        character,
        pets,
        selected,
        selectedPetId: selectedId,
        onOpen: setSelectedId,
      },
      selected,
    };
  }), [visiblePeople, petsByOwner, project.positions, selectedId]);

  useEffect(() => setLocalNodes(nodes), [nodes]);

  const edges = useMemo<Edge[]>(() => {
    const familyEdges: Edge[] = showParents ? project.parentLinks
      .filter((link) => link.active && visibleIds.has(link.parentId) && visibleIds.has(link.childId))
      .map((link) => ({
        id: link.id,
        source: link.parentId,
        target: link.childId,
        type: "smoothstep",
        className: "family-edge",
        style: { stroke: "#A6BCC9", strokeWidth: 2 },
      })) : [];
    const personalEdges: Edge[] = showRelations ? project.pairLinks
      .filter(pair => pair.labels.length && visibleIds.has(pair.aId) && visibleIds.has(pair.bId))
      .map(pair => {
        const color = pair.labels.find(label => label.active)?.color ?? pair.labels[0].color;
        const marker = { type: MarkerType.ArrowClosed, color };
        return {
          id: `relationship:${pair.id}`, source: pair.aId, target: pair.bId, type: "relationship",
          className: "personal-edge",
          data: { text: pair.labels.map(label => `${valueLabel(label.name)}${label.publicity === "secret" ? t("secretSuffix") : ""}${!label.active ? ` · ${t("endedConnection")}` : ""}`).join(" / ") },
          style: { stroke: color, strokeWidth: 2, strokeOpacity: 0.35, strokeDasharray: pair.labels.every(label => !label.active) || pair.labels.some(label => label.publicity === "secret") ? "5 5" : undefined },
          markerStart: pair.labels.some(label => label.direction === "b-to-a") ? marker : undefined,
          markerEnd: pair.labels.some(label => label.direction === "a-to-b") ? marker : undefined,
          ariaLabel: pair.labels.map(label => valueLabel(label.name)).join(", "),
        };
      }) : [];
    return [...familyEdges, ...personalEdges];
  }, [project.parentLinks, project.pairLinks, showParents, showRelations, visibleIds, valueLabel, t]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePreference("dynasty-chronicles:theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) { if (key === "s") event.preventDefault(); return; }
      if (!app.hasProject) { if (key === "s") event.preventDefault(); return; }
      const editingText = event.target instanceof Element && Boolean(event.target.closest('input, textarea, [contenteditable="true"]'));
      if (key === "s") {
        event.preventDefault();
        const result = app.forceSave();
        if (result instanceof Promise) void result.then(ok => notify(t(ok ? "projectSaved" : "saveFailedHint")));
        else notify(t(result ? "projectSaved" : "saveFailedHint"));
      } else if (key === "k") {
        event.preventDefault(); searchInput.current?.focus(); searchInput.current?.select();
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
  }, [app, notify, t]);

  const onNodesChange: OnNodesChange<Node<CharacterNodeData>> = useCallback((changes) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onPhotoFile = async (file: File, stageName: string) => {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify(t("unsupportedImage")); return; }
    if (file.size > 25 * 1024 * 1024) {
      notify(t("fileTooLarge"));
      return;
    }
    const characterId = selected.id;
    try { setPhotoDraft({ original: await readAsDataUrl(file), stageName, characterId }); }
    catch { notify(t("imageReadError")); }
  };

  const savePhoto = (edited: string, transform: PhotoTransform) => {
    if (!photoDraft) return;
    const character = project.characters.find((item) => item.id === photoDraft.characterId);
    if (!character) return;
    const stages = character.stages.map((stage) => stage.name === photoDraft.stageName ? {
      ...stage,
      photo: { original: photoDraft.original, edited, transform, updatedAt: new Date().toISOString() },
    } : stage);
    app.updateCharacter(character.id, { stages });
    setPhotoDraft(undefined);
    notify(t("photoSaved", { stage: photoDraft.stageName }));
  };

  const requestDelete = () => {
    if (!selected) return;
    setDeleteDraft({
      character: selected,
      family: project.parentLinks.filter((link) => link.parentId === selected.id || link.childId === selected.id).length,
      pairs: project.pairLinks.filter((link) => link.aId === selected.id || link.bId === selected.id).length,
      photos: selected.stages.filter((stage) => stage.photo).length,
    });
  };

  const exportPng = async () => {
    const canvas = document.querySelector<HTMLElement>(".flow-wrap");
    if (!canvas) return;
    try {
      const dataUrl = await toPng(canvas, { backgroundColor: theme === "dark" ? "#160B18" : "#E8EEF1", pixelRatio: 2 });
      if (isTauri()) {
        if (await saveDesktopExport(`${project.name.replace(/\s+/g, "_")}.png`, dataUrl.slice(dataUrl.indexOf(",") + 1), true)) notify(t("pngCreated"));
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

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readProjectDocument(await file.text());
      setPendingImport(imported); setChosenDirectory(undefined); setFolderError(undefined);
    } catch {
      notify(t("importFailed"));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const switchProject = async (id: string) => {
    if (id === project.id && !app.folderName) { setShowProjectMenu(false); return; }
    try {
      const next = loadProject(id);
      if (!next) { notify(t("loadFailedHint")); return; }
      if (!await app.replace(next)) { notify(t("saveFailedHint")); return; }
      setSelectedId(next.characters[0]?.id);
      setSearch(""); setStatusFilter("all");
      setShowProjectMenu(false);
    } catch { notify(t("loadFailedHint")); }
  };

  const showFolderFailure = (error: unknown) => {
    if ((error as Error).name === "AbortError") return;
    const message = (error as Error).message;
    setFolderError(t(message === "FOLDER_UNSUPPORTED" ? "folderUnsupported" : message === "FOLDER_NOT_EMPTY" ? "folderNotEmpty" : message === "FOLDER_CONFLICT" ? "folderConflict" : "folderFailed"));
  };
  const chooseDirectory = async () => {
    if (choosingDirectoryRef.current) return;
    const selection = ++directorySelection.current;
    choosingDirectoryRef.current = true; setChoosingDirectory(true);
    try {
      const directory = await pickDynastyDirectory();
      if (selection !== directorySelection.current) return;
      if (!directory || typeof directory.name !== "string" || typeof directory.getFileHandle !== "function") throw new Error("INVALID_DIRECTORY_HANDLE");
      setChosenDirectory(directory); setFolderError(undefined);
    } catch (error) { if (selection === directorySelection.current) showFolderFailure(error); }
    finally { choosingDirectoryRef.current = false; setChoosingDirectory(false); }
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
    const selection = recent ? grantDirectory(recent).then(() => recent)
      : target ? Promise.resolve(target) : pickDynastyDirectory();
    setFolderWorking(true); setFolderError(undefined);
    try {
      const directory = await selection;
      if (mode !== "transfer" && !app.loadError && !await app.forceSave()) { notify(t("saveFailedHint")); return; }
      let next: Project; let folder: DynastyFolder;
      if (mode === "open") ({ project: next, folder } = await DynastyFolder.open(directory));
      else {
        next = mode === "transfer" ? project : mode === "import" ? pendingImport! : createEmptyProject(newProjectName!.trim());
        folder = await DynastyFolder.createInLocation(directory, next);
      }
      if (!await app.openFolder(folder, next, mode === "transfer")) { notify(t("saveFailedHint")); return; }
      setSearch(""); setStatusFilter("all"); setSelectedId(next.characters[0]?.id);
      setNewProjectName(undefined); setPendingImport(undefined); setChosenDirectory(undefined); setShowProjectMenu(false);
      refreshFolders();
    } catch (error) { showFolderFailure(error); }
    finally { setFolderWorking(false); }
  };
  const createNewProject = () => { if (newProjectName?.trim()) void workWithFolder("create"); };

  const runAutoLayout = () => {
    const positions = autoLayout(project);
    app.commit((draft) => { draft.positions = positions; });
    window.setTimeout(() => flowInstance.current?.fitView({ duration: 500, padding: 0.18 }), 50);
    notify(t(hasAncestorCycle(project) ? "layoutCycleHint" : "layoutDone"));
  };

  const openLinkDialog = (kind: "parent" | "pair" = "parent") => {
    setEditingLink(undefined);
    setLinkDialogKind(kind);
    setShowLinkDialog(true);
  };

  useEffect(() => {
    if (!app.hasProject) { flowInstance.current = null; return; }
    const frame = window.requestAnimationFrame(() => {
      flowInstance.current?.fitView({ duration: 350, padding: 0.16, maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id, app.hasProject]);

  const exportProject = () => { void downloadProject(project).catch(error => {
    const failure = recordStorageFailure(error, "export");
    notify(`${t("exportFailed")} ${failure.name}: ${failure.message}`);
  }); };
  const openSettings = () => { setProjectDetails({ name: project.name, description: project.description }); setShowProjectSettings(true); };
  const requestDeleteDynasty = () => {
    setShowProjectMenu(false);
    setPermanentDeleteDraft({ kind: "dynasty", projectId: project.id, name: project.name });
  };
  const confirmPermanentDelete = (): boolean | Promise<boolean> => {
    if (!permanentDeleteDraft || permanentDeleteDraft.projectId !== project.id) return false;
    if (permanentDeleteDraft.kind === "dynasty") {
      const finish = (ok: boolean) => {
        if (!ok) return false;
        setShowProjectSettings(false); setShowTrash(false); setShowProjectMenu(false);
        setSelectedId(undefined);
        setSearch(""); setStatusFilter("all");
        notify(t("dynastyDeleted"));
        refreshFolders();
        return true;
      };
      const result = app.deleteProject();
      return result instanceof Promise ? result.then(finish) : finish(result);
    } else {
      const ids = permanentDeleteDraft.kind === "character" ? [permanentDeleteDraft.id] : permanentDeleteDraft.ids;
      const finish = (ok: boolean) => { if (ok) notify(t("permanentlyDeleted")); return ok; };
      const result = app.permanentlyDeleteCharacters(ids);
      return result instanceof Promise ? result.then(finish) : finish(result);
    }
  };

  return (
    <div className="app-shell" inert={folderWorking || app.busy}>
      <aside className="rail">
        <button className="brand-mark" aria-label={t("appName")}><GitBranch size={21} /></button>
        <nav>
          <button className={app.hasProject ? "active" : ""} disabled={!app.hasProject} title={t("tree")}><Network size={19} /></button>
          <button title={t("characterList")} disabled={!app.hasProject} onClick={() => setShowCharacterList(true)}><LayoutDashboard size={19} /></button>
          <button title={t("gameCatalogs")} aria-label={t("gameCatalogs")} onClick={() => setShowCatalog(true)}><BookOpenText size={19} /></button>
          <button title={t("trash")} disabled={!app.hasProject} onClick={() => setShowTrash(true)}><ArchiveRestore size={19} /><span className="rail-badge">{project.trashedCharacters.length || ""}</span></button>
        </nav>
        <div className="rail-middle" aria-label={t("helpSupport")}>
          <button className={utilityPanel === "guide" ? "active" : ""} title={t("guide")} aria-label={t("guide")} onClick={() => setUtilityPanel("guide")}><BookOpenText size={19} /></button>
          <button className={utilityPanel === "updates" ? "active" : ""} title={t("checkUpdates")} aria-label={t("checkUpdates")} onClick={() => setUtilityPanel("updates")}><RefreshCw size={19} /></button>
          <button className={utilityPanel === "donation" ? "active" : ""} title={t("donation")} aria-label={t("donation")} onClick={() => setUtilityPanel("donation")}><HeartHandshake size={19} /></button>
        </div>
        <div className="rail-bottom">
          <div className="language-switcher">
            <button className={showLanguageMenu ? "active" : ""} title={t("language")} aria-label={`${t("language")}: ${currentLocale.label}`} onClick={() => setShowLanguageMenu((value) => !value)}>
              <Languages size={18} /><span>{currentLocale.short}</span>
            </button>
            {showLanguageMenu && (
              <div className="language-menu" role="menu" aria-label={t("language")}>
                <div className="language-menu-header">
                  <strong>{t("language")}</strong>
                  <button type="button" className="translation-request" title={t("requestTranslation")} aria-label={t("requestTranslation")}>
                    <MessageCircleQuestion size={14} />
                  </button>
                </div>
                <button className={preference === "system" ? "active" : ""} onClick={() => { setPreference("system"); setShowLanguageMenu(false); }}>
                  <span>◉</span><span>{t("systemLanguage", { language: detectedLocale.label })}</span>
                </button>
                {supportedLocales.map((item) => (
                  <button key={item.code} className={preference === item.code ? "active" : ""} onClick={() => { setPreference(item.code as LocalePreference); setShowLanguageMenu(false); }}>
                    <span>{item.short}</span><span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button title={t("settings")} onClick={openSettings} disabled={app.loadError || !app.hasProject}><Settings2 size={19} /></button>
          <button title={t("about")} onClick={() => setShowAbout(true)}><CircleHelp size={19} /></button>
          <button title={t("changeTheme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
          <span className="privacy-dot" title={t("offline")} />
        </div>
      </aside>

      {showCatalog && <CatalogBrowser onClose={() => setShowCatalog(false)} />}
      <main className="workspace">
        {!app.hasProject ? <section className="dynasty-welcome">
          <GitBranch size={36} />
          <h1>{t("noDynastyTitle")}</h1>
          <p>{t("noDynastyHint")}</p>
          <p>{t("folderHint")}</p>
          <div className="dynasty-welcome-actions">
            <button className="button primary" onClick={() => { setChosenDirectory(undefined); setFolderError(undefined); setNewProjectName(""); }}><Plus size={16} /> {t("newProject")}</button>
            <button className="button subtle" onClick={() => void workWithFolder("open")}><FolderOpen size={16} /> {t("openDynastyFolder")}</button>
            <button className="button subtle" onClick={() => importInput.current?.click()}><Upload size={16} /> {t("import")}</button>
          </div>
          {!supportsDynastyFolders() && <p role="note">{t("folderUnsupported")}</p>}
          {!!recentFolders.length && <div className="folder-recents"><h2>{t("recentProjects")}</h2>{recentFolders.map(item => <button className="button subtle" key={item.id} onClick={() => void workWithFolder("open", item.directory)}><FolderOpen size={16} /> {item.name} · {item.directory.name}</button>)}</div>}
          {!!listProjects().length && <div className="folder-recents"><h2>{t("browserDynasties")}</h2>{listProjects().map(item => <button className="button subtle" key={item.id} onClick={() => void switchProject(item.id)}>{item.name}</button>)}</div>}
        </section> : <>
        <header className="topbar">
          <div className="project-switcher">
            <button onClick={() => setShowProjectMenu(!showProjectMenu)}>
              <span className="project-emblem">{project.name.slice(0, 1).toUpperCase()}</span>
              <span><small>{t("project")}</small><strong>{project.name}</strong></span>
              <ChevronDown size={16} />
            </button>
            {showProjectMenu && (
              <div className="project-menu">
                <div className="menu-label">{t("recentProjects")}</div>
                {recentFolders.map(item => <button key={`folder:${item.id}`} onClick={() => void workWithFolder("open", item.directory)}><FolderOpen size={16} /><div><strong>{item.name}</strong><small>{item.directory.name}</small></div></button>)}
                <div className="menu-label">{t("browserDynasties")}</div>
                {listProjects().map((item) => (
                  <button key={item.id} className={item.id === project.id ? "active" : ""} onClick={() => switchProject(item.id)}>
                    <span>{item.name.slice(0, 1)}</span>
                    <div><strong>{item.name}</strong><small>{t("charactersCount", { count: item.characterCount })}</small></div>
                  </button>
                ))}
                <div className="menu-separator" />
                <button onClick={() => { setChosenDirectory(undefined); setFolderError(undefined); setNewProjectName(""); }}><Plus size={16} /> {t("newProject")}</button>
                <button onClick={() => void workWithFolder("open")}><FolderOpen size={16} /> {t("openDynastyFolder")}</button>
                {!app.folderName && <button onClick={() => { setChosenDirectory(undefined); void workWithFolder("transfer"); }}><FolderOpen size={16} /> {t("saveDynastyFolder")}</button>}
                {app.folderName && <button onClick={() => void app.closeFolder().then(ok => { if (ok) setShowProjectMenu(false); })}>{t("closeDynastyFolder")}</button>}
                <button onClick={() => importInput.current?.click()}><Upload size={16} /> {t("import")}</button>
                <div className="menu-separator" />
                <button className="danger-text" disabled={app.loadError} onClick={requestDeleteDynasty}><Trash2 size={16} /> {t("deleteDynasty")}</button>
              </div>
            )}
          </div>
          <div className={`save-state ${app.saveStatus}`}>
            <i /> <span>{statusText[app.saveStatus]}</span>
            <small title={t("folderHint")}>{app.folderName ? `${app.folderName} / dynasty.json` : t("browserStorage")}</small>
          </div>
          <div className="top-actions">
            <button disabled={!app.canUndo} onClick={app.undo} title={t("undo")}><Undo2 size={17} /></button>
            <button disabled={!app.canRedo} onClick={app.redo} title={t("redo")}><Redo2 size={17} /></button>
            <span className="toolbar-separator" />
            <button onClick={runAutoLayout} disabled={app.loadError}><Network size={16} /> <span>{t("autoLayout")}</span></button>
            <button onClick={exportProject} title={t("exportProject")} disabled={app.loadError}><Download size={17} /></button>
            <button onClick={exportPng} title={t("exportPng")}><ImageDown size={17} /></button>
            <button className="button primary add-person" disabled={app.loadError} onClick={() => setShowAddCharacter(true)}><UserPlus size={17} /> {t("character")}</button>
          </div>
        </header>

        {(app.loadError || app.saveStatus === "error" || app.closeGuardError) && <div className="storage-error" role="alert">
          <span>{app.saveStatus === "error" && app.saveError && !app.loadError ? app.folderName ? t(app.saveError.message === "FOLDER_CONFLICT" ? "folderConflict" : "folderSaveFailed") : storageFailureText(app.saveError, t) : t(app.loadError ? "loadFailedHint" : app.saveStatus === "error" ? "saveFailedHint" : "closeGuardFailedHint")}</span>
          {app.loadError ? <button className="button subtle" onClick={downloadRecoveryData}>{t("downloadRecovery")}</button> : <><button className="button subtle" onClick={() => app.forceSave()}>{t("retrySave")}</button><button className="button subtle" onClick={exportProject}>{t("exportProject")}</button></>}
          {app.saveStatus === "error" && app.saveError && <details className="storage-error-details"><summary>{t("errorDetails")}</summary><pre>{JSON.stringify(app.saveError, null, 2)}</pre></details>}
        </div>}

        <section className="canvas-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchCharacter")} aria-label={t("searchCharacter")} />
            {search && <button onClick={() => setSearch("")}><X size={14} /></button>}
            <kbd>Ctrl K</kbd>
          </div>
          <button className={showFilters ? "active" : ""} onClick={() => setShowFilters(!showFilters)}><ListFilter size={16} /> {t("filters")} {statusFilter !== "all" && <i />}</button>
          <button onClick={() => flowInstance.current?.fitView({ duration: 400, padding: 0.18 })}><Focus size={16} /> {t("showAll")}</button>
          <div className="view-label">
            {t("visibleCharacters", { visible: visibleCharacters.length, total: project.characters.length })}
          </div>
        </section>

        {showFilters && (
          <section className="filter-panel">
            <div className="filter-title"><Filter size={16} /><strong>{t("viewFilters")}</strong></div>
            <label>{t("status")}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CharacterStatus | "all")}><option value="all">{t("all")}</option><option value="alive">{t("alive")}</option><option value="dead">{t("dead")}</option><option value="missing">{t("missing")}</option></select></label>
            <label className="toggle-row"><input type="checkbox" checked={showParents} onChange={(event) => setShowParents(event.target.checked)} /><span>{t("family")}</span></label>
            <label className="toggle-row"><input type="checkbox" checked={showRelations} onChange={(event) => setShowRelations(event.target.checked)} /><span>{t("relations")}</span></label>
            <button className="icon-button" onClick={() => setShowFilters(false)}><X size={16} /></button>
          </section>
        )}

        <div className={`content-row ${selected ? "with-inspector" : ""}`}>
          <div className="flow-wrap">
            <ReactFlow
              nodes={localNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => { flowInstance.current = instance; }}
              onNodesChange={onNodesChange}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onNodeDragStop={(_, node) => app.updatePosition(node.id, node.position, true)}
              onPaneClick={() => setSelectedId(undefined)}
              minZoom={0.12}
              maxZoom={1.8}
              defaultViewport={{ x: 40, y: 25, zoom: 0.78 }}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              ariaLabelConfig={graphAriaLabels}
              selectionOnDrag
              panOnScroll
              deleteKeyCode={null}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <MiniMap
                pannable
                zoomable
                className="mini-map"
                nodeColor={(node) => (node.data as CharacterNodeData).character.color}
                maskColor={theme === "dark" ? "rgba(22,11,24,.74)" : "rgba(232,238,241,.72)"}
              />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
            {!visiblePeople.length && (
              <div className="canvas-empty">
                <Search size={26} />
                <h3>{project.characters.length ? t("emptySearch") : t("emptyTree")}</h3>
                <p>{project.characters.length ? t("emptySearchHint") : t("emptyTreeHint")}</p>
                <button className="button primary" disabled={app.loadError} onClick={() => project.characters.length ? (setSearch(""), setStatusFilter("all")) : setShowAddCharacter(true)}>
                  {project.characters.length ? t("resetFilters") : <><Plus size={16} /> {t("addCharacter")}</>}
                </button>
              </div>
            )}
            <div className="legend">
              <span className="eyebrow">{t("legend")}</span>
              <div><i className="line family" /> {t("family")}</div>
              <div><i className="line pair" /> {t("relations")}</div>
            </div>
            <button className="floating-link" onClick={() => openLinkDialog("parent")} disabled={project.characters.length < 1}><Link2 size={17} /> {t("addConnection")}</button>
          </div>
          {selected && (
            <Inspector
              character={selected}
              project={project}
              onClose={() => setSelectedId(undefined)}
              onEdit={() => setEditingCharacter(selected)}
              onDelete={requestDelete}
              onAddLink={openLinkDialog}
              onPhoto={(file, stage) => void onPhotoFile(file, stage)}
              onLifeStage={(lifeStage) => app.updateCharacter(selected.id, { lifeStage })}
              onPasteError={() => notify(t("clipboardNoImage"))}
              onEditPhoto={(stageName) => {
                const photo = selected.stages.find((stage) => stage.name === stageName)?.photo;
                if (photo) setPhotoDraft({ original: photo.original, stageName, characterId: selected.id, transform: photo.transform });
              }}
              onRemovePhoto={(stageName) => setConfirmAction({ title: t("removePhoto"), run: () => {
                app.updateCharacter(selected.id, { stages: selected.stages.map((stage) => stage.name === stageName ? { ...stage, photo: undefined } : stage) });
              } })}
              onEditLink={(edit) => { setEditingLink(edit); setLinkDialogKind(edit.kind); setShowLinkDialog(true); }}
              onRemoveLink={(kind, id, labelId) => setConfirmAction({ title: t("removeConnection"), run: () => {
                if (kind === "pair" && labelId) app.removeRelationship(id, labelId);
                else app.removeLink(kind, id);
              } })}
            />
          )}
        </div>
        </>}
        <input ref={importInput} type="file" accept=".dynasty-tree,application/json" hidden onChange={(event) => void handleImport(event.target.files?.[0])} />
      </main>

      {showAddCharacter && <CharacterDialog ownerCandidates={project.characters} onClose={() => setShowAddCharacter(false)} onSave={(character) => { if (!app.addCharacter(character)) { notify(t("petOwnerRequired")); return; } setSelectedId(character.id); setShowAddCharacter(false); notify(t("characterAdded")); }} />}
      {editingCharacter && <CharacterDialog character={editingCharacter} ownerCandidates={project.characters} onClose={() => setEditingCharacter(undefined)} onSave={(character) => { if (!app.updateCharacter(character.id, character)) { notify(t("petOwnerRequired")); return; } setEditingCharacter(undefined); notify(t("profileUpdated")); }} />}
      {showLinkDialog && <LinkDialog project={project} selectedId={selectedId} initialKind={linkDialogKind} editing={editingLink} onClose={() => setShowLinkDialog(false)} onParent={(link) => { app.addParentLink(link); setShowLinkDialog(false); notify(t(editingLink ? "connectionUpdated" : "familyAdded")); }} onPair={(link) => { app.addPairLink(link); setShowLinkDialog(false); notify(t(editingLink ? "connectionUpdated" : "relationAdded")); }} />}
      {photoDraft && <PhotoEditor source={photoDraft.original} initialTransform={photoDraft.transform} onClose={() => setPhotoDraft(undefined)} onSave={savePhoto} />}
      {confirmAction && <Modal title={confirmAction.title} subtitle={t("canUndoAction")} onClose={() => setConfirmAction(undefined)}><footer className="modal-footer"><button className="button ghost" onClick={() => setConfirmAction(undefined)}>{t("cancel")}</button><button className="button danger" onClick={() => { confirmAction.run(); setConfirmAction(undefined); }}>{t("confirmAction")}</button></footer></Modal>}
      {showProjectSettings && <Modal title={t("projectSettings")} onClose={() => setShowProjectSettings(false)}>
        <div className="modal-body form-stack">
          <label className="field"><span>{t("projectName")}</span><input autoFocus value={projectDetails.name} onChange={(event) => setProjectDetails({ ...projectDetails, name: event.target.value })} /></label>
          <label className="field"><span>{t("projectDescription")}</span><textarea rows={4} value={projectDetails.description} onChange={(event) => setProjectDetails({ ...projectDetails, description: event.target.value })} /></label>
        </div>
        <footer className="modal-footer dynasty-settings-footer">
          <button className="button ghost danger-text" disabled={app.loadError} onClick={requestDeleteDynasty}><Trash2 size={16} /> {t("deleteDynasty")}</button>
          <button className="button ghost" onClick={() => setShowProjectSettings(false)}>{t("cancel")}</button>
          <button className="button primary" disabled={!projectDetails.name.trim()} onClick={() => { app.commit((draft) => { Object.assign(draft, projectDetails, { name: projectDetails.name.trim() }); }); setShowProjectSettings(false); }}>{t("save")}</button>
        </footer>
      </Modal>}
      {showCharacterList && <Modal title={t("characterList")} subtitle={t("charactersCount", { count: project.characters.length })} onClose={() => setShowCharacterList(false)}>
        <div className="modal-body character-list">{project.characters.map((character) => <button key={character.id} onClick={() => {
          setSelectedId(character.id); setShowCharacterList(false); setSearch(""); setStatusFilter("all");
          const nodeId = character.type === "pet" ? character.ownerIds?.[0] ?? inferPetOwner(character, project) : character.id;
          if (nodeId) window.setTimeout(() => flowInstance.current?.fitView({ nodes: [{ id: nodeId }], duration: 350, maxZoom: 1 }), 50);
        }}><strong>{character.displayName}</strong><small>{t(character.type)} · {valueLabel(character.lifeStage)} · {t(character.status)}</small></button>)}{!project.characters.length && <p>{t("emptyTree")}</p>}</div>
      </Modal>}
      {deleteDraft && (
        <Modal title={t("deleteTitle", { name: deleteDraft.character.displayName })} subtitle={t("deleteHint")} onClose={() => setDeleteDraft(undefined)}>
          <div className="modal-body delete-summary">
            <div><strong>{deleteDraft.family}</strong><span>{t("familyLinksCount")}</span></div>
            <div><strong>{deleteDraft.pairs}</strong><span>{t("personalLinksCount")}</span></div>
            <div><strong>{deleteDraft.photos}</strong><span>{t("photosCount")}</span></div>
          </div>
          <footer className="modal-footer">
            <button className="button ghost" onClick={() => setDeleteDraft(undefined)}>{t("cancel")}</button>
            <button className="button danger" onClick={() => { app.deleteCharacter(deleteDraft.character.id); setSelectedId(undefined); setDeleteDraft(undefined); notify(t("movedToTrash")); }}><ArchiveRestore size={16} /> {t("moveToTrash")}</button>
          </footer>
        </Modal>
      )}
      {showTrash && (
        <Modal title={t("projectTrash")} subtitle={t("trashHint")} onClose={() => setShowTrash(false)}>
          <div className="modal-body trash-list">
            {project.trashedCharacters.map((character) => (
              <div key={character.id}>
                <span style={{ background: character.color }}>{character.displayName.slice(0, 1)}</span>
                <div><strong>{character.displayName}</strong><small>{valueLabel(character.lifeStage)}</small></div>
                <div className="trash-actions">
                  <button className="button subtle" onClick={() => { app.restoreCharacter(character.id); notify(t("restored")); }}>{t("restore")}</button>
                  <button className="button ghost danger-text" aria-label={t("purgeCharacterTitle", { name: character.displayName })} onClick={() => setPermanentDeleteDraft({ kind: "character", projectId: project.id, id: character.id, name: character.displayName })}><Trash2 size={15} /> {t("deletePermanently")}</button>
                </div>
              </div>
            ))}
            {!project.trashedCharacters.length && <div className="empty-modal"><ArchiveRestore size={28} /><p>{t("trashEmpty")}</p></div>}
          </div>
          {!!project.trashedCharacters.length && <footer className="modal-footer">
            <button className="button danger" onClick={() => setPermanentDeleteDraft({ kind: "trash", projectId: project.id, ids: project.trashedCharacters.map((item) => item.id) })}><Trash2 size={16} /> {t("emptyTrash")}</button>
          </footer>}
        </Modal>
      )}
      {newProjectName !== undefined && (
        <Modal title={t("newProject")} subtitle={t("newProjectHint")} onClose={() => { setChosenDirectory(undefined); setNewProjectName(undefined); }}>
          <div className="modal-body form-stack"><label className="field"><span>{t("projectName")}</span><input autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder={t("projectNameExample")} onKeyDown={(event) => event.key === "Enter" && createNewProject()} /></label><p>{t("folderHint")}</p><button className="button subtle" disabled={choosingDirectory} onClick={() => void chooseDirectory()}><FolderOpen size={16} /> {chosenDirectoryName ?? t("chooseDynastyFolder")}</button>{!supportsDynastyFolders() && <p role="note">{t("folderUnsupported")}</p>}</div>
          <footer className="modal-footer"><button className="button ghost" onClick={() => { setChosenDirectory(undefined); setNewProjectName(undefined); }}>{t("cancel")}</button><button className="button primary" onClick={createNewProject} disabled={!newProjectName.trim() || !chosenDirectoryName || choosingDirectory}><Plus size={16} /> {t("create")}</button></footer>
        </Modal>
      )}
      {pendingImport && <Modal title={t("import")} subtitle={pendingImport.name} onClose={() => { setChosenDirectory(undefined); setPendingImport(undefined); }}><div className="modal-body form-stack"><p>{t("importFolderHint")}</p><button className="button subtle" disabled={choosingDirectory} onClick={() => void chooseDirectory()}><FolderOpen size={16} /> {chosenDirectoryName ?? t("chooseDynastyFolder")}</button></div><footer className="modal-footer"><button className="button ghost" onClick={() => { setChosenDirectory(undefined); setPendingImport(undefined); }}>{t("cancel")}</button><button className="button primary" disabled={!chosenDirectoryName || choosingDirectory} onClick={() => void workWithFolder("import")}>{t("import")}</button></footer></Modal>}
      {folderError && <div className="folder-error" role="alert"><span>{folderError}</span><button className="button ghost" onClick={() => setFolderError(undefined)} aria-label={t("close")}><X size={16} /></button></div>}
      {showAbout && (
        <Modal title={t("about")} subtitle={t("aboutSubtitle").replace("0.1.0", APP_VERSION)} onClose={() => setShowAbout(false)}>
          <div className="modal-body about-copy">
            <div className="about-mark"><GitBranch size={28} /></div>
            <p>{t("aboutText")}</p>
            <p className="offline-note"><Save size={16} /> {t("offline")}. {t("offlineExtra")}</p>
            {lastFailure && <details className="storage-error-details"><summary>{t("lastStorageError")}</summary><pre>{JSON.stringify(lastFailure, null, 2)}</pre></details>}
          </div>
        </Modal>
      )}
      {utilityPanel === "guide" && (
        <Modal title={t("guide")} subtitle={t("guideSubtitle")} onClose={() => setUtilityPanel(undefined)}>
          <div className="modal-body utility-page guide-page">
            <div><span>01</span><section><strong>{t("guideAddTitle")}</strong><p>{t("guideAddText")}</p></section></div>
            <div><span>02</span><section><strong>{t("guideLinkTitle")}</strong><p>{t("guideLinkText")}</p></section></div>
            <div><span>03</span><section><strong>{t("guideTreeTitle")}</strong><p>{t("guideTreeText")}</p></section></div>
            <div><span>04</span><section><strong>{t("guideExportTitle")}</strong><p>{t("guideExportText")}</p></section></div>
          </div>
        </Modal>
      )}
      {utilityPanel === "updates" && (
        <Modal title={t("checkUpdates")} subtitle={t("updatesSubtitle")} onClose={() => setUtilityPanel(undefined)}>
          <div className="modal-body utility-placeholder">
            <span className="utility-icon"><RefreshCw size={26} /></span>
            <span className="status-pill">{t("soon")}</span>
            <h3>{t("githubUpdates")}</h3>
            <p>{t("githubUpdatesText")}</p>
          </div>
        </Modal>
      )}
      {utilityPanel === "donation" && (
        <Modal title={t("donation")} subtitle={t("donationSubtitle")} onClose={() => setUtilityPanel(undefined)}>
          <div className="modal-body utility-placeholder">
            <span className="utility-icon"><HeartHandshake size={26} /></span>
            <span className="status-pill">{t("soon")}</span>
            <h3>{t("supportPage")}</h3>
            <p>{t("supportPageText")}</p>
          </div>
        </Modal>
      )}
      {permanentDeleteDraft && <PermanentDeleteDialog
        title={permanentDeleteDraft.kind === "dynasty" ? t("deleteDynastyTitle", { name: permanentDeleteDraft.name }) : permanentDeleteDraft.kind === "character" ? t("purgeCharacterTitle", { name: permanentDeleteDraft.name }) : t("emptyTrash")}
        description={permanentDeleteDraft.kind === "dynasty" ? app.folderName ? t("deleteFolderDynastyHint", { folder: app.folderName }) : t("deleteDynastyHint", { name: permanentDeleteDraft.name }) : permanentDeleteDraft.kind === "character" ? t("purgeCharacterHint", { name: permanentDeleteDraft.name }) : t("emptyTrashHint", { count: permanentDeleteDraft.ids.length })}
        clearHistory={permanentDeleteDraft.kind !== "dynasty"}
        onClose={() => setPermanentDeleteDraft(undefined)}
        onConfirm={confirmPermanentDelete}
      />}
      {toast && <div className="toast" role="status" aria-live="polite"><i /><span>{toast}</span></div>}
    </div>
  );
}
