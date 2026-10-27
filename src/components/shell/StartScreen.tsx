import { FolderOpen, GitBranch, Plus, Upload } from "lucide-react";
import { useI18n } from "../../i18n";
import { supportsDynastyFolders } from "../../lib/folderStorage";
import { listProjects } from "../../lib/storage";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";

/** Shown while no dynasty is open. */
export function StartScreen({ files }: { files: DynastyFiles }) {
  const { t } = useI18n();
  return (
    <section className="dynasty-welcome">
      <GitBranch size={36} />
      <h1>{t("noDynastyTitle")}</h1>
      <p>{t("noDynastyHint")}</p>
      <p>{t("folderHint")}</p>
      <div className="dynasty-welcome-actions">
        <button className="button primary" onClick={files.startNewProject}>
          <Plus size={16} /> {t("newProject")}
        </button>
        <button className="button subtle" onClick={() => void files.workWithFolder("open")}>
          <FolderOpen size={16} /> {t("openDynastyFolder")}
        </button>
        <button className="button subtle" onClick={files.openImportPicker}>
          <Upload size={16} /> {t("import")}
        </button>
      </div>
      {!supportsDynastyFolders() && <p role="note">{t("folderUnsupported")}</p>}
      {!!files.recentFolders.length && (
        <div className="folder-recents">
          <h2>{t("recentProjects")}</h2>
          {files.recentFolders.map((item) => (
            <button
              className="button subtle"
              key={item.id}
              onClick={() => void files.workWithFolder("open", item.directory)}
            >
              <FolderOpen size={16} /> {item.name} · {item.directory.name}
            </button>
          ))}
        </div>
      )}
      {!!listProjects().length && (
        <div className="folder-recents">
          <h2>{t("browserDynasties")}</h2>
          {listProjects().map((item) => (
            <button className="button subtle" key={item.id} onClick={() => void files.switchProject(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
