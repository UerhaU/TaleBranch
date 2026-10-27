import data from "../data/game-catalog.json";
import type { Character, CharacterCatalog, CharacterType } from "../types";
import { makeId } from "./id";

export type CatalogKind =
  "traits" | "aspirations" | "breeds" | "skills" | "preferences" | "careers" | "occults" | "deathCauses" | "ages";
export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  icon?: string;
  pack: string;
  category: string;
  species: string[];
  availability: Record<string, string[]>;
  ageNames: string[];
  maxLevel?: number;
  traitKind?: string;
  conflicts?: string[];
  stageCode?: string;
  order?: number;
  preferenceKind?: string;
  careerDetails?: string;
  wiki?: string;
}
export const gameCatalog = data as unknown as {
  version: string;
  packs: { id: string; label: string }[];
  species: { id: string; label: string; type: string }[];
  entries: Record<CatalogKind, CatalogEntry[]>;
};
// Keep the stable game ID while using the separate age requested by the owner.
const youngAge = gameCatalog.entries.ages.find((entry) => entry.id === "human:youngadult");
if (youngAge) youngAge.label = "Молодой";
const indexes = Object.fromEntries(
  Object.entries(gameCatalog.entries).map(([kind, entries]) => [
    kind,
    new Map(entries.map((entry) => [entry.id, entry])),
  ]),
) as Record<CatalogKind, Map<string, CatalogEntry>>;
export const catalogEntry = (kind: CatalogKind, id?: string) => (id ? indexes[kind].get(id) : undefined);
export const packLabel = (code: string) => gameCatalog.packs.find((pack) => pack.id === code)?.label ?? code;
export const iconUrl = (file?: string) =>
  file ? `${import.meta.env.BASE_URL}game-icons/${encodeURIComponent(file)}` : undefined;
const normalize = (value: string) => value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
const normalizeAge = (value: string) => (normalize(value) === "молодой взрослый" ? "молодой" : normalize(value));

export function speciesId(character: Pick<Character, "type" | "species">): string | undefined {
  if (character.type === "sim") return "human";
  if (character.type === "custom") return undefined;
  const aliases: Record<string, string> = {
    cat: "cat",
    кошка: "cat",
    кот: "cat",
    dog: "dog",
    собака: "dog",
    пес: "dog",
    пёс: "dog",
    horse: "horse",
    лошадь: "horse",
    конь: "horse",
  };
  return aliases[normalize(character.species)];
}

export function ageEntry(
  character: Pick<Character, "type" | "species" | "lifeStage">,
  stageName = character.lifeStage,
) {
  const sp = speciesId(character);
  const entries = gameCatalog.entries.ages.filter((entry) => entry.species.includes(sp ?? ""));
  return (
    entries.find((entry) => normalizeAge(entry.label) === normalizeAge(stageName)) ??
    (character.type === "pet" && normalize(stageName) === "детеныш"
      ? entries.find((entry) => entry.stageCode === "child")
      : undefined)
  );
}

/** Species always scopes game choices; age rules may be relaxed for authored stories. */
export function catalogOptions(
  kind: CatalogKind,
  character: Pick<Character, "type" | "species" | "lifeStage">,
  allAges = false,
): CatalogEntry[] {
  const sp = speciesId(character),
    age = ageEntry(character)?.stageCode;
  return gameCatalog.entries[kind]
    .filter((entry) => {
      if (kind === "ages") return entry.species.includes(sp ?? "");
      if (kind === "breeds" && !sp) return false;
      if (sp && !entry.species.includes(sp)) return false;
      if (!sp && character.type === "pet" && entry.species.includes("human")) return false;
      if (character.type === "pet" && ["aspirations", "careers", "preferences"].includes(kind)) return false;
      if (allAges || character.type === "custom") return true;
      const allowed = sp ? entry.availability[sp] : undefined;
      if (age && allowed?.length && !allowed.includes(age)) return false;
      if (
        entry.ageNames.length &&
        !entry.ageNames.some((name) => normalizeAge(name) === normalizeAge(character.lifeStage))
      )
        return false;
      return true;
    })
    .sort((a, b) => (kind === "ages" ? (a.order ?? 0) - (b.order ?? 0) : a.label.localeCompare(b.label, "ru")));
}

