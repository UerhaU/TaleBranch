import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Edge, type Node,
  type OnNodesChange, applyNodeChanges, type ReactFlowInstance, type AriaLabelConfig,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import {
  ArchiveRestore, BookOpenText, ChevronDown, CircleHelp, Download, Filter, Focus, GitBranch,
  HeartHandshake, ImageDown, Languages, LayoutDashboard, Link2, ListFilter, Menu, MessageCircleQuestion, Moon, Network, Plus,
  Redo2, RefreshCw, Save, Search, Settings2, SlidersHorizontal, Sun, Undo2, Upload, UserPlus, X,
} from "lucide-react";
import { CharacterNode, type CharacterNodeData } from "./components/CharacterNode";
import { CharacterDialog } from "./components/CharacterDialog";
import { Inspector } from "./components/Inspector";
import { LinkDialog, type LinkEdit } from "./components/LinkDialog";
import { Modal } from "./components/Modal";
import { PhotoEditor } from "./components/PhotoEditor";
import { useProject } from "./hooks/useProject";
import { autoLayout, createEmptyProject, hasAncestorCycle } from "./lib/project";
import { downloadProject, downloadRecoveryData, importProject, listProjects, loadProject } from "./lib/storage";
import { supportedLocales, useI18n, type LocalePreference } from "./i18n";
import type { Character, CharacterStatus, PhotoTransform, Project, Theme } from "./types";
import { APP_VERSION } from "./version";
import { readPreference, writePreference } from "./lib/preferences";

