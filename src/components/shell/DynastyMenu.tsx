import { ChevronDown, Download, FolderOpen, History, ImageDown, Plus, Trash2, Upload, X } from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { useI18n } from "../../i18n";
import type { Dialogs } from "../../hooks/useDialogs";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";
import type { ProjectApi } from "../../hooks/projectApi";
import { Popover } from "./Popover";

/** Dynasty name at the start of the top capsule and the menu that opens below it. */
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
  const open = Boolean(dialogs.state.projectMenu);
  const close = () => dialogs.close("projectMenu");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? dialogs.open("projectMenu") : close())}
      className="project-switcher"
      menuClassName="tb-dynasty-menu project-menu"
      label={t("project")}
      trigger={
        <button
          className={`tb-dyn-btn ${open ? "is-open" : ""}`}
          aria-label={`${t("project")}: ${project.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title={project.name}
          onClick={() => dialogs.toggle("projectMenu")}
        >
          <span className="tb-logo">
            <TreeIcon size={18} />
          </span>
          <strong className="tb-dyn-name">{project.name}</strong>
          <ChevronDown size={14} />
        </button>
      }
    >
      {!!files.recentFolders.length && <div className="tb-menu-label">{t("recentProjects")}</div>}
      {files.recentFolders.map((item) => (
        <button
          key={`folder:${item.id}`}
          className="tb-menu-item"
          onClick={() => void files.workWithFolder("open", item)}
        >
          <FolderOpen size={18} />
          <span>
            <strong>{item.name}</strong>
            <small>{item.folderName}</small>
          </span>
        </button>
      ))}
      {!!files.legacyProjects.length && <div className="tb-menu-label">{t("browserDynasties")}</div>}
      {files.legacyProjects.map((item) => (
        <button key={item.id} className="tb-menu-item" onClick={() => files.startTransfer(item.id)}>
          <TreeIcon size={18} />
          <span>
            <strong>{item.name}</strong>
            <small>{t("charactersCount", { count: item.characterCount })}</small>
          </span>
        </button>
      ))}
      <button className="tb-menu-item" onClick={() => void files.workWithFolder("open")}>
        <FolderOpen size={18} />
        <span>{t("openDynastyFolder")}</span>
      </button>
      <div className="tb-menu-sep" />
      <button className="tb-menu-item" onClick={files.startNewProject}>
        <Plus size={18} />
        <span>{t("newProject")}</span>
      </button>
      <button className="tb-menu-item" onClick={files.openImportPicker}>
        <Upload size={18} />
        <span>{t("import")}</span>
      </button>
      <button
        className="tb-menu-item"
        onClick={() => {
          close();
          files.exportProject();
        }}
      >
        <Download size={18} />
        <span>{t("exportProject")}</span>
      </button>
      <button
        className="tb-menu-item"
        onClick={() => {
          close();
          void files.exportPng();
        }}
      >
        <ImageDown size={18} />
        <span>{t("exportPng")}</span>
      </button>
      <button className="tb-menu-item" onClick={() => void files.showVersions()}>
        <History size={18} />
        <span>{t("dynastyVersions")}</span>
      </button>
      <button
        className="tb-menu-item"
        onClick={() =>
          void app.closeFolder().then((ok) => {
            if (ok) close();
          })
        }
      >
        <X size={18} />
        <span>{t("closeDynastyFolder")}</span>
      </button>
      <div className="tb-menu-sep" />
      <button className="tb-menu-item danger" onClick={onDeleteDynasty}>
        <Trash2 size={18} />
        <span>{t("deleteDynasty")}</span>
      </button>
    </Popover>
  );
}
