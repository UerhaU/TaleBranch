import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, Sparkles, X } from "lucide-react";
import { catalogEntry, iconUrl, type CatalogEntry, type CatalogKind } from "../lib/catalog";
import { useI18n } from "../i18n";
import { catalogSearchText, localizedCatalogCategory, localizedCatalogEntry, localizedPackLabel } from "../lib/catalogLocalization";

export function GameIcon({ entry, className = "" }: { entry?: Pick<CatalogEntry, "icon">; className?: string }) {
  const source = iconUrl(entry?.icon);
  const [failedSource, setFailedSource] = useState<string>();
  return <span className={`game-icon ${className}`}>{source && source !== failedSource
    ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)} />
    : <Sparkles size={18} aria-hidden="true" />}</span>;
}

export function CatalogPicker({ label, kind, options, selected, onChange, multiple = false, customValues = [], onCustomValuesChange, customValue, onCustomChange, alwaysOpen = false }: {
  label: string;
  kind: CatalogKind;
  options: CatalogEntry[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  customValues?: string[];
  onCustomValuesChange?: (values: string[]) => void;
  customValue?: string;
  onCustomChange?: (value: string) => void;
  alwaysOpen?: boolean;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [pack, setPack] = useState("");
  const [category, setCategory] = useState(() => !alwaysOpen && kind === "traits" ? options.find(entry => ["personality", "infant", "toddler", "pet"].includes(entry.traitKind ?? ""))?.category ?? "" : "");
  const [limit, setLimit] = useState(40), [customOpen, setCustomOpen] = useState(false), [customText, setCustomText] = useState("");
  const active = open || alwaysOpen;
  const packs = useMemo(() => [...new Set(options.map(item => item.pack))].sort(), [options]);
  const categories = useMemo(() => [...new Set(options.map(item => item.category).filter(Boolean))].sort((a,b) => localizedCatalogCategory(a, locale).localeCompare(localizedCatalogCategory(b, locale), locale)), [options, locale]);
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ё", "е");
  const filtered = options.filter(item => (!packs.includes(pack) || !pack || item.pack === pack) && (!categories.includes(category) || !category || item.category === category)
    && (!search || catalogSearchText(kind, item, locale).includes(normalize(search))))
    .sort((a,b) => kind === "ages" ? (a.order ?? 0) - (b.order ?? 0) : localizedCatalogEntry(kind, a, locale).label.localeCompare(localizedCatalogEntry(kind, b, locale).label, locale));
  const eligible = new Set(options.map(item => item.id));
  const choose = (entry: CatalogEntry) => {
    onChange(multiple ? selected.includes(entry.id) ? selected.filter(id => id !== entry.id) : [...selected, entry.id] : [entry.id]);
    if (!multiple) { onCustomChange?.(""); setOpen(false); }
  };
  const addCustom = () => {
    const value = customText.trim();
    if (value && !customValues.includes(value)) onCustomValuesChange?.([...customValues, value]);
    setCustomText("");
  };
  return <div className="catalog-field">
    <span className="catalog-field-label" id={`${id}-label`}>{label}</span>
    {!!(selected.length || customValues.length || customValue) && <div className="catalog-chips">
      {selected.map(value => {
        const original = catalogEntry(kind, value);
        const entry = original && localizedCatalogEntry(kind, original, locale);
        return <span key={value} className={`catalog-chip ${eligible.has(value) || alwaysOpen ? "" : "catalog-chip-unavailable"}`} title={entry?.description}>
          <GameIcon entry={entry} /><span>{entry?.label ?? t("catalogUnknown")}</span>
          <button type="button" aria-label={`${t("removeValue")} ${entry?.label ?? t("catalogUnknown")}`} onClick={() => onChange(selected.filter(id => id !== value))}><X size={13} /></button>
        </span>;
      })}
      {customValues.map((value, index) => <span className="catalog-chip custom-chip" key={`${index}:${value}`}><span>{value}</span><button type="button" aria-label={`${t("removeValue")} ${value}`} onClick={() => onCustomValuesChange?.(customValues.filter((_, i) => index !== i))}><X size={13} /></button></span>)}
      {customValue && <span className="catalog-chip custom-chip"><span>{customValue}</span><button type="button" aria-label={`${t("removeValue")} ${customValue}`} onClick={() => onCustomChange?.("")}><X size={13} /></button></span>}
    </div>}
    {!alwaysOpen && <button type="button" className="catalog-trigger" aria-label={`${t("choose")} ${label}`} aria-expanded={active} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
      <Search size={16} /><span>{t("chooseFromCatalog")}</span><ChevronDown size={15} />
    </button>}
    {!alwaysOpen && selected.some(value => !eligible.has(value)) && <small className="catalog-hint">{t("catalogOutsideRules")}</small>}
    {active && <section id={`${id}-panel`} className="catalog-panel" data-escape-layer={alwaysOpen ? undefined : true} aria-labelledby={`${id}-label`} onKeyDown={event => {
      if (event.key === "Escape" && !alwaysOpen) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    }}>
      <div className="catalog-search"><Search size={15} /><input autoFocus={!alwaysOpen} aria-label={`${t("catalogSearch")} ${label}`} value={search} placeholder={t("catalogSearch")} onChange={event => { setSearch(event.target.value); setLimit(40); }} /></div>
      <div className="catalog-filters">
        <select aria-label={t("gamePack")} value={packs.includes(pack) ? pack : ""} onChange={event => { setPack(event.target.value); setLimit(40); }}><option value="">{t("allPacks")}</option>{packs.map(code => <option key={code} value={code}>{localizedPackLabel(code, locale)}</option>)}</select>
        {categories.length > 1 && <select aria-label={t("catalogCategory")} value={categories.includes(category) ? category : ""} onChange={event => { setCategory(event.target.value); setLimit(40); }}><option value="">{t("allCategories")}</option>{categories.map(category => <option key={category} value={category}>{localizedCatalogCategory(category, locale)}</option>)}</select>}
      </div>
      <div className="catalog-results">
        {filtered.slice(0, limit).map(entry => { const display = localizedCatalogEntry(kind, entry, locale); return <button type="button" className={`catalog-option ${selected.includes(entry.id) ? "selected" : ""}`} key={entry.id} onClick={() => choose(entry)} aria-pressed={selected.includes(entry.id)}>
          <GameIcon entry={entry} /><span><strong>{display.label}</strong><small>{[display.category, localizedPackLabel(entry.pack, locale)].filter(Boolean).join(" · ")}</small></span>{selected.includes(entry.id) && <Check size={17} />}
        </button>; })}
        {!filtered.length && <p className="catalog-hint">{t("catalogNoResults")}</p>}
      </div>
      <div className="catalog-panel-footer"><small>{t("catalogCount", { count: filtered.length })}</small>{filtered.length > limit && <button className="button subtle" onClick={() => setLimit(limit + 40)}>{t("showMoreValues")}</button>}{!alwaysOpen && <button className="button ghost" onClick={() => setOpen(false)}>{t("done")}</button>}</div>
    </section>}
    {(onCustomChange || onCustomValuesChange) && <>
      <button type="button" className="catalog-custom-toggle" onClick={() => setCustomOpen(!customOpen)}><Plus size={13} />{t("customCatalogValue")}</button>
      {customOpen && <div className="catalog-custom-input">
        <input aria-label={`${t("customCatalogValue")} ${label}`} placeholder={t("customCatalogValue")} value={multiple ? customText : customValue ?? ""}
          onChange={event => { if (multiple) setCustomText(event.target.value); else { onChange([]); onCustomChange?.(event.target.value); } }}
          onKeyDown={event => { if (multiple && event.key === "Enter") { event.preventDefault(); addCustom(); } }} />
        {multiple && <button type="button" className="button subtle" onClick={addCustom} disabled={!customText.trim()}>{t("addValue")}</button>}
      </div>}
    </>}
  </div>;
}
