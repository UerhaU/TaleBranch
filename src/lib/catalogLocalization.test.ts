import { describe, expect, it } from "vitest";
import { supportedLocales } from "../i18n";
import official from "../data/catalog-locales.json";
import authored from "../data/catalog-authored.json";
import { catalogEntry, gameCatalog, type CatalogKind } from "./catalog";
import { catalogLabel, catalogSearchText, localizedCatalogCategory, localizedCatalogEntry, localizedPackLabel } from "./catalogLocalization";

const requested: CatalogKind[] = ["traits","aspirations","occults","deathCauses","skills","preferences","careers"];
describe("game catalog localization", () => {
  it("uses actual game strings rather than translating the Russian trait name", () => {
    expect(catalogLabel("traits", "trait_Genius", "en")).toBe("Genius");
    expect(catalogLabel("traits", "trait_Genius", "de")).toBe("Genie");
    expect(catalogLabel("traits", "trait_Genius", "fr")).toBe("Génies");
    expect(catalogLabel("traits", "trait_Mean", "en")).toBe("Mean");
    expect(catalogLabel("skills", "statistic_Skill_AdultMajor_Programming", "fr")).toBe("Programmation");
    expect(catalogLabel("preferences", "preferenceItem_Fashion_Hipster", "fr")).toBe("Style Hipster");
  });
  it.each(supportedLocales)("has names for all requested lists in $label without silent Russian fallback", ({code}) => {
    for (const kind of requested) for (const entry of gameCatalog.entries[kind]) {
      const key = `${kind}:${entry.id}`;
      const native = (official as Record<string, {entries:Record<string,{label?:string}>}>)[code]?.entries[key]?.label;
      const custom = (authored as Record<string, {labels:Record<string,string>}>)[code]?.labels[key];
      if (code !== "ru") expect(native || custom, key).toBeTruthy();
      const display = localizedCatalogEntry(kind,entry,code);
      expect(display.label.trim(),key).not.toBe("");
      expect(display.id).toBe(entry.id); expect(display.icon).toBe(entry.icon);
      expect(display.availability).toBe(entry.availability); expect(display.species).toBe(entry.species);
      if (native) expect(display.label).toBe(native);
    }
  });
  it.each(supportedLocales)("localizes filters without replacing their canonical values ($code)", ({code}) => {
    for (const category of new Set(Object.values(gameCatalog.entries).flat().map(entry=>entry.category).filter(Boolean))) {
      if (code !== "ru") {
        const original = (official as Record<string,{categories:Record<string,string>}>)[code]?.categories[category];
        const custom = (authored as Record<string,{categories:Record<string,string>}>)[code]?.categories[category];
        expect(original || custom, `${code}: ${category}`).toBeTruthy();
      }
      expect(localizedCatalogCategory(category,code).trim()).not.toBe("");
    }
  });
  it("searches displayed names, original labels and IDs and translates expansion names", () => {
    const entry = catalogEntry("traits", "trait_Genius")!;
    const search = catalogSearchText("traits",entry,"fr");
    expect(search).toContain("génies"); expect(search).toContain("гений"); expect(search).toContain("trait_genius");
    expect(localizedPackLabel("EP04","en")).toContain("Cats");
    expect(localizedPackLabel("EP04","fr")).toContain("Chiens");
    expect(localizedPackLabel("MOD_UNKNOWN","en")).toBe("MOD_UNKNOWN");
  });
  it("renders game descriptions and careers without raw Sim name/pronoun tokens", () => {
    for (const kind of requested) for (const entry of gameCatalog.entries[kind]) {
      const display = localizedCatalogEntry(kind,entry,"en");
      expect(display.description).not.toMatch(/\{\d+\.Sim/);
      expect(display.label).not.toMatch(/\{(?:M|F|T|DAE)\d+\./);
    }
    expect(localizedCatalogEntry("careers",gameCatalog.entries.careers[0],"en").careerDetails).toContain("→");
    const breedWithoutDescription = gameCatalog.entries.breeds.find(entry=>!entry.description)!;
    expect(localizedCatalogEntry("breeds",breedWithoutDescription,"en").description).toBe("");
  });
});
