import { describe, expect, it, vi } from "vitest";
import { emptyCharacterCatalog, prepareCatalogDraft } from "./catalog";
import { storeLegacyProject } from "./dynastyStore.testSupport";
import { loadLegacyProject } from "./legacyStorage";
import { createCharacter, createEmptyProject } from "./project";
import { importProject, readProjectDocument, serializeProject } from "./storage";
import { parseProject } from "./validation";

const legacyKeys = ["aspiration", "traits", "preferences", "skills", "occultType", "deathCause"];

/** A dynasty written before stage 14: the user's own values sit in top-level fields. */
function legacyProject(patch: Record<string, unknown> = {}, catalog?: Record<string, unknown>) {
  const project = createEmptyProject("Старая династия");
  const { catalog: _, ...character } = createCharacter("Анна Старая", "sim", { id: "char_anna" });
  project.characters.push({
    ...character,
    aspiration: "Моя цель",
    traits: ["Своя черта", "Гений"],
    preferences: ["Любит дождь"],
    skills: ["Вязание крючком"],
    occultType: "Полуфея, полуэльф",
    deathCause: "От смеха",
    ...(catalog ? { catalog } : {}),
    ...patch,
  } as never);
  return JSON.parse(JSON.stringify(project));
}

const oldDocument = (project: unknown) =>
  JSON.stringify({ app: "dynasty-chronicles", formatVersion: 1, project }, null, 2);

describe("старые поля персонажа (этап 14)", () => {
  it("переносит всё из старого файла в новые поля", () => {
    const catalog = parseProject(legacyProject()).characters[0].catalog;
    expect(catalog).toEqual({
      ...emptyCharacterCatalog(),
      customTraits: ["Своя черта", "Гений"],
      customAspiration: "Моя цель",
      customOccults: ["Полуфея, полуэльф"],
      customDeathCause: "От смеха",
      customSkills: ["Вязание крючком"],
      customPreferences: ["Любит дождь"],
    });
  });

  it("не теряет значения, когда заполнены и старые, и новые поля", () => {
    const raw = legacyProject(
      {},
      {
        ...emptyCharacterCatalog(),
        traitIds: ["trait_Genius"],
        aspirationId: "Track_Love_B",
        deathCauseId: "death_Fire",
        skills: [{ id: "statistic_Skill_Hidden_VampireLore", level: 7 }],
        customTraits: ["Своя черта", "Уже новая"],
        customAspiration: "Другая цель",
      },
    );
    const catalog = parseProject(raw).characters[0].catalog!;
    expect(catalog.traitIds).toEqual(["trait_Genius"]);
    expect(catalog.aspirationId).toBe("Track_Love_B");
    expect(catalog.deathCauseId).toBe("death_Fire");
    expect(catalog.skills).toEqual([{ id: "statistic_Skill_Hidden_VampireLore", level: 7 }]);
    expect(catalog.customTraits).toEqual(["Своя черта", "Уже новая", "Гений"]);
    expect(catalog.customAspiration).toBe("Другая цель, Моя цель");
    expect(catalog.customSkills).toEqual(["Вязание крючком"]);
  });

  it("сохраняет свои значения, которых нет в справочнике, и не создаёт пустых записей", () => {
    const raw = legacyProject({
      traits: ["Ловец снов", "Ловец снов", ""],
      aspiration: "",
      occultType: "",
      deathCause: "  ",
      skills: [],
      preferences: [],
    });
    const catalog = parseProject(raw).characters[0].catalog!;
    expect(catalog.customTraits).toEqual(["Ловец снов"]);
    expect(catalog.customAspiration).toBe("");
    expect(catalog.customOccults).toEqual([]);
    const plain = legacyProject({
      traits: [],
      aspiration: "",
      preferences: [],
      skills: [],
      occultType: "",
      deathCause: "",
    });
    expect(parseProject(plain).characters[0].catalog).toBeUndefined();
  });

  it("не записывает старые поля, и повторное открытие ничего не меняет", async () => {
    const first = await readProjectDocument(oldDocument(legacyProject()));
    const text = (await serializeProject(first)).text;
    const saved = JSON.parse(text).project.characters[0];
    for (const key of legacyKeys) expect(saved).not.toHaveProperty(key);
    const second = await readProjectDocument(text);
    expect(second).toEqual(first);
    expect((await serializeProject(second)).text).toBe(text);
  });

  it("переносит старые поля при импорте файла .dynasty-tree и сохраняет их при экспорте", async () => {
    const file = new File([oldDocument(legacyProject())], "old.dynasty-tree");
    const imported = await importProject(file, "копия");
    expect(imported.characters[0].catalog?.customTraits).toEqual(["Своя черта", "Гений"]);
    const exported = (await serializeProject(imported)).text;
    expect(exported).not.toMatch(/"(aspiration|traits|occultType|deathCause)":/);
    const again = await importProject(new File([exported], "new.dynasty-tree"), "копия");
    expect(again.characters[0].catalog).toEqual(imported.characters[0].catalog);
  });

  it("старая бета может прочитать новый файл: номер формата и версия справочника прежние", async () => {
    const text = (await serializeProject(parseProject(legacyProject()))).text;
    const raw = JSON.parse(text);
    expect(raw.formatVersion).toBe(1);
    expect(raw.project.formatVersion).toBe(1);
    expect(raw.project.characters[0].catalog.version).toBe(1);
  });
});

