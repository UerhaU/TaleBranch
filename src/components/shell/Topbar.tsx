import { useState, type RefObject } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Link2,
  LoaderCircle,
  PawPrint,
  Plus,
  Redo2,
  Undo2,
  UserRound,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";
import type { TreeView } from "../../hooks/useTreeView";
import type { Character } from "../../types";
import { DynastyMenu } from "./DynastyMenu";
import { Popover } from "./Popover";
import { SearchBox } from "./SearchBox";

/** Top capsule (dynasty, search, undo and redo, save state) and the «+ Add ▾» button beside it. */
export function Topbar({
  app,
  files,
  dialogs,
  view,
  searchInput,
  onPick,
  onDeleteDynasty,
}: {
  app: ProjectApi;
  files: DynastyFiles;
  dialogs: Dialogs;
  view: TreeView;
  searchInput: RefObject<HTMLInputElement | null>;
  onPick: (character: Character) => void;
  onDeleteDynasty: () => void;
}) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const statusText = { saved: t("saved"), saving: t("saving"), error: t("saveError") };
  const StatusIcon = { saved: Check, saving: LoaderCircle, error: AlertTriangle }[app.saveStatus];
  const add = (action: () => void) => {
    setAddOpen(false);
    action();
  };
  return (
    <div className="tb-top-row">
      <header className="tb-island tb-topbar">
        <DynastyMenu app={app} files={files} dialogs={dialogs} onDeleteDynasty={onDeleteDynasty} />
        <span className="tb-sep" />
        <SearchBox view={view} searchInput={searchInput} onPick={onPick} />
        <span className="tb-sep" />
        <button className="tb-icon-btn" disabled={!app.canUndo} onClick={app.undo} title={t("undo")}>
          <Undo2 size={18} />
        </button>
        <button className="tb-icon-btn" disabled={!app.canRedo} onClick={app.redo} title={t("redo")}>
          <Redo2 size={18} />
        </button>
        <span
          className={`tb-save-state save-state ${app.saveStatus}`}
          role="status"
          title={`${app.folderName ? `${app.folderName} / dynasty.json` : t("browserStorage")}\n${t("folderHint")}`}
        >
          <StatusIcon size={16} />
          <span>{statusText[app.saveStatus]}</span>
        </span>
      </header>
      <div className="tb-add">
        <Popover
          open={addOpen}
          onOpenChange={setAddOpen}
          align="end"
          menuClassName="tb-add-menu"
          label={t("addOptions")}
          trigger={
            <span className="tb-add-split">
              <button
                className="tb-add-main add-person"
                title={`${t("addCharacter")} (N)`}
                onClick={() => dialogs.open("addCharacter", { type: "sim" })}
              >
                <Plus size={18} strokeWidth={2.4} />
                <span>{t("add")}</span>
              </button>
              <button
                className="tb-add-more"
                title={t("addOptions")}
                aria-label={t("addOptions")}
                aria-haspopup="menu"
                aria-expanded={addOpen}
                onClick={() => setAddOpen((value) => !value)}
              >
                <ChevronDown size={16} />
              </button>
            </span>
          }
        >
          <button className="tb-menu-item" onClick={() => add(() => dialogs.open("addCharacter", { type: "sim" }))}>
            <UserRound size={18} />
            <span>{t("character")}</span>
            <kbd>N</kbd>
          </button>
          <button className="tb-menu-item" onClick={() => add(() => dialogs.open("addCharacter", { type: "pet" }))}>
            <PawPrint size={18} />
            <span>{t("pet")}</span>
          </button>
          <button
            className="tb-menu-item"
            disabled={app.project.characters.length < 1}
            onClick={() => add(() => dialogs.open("link", { kind: "parent" }))}
          >
            <Link2 size={18} />
            <span>{t("addConnection")}</span>
            <kbd>L</kbd>
          </button>
        </Popover>
      </div>
    </div>
  );
}
