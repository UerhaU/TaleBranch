import type { Character, CharacterType, PairLink, ParentLink, Project } from "../types";
import { makeId } from "./id";
import { createStages, defaultStage } from "./stages";

export { autoLayout } from "./autoLayout";

const now = () => new Date().toISOString();

export function createCharacter(
  displayName: string,
  type: CharacterType = "sim",
  patch: Partial<Character> = {},
): Character {
  const [firstName = displayName, ...last] = displayName.trim().split(/\s+/);
  return {
    id: makeId("char"),
    displayName,
    firstName,
    lastName: last.join(" "),
    aliases: [],
    type,
    species: "",
    lifeStage: defaultStage(type),
    status: "alive",
    pronouns: "",
    gender: "",
    occultType: "",
    birthDate: "",
    deathDate: "",
    generation: 1,
    household: "",
    world: "",
    lot: "",
    aspiration: "",
    traits: [],
    preferences: [],
    skills: [],
    education: "",
    deathCause: "",
    biography: "",
    notes: "",
    tags: [],
    color: "#3E4B8E",
    ownerIds: [],
    stages: createStages(type, patch.species),
    createdAt: now(),
    updatedAt: now(),
    ...patch,
  };
}

export function createEmptyProject(name = ""): Project {
  return {
    formatVersion: 1,
    id: makeId("project"),
    name,
    description: "",
    worldName: "",
    createdAt: now(),
    updatedAt: now(),
    characters: [],
    parentLinks: [],
    pairLinks: [],
    positions: {},
    trashedCharacters: [],
  };
}

