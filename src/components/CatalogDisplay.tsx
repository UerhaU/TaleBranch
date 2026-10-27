import type { Character } from "../types";
import { catalogEntry, entryForLegacy, type CatalogKind } from "../lib/catalog";
import { GameIcon } from "./CatalogPicker";
import { useI18n } from "../i18n";
import { localizedCatalogEntry } from "../lib/catalogLocalization";

export function CatalogValue({
  kind,
  id,
  value,
  character,
  suffix,
}: {
  kind: CatalogKind;
  id?: string;
  value?: string;
  character: Character;
  suffix?: string;
}) {
  const { t, locale } = useI18n();
  const original = catalogEntry(kind, id) ?? (value ? entryForLegacy(kind, value, character) : undefined);
  const entry = original && localizedCatalogEntry(kind, original, locale);
  return (
    <span className="catalog-display">
      <GameIcon entry={entry} />
      <span>
        {entry?.label ?? value ?? t("catalogUnknown")}
        {suffix ? ` · ${suffix}` : ""}
      </span>
    </span>
  );
}

export function CatalogValues({
  kind,
  ids = [],
  legacy = [],
  character,
  suffixes = {},
}: {
  kind: CatalogKind;
  ids?: string[];
  legacy?: string[];
  character: Character;
  suffixes?: Record<string, string>;
}) {
  const { t } = useI18n();
  const represented = new Set(ids.map((id) => catalogEntry(kind, id)?.label));
  const custom = legacy.filter((value) => !represented.has(value));
  return (
    <div className="large-chips catalog-display-list">
      {ids.map((id) => (
        <span key={id}>
          <CatalogValue kind={kind} id={id} character={character} suffix={suffixes[id]} />
        </span>
      ))}
      {custom.map((value, index) => (
        <span key={`custom:${index}`}>
          <CatalogValue kind={kind} value={value} character={character} />
        </span>
      ))}
      {!ids.length && !custom.length && <p className="empty-inline">{t("notFilled")}</p>}
    </div>
  );
}
