import { useEffect, useRef } from "react";
import { useProject } from "./hooks/useProject";
import { useDialogs } from "./hooks/useDialogs";
import { useDynastyFiles } from "./hooks/useDynastyFiles";
import { useShortcuts } from "./hooks/useShortcuts";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { useTreeView } from "./hooks/useTreeView";
import { useI18n } from "./i18n";
import { autoLayout, hasAncestorCycle } from "./lib/project";
import { inferPetOwner } from "./lib/pets";
import type { Character } from "./types";
import { CatalogBrowser } from "./components/CatalogBrowser";
import { CanvasToolbar } from "./components/shell/CanvasToolbar";
import { InspectorPanel } from "./components/shell/InspectorPanel";
import { FolderErrorBar, Toast } from "./components/shell/Notices";
import { Sidebar } from "./components/shell/Sidebar";
import { StartScreen } from "./components/shell/StartScreen";
import { StorageErrorBar } from "./components/shell/StorageErrorBar";
import { Topbar } from "./components/shell/Topbar";
import { TreeCanvas, type FlowInstance } from "./components/shell/TreeCanvas";
import { AboutDialog } from "./components/dialogs/AboutDialog";
import { CharacterDialogs } from "./components/dialogs/CharacterDialogs";
import { CharacterListDialog } from "./components/dialogs/CharacterListDialog";
import { DeleteCharacterDialog } from "./components/dialogs/DeleteCharacterDialog";
import { ImportDynastyDialog, NewDynastyDialog } from "./components/dialogs/DynastyFolderDialogs";
import { PermanentDeletePrompt } from "./components/dialogs/PermanentDeletePrompt";
import { ProjectSettingsDialog } from "./components/dialogs/ProjectSettingsDialog";
import { TrashDialog } from "./components/dialogs/TrashDialog";
import { UtilityDialog } from "./components/dialogs/UtilityDialog";

