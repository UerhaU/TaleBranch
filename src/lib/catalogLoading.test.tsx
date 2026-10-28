// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocaleCode } from "../i18n";

// The test setup loads the whole catalog; these tests start from fresh copies of the modules instead.
beforeEach(() => {
  vi.resetModules();
});
const fresh = async () => ({
  catalog: await import("./catalog"),
  texts: await import("./catalogLocalization"),
  hook: await import("../hooks/useCatalog"),
});

describe("загрузка справочника по требованию", () => {
  it("при запуске знает только возрасты, остальное приносит по запросу", async () => {
    const { catalog } = await fresh();
    expect(catalog.catalogEntriesLoaded()).toBe(false);
    expect(catalog.ageEntry({ type: "sim", species: "", lifeStage: "Взрослый" })?.id).toBe("human:adult");
    expect(catalog.gameCatalog.entries.traits).toEqual([]);
    expect(catalog.catalogEntry("traits", "trait_Genius")).toBeUndefined();

    const first = catalog.loadCatalogEntries();
    expect(catalog.loadCatalogEntries()).toBe(first);
    await first;
    expect(catalog.catalogEntriesLoaded()).toBe(true);
    expect(catalog.catalogEntry("traits", "trait_Genius")?.icon).toBeTruthy();
    expect(catalog.catalogEntry("skills", "statistic_Skill_Hidden_VampireLore")?.maxLevel).toBe(15);
    expect(catalog.gameCatalog.entries.ages.find((entry) => entry.id === "human:youngadult")?.label).toBe("Молодой");
  });

  it.each([
    ["en", "Genius"],
    ["de", "Genie"],
    ["fr", "Génies"],
    ["zh-CN", undefined],
    ["sr", undefined],
    ["koi", undefined],
  ] as [LocaleCode, string | undefined][])("загружает переводы только выбранного языка: %s", async (locale, label) => {
    const { catalog, texts } = await fresh();
    await catalog.loadCatalogEntries();
    expect(texts.catalogTextsLoaded(locale)).toBe(false);
    await texts.loadCatalogTexts(locale);
    expect(texts.catalogTextsLoaded(locale)).toBe(true);
    for (const other of ["ru", "en", "de", "fr", "es", "pt-BR", "zh-CN", "sr", "koi"] as LocaleCode[])
      if (other !== locale) expect(texts.catalogTextsLoaded(other), other).toBe(false);
    const genius = texts.catalogLabel("traits", "trait_Genius", locale)!;
    if (label) expect(genius).toBe(label);
    expect(genius).not.toBe(catalog.catalogEntry("traits", "trait_Genius")!.label);
    expect(texts.localizedPackLabel("EP04", locale)).not.toBe("EP04");
  });

  it("берёт английские названия пород, если в языке их нет", async () => {
    const { catalog, texts } = await fresh();
    await Promise.all([catalog.loadCatalogEntries(), texts.loadCatalogTexts("en"), texts.loadCatalogTexts("sr")]);
    const breed = catalog.gameCatalog.entries.breeds[0];
    expect(texts.localizedCatalogEntry("breeds", breed, "sr").label).toBe(
      texts.localizedCatalogEntry("breeds", breed, "en").label,
    );
  });

  it("показывает заглушку на месте черты, а после загрузки — её название на языке программы", async () => {
    localStorage.setItem("dynasty-chronicles:language", "de");
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const { hook } = await fresh();
    const { LanguageProvider } = await import("../i18n");
    const { CatalogValue } = await import("../components/CatalogDisplay");
    const { createCharacter } = await import("./project");
    const container = document.createElement("div");
    const root = createRoot(container);
    const character = createCharacter("Test");
    act(() =>
      root.render(
        <LanguageProvider>
          <CatalogValue kind="ages" value="Взрослый" character={character} />
          <CatalogValue kind="traits" id="trait_Genius" character={character} />
        </LanguageProvider>,
      ),
    );
    const [age] = container.querySelectorAll(".catalog-display");
    expect(age.getAttribute("aria-busy")).toBeNull();
    expect(age.textContent).toBe("Erwachsener");
    expect(container.querySelector("[aria-busy]")?.textContent).toBe("…");
    await act(() => hook.loadCatalog("de"));
    expect(container.querySelector("[aria-busy]")).toBeNull();
    expect(container.querySelectorAll(".catalog-display")[1].textContent).toBe("Genie");
    act(() => root.unmount());
    localStorage.clear();
  });
});
