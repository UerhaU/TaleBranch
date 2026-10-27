import { ChevronDown, FolderOpen, Plus, Trash2, Upload } from "lucide-react";
import { useI18n } from "../../i18n";
import { listProjects } from "../../lib/storage";
import type { Dialogs } from "../../hooks/useDialogs";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";
import type { ProjectApi } from "../../hooks/projectApi";

/** Dynasty name in the top bar and the menu that opens below it. */
export function DynastyMenu({
  app,
  files,
  dialogs,
  onDeleteDynasty,
}: {
  app: ProjectApi;
  files: DynastyFiles;
  dialogs: Dialogs;
  onDeleteDynasty: () => void;
}) {
  const { t } = useI18n();
  const { project } = app;
  return (
    <div className="project-switcher">
      <button onClick={() => dialogs.toggle("projectMenu")}>
        <span className="project-emblem">{project.name.slice(0, 1).toUpperCase()}</span>
        <span>
          <small>{t("project")}</small>
          <strong>{project.name}</strong>
        </span>
        <ChevronDown size={16} />
      </button>
      {dialogs.state.projectMenu && (
        <div className="project-menu">
          <div className="menu-label">{t("recentProjects")}</div>
          {files.recentFolders.map((item) => (
            <button key={`folder:${item.id}`} onClick={() => void files.workWithFolder("open", item.directory)}>
              <FolderOpen size={16} />
              <div>
                <strong>{item.name}</strong>
                <small>{item.directory.name}</small>
              </div>
            </button>
          ))}
          <div className="menu-label">{t("browserDynasties")}</div>
          {listProjects().map((item) => (
            <button
              key={item.id}
              className={item.id === project.id ? "active" : ""}
              onClick={() => files.switchProject(item.id)}
            >
              <span>{item.name.slice(0, 1)}</span>
              <div>
                <strong>{item.name}</strong>
                <small>{t("charactersCount", { count: item.characterCount })}</small>
              </div>
            </button>
          ))}
          <div className="menu-separator" />
          <button onClick={files.startNewProject}>
            <Plus size={16} /> {t("newProject")}
          </button>
          <button onClick={() => void files.workWithFolder("open")}>
            <FolderOpen size={16} /> {t("openDynastyFolder")}
          </button>
          {!app.folderName && (
            <button onClick={files.transferToFolder}>
              <FolderOpen size={16} /> {t("saveDynastyFolder")}
            </button>
          )}
          {app.folderName && (
            <button
              onClick={() =>
                void app.closeFolder().then((ok) => {
                  if (ok) dialogs.close("projectMenu");
                })
              }
            >
              {t("closeDynastyFolder")}
            </button>
          )}
          <button onClick={files.openImportPicker}>
            <Upload size={16} /> {t("import")}
          </button>
          <div className="menu-separator" />
          <button className="danger-text" disabled={app.loadError} onClick={onDeleteDynasty}>
            <Trash2 size={16} /> {t("deleteDynasty")}
          </button>
        </div>
      )}
    </div>
  );
}
