import { useEffect, useReducer } from "react";
import type { LocaleCode } from "../i18n";
import { catalogEntriesLoaded, loadCatalogEntries } from "../lib/catalog";
import { catalogTextsLoaded, loadCatalogTexts } from "../lib/catalogLocalization";

export const catalogReady = (locale: LocaleCode) => catalogEntriesLoaded() && catalogTextsLoaded(locale);

/** Loads both catalog parts at once; the same loading is shared by everyone who asks. */
export function loadCatalog(locale: LocaleCode): Promise<void> {
  return Promise.all([loadCatalogEntries(), loadCatalogTexts(locale)]).then(() => undefined);
}

/**
 * Loads the game catalog and its translations for `locale` the first time a screen needs them
 * and tells whether they are ready. Ages for cards on the field do not need it.
 */
export function useCatalog(locale: LocaleCode, enabled = true): boolean {
  const ready = enabled && catalogReady(locale);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (!enabled || ready) return;
    let active = true;
    loadCatalog(locale).then(
      () => active && refresh(),
      (error: unknown) => console.error("Game catalog failed to load", error),
    );
    return () => {
      active = false;
    };
  }, [enabled, ready, locale]);
  return ready;
}

/** Like `useCatalog`, but stays ready after the first load, so a language switch does not hide an open form. */
export function useCatalogOnce(locale: LocaleCode): boolean {
  const ready = useCatalog(locale);
  const [opened, setOpened] = useReducer(() => true, false);
  useEffect(() => {
    if (ready) setOpened();
  }, [ready]);
  return ready || opened;
}
