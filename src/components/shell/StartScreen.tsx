import type { CSSProperties } from "react";
import { FolderOpen, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { useI18n } from "../../i18n";
import { supportsDynastyFolders } from "../../lib/folderStorage";
import { listProjects } from "../../lib/storage";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";

const recentColors = ["blue", "violet", "rose", "amber", "teal", "sky", "coral", "plum"].map(
  (name) => `var(--tb-p-${name})`,
);

/** Shown while no dynasty is open. */
export function StartScreen({ files }: { files: DynastyFiles }) {
  const { t } = useI18n();
  const browserProjects = listProjects();
  const action = (Icon: typeof Sparkles, title: string, hint: string, onClick: () => void, primary = false) => (
    <button className={`tb-start-btn ${primary ? "primary" : ""}`} aria-label={title} title={hint} onClick={onClick}>
      <span className="tb-start-icon">
        <Icon size={20} />
      </span>
      <b>{title}</b>
      <small>{hint}</small>
    </button>
  );
  return (
    <>
      <div className="tb-island tb-start-top">
        <span className="tb-dyn-btn">
          <span className="tb-logo">
            <TreeIcon size={18} />
          </span>
          <span className="tb-dyn-name">{t("appName")}</span>
        </span>
      </div>
      <main className="tb-start dynasty-welcome">
        <section className="tb-island tb-start-card">
          <span className="tb-logo big">
            <TreeIcon size={32} />
          </span>
          <h1>{t("noDynastyTitle")}</h1>
          <p>{t("noDynastyHint")}</p>
          <div className="tb-start-actions">
            {action(Sparkles, t("newProject"), t("createDynastyHint"), files.startNewProject, true)}
            {action(FolderOpen, t("openDynastyFolder"), t("openDynastyHint"), () => void files.workWithFolder("open"))}
            {action(Upload, t("import"), t("importDynastyHint"), files.openImportPicker)}
          </div>
          <p className="tb-start-note">{t("folderHint")}</p>
          {!supportsDynastyFolders() && (
            <p className="tb-start-note" role="note">
              {t("folderUnsupported")}
            </p>
          )}
        </section>
        <section className="tb-island tb-recent-card">
          <h2>{t("recentProjects")}</h2>
          {!files.recentFolders.length && !browserProjects.length && (
            <p className="tb-recent-empty">{t("recentEmpty")}</p>
          )}
          {files.recentFolders.map((item, index) => (
            <button
              className="tb-recent"
              key={item.id}
              onClick={() => void files.workWithFolder("open", item.directory)}
            >
              <span className="tb-recent-icon" style={{ "--pc": recentColors[index % 8] } as CSSProperties}>
                <TreeIcon size={20} />
              </span>
              <span className="tb-recent-text">
                <span className="tb-recent-name">{item.name}</span>
                <small>{item.directory.name}</small>
              </span>
            </button>
          ))}
          {!!browserProjects.length && <h3>{t("browserDynasties")}</h3>}
          {browserProjects.map((item, index) => (
            <button className="tb-recent" key={item.id} onClick={() => void files.switchProject(item.id)}>
              <span className="tb-recent-icon" style={{ "--pc": recentColors[(index + 3) % 8] } as CSSProperties}>
                <TreeIcon size={20} />
              </span>
              <span className="tb-recent-text">
                <span className="tb-recent-name">{item.name}</span>
                <small>{t("charactersCount", { count: item.characterCount })}</small>
              </span>
            </button>
          ))}
        </section>
        <p className="tb-offline">
          <ShieldCheck size={18} />
          {t("offline")}
        </p>
      </main>
    </>
  );
}
