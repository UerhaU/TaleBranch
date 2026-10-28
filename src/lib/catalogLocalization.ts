import { catalogEntry, gameCatalog, type CatalogEntry, type CatalogKind } from "./catalog";
import { translateMessage, translateSystemValue, type LocaleCode } from "../i18n";

interface Texts {
  label?: string;
  description?: string;
  careerDetails?: string;
}
interface Dictionary {
  entries: Record<string, Texts>;
  categories: Record<string, string>;
  packs: Record<string, string>;
}
/** Catalog translations of one language, made by the `catalog-chunks` plugin in vite.config.ts. */
export interface CatalogTexts {
  official: Dictionary | null;
  authored: { labels: Record<string, string>; categories: Record<string, string> } | null;
  englishBreeds: Record<string, string>;
  englishPacks: Record<string, string>;
}

// Each language is a separate file; only the chosen one is loaded.
const loaders: Record<LocaleCode, () => Promise<{ default: CatalogTexts }>> = {
  ru: () => import("virtual:catalog-texts/ru"),
  en: () => import("virtual:catalog-texts/en"),
  de: () => import("virtual:catalog-texts/de"),
  fr: () => import("virtual:catalog-texts/fr"),
  es: () => import("virtual:catalog-texts/es"),
  "pt-BR": () => import("virtual:catalog-texts/pt-BR"),
  "zh-CN": () => import("virtual:catalog-texts/zh-CN"),
  sr: () => import("virtual:catalog-texts/sr"),
  koi: () => import("virtual:catalog-texts/koi"),
};
const loaded = new Map<LocaleCode, CatalogTexts>();
const loading = new Map<LocaleCode, Promise<void>>();
export const catalogTextsLoaded = (locale: LocaleCode) => loaded.has(locale);
/** Brings in the catalog translations of one language once; later calls reuse the same loading. */
export function loadCatalogTexts(locale: LocaleCode): Promise<void> {
  let promise = loading.get(locale);
  if (!promise) {
    promise = loaders[locale]().then(
      ({ default: texts }) => {
        loaded.set(locale, texts);
      },
      (error: unknown) => {
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, promise);
  }
  return promise;
}
const official = (locale: LocaleCode) => loaded.get(locale)?.official;
const custom = (locale: LocaleCode) => loaded.get(locale)?.authored;

/** Language is a view preference. Stored IDs, rules and user-written text stay intact. */
export function localizedCatalogEntry(kind: CatalogKind, entry: CatalogEntry, locale: LocaleCode): CatalogEntry {
  if (kind === "ages") return { ...entry, label: translateSystemValue(locale, entry.label) };
  const key = `${kind}:${entry.id}`;
  const source = official(locale)?.entries[key];
  // International breed names keep the game's English spelling where the game
  // has no language pack. Do not manufacture an "official" breed translation.
  const label =
    source?.label ??
    custom(locale)?.labels[key] ??
    (kind === "breeds" ? loaded.get(locale)?.englishBreeds[key] : undefined);
  return {
    ...entry,
    label: label ?? entry.label,
    description: formatGameText(source?.description ?? (locale === "ru" ? entry.description : ""), locale),
    careerDetails: source?.careerDetails ?? (locale === "ru" ? entry.careerDetails : undefined),
    category: localizedCatalogCategory(entry.category, locale),
  };
}
function formatGameText(text: string, locale: LocaleCode): string {
  // Tuning strings refer to a particular in-game Sim. Catalog descriptions are
  // generic, so use the localized Sim noun instead of displaying raw game tokens.
  const pronouns: Record<string, string[]> = {
    ru: ["он", "его", "его", "себя"],
    en: ["he", "him", "his", "himself"],
    de: ["er", "ihn", "sein", "sich"],
    fr: ["il", "lui", "son", "lui-même"],
    es: ["él", "él", "su", "sí mismo"],
    "pt-BR": ["ele", "ele", "seu", "si mesmo"],
    "zh-CN": ["他", "他", "他的", "他自己"],
  };
  return text.replace(/\{\d+\.Sim([^}]+)\}/g, (_match, token: string) => {
    const p = pronouns[locale];
    if (token.startsWith("Pronoun")) {
      const index = token.includes("Subjective")
        ? 0
        : token.includes("Reflexive")
          ? 3
          : token.includes("Possessive")
            ? 2
            : 1;
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
  return official(locale)?.categories[category] ?? custom(locale)?.categories[category] ?? category;
}
export function localizedPackLabel(id: string, locale: LocaleCode): string {
  return (
    official(locale)?.packs[id] ??
    loaded.get(locale)?.englishPacks[id] ??
    gameCatalog.packs.find((pack) => pack.id === id)?.label ??
    id
  );
}
export function catalogSearchText(kind: CatalogKind, entry: CatalogEntry, locale: LocaleCode): string {
  const display = localizedCatalogEntry(kind, entry, locale);
  return [display.label, display.category, display.description, entry.label, entry.id]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .replaceAll("ё", "е");
}