export function createDemoProject(): Project {
  const elena = createCharacter("Елена Воронова", "sim", {
    id: "char_elena",
    firstName: "Елена",
    lastName: "Воронова",
    lifeStage: "Пожилой",
    generation: 1,
    household: "Дом Вороновых",
    world: "Винденбург",
    aspiration: "Большая счастливая семья",
    traits: ["Семейная", "Творец", "Добрая"],
    tags: ["Основательница"],
    biography: "Основательница династии. Превратила старый особняк у моря в дом для большой семьи.",
    color: "#3D1534",
  });
  const mark = createCharacter("Марк Воронов", "sim", {
    id: "char_mark",
    firstName: "Марк",
    lastName: "Воронов",
    lifeStage: "Пожилой",
    status: "dead",
    generation: 1,
    household: "Дом Вороновых",
    world: "Винденбург",
    traits: ["Меломан", "Романтик", "Амбициозный"],
    color: "#6D78B2",
  });
  const vera = createCharacter("Вера Воронова", "sim", {
    id: "char_vera",
    firstName: "Вера",
    lastName: "Воронова",
    lifeStage: "Взрослый",
    generation: 2,
    household: "Дом Вороновых",
    world: "Винденбург",
    aspiration: "Исключительный художник",
    traits: ["Творец", "Перфекционист", "Одиночка"],
    tags: ["Наследница"],
    biography: "Художница и хранительница семейного архива.",
    color: "#C69D63",
  });
  const leon = createCharacter("Леон Риверс", "sim", {
    id: "char_leon",
    firstName: "Леон",
    lastName: "Риверс",
    lifeStage: "Взрослый",
    generation: 2,
    household: "Дом Вороновых",
    world: "Винденбург",
    traits: ["Книжный червь", "Верный", "Гурман"],
    color: "#8AA6B6",
  });
  const nika = createCharacter("Ника Воронова", "sim", {
    id: "char_nika",
    firstName: "Ника",
    lastName: "Воронова",
    lifeStage: "Подросток",
    generation: 3,
    household: "Дом Вороновых",
    world: "Винденбург",
    aspiration: "Звезда сцены",
    traits: ["Самоуверенная", "Общительная"],
    tags: ["Третье поколение"],
    biography: "Мечтает собрать собственную группу и уехать на гастроли.",
    color: "#6F4B68",
  });
  const rune = createCharacter("Руна", "pet", {
    id: "char_rune",
    firstName: "Руна",
    lastName: "",
    lifeStage: "Взрослый",
    generation: 3,
    ownerIds: [nika.id],
    household: "Дом Вороновых",
    species: "Собака",
    traits: ["Верная", "Игривый", "Любопытная"],
    tags: ["Любимица семьи"],
    color: "#C69D63",
  });

  const parentLinks: ParentLink[] = [
    {
      id: "parent_1",
      parentId: elena.id,
      childId: vera.id,
      kind: "Биологическое",
      parentRole: "Мама",
      childRole: "Дочь",
      biological: "yes",
      active: true,
      comment: "",
    },
    {
      id: "parent_2",
      parentId: mark.id,
      childId: vera.id,
      kind: "Биологическое",
      parentRole: "Папа",
      childRole: "Дочь",
      biological: "yes",
      active: true,
      comment: "",
    },
    {
      id: "parent_3",
      parentId: vera.id,
      childId: nika.id,
      kind: "Биологическое",
      parentRole: "Мама",
      childRole: "Дочь",
      biological: "yes",
      active: true,
      comment: "",
    },
    {
      id: "parent_4",
      parentId: leon.id,
      childId: nika.id,
      kind: "Биологическое",
      parentRole: "Папа",
      childRole: "Дочь",
      biological: "yes",
      active: true,
      comment: "",
    },
  ];

  const pairLinks: PairLink[] = [
    {
      id: "pair_1",
      aId: elena.id,
      bId: mark.id,
      labels: [
        {
          id: "rel_1",
          name: "Супруги",
          color: "#F6E0B6",
          icon: "rings",
          direction: "mutual",
          active: false,
          publicity: "open",
          comment: "До смерти Марка",
        },
      ],
    },
    {
      id: "pair_2",
      aId: leon.id,
      bId: vera.id,
      labels: [
        {
          id: "rel_2",
          name: "Супруги",
          color: "#F6E0B6",
          icon: "rings",
          direction: "mutual",
          active: true,
          publicity: "open",
          comment: "",
        },
        {
          id: "rel_3",
          name: "Лучшие друзья",
          color: "#8DAAB9",
          icon: "spark",
          direction: "mutual",
          active: true,
          publicity: "open",
          comment: "",
        },
      ],
    },
  ];

  return {
    formatVersion: 1,
    id: "project_demo",
    name: "Дом Вороновых",
    description: "Три поколения, один старый дом и истории, которые не должны потеряться.",
    worldName: "Винденбург",
    createdAt: now(),
    updatedAt: now(),
    characters: [elena, mark, vera, leon, nika, rune],
    parentLinks,
    pairLinks,
    positions: {
      [elena.id]: { x: 140, y: 80 },
      [mark.id]: { x: 470, y: 80 },
      [vera.id]: { x: 270, y: 370 },
      [leon.id]: { x: 600, y: 370 },
      [nika.id]: { x: 435, y: 670 },
      [rune.id]: { x: 790, y: 650 },
    },
    trashedCharacters: [],
  };
}

export function normalizePair(aId: string, bId: string): [string, string] {
  return aId.localeCompare(bId) <= 0 ? [aId, bId] : [bId, aId];
}

export function wouldCreateAncestorCycle(project: Project, parentId: string, childId: string): boolean {
  if (parentId === childId) return true;
  const childrenByParent = new Map<string, string[]>();
  project.parentLinks.forEach((link) => {
    childrenByParent.set(link.parentId, [...(childrenByParent.get(link.parentId) ?? []), link.childId]);
  });
  const queue = [childId];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current === parentId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}

export function hasAncestorCycle(project: Project): boolean {
  const ids = project.characters.map((character) => character.id);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const children = new Map<string, string[]>();
  project.parentLinks
    .filter((link) => link.active && indegree.has(link.parentId) && indegree.has(link.childId))
    .forEach((link) => {
      indegree.set(link.childId, indegree.get(link.childId)! + 1);
      children.set(link.parentId, [...(children.get(link.parentId) ?? []), link.childId]);
    });
  const queue = ids.filter((id) => indegree.get(id) === 0);
  for (let index = 0; index < queue.length; index++) {
    for (const childId of children.get(queue[index]) ?? []) {
      indegree.set(childId, indegree.get(childId)! - 1);
      if (indegree.get(childId) === 0) queue.push(childId);
    }
  }
  return queue.length < ids.length;
}
