import { useState } from "react";
import {
  ArchiveRestore,
  BookOpenText,
  CircleHelp,
  GitBranch,
  HeartHandshake,
  Languages,
  LayoutDashboard,
  MessageCircleQuestion,
  Moon,
  Network,
  RefreshCw,
  Settings2,
  Sun,
} from "lucide-react";
import { supportedLocales, useI18n, type LocalePreference } from "../../i18n";
import type { Dialogs } from "../../hooks/useDialogs";
import type { Theme } from "../../types";

export function Sidebar({
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
  const { t, locale, preference, systemLocale, setPreference } = useI18n();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const currentLocale = supportedLocales.find((item) => item.code === locale)!;
  const detectedLocale = supportedLocales.find((item) => item.code === systemLocale)!;
  const utilityPanel = dialogs.state.utility;

  return (
    <aside className="rail">
      <button className="brand-mark" aria-label={t("appName")}>
        <GitBranch size={21} />
      </button>
      <nav>
        <button className={hasProject ? "active" : ""} disabled={!hasProject} title={t("tree")}>
          <Network size={19} />
        </button>
        <button title={t("characterList")} disabled={!hasProject} onClick={() => dialogs.open("characterList")}>
          <LayoutDashboard size={19} />
        </button>
        <button title={t("gameCatalogs")} aria-label={t("gameCatalogs")} onClick={() => dialogs.open("catalog")}>
          <BookOpenText size={19} />
        </button>
        <button title={t("trash")} disabled={!hasProject} onClick={() => dialogs.open("trash")}>
          <ArchiveRestore size={19} />
          <span className="rail-badge">{trashCount || ""}</span>
        </button>
      </nav>
      <div className="rail-middle" aria-label={t("helpSupport")}>
        <button
          className={utilityPanel === "guide" ? "active" : ""}
          title={t("guide")}
          aria-label={t("guide")}
          onClick={() => dialogs.open("utility", "guide")}
        >
          <BookOpenText size={19} />
        </button>
        <button
          className={utilityPanel === "updates" ? "active" : ""}
          title={t("checkUpdates")}
          aria-label={t("checkUpdates")}
          onClick={() => dialogs.open("utility", "updates")}
        >
          <RefreshCw size={19} />
        </button>
        <button
          className={utilityPanel === "donation" ? "active" : ""}
          title={t("donation")}
          aria-label={t("donation")}
          onClick={() => dialogs.open("utility", "donation")}
        >
          <HeartHandshake size={19} />
        </button>
      </div>
      <div className="rail-bottom">
        <div className="language-switcher">
          <button
            className={showLanguageMenu ? "active" : ""}
            title={t("language")}
            aria-label={`${t("language")}: ${currentLocale.label}`}
            onClick={() => setShowLanguageMenu((value) => !value)}
          >
            <Languages size={18} />
            <span>{currentLocale.short}</span>
          </button>
          {showLanguageMenu && (
            <div className="language-menu" role="menu" aria-label={t("language")}>
              <div className="language-menu-header">
                <strong>{t("language")}</strong>
                <button
                  type="button"
                  className="translation-request"
                  title={t("requestTranslation")}
                  aria-label={t("requestTranslation")}
                >
                  <MessageCircleQuestion size={14} />
                </button>
              </div>
              <button
                className={preference === "system" ? "active" : ""}
                onClick={() => {
                  setPreference("system");
                  setShowLanguageMenu(false);
                }}
              >
                <span>◉</span>
                <span>{t("systemLanguage", { language: detectedLocale.label })}</span>
              </button>
              {supportedLocales.map((item) => (
                <button
                  key={item.code}
                  className={preference === item.code ? "active" : ""}
                  onClick={() => {
                    setPreference(item.code as LocalePreference);
                    setShowLanguageMenu(false);
                  }}
                >
                  <span>{item.short}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button title={t("settings")} onClick={() => dialogs.open("settings")} disabled={loadError || !hasProject}>
          <Settings2 size={19} />
        </button>
        <button title={t("about")} onClick={() => dialogs.open("about")}>
          <CircleHelp size={19} />
        </button>
        <button title={t("changeTheme")} onClick={() => onTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <span className="privacy-dot" title={t("offline")} />
      </div>
    </aside>
  );
}