/** A character as v0.1.0-beta.1 wrote it: chosen goal and careers in `catalog`, old text fields empty. */
function betaProject() {
  const project = legacyProject(
    { aspiration: "", traits: [], preferences: [], skills: [], occultType: "", deathCause: "" },
    {
      version: 1,
      traitIds: ["trait_PracticeMakesPerfect"],
      aspirationId: "Track_Knowledge_Academic",
      occultIds: [],
      breedId: "",
      customBreed: "",
      neutered: "unknown",
      deathCauseId: "",
      skills: [],
      preferences: [],
      careers: [
        {
          id: "career_1",
          careerId: "careers_Adult_Gardener",
          customName: "",
          branch: "",
          title: "",
          level: 6,
          start: "",
          end: "",
          current: true,
          notes: "Розы",
        },
        {
          id: "career_2",
          careerId: "",
          customName: "Своя работа",
          branch: "",
          title: "",
          start: "",
          end: "",
          current: false,
          notes: "",
        },
      ],
    },
  );
  return project;
}

describe("цели и карьера из старых версий", () => {
  it("файл беты v0.1.0-beta.1: цель и карьера остаются после импорта и сохранения", async () => {
    const imported = await importProject(new File([oldDocument(betaProject())], "Varonzov.dynasty-tree"), "копия");
    const catalog = imported.characters[0].catalog!;
    expect(catalog.aspirationId).toBe("Track_Knowledge_Academic");
    expect(catalog.careers).toEqual([
      expect.objectContaining({ careerId: "careers_Adult_Gardener", level: 6, current: true, notes: "Розы" }),
      expect.objectContaining({ careerId: "", customName: "Своя работа", current: false }),
    ]);
    const reopened = await readProjectDocument((await serializeProject(imported)).text);
    expect(reopened.characters[0].catalog).toEqual(catalog);
  });

  it("старая запись браузера: цель и карьера переносятся вместе с династией", () => {
    const records = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
    });
    const project = betaProject();
    storeLegacyProject(project);
    const loaded = loadLegacyProject(project.id)!;
    expect(loaded.characters[0].catalog?.aspirationId).toBe("Track_Knowledge_Academic");
    expect(loaded.characters[0].catalog?.careers.map((period) => period.careerId)).toEqual([
      "careers_Adult_Gardener",
      "",
    ]);
    vi.unstubAllGlobals();
  });

  it("файл альфы: цель была только текстом и не пропадает", async () => {
    const project = legacyProject({ aspiration: "Академик", traits: [], skills: [], preferences: [] });
    const imported = await importProject(new File([oldDocument(project)], "alpha.dynasty-tree"), "копия");
    const character = imported.characters[0];
    expect(character.catalog?.customAspiration).toBe("Академик");
    // The editor turns an exact catalog name into the catalog value.
    expect(prepareCatalogDraft(character).catalog?.aspirationId).toBe("Track_Knowledge_Academic");
  });
});