const nodeTypes = { character: CharacterNode };
type PhotoDraft = { original: string; stageName: string; characterId: string; transform?: PhotoTransform };
type DeleteDraft = { character: Character; family: number; pairs: number; photos: number };
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
  const [theme, setTheme] = useState<Theme>(() => readPreference("dynasty-chronicles:theme") === "light" ? "light" : "dark");
  const [selectedId, setSelectedId] = useState<string | undefined>(() => project.characters.find((item) => item.id === "char_vera")?.id ?? project.characters[0]?.id);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CharacterStatus | "all">("all");
  const [generationFilter, setGenerationFilter] = useState<number | "all">("all");
  const [showParents, setShowParents] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkEdit | undefined>();
  const [confirmAction, setConfirmAction] = useState<{ title: string; run: () => void } | undefined>();
  const [showCharacterList, setShowCharacterList] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectDetails, setProjectDetails] = useState({ name: "", description: "", worldName: "" });
  const [linkDialogKind, setLinkDialogKind] = useState<"parent" | "pair">("parent");
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft | undefined>();
  const [deleteDraft, setDeleteDraft] = useState<DeleteDraft | undefined>();
  const [showTrash, setShowTrash] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel | undefined>();
  const [newProjectName, setNewProjectName] = useState<string | undefined>();
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
  const generations = useMemo(() => [...new Set(project.characters.map((character) => character.generation))].sort((a, b) => a - b), [project.characters]);

  const visibleCharacters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return project.characters.filter((character) => {
      const matchesSearch = !query || [character.displayName, ...character.aliases, ...character.tags].join(" ").toLocaleLowerCase("ru").includes(query);
      const matchesStatus = statusFilter === "all" || character.status === statusFilter;
      const matchesGeneration = generationFilter === "all" || character.generation === generationFilter;
      return matchesSearch && matchesStatus && matchesGeneration;
    });
  }, [project.characters, search, statusFilter, generationFilter]);

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
    return familyEdges;
  }, [project.parentLinks, showParents, visibleIds]);

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
      const editingText = event.target instanceof Element && Boolean(event.target.closest('input, textarea, [contenteditable="true"]'));
      if (key === "s") {
        event.preventDefault();
        notify(t(app.forceSave() ? "projectSaved" : "saveFailedHint"));
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
      const imported = await importProject(file, t("projectCopySuffix"));
      if (!app.replace(imported)) { notify(t("saveFailedHint")); return; }
      setSearch(""); setStatusFilter("all"); setGenerationFilter("all");
      setSelectedId(imported.characters[0]?.id);
      notify(t("projectImported"));
    } catch {
      notify(t("importFailed"));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const switchProject = (id: string) => {
    if (id === project.id) { setShowProjectMenu(false); return; }
    try {
      const next = loadProject(id);
      if (!next) { notify(t("loadFailedHint")); return; }
      if (!app.replace(next)) { notify(t("saveFailedHint")); return; }
      setSelectedId(next.characters[0]?.id);
      setSearch(""); setStatusFilter("all"); setGenerationFilter("all");
      setShowProjectMenu(false);
    } catch { notify(t("loadFailedHint")); }
  };

  const createNewProject = () => {
    if (!newProjectName?.trim()) return;
    const next = createEmptyProject(newProjectName.trim());
    if (!app.replace(next)) { notify(t("saveFailedHint")); return; }
    setSearch(""); setStatusFilter("all"); setGenerationFilter("all");
    setSelectedId(undefined);
    setNewProjectName(undefined);
    setShowProjectMenu(false);
  };

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
    const frame = window.requestAnimationFrame(() => {
      flowInstance.current?.fitView({ duration: 350, padding: 0.16, maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id]);

  const exportProject = () => { void downloadProject(project).catch(() => notify(t("exportFailed"))); };
  const openSettings = () => { setProjectDetails({ name: project.name, description: project.description, worldName: project.worldName }); setShowProjectSettings(true); };

  return (
    <div className="app-shell">
      <aside className="rail">
        <button className="brand-mark" aria-label={t("appName")}><GitBranch size={21} /></button>
        <nav>
          <button className="active" title={t("tree")}><Network size={19} /></button>
          <button title={t("characterList")} onClick={() => setShowCharacterList(true)}><LayoutDashboard size={19} /></button>
          <button title={t("trash")} onClick={() => setShowTrash(true)}><ArchiveRestore size={19} /><span className="rail-badge">{project.trashedCharacters.length || ""}</span></button>
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
          <button title={t("settings")} onClick={openSettings} disabled={app.loadError}><Settings2 size={19} /></button>
          <button title={t("about")} onClick={() => setShowAbout(true)}><CircleHelp size={19} /></button>
          <button title={t("changeTheme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
          <span className="privacy-dot" title={t("offline")} />
        </div>
      </aside>

      <main className="workspace">
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
                {listProjects().map((item) => (
                  <button key={item.id} className={item.id === project.id ? "active" : ""} onClick={() => switchProject(item.id)}>
                    <span>{item.name.slice(0, 1)}</span>
                    <div><strong>{item.name}</strong><small>{t("charactersCount", { count: item.characterCount })}</small></div>
                  </button>
                ))}
                <div className="menu-separator" />
                <button onClick={() => setNewProjectName("")}><Plus size={16} /> {t("newProject")}</button>
                <button onClick={() => importInput.current?.click()}><Upload size={16} /> {t("import")}</button>
              </div>
            )}
            <input ref={importInput} type="file" accept=".dynasty-tree,application/json" hidden onChange={(event) => void handleImport(event.target.files?.[0])} />
          </div>
          <div className={`save-state ${app.saveStatus}`}>
            <i /> <span>{statusText[app.saveStatus]}</span>
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
          <span>{t(app.loadError ? "loadFailedHint" : app.saveStatus === "error" ? "saveFailedHint" : "closeGuardFailedHint")}</span>
          {app.loadError ? <button className="button subtle" onClick={downloadRecoveryData}>{t("downloadRecovery")}</button> : <><button className="button subtle" onClick={() => app.forceSave()}>{t("retrySave")}</button><button className="button subtle" onClick={exportProject}>{t("exportProject")}</button></>}
        </div>}

        <section className="canvas-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchCharacter")} aria-label={t("searchCharacter")} />
            {search && <button onClick={() => setSearch("")}><X size={14} /></button>}
            <kbd>Ctrl K</kbd>
          </div>
          <button className={showFilters ? "active" : ""} onClick={() => setShowFilters(!showFilters)}><ListFilter size={16} /> {t("filters")} {(statusFilter !== "all" || generationFilter !== "all") && <i />}</button>
          <button onClick={() => flowInstance.current?.fitView({ duration: 400, padding: 0.18 })}><Focus size={16} /> {t("showAll")}</button>
          <div className="view-label">
            {t("visibleCharacters", { visible: visibleCharacters.length, total: project.characters.length })}
          </div>
        </section>

        {showFilters && (
          <section className="filter-panel">
            <div className="filter-title"><Filter size={16} /><strong>{t("viewFilters")}</strong></div>
            <label>{t("status")}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CharacterStatus | "all")}><option value="all">{t("all")}</option><option value="alive">{t("alive")}</option><option value="dead">{t("dead")}</option><option value="missing">{t("missing")}</option></select></label>
            <label>{t("generation")}<select value={generationFilter} onChange={(event) => setGenerationFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">{t("all")}</option>{generations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="toggle-row"><input type="checkbox" checked={showParents} onChange={(event) => setShowParents(event.target.checked)} /><span>{t("family")}</span></label>
            <button className="icon-button" onClick={() => setShowFilters(false)}><X size={16} /></button>
          </section>
        )}

        <div className={`content-row ${selected ? "with-inspector" : ""}`}>
          <div className="flow-wrap">
            <ReactFlow
              nodes={localNodes}
              edges={edges}
              nodeTypes={nodeTypes}
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
                <button className="button primary" disabled={app.loadError} onClick={() => project.characters.length ? (setSearch(""), setStatusFilter("all"), setGenerationFilter("all")) : setShowAddCharacter(true)}>
                  {project.characters.length ? t("resetFilters") : <><Plus size={16} /> {t("addCharacter")}</>}
                </button>
              </div>
            )}
            <div className="legend">
              <span className="eyebrow">{t("legend")}</span>
              <div><i className="line family" /> {t("family")}</div>
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
      </main>

      {showAddCharacter && <CharacterDialog ownerCandidates={project.characters} onClose={() => setShowAddCharacter(false)} onSave={(character) => { app.addCharacter(character); setSelectedId(character.id); setShowAddCharacter(false); notify(t("characterAdded")); }} />}
      {editingCharacter && <CharacterDialog character={editingCharacter} ownerCandidates={project.characters} onClose={() => setEditingCharacter(undefined)} onSave={(character) => { app.updateCharacter(character.id, character); setEditingCharacter(undefined); notify(t("profileUpdated")); }} />}
      {showLinkDialog && <LinkDialog project={project} selectedId={selectedId} initialKind={linkDialogKind} editing={editingLink} onClose={() => setShowLinkDialog(false)} onParent={(link) => { app.addParentLink(link); setShowLinkDialog(false); notify(t(editingLink ? "connectionUpdated" : "familyAdded")); }} onPair={(link) => { app.addPairLink(link); setShowLinkDialog(false); notify(t(editingLink ? "connectionUpdated" : "relationAdded")); }} />}
      {photoDraft && <PhotoEditor source={photoDraft.original} initialTransform={photoDraft.transform} onClose={() => setPhotoDraft(undefined)} onSave={savePhoto} />}
      {confirmAction && <Modal title={confirmAction.title} subtitle={t("canUndoAction")} onClose={() => setConfirmAction(undefined)}><footer className="modal-footer"><button className="button ghost" onClick={() => setConfirmAction(undefined)}>{t("cancel")}</button><button className="button danger" onClick={() => { confirmAction.run(); setConfirmAction(undefined); }}>{t("confirmAction")}</button></footer></Modal>}
      {showProjectSettings && <Modal title={t("projectSettings")} onClose={() => setShowProjectSettings(false)}>
        <div className="modal-body form-stack">
          <label className="field"><span>{t("projectName")}</span><input autoFocus value={projectDetails.name} onChange={(event) => setProjectDetails({ ...projectDetails, name: event.target.value })} /></label>
          <label className="field"><span>{t("projectDescription")}</span><textarea rows={4} value={projectDetails.description} onChange={(event) => setProjectDetails({ ...projectDetails, description: event.target.value })} /></label>
          <label className="field"><span>{t("world")}</span><input value={projectDetails.worldName} onChange={(event) => setProjectDetails({ ...projectDetails, worldName: event.target.value })} /></label>
        </div><footer className="modal-footer"><button className="button ghost" onClick={() => setShowProjectSettings(false)}>{t("cancel")}</button><button className="button primary" disabled={!projectDetails.name.trim()} onClick={() => { app.commit((draft) => { Object.assign(draft, projectDetails, { name: projectDetails.name.trim() }); }); setShowProjectSettings(false); }}>{t("save")}</button></footer>
      </Modal>}
      {showCharacterList && <Modal title={t("characterList")} subtitle={t("charactersCount", { count: project.characters.length })} onClose={() => setShowCharacterList(false)}>
        <div className="modal-body character-list">{project.characters.map((character) => <button key={character.id} onClick={() => {
          setSelectedId(character.id); setShowCharacterList(false); setSearch(""); setStatusFilter("all"); setGenerationFilter("all");
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
              <div key={character.id}><span style={{ background: character.color }}>{character.displayName.slice(0, 1)}</span><div><strong>{character.displayName}</strong><small>{valueLabel(character.lifeStage)}</small></div><button className="button subtle" onClick={() => { app.restoreCharacter(character.id); notify(t("restored")); }}>{t("restore")}</button></div>
            ))}
            {!project.trashedCharacters.length && <div className="empty-modal"><ArchiveRestore size={28} /><p>{t("trashEmpty")}</p></div>}
          </div>
        </Modal>
      )}
      {newProjectName !== undefined && (
        <Modal title={t("newProject")} subtitle={t("newProjectHint")} onClose={() => setNewProjectName(undefined)}>
          <div className="modal-body"><label className="field"><span>{t("projectName")}</span><input autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder={t("projectNameExample")} onKeyDown={(event) => event.key === "Enter" && createNewProject()} /></label></div>
          <footer className="modal-footer"><button className="button ghost" onClick={() => setNewProjectName(undefined)}>{t("cancel")}</button><button className="button primary" onClick={createNewProject} disabled={!newProjectName.trim()}><Plus size={16} /> {t("create")}</button></footer>
        </Modal>
      )}
      {showAbout && (
        <Modal title={t("about")} subtitle={t("aboutSubtitle").replace("0.1.0", APP_VERSION)} onClose={() => setShowAbout(false)}>
          <div className="modal-body about-copy">
            <div className="about-mark"><GitBranch size={28} /></div>
            <p>{t("aboutText")}</p>
            <p className="offline-note"><Save size={16} /> {t("offline")}. {t("offlineExtra")}</p>
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
      {toast && <div className="toast" role="status" aria-live="polite"><i /><span>{toast}</span></div>}
    </div>
  );
}
