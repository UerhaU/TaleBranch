import { Download, ImageDown, Network, Redo2, Undo2, UserPlus } from "lucide-react";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";
import type { Theme } from "../../types";
import { DynastyMenu } from "./DynastyMenu";

export function Topbar({
  app,
  files,
  dialogs,
  theme,
  onAutoLayout,
  onDeleteDynasty,
}: {
  app: ProjectApi;
  files: DynastyFiles;
  dialogs: Dialogs;
  theme: Theme;
  onAutoLayout: () => void;
  onDeleteDynasty: () => void;
}) {
  const { t } = useI18n();
  const statusText = { saved: t("saved"), saving: t("saving"), error: t("saveError") };
  return (
    <header className="topbar">
      <DynastyMenu app={app} files={files} dialogs={dialogs} onDeleteDynasty={onDeleteDynasty} />
      <div className={`save-state ${app.saveStatus}`}>
        <i /> <span>{statusText[app.saveStatus]}</span>
        <small title={t("folderHint")}>
          {app.folderName ? `${app.folderName} / dynasty.json` : t("browserStorage")}
        </small>
      </div>
      <div className="top-actions">
        <button disabled={!app.canUndo} onClick={app.undo} title={t("undo")}>
          <Undo2 size={17} />
        </button>
        <button disabled={!app.canRedo} onClick={app.redo} title={t("redo")}>
          <Redo2 size={17} />
        </button>
        <span className="toolbar-separator" />
        <button onClick={onAutoLayout} disabled={app.loadError}>
          <Network size={16} /> <span>{t("autoLayout")}</span>
        </button>
        <button onClick={files.exportProject} title={t("exportProject")} disabled={app.loadError}>
          <Download size={17} />
        </button>
        <button onClick={() => files.exportPng(theme)} title={t("exportPng")}>
          <ImageDown size={17} />
        </button>
        <button
          className="button primary add-person"
          disabled={app.loadError}
          onClick={() => dialogs.open("addCharacter")}
        >
          <UserPlus size={17} /> {t("character")}
        </button>
      </div>
    </header>
  );
}