export default function App() {
  const { t } = useI18n();
  const app = useProject();
  const { project } = app;
  const [theme, setTheme] = useTheme();
  const dialogs = useDialogs();
  const view = useTreeView(project);
  const { toast, notify } = useToast();
  const files = useDynastyFiles({
    app,
    notify,
    onOpened: (next) => {
      view.resetFilters();
      view.setSelectedId(next.characters[0]?.id);
      dialogs.close("projectMenu");
    },
    closeProjectMenu: () => dialogs.close("projectMenu"),
  });
  const flowInstance = useRef<FlowInstance | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useShortcuts(app, notify, searchInput);
  const { selected } = view;
  const permanentDelete = dialogs.state.permanentDelete;

  useEffect(() => {
    if (!app.hasProject) {
      flowInstance.current = null;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      flowInstance.current?.fitView({ duration: 350, padding: 0.16, maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id, app.hasProject]);

  const runAutoLayout = () => {
    const positions = autoLayout(project);
    app.commit((draft) => {
      draft.positions = positions;
    });
    window.setTimeout(() => flowInstance.current?.fitView({ duration: 500, padding: 0.18 }), 50);
    notify(t(hasAncestorCycle(project) ? "layoutCycleHint" : "layoutDone"));
  };

  const focusCharacter = (character: Character) => {
    view.setSelectedId(character.id);
    dialogs.close("characterList");
    view.resetFilters();
    const nodeId =
      character.type === "pet" ? (character.ownerIds?.[0] ?? inferPetOwner(character, project)) : character.id;
    if (nodeId)
      window.setTimeout(
        () => flowInstance.current?.fitView({ nodes: [{ id: nodeId }], duration: 350, maxZoom: 1 }),
        50,
      );
  };

  const requestDeleteDynasty = () => {
    dialogs.close("projectMenu");
    dialogs.open("permanentDelete", { kind: "dynasty", projectId: project.id, name: project.name });
  };
  const confirmPermanentDelete = (): boolean | Promise<boolean> => {
    if (!permanentDelete || permanentDelete.projectId !== project.id) return false;
    if (permanentDelete.kind === "dynasty") {
      const finish = (ok: boolean) => {
        if (!ok) return false;
        dialogs.close("settings", "trash", "projectMenu");
        view.setSelectedId(undefined);
        view.resetFilters();
        notify(t("dynastyDeleted"));
        files.refreshFolders();
        return true;
      };
      const result = app.deleteProject();
      return result instanceof Promise ? result.then(finish) : finish(result);
    } else {
      const ids = permanentDelete.kind === "character" ? [permanentDelete.id] : permanentDelete.ids;
      const finish = (ok: boolean) => {
        if (ok) notify(t("permanentlyDeleted"));
        return ok;
      };
      const result = app.permanentlyDeleteCharacters(ids);
      return result instanceof Promise ? result.then(finish) : finish(result);
    }
  };

  return (
    <div className="app-shell" inert={files.folderWorking || app.busy}>
      <Sidebar
        hasProject={app.hasProject}
        loadError={app.loadError}
        trashCount={project.trashedCharacters.length}
        dialogs={dialogs}
        theme={theme}
        onTheme={setTheme}
      />

      {dialogs.state.catalog && <CatalogBrowser onClose={() => dialogs.close("catalog")} />}
      <main className="workspace">
        {!app.hasProject ? (
          <StartScreen files={files} />
        ) : (
          <>
            <Topbar
              app={app}
              files={files}
              dialogs={dialogs}
              theme={theme}
              onAutoLayout={runAutoLayout}
              onDeleteDynasty={requestDeleteDynasty}
            />
            <StorageErrorBar app={app} onExport={files.exportProject} />
            <CanvasToolbar
              view={view}
              dialogs={dialogs}
              total={project.characters.length}
              searchInput={searchInput}
              onShowAll={() => flowInstance.current?.fitView({ duration: 400, padding: 0.18 })}
            />
            <div className={`content-row ${selected ? "with-inspector" : ""}`}>
              <TreeCanvas
                app={app}
                view={view}
                theme={theme}
                flowInstance={flowInstance}
                onAddCharacter={() => dialogs.open("addCharacter")}
                onAddLink={() => dialogs.open("link", { kind: "parent" })}
              />
              {selected && (
                <InspectorPanel
                  app={app}
                  selected={selected}
                  dialogs={dialogs}
                  notify={notify}
                  onClose={() => view.setSelectedId(undefined)}
                />
              )}
            </div>
          </>
        )}
        <input
          ref={files.importInput}
          type="file"
          accept=".dynasty-tree,application/json"
          hidden
          onChange={(event) => void files.handleImport(event.target.files?.[0])}
        />
      </main>

      <CharacterDialogs
        app={app}
        dialogs={dialogs}
        selectedId={view.selectedId}
        onSelect={view.setSelectedId}
        notify={notify}
      />
      {dialogs.state.settings && (
        <ProjectSettingsDialog
          app={app}
          onClose={() => dialogs.close("settings")}
          onDeleteDynasty={requestDeleteDynasty}
        />
      )}
      {dialogs.state.characterList && (
        <CharacterListDialog project={project} onPick={focusCharacter} onClose={() => dialogs.close("characterList")} />
      )}
      {dialogs.state.deleteCharacter && (
        <DeleteCharacterDialog
          draft={dialogs.state.deleteCharacter}
          onClose={() => dialogs.close("deleteCharacter")}
          onConfirm={() => {
            app.deleteCharacter(dialogs.state.deleteCharacter!.character.id);
            view.setSelectedId(undefined);
            dialogs.close("deleteCharacter");
            notify(t("movedToTrash"));
          }}
        />
      )}
      {dialogs.state.trash && (
        <TrashDialog
          app={app}
          notify={notify}
          onPermanentDelete={(draft) => dialogs.open("permanentDelete", draft)}
          onClose={() => dialogs.close("trash")}
        />
      )}
      {files.newProjectName !== undefined && <NewDynastyDialog files={files} />}
      {files.pendingImport && <ImportDynastyDialog files={files} name={files.pendingImport.name} />}
      {files.folderError && (
        <FolderErrorBar message={files.folderError} onClose={() => files.setFolderError(undefined)} />
      )}
      {dialogs.state.about && <AboutDialog app={app} onClose={() => dialogs.close("about")} />}
      {dialogs.state.utility && (
        <UtilityDialog
          key={dialogs.state.utility}
          panel={dialogs.state.utility}
          onClose={() => dialogs.close("utility")}
        />
      )}
      {permanentDelete && (
        <PermanentDeletePrompt
          draft={permanentDelete}
          folderName={app.folderName}
          onConfirm={confirmPermanentDelete}
          onClose={() => dialogs.close("permanentDelete")}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
