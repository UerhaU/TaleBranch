import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  Check,
  Database,
  FolderOpen,
  RefreshCw,
  Globe,
  Palette,
  Save,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { Modal } from "../Modal";
import { supportedLocales, useI18n } from "../../i18n";
import { TEXT_SIZE, THEMES, type AppearanceApi, type ThemeMode, type ThemeName } from "../../hooks/useAppearance";
import type { ProjectApi } from "../../hooks/projectApi";
import type { CustomStylesApi } from "../../hooks/useCustomStyles";
import type { TreeView } from "../../hooks/useTreeView";

const themeLabels: Record<ThemeName, string> = {
  default: "themeDefault",
  garden: "themeGarden",
  magic: "themeMagic",
  moon: "themeMoon",
  city: "themeCity",
  kingdom: "themeKingdom",
};

type Section = "look" | "language" | "tree" | "data" | "dynasty";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="tb-toggle wide">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
    </label>
  );
}

/** Dynasty name and description; deleting the dynasty is here too. */
function DynastySection({ app, onDeleteDynasty }: { app: ProjectApi; onDeleteDynasty: () => void }) {
  const { t } = useI18n();
  const [details, setDetails] = useState(() => ({ name: app.project.name, description: app.project.description }));
  const changed = details.name !== app.project.name || details.description !== app.project.description;
  return (
    <>
      <label className="field">
        <span>{t("projectName")}</span>
        <input value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} />
      </label>
      <label className="field">
        <span>{t("projectDescription")}</span>
        <textarea
          rows={4}
          value={details.description}
          onChange={(event) => setDetails({ ...details, description: event.target.value })}
        />
      </label>
      <div className="tb-row-actions">
        <button className="button danger-text ghost" disabled={app.loadError} onClick={onDeleteDynasty}>
          <Trash2 size={16} /> {t("deleteDynasty")}
        </button>
        <button
          className="button primary"
          disabled={!details.name.trim() || !changed || app.loadError}
          onClick={() =>
            app.commit((draft) => {
              Object.assign(draft, details, { name: details.name.trim() });
            })
          }
        >
          <Check size={16} /> {t("save")}
        </button>
      </div>
    </>
  );
}

/** The user's own CSS: files with switches in the desktop version, one field in the browser. */
function CustomStylesSection({ custom }: { custom: CustomStylesApi }) {
  const { t } = useI18n();
  return (
    <>
      <h3>{t("customStyles")}</h3>
      {custom.safe && (
        <div className="tb-row-card tb-safe-note" role="status">
          <span>
            <b>{t("customStylesOffTitle")}</b>
            <small>{t("customStylesOffHint")}</small>
          </span>
          <button className="button subtle" onClick={custom.restore}>
            {t("customStylesRestore")}
          </button>
        </div>
      )}
      {custom.desktop ? (
        <>
          <p className="tb-hint">{t("customStylesHint")}</p>
          {custom.snippets.map((snippet) => (
            <Toggle
              key={snippet.file}
              label={snippet.file.replace(/\.css$/i, "")}
              checked={custom.enabled.includes(snippet.file)}
              onChange={(on) => custom.toggle(snippet.file, on)}
            />
          ))}
          {!custom.snippets.length && <p className="tb-hint">{t("customStylesEmpty")}</p>}
          {custom.error && (
            <p className="tb-hint" role="alert">
              {t("customStylesError")}
            </p>
          )}
          <div className="tb-row-card">
            <FolderOpen size={18} />
            <span>
              <b>{t("customStylesFolder")}</b>
              <small className="tb-path">
                {custom.folder ? `${custom.folder}\\snippets · ${custom.folder}\\themes` : "TaleBranch-data"}
              </small>
            </span>
            <button className="button subtle" onClick={() => void custom.refresh()}>
              <RefreshCw size={16} /> {t("customStylesRefresh")}
            </button>
          </div>
        </>
      ) : (
        <label className="field">
          <span>{t("customCssLabel")}</span>
          <textarea
            className="tb-code"
            rows={6}
            spellCheck={false}
            placeholder=".tb-card { border-radius: 18px; }"
            value={custom.webCss}
            onChange={(event) => custom.setWebCss(event.target.value)}
          />
          <small className="tb-hint">{t("customCssHint")}</small>
        </label>
      )}
    </>
  );
}

