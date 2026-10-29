import { useCallback, useEffect, useRef } from "react";
import { useProject } from "./hooks/useProject";
import { useDialogs } from "./hooks/useDialogs";
import { useDynastyFiles } from "./hooks/useDynastyFiles";
import { useShortcuts } from "./hooks/useShortcuts";
import { useAppearance } from "./hooks/useAppearance";
import { useCustomStyles } from "./hooks/useCustomStyles";
import { useCharacterActions } from "./hooks/useCharacterActions";
import { useToast } from "./hooks/useToast";
import { useTreeView } from "./hooks/useTreeView";
import { useI18n } from "./i18n";
import { autoLayout, hasAncestorCycle } from "./lib/project";
import { inferPetOwner } from "./lib/pets";
import type { Character } from "./types";
import { CatalogBrowser } from "./components/CatalogBrowser";
import { Dock } from "./components/shell/Dock";
import { InspectorPanel } from "./components/shell/InspectorPanel";
import { FolderErrorBar, Toast } from "./components/shell/Notices";
import { StartScreen } from "./components/shell/StartScreen";
import { StorageErrorBar } from "./components/shell/StorageErrorBar";
import { Topbar } from "./components/shell/Topbar";
import { TreeCanvas, fitPadding, type FlowInstance } from "./components/shell/TreeCanvas";
import { AboutDialog } from "./components/dialogs/AboutDialog";
import { CharacterDialogs } from "./components/dialogs/CharacterDialogs";
import { CharacterListDialog } from "./components/dialogs/CharacterListDialog";
import { DeleteCharacterDialog } from "./components/dialogs/DeleteCharacterDialog";
import { ImportDynastyDialog, NewDynastyDialog } from "./components/dialogs/DynastyFolderDialogs";
import { PermanentDeletePrompt } from "./components/dialogs/PermanentDeletePrompt";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { ShortcutsDialog } from "./components/dialogs/ShortcutsDialog";
import { TrashDialog } from "./components/dialogs/TrashDialog";
import { UtilityDialog } from "./components/dialogs/UtilityDialog";
import { VersionsDialog } from "./components/dialogs/VersionsDialog";

export default function App() {
  const { t } = useI18n();
  const app = useProject();
  const { project } = app;
  const dialogs = useDialogs();
  const view = useTreeView(project);
  const { toast, notify } = useToast();
  const custom = useCustomStyles(useCallback(() => notify(t("customStylesOff")), [notify, t]));
  const appearance = useAppearance({
    ids: custom.themes.map((theme) => theme.id),
    loaded: custom.loaded,
    safe: custom.safe,
  });
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
  const { selected } = view;
  const { actions, photoInput, acceptPhoto } = useCharacterActions({ app, dialogs, view, flowInstance, notify, t });
  const showAll = () => flowInstance.current?.fitView({ duration: 400, padding: fitPadding() });
  useShortcuts({
    app,
    notify,
    searchInput,
    dialogs,
    selectedId: view.selectedId,
    actions,
    onDeselect: () => view.setSelectedId(undefined),
    onShowAll: showAll,
  });
  const permanentDelete = dialogs.state.permanentDelete;

  useEffect(() => {
    if (!app.hasProject) {
      flowInstance.current = null;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      flowInstance.current?.fitView({ duration: 350, padding: fitPadding(), maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id, app.hasProject]);

  // Another dynasty or a closed one: an unfinished new or edited character belongs to the old one.
  useEffect(() => dialogs.close("addCharacter", "editCharacter"), [project.id, app.hasProject, dialogs.close]);

  const runAutoLayout = () => {
    const positions = autoLayout(project);
    app.commit((draft) => {
      draft.positions = positions;
    });
    window.setTimeout(() => flowInstance.current?.fitView({ duration: 500, padding: fitPadding() }), 50);
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

  const hasInspector = app.hasProject && Boolean(selected || dialogs.state.addCharacter || dialogs.state.editCharacter);
  return (
    <div className={`tb-app app-shell ${hasInspector ? "has-inspector" : ""}`} inert={files.folderWorking || app.busy}>
      {!app.hasProject ? (
        <>
          <div className="tb-field" />
          <StartScreen files={files} />
        </>
      ) : (
        <>
          <TreeCanvas
            app={app}
            view={view}
            dialogs={dialogs}
            flowInstance={flowInstance}
            actions={actions}
            showMinimap={appearance.showMinimap}
            onAddCharacter={(position) => dialogs.open("addCharacter", { type: "sim", position })}
            onShowAll={showAll}
            onAutoLayout={runAutoLayout}
          />
          <Topbar
            app={app}
            files={files}
            dialogs={dialogs}
            view={view}
            searchInput={searchInput}
            onPick={focusCharacter}
            onDeleteDynasty={requestDeleteDynasty}
          />
          <StorageErrorBar app={app} onExport={files.exportProject} />
          {hasInspector && (
            <InspectorPanel
              app={app}
              selected={selected}
              dialogs={dialogs}
              actions={actions}
              notify={notify}
              onSelect={view.setSelectedId}
              onPhoto={(file, characterId, stageName) => void acceptPhoto(file, characterId, stageName)}
              onClose={() => view.setSelectedId(undefined)}
            />
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              void acceptPhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </>
      )}
      <Dock hasProject={app.hasProject} trashCount={project.trashedCharacters.length} dialogs={dialogs} />
      <input
        ref={files.importInput}
        type="file"
        accept=".dynasty-tree,application/json"
        hidden
        onChange={(event) => void files.handleImport(event.target.files?.[0])}
      />

      {dialogs.state.catalog && <CatalogBrowser onClose={() => dialogs.close("catalog")} />}

      <CharacterDialogs app={app} dialogs={dialogs} selectedId={view.selectedId} notify={notify} />
      {dialogs.state.settings && (
        <SettingsDialog
          appearance={appearance}
          custom={custom}
          app={app}
          view={view}
          onClose={() => dialogs.close("settings")}
          onDeleteDynasty={requestDeleteDynasty}
        />
      )}
      {dialogs.state.shortcuts && <ShortcutsDialog onClose={() => dialogs.close("shortcuts")} />}
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
            dialogs.close("deleteCharacter", "editCharacter");
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
      {files.versions && (
        <VersionsDialog
          title={t("dynastyVersions")}
          hint={t("dynastyVersionsHint")}
          versions={files.versions}
          formatDate={files.versionDate}
          onRestore={files.restoreVersion}
          onClose={files.closeVersions}
        />
      )}
      {files.damaged && (
        <VersionsDialog
          damaged
          title={t("dynastyDamagedTitle")}
          hint={t("dynastyDamagedHint")}
          versions={files.damaged.versions}
          formatDate={files.versionDate}
          onRestore={files.restoreDamaged}
          onClose={files.dismissDamaged}
        />
      )}
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
