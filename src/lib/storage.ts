import type { Project, ProjectSummary } from "../types";
import { makeId } from "./id";
import { parseProject } from "./validation";
import LZString from "lz-string";
import { isTauri } from "@tauri-apps/api/core";
import { saveDesktopExport } from "./desktopStorage";

const INDEX_KEY = "dynasty-chronicles:index";
const PROJECT_PREFIX = "dynasty-chronicles:project:";
const ACTIVE_KEY = "dynasty-chronicles:active";
const COMPRESSED_PREFIX = "dynasty-lz16-v1:";

function encodeProject(project: Project): string {
  const json = JSON.stringify(project);
  const compressed = COMPRESSED_PREFIX + LZString.compressToUTF16(json);
  return compressed.length < json.length ? compressed : json;
}

function decodeProject(raw: string): Project {
  const json = raw.startsWith(COMPRESSED_PREFIX) ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length)) : raw;
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

function readIndex(): ProjectSummary[] {
  // The index is a cache. Recover entries if a previous index write was interrupted.
  let projects: ProjectSummary[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    if (Array.isArray(raw)) projects = raw.filter((item): item is ProjectSummary =>
      item && typeof item.id === "string" && typeof item.name === "string" && typeof item.updatedAt === "string" &&
      typeof item.characterCount === "number" && localStorage.getItem(`${PROJECT_PREFIX}${item.id}`) !== null);
  } catch { /* Rebuild a damaged cache from project records. */ }
  const indexed = new Set(projects.map((item) => item.id));
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PROJECT_PREFIX)) continue;
    if (indexed.has(key.slice(PROJECT_PREFIX.length))) continue;
    try {
      projects.push(summary(decodeProject(localStorage.getItem(key)!)));
    } catch {
      // Corrupt source records are retained, and opening one reports an error.
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

export function listProjects(): ProjectSummary[] {
  try { return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  catch { return []; }
}

export function saveProject(project: Project): void {
  localStorage.setItem(`${PROJECT_PREFIX}${project.id}`, encodeProject(project));
  const index = readIndex().filter((item) => item.id !== project.id);
  index.unshift(summary(project));
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  localStorage.setItem(ACTIVE_KEY, project.id);
}

export function loadProject(id: string): Project | null {
  const raw = localStorage.getItem(`${PROJECT_PREFIX}${id}`);
  return raw ? migratePalette(decodeProject(raw)) : null;
}

export function loadInitialProject(): Project | null {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  const active = activeId ? loadProject(activeId) : null;
  if (active) return active;
  const first = listProjects()[0];
  const recent = first ? loadProject(first.id) : null;
  if (recent) return recent;
  if (Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some((key) => key?.startsWith(PROJECT_PREFIX))) {
    throw new Error("PROJECT_RECOVERY_REQUIRED");
  }
  return null;
}

// Put the irreversible change last. A failed preparatory write leaves its source intact.
function writeWithRollback(changes: Array<[string, string | null]>): void {
  const previous = changes.map(([key]) => [key, localStorage.getItem(key)] as const);
  let completed = 0;
  try {
    for (const [key, value] of changes) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      completed++;
    }
  } catch (error) {
    for (let index = completed - 1; index >= 0; index--) {
      const [key, value] = previous[index];
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch { /* Project records remain recoverable through readIndex. */ }
    }
    throw error;
  }
}

export function saveProjectIrreversibly(project: Project): void {
  const index = [summary(project), ...readIndex().filter((item) => item.id !== project.id)];
  writeWithRollback([
    [INDEX_KEY, JSON.stringify(index)],
    [ACTIVE_KEY, project.id],
    [`${PROJECT_PREFIX}${project.id}`, encodeProject(project)],
  ]);
}

export function deleteStoredProject(id: string, replacement?: Project): void {
  if (id === replacement?.id) throw new Error("CANNOT_DELETE_REPLACEMENT");
  const remaining = readIndex().filter((item) => item.id !== id && item.id !== replacement?.id);
  const index = replacement ? [summary(replacement), ...remaining] : remaining;
  const changes: Array<[string, string | null]> = replacement ? [[`${PROJECT_PREFIX}${replacement.id}`, encodeProject(replacement)]] : [];
  changes.push([INDEX_KEY, JSON.stringify(index)], [ACTIVE_KEY, replacement?.id ?? null], [`${PROJECT_PREFIX}${id}`, null]);
  writeWithRollback(changes);
}

function downloadText(contents: string, filename: string) {
  if (isTauri()) { void saveDesktopExport(filename, contents).catch(() => {}); return; }
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Attach the link so browsers that ignore detached download links can save it.
  document.body.append(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadRecoveryData(): void {
  const records = Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
    .filter((key) => key.startsWith("dynasty-chronicles:"))
    .map((key) => [key, localStorage.getItem(key)]));
  downloadText(JSON.stringify(records, null, 2), "dynasty-recovery.json");
}

async function contentHash(project: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function serializeProject(project: Project): Promise<string> {
  return JSON.stringify({ app: "dynasty-chronicles", formatVersion: 1,
    contentHash: await contentHash(project), project }, null, 2);
}

export async function readProjectDocument(text: string): Promise<Project> {
  const raw = JSON.parse(text);
  if (!raw || raw.app !== "dynasty-chronicles" || raw.formatVersion !== 1) throw new Error("INVALID_PROJECT_FORMAT");
  if (raw.contentHash !== undefined && raw.contentHash !== await contentHash(raw.project)) throw new Error("PROJECT_CHECKSUM_MISMATCH");
  const project = parseProject(raw.project);
  if (raw.checksum !== undefined && raw.checksum !== `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`) throw new Error("PROJECT_CHECKSUM_MISMATCH");
  return project;
}

export async function downloadProject(project: Project): Promise<void> {
  const manifest = {
    app: "dynasty-chronicles",
    formatVersion: project.formatVersion,
    exportedAt: new Date().toISOString(),
    checksum: `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`,
    contentHash: await contentHash(project),
    project,
  };
  const filename = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "project"}.dynasty-tree`;
  const contents = JSON.stringify(manifest, null, 2);
  if (isTauri()) await saveDesktopExport(filename, contents);
  else downloadText(contents, filename);
}

export async function importProject(file: File, copySuffix: string): Promise<Project> {
  const project = await readProjectDocument(await file.text());
  return {
    ...project,
    id: makeId("project"),
    name: `${project.name} — ${copySuffix}`,
    updatedAt: new Date().toISOString(),
  };
}
