import type { Project, ProjectSummary } from "../types";
import { createDemoProject } from "./project";
import { makeId } from "./id";
import { parseProject } from "./validation";

const INDEX_KEY = "dynasty-chronicles:index";
const PROJECT_PREFIX = "dynasty-chronicles:project:";
const ACTIVE_KEY = "dynasty-chronicles:active";

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
      projects.push(summary(parseProject(JSON.parse(localStorage.getItem(key)!))));
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
  localStorage.setItem(`${PROJECT_PREFIX}${project.id}`, JSON.stringify(project));
  const index = readIndex().filter((item) => item.id !== project.id);
  index.unshift(summary(project));
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  localStorage.setItem(ACTIVE_KEY, project.id);
}

export function loadProject(id: string): Project | null {
  const raw = localStorage.getItem(`${PROJECT_PREFIX}${id}`);
  return raw ? migratePalette(parseProject(JSON.parse(raw))) : null;
}

export function loadInitialProject(): Project {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  const active = activeId ? loadProject(activeId) : null;
  if (active) return active;
  const first = listProjects()[0];
  const recent = first ? loadProject(first.id) : null;
  if (recent) return recent;
  if (Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some((key) => key?.startsWith(PROJECT_PREFIX))) {
    throw new Error("PROJECT_RECOVERY_REQUIRED");
  }
  const demo = createDemoProject();
  return demo;
}

export function deleteStoredProject(id: string): void {
  localStorage.removeItem(`${PROJECT_PREFIX}${id}`);
  localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((item) => item.id !== id)));
  if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
}

function downloadText(contents: string, filename: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export async function downloadProject(project: Project): Promise<void> {
  const manifest = {
    app: "dynasty-chronicles",
    formatVersion: project.formatVersion,
    exportedAt: new Date().toISOString(),
    checksum: `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`,
    contentHash: await contentHash(project),
    project,
  };
  downloadText(JSON.stringify(manifest, null, 2), `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "project"}.dynasty-tree`);
}

export async function importProject(file: File, copySuffix: string): Promise<Project> {
  const raw = JSON.parse(await file.text());
  if (!raw || raw.app !== "dynasty-chronicles" || raw.formatVersion !== 1) {
    throw new Error("INVALID_PROJECT_FORMAT");
  }
  if (raw.contentHash !== undefined && raw.contentHash !== await contentHash(raw.project)) throw new Error("PROJECT_CHECKSUM_MISMATCH");
  const project = parseProject(raw.project);
  if (raw.checksum !== undefined && raw.checksum !== `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`) {
    throw new Error("PROJECT_CHECKSUM_MISMATCH");
  }
  return {
    ...project,
    id: makeId("project"),
    name: `${project.name} — ${copySuffix}`,
    updatedAt: new Date().toISOString(),
  };
}
