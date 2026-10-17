import { describe, expect, it } from "vitest";
import { ageEntry, catalogEntry, catalogOptions, changeCharacterKind, emptyCharacterCatalog, prepareCatalogDraft, traitConflicts } from "./catalog";
import { createCharacter, createEmptyProject } from "./project";
import { parseProject } from "./validation";

describe("game catalogs and existing projects", () => {
  it("keeps young and adult stages separate and supports old young-stage records", () => {
    const character = createCharacter("Том");
    expect(character.lifeStage).toBe("Молодой");
    expect(character.stages.map(stage => stage.name)).toContain("Молодой");
    expect(character.stages.map(stage => stage.name)).toContain("Взрослый");
    expect(character.stages.map(stage => stage.name)).not.toContain("Молодой взрослый");
    const young = ageEntry(character)!;
    expect(young.id).toBe("human:youngadult"); expect(young.icon).toBeTruthy();
    expect(ageEntry({ ...character, lifeStage: "Взрослый" })?.id).toBe("human:adult");
    const old = structuredClone(character);
    old.lifeStage = "Молодой взрослый";
    const stage = old.stages.find(item => item.name === "Молодой")!;
    stage.name = "Молодой взрослый";
    stage.photo = { original:"data:image/png;base64,AA==", edited:"data:image/png;base64,AA==", updatedAt:old.updatedAt };
    expect(ageEntry(old)?.id).toBe(young.id);
    expect(catalogOptions("traits", old).map(item => item.id)).toEqual(catalogOptions("traits", character).map(item => item.id));
    const project = createEmptyProject(); project.characters.push(old);
    expect(parseProject(project).characters[0].stages.find(item => item.id === stage.id)?.photo).toEqual(stage.photo);
  });
  it("scopes cat traits and breeds without exposing human or dog choices", () => {
    const cat = createCharacter("", "pet", { species: "Кошка", lifeStage: "Взрослый" });
    const traits = catalogOptions("traits", cat);
    expect(traits.some(entry => entry.id === "trait_Pet_Friendly_Cat")).toBe(true);
    expect(traits.some(entry => entry.id === "trait_Pet_Friendly_Dog")).toBe(false);
    expect(traits.some(entry => entry.id === "trait_Genius")).toBe(false);
    expect(catalogOptions("breeds", cat)).toHaveLength(50);
    expect(catalogOptions("aspirations", cat)).toEqual([]);
    expect(catalogOptions("careers", cat)).toEqual([]);
  });
  it("uses infant rules and allows authored choices from other ages", () => {
    const infant = createCharacter("", "sim", { lifeStage: "Младенец" });
    expect(catalogOptions("traits", infant).some(entry => entry.id === "trait_Infant_Cautious")).toBe(true);
    expect(catalogOptions("traits", infant).some(entry => entry.id === "trait_Toddler_Independent")).toBe(false);
    expect(catalogOptions("traits", infant, true).some(entry => entry.id === "trait_Toddler_Independent")).toBe(true);
  });
  it("retains original photos and stage IDs when changing a pet species", () => {
    const cat = createCharacter("", "pet", { species: "Кошка", lifeStage: "Котёнок" });
    const child = cat.stages.find(stage => stage.name === "Котёнок")!;
    child.photo = { original: "data:image/png;base64,AA==", edited: "data:image/png;base64,AA==", updatedAt: "2026-10-16" };
    const dog = changeCharacterKind(cat, "pet", "Собака");
    expect(dog.lifeStage).toBe("Щенок");
    expect(dog.stages.find(stage => stage.id === child.id)?.photo).toEqual(child.photo);
    expect(ageEntry(dog)?.icon).toBeTruthy();
    expect(cat.lifeStage).toBe("Котёнок");
  });
  it("starts a new pet with species ages and resolves the old generic young age", () => {
    const pet = changeCharacterKind(createCharacter(""), "pet", "Лошадь");
    expect(pet.stages.map(stage => stage.name)).toEqual(["Жеребёнок", "Взрослый", "Пожилой"]);
    expect(ageEntry({ type: "pet", species: "Собака", lifeStage: "Детёныш" })?.label).toBe("Щенок");
  });
  it("resolves exact old labels only in a draft and preserves custom text", () => {
    const source = createCharacter("", "sim", { traits: ["Гений", "Своя необычная черта"], aspiration: "Моя цель" });
    const draft = prepareCatalogDraft(source);
    expect(draft.catalog?.traitIds).toContain("trait_Genius");
    expect(draft.traits).toEqual(["Своя необычная черта"]);
    expect(draft.aspiration).toBe("Моя цель");
    expect(source.catalog).toBeUndefined();
    expect(source.traits).toEqual(["Гений", "Своя необычная черта"]);
  });
  it("retains all new values through project parsing without catalog copies", () => {
    const project = createEmptyProject();
    const catalog = { ...emptyCharacterCatalog(), traitIds: ["trait_Genius"], aspirationId: "Track_Love_B",
      breedId: "custom-future-breed", neutered: "unknown" as const, skills: [{ id: "statistic_Skill_Hidden_VampireLore", level: 15 }],
      preferences: [{ id: "a-future-catalog-id", rating: "dislike" as const }], careers: [{ id: "period1", careerId: "career_Adult_Active_Doctor", customName: "", branch: "", title: "Врач", level: 3, start: "Весна, 2-й год", end: "", current: true, notes: "Заметка" }] };
    project.characters.push(createCharacter("", "sim", { catalog }));
    const parsed = parseProject(JSON.parse(JSON.stringify(project)));
    expect(parsed.characters[0].catalog).toEqual(catalog);
    expect(parseProject({ ...project, characters: [createCharacter("")] }).characters[0].catalog).toBeUndefined();
  });
  it("rejects damaged new values instead of discarding them", () => {
    const project = createEmptyProject();
    project.characters.push(createCharacter("", "sim", { catalog: { ...emptyCharacterCatalog(), skills: [{ id: "skill", level: NaN }] } }));
    expect(() => parseProject(project)).toThrow("INVALID_PROJECT_FORMAT");
    project.characters[0].catalog!.skills = [{ id: "skill", level: 1 }, { id: "skill", level: 2 }];
    expect(() => parseProject(project)).toThrow("INVALID_PROJECT_FORMAT");
  });
  it("keeps individual skill limits and reports conflicting traits", () => {
    expect(catalogEntry("skills", "statistic_Skill_Hidden_VampireLore")?.maxLevel).toBe(15);
    expect(catalogEntry("skills", "statistic_Skill_Toddler_Potty")?.maxLevel).toBe(3);
    expect(traitConflicts(["trait_Good", "trait_Evil"])).toHaveLength(1);
  });
});
