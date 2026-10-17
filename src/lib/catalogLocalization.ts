import translations from "../data/catalog-locales.json";
import authored from "../data/catalog-authored.json";
import { catalogEntry, gameCatalog, type CatalogEntry, type CatalogKind } from "./catalog";
import { translateMessage, translateSystemValue, type LocaleCode } from "../i18n";

interface Texts { label?: string; description?: string; careerDetails?: string }
interface Dictionary { entries: Record<string, Texts>; categories: Record<string, string>; packs: Record<string, string> }
const official = translations as Record<string, Dictionary>;
const custom = authored as Record<string, { labels: Record<string,string>; categories: Record<string,string> }>;

/** Language is a view preference. Stored IDs, rules and user-written text stay intact. */
export function localizedCatalogEntry(kind: CatalogKind, entry: CatalogEntry, locale: LocaleCode): CatalogEntry {
  if (kind === "ages") return { ...entry, label: translateSystemValue(locale, entry.label) };
  const key = `${kind}:${entry.id}`;
  const source = official[locale]?.entries[key];
  // International breed names keep the game's English spelling where the game
  // has no language pack. Do not manufacture an "official" breed translation.
  const label = source?.label ?? custom[locale]?.labels[key] ?? (kind === "breeds" ? official.en.entries[key]?.label : undefined);
  return {
    ...entry, label: label ?? entry.label,
    description: formatGameText(source?.description ?? (locale === "ru" ? entry.description : ""), locale),
    careerDetails: source?.careerDetails ?? (locale === "ru" ? entry.careerDetails : undefined),
    category: localizedCatalogCategory(entry.category, locale),
  };
}
function formatGameText(text: string, locale: LocaleCode): string {
  // Tuning strings refer to a particular in-game Sim. Catalog descriptions are
  // generic, so use the localized Sim noun instead of displaying raw game tokens.
  const pronouns: Record<string, string[]> = {
    ru:["он","его","его","себя"], en:["he","him","his","himself"], de:["er","ihn","sein","sich"],
    fr:["il","lui","son","lui-même"], es:["él","él","su","sí mismo"], "pt-BR":["ele","ele","seu","si mesmo"],
    "zh-CN":["他","他","他的","他自己"],
  };
  return text.replace(/\{\d+\.Sim([^}]+)\}/g, (_match, token: string) => {
    const p = pronouns[locale];
    if (token.startsWith("Pronoun")) {
      const index = token.includes("Subjective") ? 0 : token.includes("Reflexive") ? 3 : token.includes("Possessive") ? 2 : 1;
      const value = p?.[index] ?? translateMessage(locale, "sim");
      return token.includes("Upper") ? value[0].toLocaleUpperCase(locale) + value.slice(1) : value;
    }
    return translateMessage(locale, "sim");
  });
}
export function catalogLabel(kind: CatalogKind, id: string, locale: LocaleCode): string | undefined {
  const entry = catalogEntry(kind, id);
  return entry && localizedCatalogEntry(kind, entry, locale).label;
}
export function localizedCatalogCategory(category: string, locale: LocaleCode): string {
  return official[locale]?.categories[category] ?? custom[locale]?.categories[category] ?? category;
}
export function localizedPackLabel(id: string, locale: LocaleCode): string {
  return official[locale]?.packs[id] ?? official.en?.packs[id] ?? gameCatalog.packs.find(pack => pack.id === id)?.label ?? id;
}
export function catalogSearchText(kind: CatalogKind, entry: CatalogEntry, locale: LocaleCode): string {
  const display = localizedCatalogEntry(kind, entry, locale);
  return [display.label, display.category, display.description, entry.label, entry.id].join(" ").normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ё", "е");
}
