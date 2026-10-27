import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { extraMessages } from "./extra";
import { en } from "./messages/en";
import { de } from "./messages/de";
import { fr } from "./messages/fr";
import { es } from "./messages/es";
import { ptBR } from "./messages/pt-BR";
import { zhCN } from "./messages/zh-CN";
import { sr } from "./messages/sr";
import { koi } from "./messages/koi";
import { ruFallback } from "./messages/ru";
import { readPreference, writePreference } from "../lib/preferences";

export type LocaleCode = "ru" | "en" | "de" | "fr" | "es" | "pt-BR" | "zh-CN" | "sr" | "koi";
export type LocalePreference = "system" | LocaleCode;

export const supportedLocales: Array<{ code: LocaleCode; label: string; short: string }> = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "es", label: "Español", short: "ES" },
  { code: "pt-BR", label: "Português (Brasil)", short: "PT" },
  { code: "zh-CN", label: "简体中文", short: "中文" },
  { code: "sr", label: "Српски", short: "SR" },
  { code: "koi", label: "Коми-пермяцкӧй", short: "КП" },
];

const translations: Record<LocaleCode, Record<string, string>> = {
  ru: {},
  en,
  de,
  fr,
  es,
  "pt-BR": ptBR,
  "zh-CN": zhCN,
  sr,
  koi,
};

const knownValueKeys: Record<string, string> = {
  Кошка: "speciesCat",
  Кот: "speciesCat",
  Собака: "speciesDog",
  Пёс: "speciesDog",
  Лошадь: "speciesHorse",
  Конь: "speciesHorse",
  Котёнок: "stageKitten",
  Щенок: "stagePuppy",
  Жеребёнок: "stageFoal",
  Новорождённый: "stageNewborn",
  Младенец: "stageInfant",
  Малыш: "stageToddler",
  Подросток: "stageTeen",
  Молодой: "stageYoungAdult",
  "Молодой взрослый": "stageYoungAdult",
  Взрослый: "stageAdult",
  Пожилой: "stageElder",
  Детёныш: "stageYoungPet",
  Начало: "stageBeginning",
  Расцвет: "stagePrime",
  "Поздний этап": "stageLate",
  Биологическое: "biological",
  Усыновление: "adoption",
  Опека: "guardianship",
  "Приёмная семья": "fosterFamily",
  "Отчим / мачеха": "stepparent",
  Донор: "donor",
  Создатель: "creator",
  Неизвестно: "unknown",
  Супруги: "spouses",
  Помолвлены: "engaged",
  Встречаются: "dating",
  Влюблены: "inLove",
  Любовники: "lovers",
  "Тайный роман": "secretRomance",
  "Обещаны друг другу": "promised",
  "Лучшие друзья": "bestFriends",
  Неприязнь: "dislike",
  Враги: "enemies",
  Разведены: "divorced",
  Родитель: "parent",
  Ребёнок: "child",
  Питомец: "pet",
  Сим: "sim",
};

function resolveSystemLocale(): LocaleCode {
  const requested =
    typeof navigator === "undefined"
      ? ["en"]
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const raw of requested) {
    const normalized = raw.toLowerCase();
    if (normalized.startsWith("ru")) return "ru";
    if (normalized.startsWith("de")) return "de";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("sr")) return "sr";
    if (normalized.startsWith("koi")) return "koi";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

function interpolate(value: string, variables?: Record<string, string | number>) {
  if (!variables) return value;
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(variables[key] ?? `{${key}}`));
}

type I18nContextValue = {
  locale: LocaleCode;
  preference: LocalePreference;
  systemLocale: LocaleCode;
  setPreference: (value: LocalePreference) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
  valueLabel: (value: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const storageKey = "dynasty-chronicles:language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [systemLocale, setSystemLocale] = useState(resolveSystemLocale);
  const [preference, setPreferenceState] = useState<LocalePreference>(() => {
    const saved = readPreference(storageKey);
    return saved === "system" || supportedLocales.some((item) => item.code === saved)
      ? (saved as LocalePreference)
      : "system";
  });
  const locale = preference === "system" ? systemLocale : preference;

  useEffect(() => {
    const refresh = () => setSystemLocale(resolveSystemLocale());
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, []);

  useEffect(() => {
    writePreference(storageKey, preference);
    document.documentElement.lang = locale;
    document.title = (locale === "ru" ? ruFallback : translations[locale]).appName;
  }, [locale, preference]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, variables?: Record<string, string | number>) => {
      return translateMessage(locale, key, variables);
    };
    return {
      locale,
      preference,
      systemLocale,
      setPreference: (next) => setPreferenceState(next),
      t,
      valueLabel: (raw) => translateSystemValue(locale, raw),
    };
  }, [locale, preference, systemLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside LanguageProvider");
  return context;
}

export function getMissingTranslationKeys(locale: LocaleCode): string[] {
  const dictionary = locale === "ru" ? ruFallback : translations[locale];
  return getTranslationKeys().filter(
    (key) => extraMessages[locale]?.[key] === undefined && dictionary[key] === undefined,
  );
}

export function getTranslationKeys(): string[] {
  return [...new Set([...Object.keys(en), ...Object.keys(extraMessages.en)])];
}

export function translateMessage(locale: LocaleCode, key: string, variables?: Record<string, string | number>): string {
  const dictionary = locale === "ru" ? ruFallback : translations[locale];
  const fallbackLocale = locale === "koi" ? "ru" : "en";
  // A locale's own translation always wins over a fallback language.
  const translated =
    extraMessages[locale]?.[key] ??
    dictionary[key] ??
    extraMessages[fallbackLocale][key] ??
    (locale === "koi" ? ruFallback[key] : en[key]) ??
    key;
  return interpolate(translated.normalize("NFC"), variables);
}

export function translateSystemValue(locale: LocaleCode, raw: string): string {
  return knownValueKeys[raw] ? translateMessage(locale, knownValueKeys[raw]) : raw;
}
