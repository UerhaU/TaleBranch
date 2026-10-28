import { useState } from "react";
import { BookOpenText, CircleHelp, Cog, HeartHandshake, Info, Keyboard, RefreshCw, Trash2, Users } from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { useI18n } from "../../i18n";
import type { Dialogs, UtilityPanel } from "../../hooks/useDialogs";
import { Popover } from "./Popover";

/** Bottom dock: work sections on the left, settings and help on the right. */
export function Dock({
  hasProject,
  trashCount,
  dialogs,
}: {
  hasProject: boolean;
  trashCount: number;
  dialogs: Dialogs;
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<"help">();
  const { characterList, catalog, trash } = dialogs.state;
  const openMenu = (name: "help") => (open: boolean) => setMenu(open ? name : undefined);
  const utility = (panel: UtilityPanel) => {
    setMenu(undefined);
    dialogs.open("utility", panel);
  };

  return (
    <nav className="tb-island tb-dock" aria-label={t("appName")}>
      {hasProject && (
        <>
          <button
            className={`tb-nav-item ${characterList || catalog || trash ? "" : "active"}`}
            title={t("tree")}
            aria-current={characterList || catalog || trash ? undefined : "page"}
            onClick={() => dialogs.close("characterList", "catalog", "trash")}
          >
            <TreeIcon size={18} />
            <span className="tb-nav-label">{t("tree")}</span>
          </button>
          <button
            className={`tb-nav-item ${characterList ? "active" : ""}`}
            title={t("characterList")}
            onClick={() => dialogs.open("characterList")}
          >
            <Users size={18} />
            <span className="tb-nav-label">{t("navCharacters")}</span>
          </button>
        </>
      )}
      <button
        className={`tb-nav-item ${catalog ? "active" : ""}`}
        title={t("gameCatalogs")}
        onClick={() => dialogs.open("catalog")}
      >
        <BookOpenText size={18} />
        <span className="tb-nav-label">{t("navCatalogs")}</span>
      </button>
      {hasProject && (
        <button
          className={`tb-nav-item ${trash ? "active" : ""}`}
          title={t("trash")}
          onClick={() => dialogs.open("trash")}
        >
          <Trash2 size={18} />
          <span className="tb-nav-label">{t("trash")}</span>
          {!!trashCount && <span className="tb-count">{trashCount}</span>}
        </button>
      )}
      <span className="tb-sep" />
      <button
        className={`tb-icon-btn ${dialogs.state.settings ? "is-open" : ""}`}
        title={`${t("settings")} (Ctrl ,)`}
        aria-label={t("settings")}
        onClick={() => dialogs.open("settings")}
      >
        <Cog size={18} />
      </button>
      <Popover
        open={menu === "help"}
        onOpenChange={openMenu("help")}
        placement="up"
        menuClassName="tb-help-menu"
        label={t("help")}
        trigger={
          <button
            className={`tb-icon-btn ${menu === "help" ? "is-open" : ""}`}
            title={t("help")}
            aria-haspopup="menu"
            aria-expanded={menu === "help"}
            onClick={() => setMenu(menu === "help" ? undefined : "help")}
          >
            <CircleHelp size={18} />
          </button>
        }
      >
        <button className="tb-menu-item" onClick={() => utility("guide")}>
          <BookOpenText size={18} />
          <span>{t("guide")}</span>
        </button>
        <button
          className="tb-menu-item"
          onClick={() => {
            setMenu(undefined);
            dialogs.open("shortcuts");
          }}
        >
          <Keyboard size={18} />
          <span>{t("shortcuts")}</span>
        </button>
        <button className="tb-menu-item" onClick={() => utility("updates")}>
          <RefreshCw size={18} />
          <span>{t("checkUpdates")}</span>
        </button>
        <button className="tb-menu-item" onClick={() => utility("donation")}>
          <HeartHandshake size={18} />
          <span>{t("supportProject")}</span>
        </button>
        <div className="tb-menu-sep" />
        <button
          className="tb-menu-item"
          onClick={() => {
            setMenu(undefined);
            dialogs.open("about");
          }}
        >
          <Info size={18} />
          <span>{t("about")}</span>
        </button>
      </Popover>
    </nav>
  );
}
