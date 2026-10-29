import type { Character, CharacterCatalog, PairLink, ParentLink, Project } from "../types";
import { emptyCharacterCatalog } from "./catalog";
import { createCharacter } from "./project";
import { normalizePairLink } from "./relationships";

type RecordValue = Record<string, unknown>;
const invalid = (): never => {
  throw new Error("INVALID_PROJECT_FORMAT");
};
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : invalid();
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const string = (value: unknown): string => (typeof value === "string" ? value : invalid());
const id = (value: unknown): string => {
  const result = string(value);
  return result && !["__proto__", "constructor", "prototype"].includes(result) ? result : invalid();
};
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T =>
  values.includes(value as T) ? (value as T) : invalid();
const boolean = (value: unknown): boolean => (typeof value === "boolean" ? value : invalid());
const finite = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : invalid());
const unique = (values: string[]) => new Set(values).size === values.length || invalid();
const image = (value: unknown) =>
  /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(string(value)) ? string(value) : invalid();

function catalog(value: unknown): CharacterCatalog {
  const raw = record(value);
  if (raw.version !== 1) invalid();
  const result = emptyCharacterCatalog();
  for (const key of [
    "aspirationId",
    "breedId",
    "customBreed",
    "deathCauseId",
    "customAspiration",
    "customDeathCause",
  ] as const)
    result[key] = string(raw[key] ?? "");
  for (const key of ["traitIds", "occultIds"] as const) {
    result[key] = array(raw[key] ?? []).map(string);
    unique(result[key]);
  }
  for (const key of ["customTraits", "customOccults", "customSkills", "customPreferences"] as const)
    result[key] = array(raw[key] ?? []).map(string);
  result.neutered = oneOf(raw.neutered ?? "unknown", ["unknown", "yes", "no"]);
  result.skills = array(raw.skills ?? []).map((item) => {
    const row = record(item);
    const level = finite(row.level);
    if (level < 0) invalid();
    return { id: string(row.id), level };
  });
  result.preferences = array(raw.preferences ?? []).map((item) => {
    const row = record(item);
    return { id: string(row.id), rating: oneOf(row.rating, ["like", "dislike"]) };
  });
  result.careers = array(raw.careers ?? []).map((item) => {
    const row = record(item);
    const level = row.level === undefined ? undefined : finite(row.level);
    if (level !== undefined && level < 0) invalid();
    return {
      id: id(row.id),
      careerId: string(row.careerId ?? ""),
      customName: string(row.customName ?? ""),
      branch: string(row.branch ?? ""),
      title: string(row.title ?? ""),
      level,
      start: string(row.start ?? ""),
      end: string(row.end ?? ""),
      current: boolean(row.current),
      notes: string(row.notes ?? ""),
    };
  });
  unique(result.skills.map((row) => row.id));
  unique(result.preferences.map((row) => row.id));
  unique(result.careers.map((row) => row.id));
  return result;
}

const mergeLists = (current: string[], legacy: string[]) => [
  ...current,
  ...legacy.filter((value, index) => value.trim() && !current.includes(value) && legacy.indexOf(value) === index),
];
const mergeTexts = (current: string, legacy: string) =>
  !legacy.trim() || current === legacy ? current : current ? `${current}, ${legacy}` : legacy;

/**
 * Files before stage 14 kept the user's own traits, goal, occult, death cause, skills and preferences
 * in separate top-level fields. They move into `catalog`, so nothing is lost and they are not written again.
 */
function moveLegacyValues(raw: RecordValue, result: Character) {
  const text = (key: string) => (raw[key] === undefined ? "" : string(raw[key]));
  const list = (key: string) => (raw[key] === undefined ? [] : array(raw[key]).map(string));
  const legacy = {
    customTraits: list("traits"),
    customSkills: list("skills"),
    customPreferences: list("preferences"),
    customOccults: text("occultType").trim() ? [text("occultType")] : [],
    customAspiration: text("aspiration"),
    customDeathCause: text("deathCause"),
  };
  if (!Object.values(legacy).some((value) => (Array.isArray(value) ? value.length : value.trim()))) return;
  const settings = (result.catalog ??= emptyCharacterCatalog());
  for (const key of ["customTraits", "customSkills", "customPreferences", "customOccults"] as const)
    settings[key] = mergeLists(settings[key], legacy[key]);
  for (const key of ["customAspiration", "customDeathCause"] as const)
    settings[key] = mergeTexts(settings[key], legacy[key]);
}

