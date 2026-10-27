import { useState } from "react";
import {
  BookOpenText,
  CircleHelp,
  Cog,
  HeartHandshake,
  Info,
  MessageCircleQuestion,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { supportedLocales, useI18n, type LocalePreference } from "../../i18n";
import type { Dialogs, UtilityPanel } from "../../hooks/useDialogs";
import type { Theme } from "../../types";
import { Popover } from "./Popover";

/** Bottom dock: work sections on the left, settings and help on the right. */
export function Dock({
  hasProject,
  loadError,
  trashCount,
  dialogs,
  theme,
  onTheme,
}: {
  hasProject: boolean;
  loadError: boolean;
  trashCount: number;
  dialogs: Dialogs;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const { t, preference, systemLocale, setPreference } = useI18n();
  const [menu, setMenu] = useState<"settings" | "help">();
  const detectedLocale = supportedLocales.find((item) => item.code === systemLocale)!;
  const { characterList, catalog, trash } = dialogs.state;
  const openMenu = (name: "settings" | "help") => (open: boolean) => setMenu(open ? name : undefined);
  const utility = (panel: UtilityPanel) => {
    setMenu(undefined);
    dialogs.open("utility", panel);
  };
  const language = (value: LocalePreference) => {
    setPreference(value);
    setMenu(undefined);
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
      <Popover
        open={menu === "settings"}
        onOpenChange={openMenu("settings")}
        placement="up"
        menuClassName="tb-settings-menu"
        label={t("settings")}
        trigger={
          <button
            className={`tb-icon-btn ${menu === "settings" ? "is-open" : ""}`}
            title={t("settings")}
            aria-haspopup="menu"
            aria-expanded={menu === "settings"}
            onClick={() => setMenu(menu === "settings" ? undefined : "settings")}
          >
            <Cog size={18} />
          </button>
        }
      >
        <button
          className="tb-menu-item"
          disabled={loadError || !hasProject}
          onClick={() => {
            setMenu(undefined);
            dialogs.open("settings");
          }}
        >
          <SlidersHorizontal size={18} />
          <span>{t("projectSettings")}</span>
        </button>
        <label className="tb-toggle">
          <span>{t("darkMode")}</span>
          <input
            type="checkbox"
            checked={theme === "dark"}
            onChange={(event) => onTheme(event.target.checked ? "dark" : "light")}
          />
          <i />
        </label>
        <div className="tb-menu-sep" />
        <div className="tb-menu-label">
          <span>{t("language")}</span>
          <button
            type="button"
            className="tb-icon-btn translation-request"
            title={t("requestTranslation")}
            aria-label={t("requestTranslation")}
          >
            <MessageCircleQuestion size={15} />
          </button>
        </div>
        <div className="tb-language-list" role="group" aria-label={t("language")}>
          <button
            className={`tb-menu-item ${preference === "system" ? "active" : ""}`}
            aria-pressed={preference === "system"}
            onClick={() => language("system")}
          >
            <span>{t("systemLanguage", { language: detectedLocale.label })}</span>
          </button>
          {supportedLocales.map((item) => (
            <button
              key={item.code}
              lang={item.code}
              className={`tb-menu-item ${preference === item.code ? "active" : ""}`}
              aria-pressed={preference === item.code}
              onClick={() => language(item.code)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </Popover>
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
