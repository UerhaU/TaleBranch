import { describe, expect, it } from "vitest";
import { emptyCharacterCatalog } from "./catalog";
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