export function emptyCharacterCatalog(): CharacterCatalog {
  return {
    version: 1,
    traitIds: [],
    aspirationId: "",
    occultIds: [],
    breedId: "",
    customBreed: "",
    neutered: "unknown",
    deathCauseId: "",
    skills: [],
    preferences: [],
    careers: [],
  };
}

export function entryForLegacy(
  kind: CatalogKind,
  label: string,
  character: Pick<Character, "type" | "species" | "lifeStage">,
): CatalogEntry | undefined {
  const matches = catalogOptions(kind, character, true).filter((entry) => normalize(entry.label) === normalize(label));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Resolve exact, unambiguous old labels only in the dialog draft, never during load. */
export function prepareCatalogDraft(character: Character): Character {
  const result = structuredClone(character);
  result.catalog = { ...emptyCharacterCatalog(), ...result.catalog };
  const settings = result.catalog;
  result.traits = result.traits.filter((value) => {
    const entry = entryForLegacy("traits", value, result);
    if (!entry) return true;
    if (!settings.traitIds.includes(entry.id)) settings.traitIds.push(entry.id);
    return false;
  });
  for (const [field, kind, target] of [
    ["aspiration", "aspirations", "aspirationId"],
    ["deathCause", "deathCauses", "deathCauseId"],
  ] as const) {
    const entry = entryForLegacy(kind, result[field], result);
    if (entry && !settings[target]) {
      settings[target] = entry.id;
      result[field] = "";
    }
  }
  const occult = entryForLegacy("occults", result.occultType, result);
  if (occult) {
    if (!settings.occultIds.includes(occult.id)) settings.occultIds.push(occult.id);
    result.occultType = "";
  }
  return result;
}

export function traitConflicts(ids: string[]): [CatalogEntry, CatalogEntry][] {
  const selected = new Set(ids);
  return ids.flatMap((id) =>
    (catalogEntry("traits", id)?.conflicts ?? [])
      .filter((other) => selected.has(other) && id < other)
      .flatMap((other) => {
        const a = catalogEntry("traits", id),
          b = catalogEntry("traits", other);
        return a && b ? [[a, b] as [CatalogEntry, CatalogEntry]] : [];
      }),
  );
}

export function changeCharacterKind(current: Character, type: CharacterType, species = current.species): Character {
  if (current.type === type && current.species === species) return current;
  const next = { ...current, type, species };
  const wanted = catalogOptions("ages", next);
  if (!wanted.length) return next;
  if (current.type !== type && !current.stages.some((stage) => stage.photo)) {
    return {
      ...next,
      stages: wanted.map((entry, order) => ({ id: makeId("stage"), name: entry.label, order })),
      lifeStage:
        wanted.find((entry) => entry.label === current.lifeStage)?.label ??
        wanted.find((entry) => entry.stageCode === "adult")?.label ??
        wanted[0].label,
    };
  }
  const beforeSpecies = speciesId(current),
    afterSpecies = speciesId(next);
  // Renaming an age keeps its stable stage ID and its original/cropped photographs.
  const stages = current.stages.map((stage) => {
    const old = ageEntry(current, stage.name);
    const legacyYoung = current.type === "pet" && normalize(stage.name) === "детеныш";
    const matching = wanted.find(
      (entry) => entry.stageCode === (old?.stageCode ?? (legacyYoung ? "child" : undefined)),
    );
    const candidate = beforeSpecies !== afterSpecies || legacyYoung ? matching : undefined;
    const replacement =
      candidate && !current.stages.some((other) => other.id !== stage.id && other.name === candidate.label)
        ? candidate
        : undefined;
    return { ...stage, name: replacement?.label ?? stage.name };
  });
  // Preserve custom/old stages and all photographs when switching species or type.
  const missing = wanted.filter((entry) => !stages.some((stage) => stage.name === entry.label));
  const merged = [
    ...stages,
    ...missing.map((entry) => ({ id: makeId("stage"), name: entry.label, order: stages.length + (entry.order ?? 0) })),
  ];
  const newCurrent = stages.find((_, i) => current.stages[i].name === current.lifeStage)?.name ?? current.lifeStage;
  return { ...next, stages: merged, lifeStage: newCurrent };
}