function character(value: unknown): Character {
  const raw = record(value);
  const type = oneOf(raw.type, ["sim", "pet", "custom"]);
  const result = createCharacter(string(raw.displayName), type, { id: id(raw.id) });
  for (const key of [
    "firstName",
    "lastName",
    "species",
    "pronouns",
    "gender",
    "birthDate",
    "deathDate",
    "household",
    "world",
    "lot",
    "education",
    "biography",
    "notes",
    "color",
    "createdAt",
    "updatedAt",
  ] as const) {
    if (raw[key] !== undefined) result[key] = string(raw[key]);
  }
  for (const key of ["aliases", "tags", "ownerIds"] as const) {
    result[key] = raw[key] === undefined ? [] : array(raw[key]).map(string);
  }
  result.status = oneOf(raw.status, ["alive", "dead", "missing", "unknown"]);
  if (raw.catalog !== undefined) result.catalog = catalog(raw.catalog);
  moveLegacyValues(raw, result);
  result.generation = finite(raw.generation);
  result.stages = array(raw.stages).map((item) => {
    const stage = record(item);
    const photo = stage.photo === undefined ? undefined : record(stage.photo);
    const transform = photo?.transform === undefined ? undefined : record(photo.transform);
    return {
      id: id(stage.id),
      name: string(stage.name),
      order: finite(stage.order),
      photo: photo
        ? {
            original: image(photo.original),
            edited: photo.edited === undefined ? undefined : image(photo.edited),
            updatedAt: string(photo.updatedAt),
            transform: transform
              ? {
                  zoom: finite(transform.zoom),
                  x: finite(transform.x),
                  y: finite(transform.y),
                  rotation: finite(transform.rotation),
                  flipped: boolean(transform.flipped),
                }
              : undefined,
          }
        : undefined,
    };
  });
  unique(result.stages.map((stage) => stage.id));
  unique(result.stages.map((stage) => stage.name));
  result.lifeStage = string(raw.lifeStage);
  if (!result.stages.some((stage) => stage.name === result.lifeStage)) invalid();
  return result;
}

function parentLink(value: unknown, ids: Set<string>): ParentLink {
  const raw = record(value);
  if (!ids.has(string(raw.parentId)) || !ids.has(string(raw.childId))) invalid();
  return {
    id: id(raw.id),
    parentId: string(raw.parentId),
    childId: string(raw.childId),
    kind: string(raw.kind),
    parentRole: string(raw.parentRole),
    childRole: string(raw.childRole),
    biological: oneOf(raw.biological, ["yes", "no", "unknown"]),
    active: boolean(raw.active),
    comment: string(raw.comment ?? ""),
  };
}

function pairLink(value: unknown, ids: Set<string>): PairLink {
  const raw = record(value);
  if (!ids.has(string(raw.aId)) || !ids.has(string(raw.bId))) invalid();
  const labels = array(raw.labels).map((item) => {
    const label = record(item);
    return {
      id: id(label.id),
      name: string(label.name),
      color: string(label.color),
      icon: string(label.icon),
      direction: oneOf(label.direction, ["mutual", "a-to-b", "b-to-a"]),
      active: boolean(label.active),
      publicity: oneOf(label.publicity, ["open", "secret", "unknown"]),
      comment: string(label.comment ?? ""),
    };
  });
  unique(labels.map((label) => label.id));
  return normalizePairLink({ id: id(raw.id), aId: string(raw.aId), bId: string(raw.bId), labels });
}

function positions(value: unknown, ids: Set<string>) {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, item]) => {
      if (!ids.has(key)) invalid();
      const position = record(item);
      return [key, { x: finite(position.x), y: finite(position.y) }];
    }),
  );
}

/** Validate before opening imported or persisted data; never modify the original. */
export function parseProject(value: unknown): Project {
  const raw = record(value);
  if (raw.formatVersion !== 1) invalid();
  const characters = array(raw.characters).map(character);
  const trashedCharacters = array(raw.trashedCharacters).map(character);
  const allIds = [...characters, ...trashedCharacters].map((item) => item.id);
  unique(allIds);
  const active = new Set(characters.map((item) => item.id));
  const all = new Set(allIds);
  const parentLinks = array(raw.parentLinks).map((item) => parentLink(item, active));
  const pairLinks = array(raw.pairLinks).map((item) => pairLink(item, active));
  unique(parentLinks.map((item) => item.id));
  unique(pairLinks.map((item) => item.id));
  unique(pairLinks.map((item) => JSON.stringify([item.aId, item.bId])));
  const archive = raw.trashLinks === undefined ? undefined : record(raw.trashLinks);
  const trashLinks = archive
    ? {
        parentLinks: array(archive.parentLinks).map((item) => parentLink(item, all)),
        pairLinks: array(archive.pairLinks).map((item) => pairLink(item, all)),
        positions: positions(archive.positions, all),
      }
    : undefined;
  if (trashLinks) {
    unique([...parentLinks, ...trashLinks.parentLinks].map((item) => item.id));
    unique([...pairLinks, ...trashLinks.pairLinks].map((item) => item.id));
  }
  return {
    formatVersion: 1,
    id: id(raw.id),
    name: string(raw.name),
    description: string(raw.description ?? ""),
    worldName: string(raw.worldName ?? ""),
    createdAt: string(raw.createdAt),
    updatedAt: string(raw.updatedAt),
    characters,
    trashedCharacters,
    parentLinks,
    pairLinks,
    positions: positions(raw.positions, all),
    trashLinks,
  };
}
