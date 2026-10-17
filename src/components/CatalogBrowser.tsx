import { useState } from "react";
import { gameCatalog, catalogEntry, packLabel, type CatalogKind } from "../lib/catalog";
import { CatalogPicker, GameIcon } from "./CatalogPicker";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";

export const catalogTitles: Record<CatalogKind, string> = { traits: "traits", aspirations: "goal", breeds: "breed", skills: "skills", preferences: "preferences", careers: "career", occults: "occultType", deathCauses: "deathCause", ages: "lifeStages" };
export function CatalogBrowser({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<CatalogKind>("traits"), [selected, setSelected] = useState<string[]>([]);
  const entry = catalogEntry(kind, selected[0]);
  return <Modal title={t("gameCatalogs")} subtitle={t("gameCatalogsHint")} onClose={onClose} wide>
    <div className="modal-body catalog-browser">
      <label className="field"><span>{t("catalogType")}</span><select value={kind} onChange={event => { setKind(event.target.value as CatalogKind); setSelected([]); }}>{Object.entries(catalogTitles).map(([id,label]) => <option key={id} value={id}>{t(label)} · {gameCatalog.entries[id as CatalogKind].length}</option>)}</select></label>
      <CatalogPicker key={kind} label={t(catalogTitles[kind])} kind={kind} options={gameCatalog.entries[kind]} selected={selected} onChange={setSelected} alwaysOpen />
      {entry && <section className="catalog-entry-details"><h3><GameIcon entry={entry} />{entry.label}</h3><small>{packLabel(entry.pack)}{entry.maxLevel ? ` · ${t("levelLimit", { max: entry.maxLevel })}` : ""}</small><p className="preserve-lines">{entry.description}</p>{entry.careerDetails && <p className="preserve-lines">{entry.careerDetails}</p>}</section>}
    </div>
  </Modal>;
}
