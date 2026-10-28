import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Database, Globe, Palette, Save, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";
import { TreeIcon } from "../TreeIcon";
import { Modal } from "../Modal";
import { supportedLocales, useI18n } from "../../i18n";
import { TEXT_SIZE, type AppearanceApi, type ThemeMode } from "../../hooks/useAppearance";
import type { ProjectApi } from "../../hooks/projectApi";
import type { TreeView } from "../../hooks/useTreeView";

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

/** Program settings; they work with or without an open dynasty. */
export function SettingsDialog({
  appearance,
  app,
  view,
  onDeleteDynasty,
  onClose,
}: {
  appearance: AppearanceApi;
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
              <div className="tb-theme-grid">
                <button className="tb-theme-tile active" aria-pressed="true">
                  <span className="tb-theme-preview" data-mode={appearance.theme}>
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
                  <span className="tb-theme-name">{t("themeDefault")}</span>
                </button>
              </div>
              <p className="tb-hint">{t("themesLater")}</p>
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