/** Program settings; they work with or without an open dynasty. */
export function SettingsDialog({
  appearance,
  custom,
  app,
  view,
  onDeleteDynasty,
  onClose,
}: {
  appearance: AppearanceApi;
  custom: CustomStylesApi;
  app: ProjectApi;
  view: TreeView;
  onDeleteDynasty: () => void;
  onClose: () => void;
}) {
  const { t, preference, systemLocale, setPreference } = useI18n();
  const [section, setSection] = useState<Section>("look");
  const detectedLocale = supportedLocales.find((item) => item.code === systemLocale)!;
  const sections: Array<[Section, string, LucideIcon | typeof TreeIcon]> = [
    ["look", t("setLook"), Palette],
    ["language", t("language"), Globe],
    ["tree", t("setTree"), TreeIcon],
    ["data", t("setData"), Database],
    ...(app.hasProject ? ([["dynasty", t("setDynasty"), Save]] as Array<[Section, string, LucideIcon]>) : []),
  ];
  const modes: Array<[ThemeMode, string]> = [
    ["light", t("modeLight")],
    ["dark", t("modeDark")],
    ["system", t("modeSystem")],
  ];

  return (
    <Modal title={t("settings")} onClose={onClose} className="modal-settings">
      <div className="tb-settings">
        <nav aria-label={t("settings")}>
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`tb-nav-row ${section === id ? "active" : ""}`}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="tb-settings-body">
          {section === "look" && (
            <>
              <h3>{t("theme")}</h3>
              <div className="tb-theme-grid" role="group" aria-label={t("theme")}>
                {[
                  ...THEMES.map((name) => [name, t(themeLabels[name])] as const),
                  ...custom.themes
                    .filter((theme) => !(THEMES as readonly string[]).includes(theme.id))
                    .map((theme) => [theme.id, theme.name] as const),
                ].map(([name, label]) => (
                  <button
                    key={name}
                    className={`tb-theme-tile ${appearance.palette === name ? "active" : ""}`}
                    aria-pressed={appearance.palette === name}
                    data-theme={name}
                    data-mode={appearance.theme}
                    onClick={() => appearance.update({ palette: name })}
                  >
                    <span className="tb-theme-preview" aria-hidden="true">
                      <span className="pv-bar" />
                      <span className="pv-card">
                        <i />
                        <b />
                      </span>
                      <span className="pv-card two">
                        <i />
                        <b />
                      </span>
                      <span className="pv-btn" />
                    </span>
                    <span className="tb-theme-name" title={label}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
              <h3>{t("mode")}</h3>
              <div className="segmented" role="group" aria-label={t("mode")}>
                {modes.map(([mode, label]) => (
                  <button
                    key={mode}
                    className={appearance.mode === mode ? "active" : ""}
                    aria-pressed={appearance.mode === mode}
                    onClick={() => appearance.update({ mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Toggle
                label={t("fieldPattern")}
                hint={t("fieldPatternHint")}
                checked={appearance.pattern}
                onChange={(pattern) => appearance.update({ pattern })}
              />
              <h3>{t("textSize")}</h3>
              <div className="tb-range">
                <small aria-hidden="true">A</small>
                <input
                  type="range"
                  aria-label={t("textSize")}
                  min={TEXT_SIZE.min}
                  max={TEXT_SIZE.max}
                  step={TEXT_SIZE.step}
                  value={appearance.textSize}
                  onChange={(event) => appearance.update({ textSize: Number(event.target.value) })}
                />
                <b aria-hidden="true">A</b>
                <span>{appearance.textSize} %</span>
              </div>
              <Toggle
                label={t("lessMotion")}
                hint={t("lessMotionHint")}
                checked={appearance.lessMotion}
                onChange={(lessMotion) => appearance.update({ lessMotion })}
              />
              <CustomStylesSection custom={custom} />
            </>
          )}
          {section === "language" && (
            <>
              <p className="tb-hint">{t("langHint")}</p>
              <div className="tb-lang-list" role="group" aria-label={t("language")}>
                <button
                  className={`tb-lang ${preference === "system" ? "active" : ""}`}
                  aria-pressed={preference === "system"}
                  onClick={() => setPreference("system")}
                >
                  <span>{t("systemLanguage", { language: detectedLocale.label })}</span>
                  {preference === "system" && <Check size={16} />}
                </button>
                {supportedLocales.map((item) => (
                  <button
                    key={item.code}
                    lang={item.code}
                    className={`tb-lang ${preference === item.code ? "active" : ""}`}
                    aria-pressed={preference === item.code}
                    onClick={() => setPreference(item.code)}
                  >
                    <span>{item.label}</span>
                    {preference === item.code && <Check size={16} />}
                  </button>
                ))}
              </div>
            </>
          )}
          {section === "tree" && (
            <>
              <Toggle
                label={t("showMinimap")}
                checked={appearance.showMinimap}
                onChange={(showMinimap) => appearance.update({ showMinimap })}
              />
              <Toggle
                label={t("family")}
                checked={view.showParents}
                disabled={!app.hasProject}
                onChange={view.setShowParents}
              />
              <Toggle
                label={t("relations")}
                checked={view.showRelations}
                disabled={!app.hasProject}
                onChange={view.setShowRelations}
              />
            </>
          )}
          {section === "data" && (
            <>
              <h3>{t("dataWhere")}</h3>
              <p className="tb-hint">{t(isTauri() ? "dataHintDesktop" : "dataHintWeb")}</p>
              {app.folderName && (
                <div className="tb-row-card">
                  <TreeIcon size={18} />
                  <span>
                    <b>{app.project.name}</b>
                    <small>{app.folderName}</small>
                  </span>
                </div>
              )}
              <div className="tb-row-card">
                <ShieldCheck size={18} />
                <span>
                  <b>{t("offline")}</b>
                </span>
              </div>
            </>
          )}
          {section === "dynasty" && app.hasProject && (
            <DynastySection key={app.project.id} app={app} onDeleteDynasty={onDeleteDynasty} />
          )}
        </div>
      </div>
    </Modal>
  );
}
