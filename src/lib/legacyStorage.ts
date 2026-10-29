import type { Project, ProjectSummary } from "../types";
import { parseProject } from "./validation";
import LZString from "lz-string";

/**
 * Dynasties of earlier web versions, kept in localStorage. They are never written
 * again: the user moves them into a folder and may delete a record after confirming.
 */
const INDEX_KEY = "dynasty-chronicles:index";
const PROJECT_PREFIX = "dynasty-chronicles:project:";
const ACTIVE_KEY = "dynasty-chronicles:active";
const COMPRESSED_PREFIX = "dynasty-lz16-v1:";

function decodeProject(raw: string): Project {
  const json = raw.startsWith(COMPRESSED_PREFIX)
    ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
    : raw;
  if (!json) throw new Error("INVALID_COMPRESSED_PROJECT");
  return parseProject(JSON.parse(json));
}

const legacyPalette: Record<string, string> = {
  "#b7744c": "#3E4B8E",
  "#a55f42": "#3D1534",
  "#6f7897": "#6D78B2",
  "#907052": "#C69D63",
  "#537b77": "#8AA6B6",
  "#815f83": "#6F4B68",
  "#9b7249": "#C69D63",
  "#c39a58": "#F6E0B6",
  "#be8b7b": "#A6BCC9",
  "#b85e68": "#7D6A9E",
  "#c95968": "#B66A87",
  "#d06b53": "#8B3F62",
  "#855780": "#3D1534",
  "#a67c52": "#D3B87C",
  "#5f9e91": "#8DAAB9",
  "#7f6b64": "#6472A4",
  "#9c4f4b": "#5C294D",
  "#73808a": "#8096A6",
};

function migratePalette(project: Project): Project {
  return {
    ...project,
    characters: project.characters.map((character) => ({
      ...character,
      color: legacyPalette[character.color.toLowerCase()] ?? character.color,
    })),
    pairLinks: project.pairLinks.map((pair) => ({
      ...pair,
      labels: pair.labels.map((label) => ({
        ...label,
        color: legacyPalette[label.color.toLowerCase()] ?? label.color,
      })),
    })),
  };
}

function recordKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter((key) =>
    key.startsWith(PROJECT_PREFIX),
  );
}

function readIndex(): ProjectSummary[] {
  // The index is a cache. Recover entries if a previous index write was interrupted.
  let projects: ProjectSummary[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    if (Array.isArray(raw))
      projects = raw.filter(
        (item): item is ProjectSummary =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.updatedAt === "string" &&
          typeof item.characterCount === "number" &&
          localStorage.getItem(`${PROJECT_PREFIX}${item.id}`) !== null,
      );
  } catch {
    /* Rebuild a damaged cache from project records. */
  }
  const indexed = new Set(projects.map((item) => item.id));
  for (const key of recordKeys()) {
    if (indexed.has(key.slice(PROJECT_PREFIX.length))) continue;
    try {
      projects.push(summary(decodeProject(localStorage.getItem(key)!)));
    } catch {
      // Corrupt source records are retained for the recovery download.
    }
  }
  return projects;
}

function summary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    worldName: project.worldName,
    updatedAt: project.updatedAt,
    characterCount: project.characters.length,
  };
}

export function listLegacyProjects(): ProjectSummary[] {
  try {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function loadLegacyProject(id: string): Project | null {
  const raw = localStorage.getItem(`${PROJECT_PREFIX}${id}`);
  return raw ? migratePalette(decodeProject(raw)) : null;
}

/** Some records cannot be read; their raw contents can still be downloaded. */
export function hasUnreadableLegacyRecords(): boolean {
  try {
    return recordKeys().length > listLegacyProjects().length;
  } catch {
    return false;
  }
}

/** Removes one old record after the user confirmed it. Dynasty folders are not touched. */
export function deleteLegacyProject(id: string): void {
  localStorage.removeItem(`${PROJECT_PREFIX}${id}`);
  // The index and active marker are caches: listing ignores entries without a record.
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex()));
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* Listing still skips the removed record. */
  }
}

/** Every raw old record, including unreadable ones, for manual recovery. */
export function legacyRecoveryData(): string {
  const records = Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
      .filter((key) => key.startsWith("dynasty-chronicles:"))
      .map((key) => [key, localStorage.getItem(key)]),
  );
  return JSON.stringify(records, null, 2);
}
